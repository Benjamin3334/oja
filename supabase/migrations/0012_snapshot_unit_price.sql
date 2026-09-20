-- ============================================================================
-- 0012 - The line price comes from the product, not from the request.
--
-- THE BUG
--   sale_items.unit_price is supplied by whoever inserts the line:
--
--       insert into sale_items (sale_id, product_id, quantity, unit_price)
--       values (..., 2, 0.00);
--
--   and complete_sale() never touches it. 0006 taught that function to
--   snapshot unit_cost from the product at completion, on the argument that a
--   historical fact must be recorded while it is still true. unit_price is the
--   same kind of fact and was left exactly as the client sent it.
--
--   The column comment has said the right thing since 0001 - "HISTORICAL
--   SNAPSHOT. This is what the customer actually paid on that day" - but
--   nothing enforced it. It described an intention, not a guarantee.
--
--   MEASURED, as authenticated, before this migration
--   (supabase/paste-chunks/17_line_price_hole_proof.sql), two units of STA-001
--   which sells for 850.00:
--       unit_price_on_line  = 0.00
--       line_total          = 0.00
--       unit_cost_snapshot  = 600.00
--       stock_moved         = 2
--
--   Everything except the money is correct, which is what makes it dangerous.
--   The stock is deducted, the ledger line is written, the cost is snapshotted.
--   Revenue, profit and customer lifetime spend all derive from line_total, so
--   all three are wrong in the same direction at once and nothing disagrees
--   with anything. The sale even reports a loss of 1200.00 that never happened,
--   because the real cost was recorded against a fictional price.
--
--   line_total offers no protection. It is generated always as
--   quantity * unit_price, maintained by PostgreSQL and impossible to
--   desynchronise, so it computes the wrong number perfectly.
--
-- THE FIX
--   complete_sale() sets unit_price alongside unit_cost, from the same
--   products row, in the same statement, at the same instant. One extra column
--   in an update that was already being issued: no new pass, no new lock, and
--   the products rows are already locked by the loop above it.
--
--   That is the section 6.2 symmetry restored. products.unit_price is what the item
--   sells for today; sale_items.unit_price is what it sold for then. Price and
--   cost are now both snapshots, taken together, from one source. Before this
--   migration the pair was incoherent - cost historical, price whatever was
--   typed - and that incoherence is exactly the seam an examiner pulls on.
--
-- WHAT THIS DOES NOT DO
--   It does not stop a client writing a price onto a DRAFT line. A draft can
--   still hold 0.00 until it is completed. That is deliberate and harmless:
--   nothing reads a draft as revenue, no stock has moved, and the correction
--   happens before the row becomes a historical record. Blocking the write
--   itself would need a column privilege on sale_items and a default, which
--   buys nothing a completed sale does not already guarantee.
--
--   It also removes any possibility of a per-line discount, because the price
--   is now always the product's. The MVP has no discount feature, so nothing
--   is lost today. If one is ever wanted, the seam is a separate
--   discount_amount column on sale_items with unit_price left authoritative -
--   NOT a relaxation of this rule, or the hole returns exactly as it was.
--
-- VERIFY AFTER RUNNING
--   Re-run 17_line_price_hole_proof.sql. The line must read 850.00 and the
--   line total 1700.00, although the insert asked for 0.00.
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

    -- 0006 recorded what the goods cost us. 0012 records what they sold for,
    -- from the same row, in the same statement, at the same instant. Set based
    -- rather than inside the loop: one statement, one pass, and the products
    -- rows are already locked above.
    update sale_items si
       set unit_cost  = p.cost_price,
           unit_price = p.unit_price
      from products p
     where si.sale_id = p_sale_id
       and si.product_id = p.id;

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$fn_complete_sale$;
