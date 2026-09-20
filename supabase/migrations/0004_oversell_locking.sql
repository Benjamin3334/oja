-- ============================================================================
-- 0004 - Close the check-then-act race in complete_sale().
--
-- THE BUG
--   complete_sale() reads the available stock, compares it, and then inserts
--   the deduction:
--
--       select stock_quantity into available
--       from v_product_stock where product_id = item.product_id;
--
--       if available < item.quantity then raise ...
--
--       insert into stock_movements ...
--
--   Nothing holds a lock between the read and the write. PostgreSQL's default
--   isolation level is READ COMMITTED, where each statement sees a fresh
--   snapshot and no row is reserved by merely reading it. Two sessions can
--   therefore both read "1 available", both pass the check, and both insert a
--   deduction. Stock ends at -1 and the ledger is no longer truthful.
--
--   FR-4.5 promises overselling is "blocked at the database level", and PRD
--   section 10 lists the overselling guard among the three things that must
--   never be cut. Today it holds only when no two people sell at once, which
--   is exactly the condition a busy shop violates.
--
-- HOW TO DEMONSTRATE IT
--   A race cannot be shown from a single SQL editor tab, because it needs two
--   transactions interleaved. With two psql sessions against the same database:
--
--     Session A                          Session B
--     begin;                             begin;
--     -- reduce a product to 1 unit
--     select complete_sale('<sale-a>');
--     -- do NOT commit yet
--                                        select complete_sale('<sale-b>');
--                                        -- BEFORE 0004: returns immediately,
--                                        --   having read the same stale count
--                                        -- AFTER 0004: blocks here, waiting
--                                        --   on the product row lock
--     commit;
--                                        -- AFTER 0004: unblocks, re-reads
--                                        --   stock, now 0, and raises
--                                        --   "Insufficient stock"
--     select stock_quantity from v_product_stock where ...;
--     -- BEFORE 0004: -1
--     -- AFTER 0004:   0
--
--   The single-session version proves nothing: one transaction cannot race
--   itself, and the guard already works correctly when calls are serial.
--
-- THE FIX
--       perform 1 from products where id = item.product_id for update;
--
--   placed BEFORE the stock is read. FOR UPDATE takes a row-level exclusive
--   lock on the product. A second session reaching the same line blocks until
--   the first transaction commits or rolls back, and only then reads the stock
--   sum - which by that point includes the first session's movement.
--
-- WHY LOCK products AND NOT stock_movements
--   The rows being counted are in stock_movements, but the row that would make
--   the count wrong does not exist yet, and you cannot lock a row that has not
--   been inserted. Locking the products row gives one fixed, always-present
--   serialisation point per product. This is the standard answer to a phantom
--   read: lock the parent, not the children you are about to count.
--
-- COST
--   Two sales of the SAME product now serialise briefly. Sales of different
--   products are unaffected, because the lock is per row. For a shop counter
--   this is invisible; the alternative is a ledger that can go negative.
--
-- VERIFY AFTER RUNNING
--   supabase/paste-chunks/12_staff_sale_proof.sql must still return
--   stock_after 97 and movements_written 1. The lock must not change
--   single-session behaviour at all.
-- ============================================================================

create or replace function complete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_complete_sale$
declare
    item        record;
    available   integer;
    v_org       uuid;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'draft';
    if v_org is null then
        raise exception 'Sale % not found or is not a draft', p_sale_id;
    end if;

    -- The tenant check RLS used to perform for us (see 0003).
    if v_org <> current_org_id() then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        -- 0004: serialise concurrent sales of this product. Everything from
        -- here to commit is protected; a second session blocks on this line
        -- rather than reading a stock figure that is about to be wrong.
        perform 1 from products where id = item.product_id for update;

        select stock_quantity into available
        from v_product_stock where product_id = item.product_id;

        if available < item.quantity then
            raise exception
                'Insufficient stock for product %: % requested, % available',
                item.product_id, item.quantity, available;
        end if;

        insert into stock_movements
            (org_id, product_id, sale_id, movement_type, quantity, reason, created_by)
        values
            (v_org, item.product_id, p_sale_id, 'out', item.quantity, 'Sale', auth.uid());
    end loop;

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$fn_complete_sale$;
