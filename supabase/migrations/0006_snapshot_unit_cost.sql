-- ============================================================================
-- 0006 - Snapshot the cost price onto sale_items, so margin stays historical.
--
-- THE BUG
--   Section 6.2 of the PRD argues at length that sale_items.unit_price is not
--   redundancy but a historical fact: products.unit_price is what a thing costs
--   TODAY, and only a stored copy can answer what was actually charged then.
--
--   FR-7.2 then computes gross margin as
--
--       revenue - (units sold x products.cost_price)
--
--   using the CURRENT cost price against HISTORICAL revenue. The same mistake
--   the snapshot argument exists to prevent, made one column over. Renegotiate
--   with a supplier and last quarter's margins silently restate themselves.
--   Nothing errors; the numbers simply become fiction.
--
--   This is the seam an examiner pulls on, because the document explains the
--   principle on one page and breaks it on another.
--
-- THE FIX
--   sale_items.unit_cost, populated at the moment the sale completes. From then
--   on margin is computed entirely from facts recorded at the time of sale:
--
--       sum(si.line_total - si.quantity * si.unit_cost)
--
--   and no later edit to products can reach backwards into it.
--
-- WHY THE COLUMN IS NULLABLE
--   A draft sale has line items before it has a cost snapshot, because the
--   snapshot is taken at completion. NOT NULL would make it impossible to
--   insert a draft line at all. So null carries a precise meaning: this line
--   belongs to a sale that was never completed, or to one completed before this
--   migration existed. Every margin query filters on status = 'completed'
--   already, so it will never meet a null in practice.
--
-- WHY COMPLETION AND NOT INSERTION
--   unit_price is captured when the line is added, because that is the price
--   the customer was quoted. Cost is captured at completion, because that is
--   the moment the goods actually leave and the transaction becomes a fact. A
--   draft abandoned for a week should not carry a week-old cost.
--
-- THE BACKFILL, AND ITS HONEST LIMITATION
--   Rows completed before this migration have no recorded cost, and it cannot
--   be recovered - that information was never stored. They are backfilled from
--   the CURRENT products.cost_price, which is an approximation and precisely
--   the thing this migration exists to stop relying on. It is acceptable here
--   only because those rows are test data; on a real system this row count is
--   the size of the gap in the audit trail, and should be stated rather than
--   quietly filled.
--
-- ORDERING NOTE
--   This migration replaces complete_sale(), and so did 0004. The body below is
--   0004's version - tenant check from 0003, row lock from 0004 - with the cost
--   snapshot added. Dropping either would silently undo an earlier fix on a
--   rebuild from empty, since migrations replay in filename order and 0006
--   runs after 0004.
--
-- SUPERSEDES
--   Reference query 9.6 in 0001 still computes margin from p.cost_price and is
--   now wrong. The corrected form is:
--
--     select p.name,
--            sum(si.line_total)                                as revenue,
--            sum(si.quantity * si.unit_cost)                   as cost,
--            sum(si.line_total - si.quantity * si.unit_cost)   as gross_margin
--     from sale_items si
--     join products p on p.id = si.product_id
--     join sales    s on s.id = si.sale_id and s.status = 'completed'
--     group by p.id, p.name
--     order by gross_margin desc;
--
-- VERIFY AFTER RUNNING
--   supabase/paste-chunks/15_cost_snapshot_proof.sql completes a sale, then
--   changes the product's cost price, and shows the snapshot margin holding
--   steady while the current-cost margin moves.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
alter table sale_items
    add column if not exists unit_cost numeric(12,2) check (unit_cost >= 0);

comment on column sale_items.unit_cost is
    'HISTORICAL SNAPSHOT of products.cost_price at the moment the sale was
     completed. Mirrors unit_price: products.cost_price is what the item costs
     to buy TODAY, unit_cost is what it cost then. Null means the sale was never
     completed, or was completed before migration 0006.';


-- ---------------------------------------------------------------------------
-- 2. Backfill. An approximation for rows whose real cost was never recorded.
-- ---------------------------------------------------------------------------
update sale_items si
   set unit_cost = p.cost_price
  from products p
 where si.product_id = p.id
   and si.unit_cost is null;


-- ---------------------------------------------------------------------------
-- 3. complete_sale() takes the snapshot.
--    Body carried forward from 0004: tenant check (0003) and row lock (0004).
-- ---------------------------------------------------------------------------
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

    -- The tenant check RLS used to perform for us (0003).
    if v_org <> current_org_id() then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        -- Serialise concurrent sales of this product (0004).
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

    -- 0006: record what the goods cost us, now, while it is still true. Set
    -- based rather than inside the loop: one statement, one pass, and the
    -- products rows are already locked above.
    update sale_items si
       set unit_cost = p.cost_price
      from products p
     where si.sale_id = p_sale_id
       and si.product_id = p.id;

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$fn_complete_sale$;
