-- ============================================================================
-- Chunk 20 - migration 0013, view 3 of 3: v_stock_valuation (FR-7.3).
--
-- Paste aid only. supabase/migrations/0013_report_views.sql remains the
-- committed source of truth.
--
-- This view uses products.cost_price, and the contrast with chunk 19 is the
-- whole point. Valuing stock held TODAY asks what it would cost to replace
-- today, so it uses the current cost. Valuing a sale that already happened
-- asks what it cost THEN, so it uses the snapshot. Same arithmetic, different
-- question, different column.
--
-- Built on v_product_stock so the derived-stock rule holds: stock is the sum
-- of the movement ledger, never a stored column.
-- ============================================================================

create or replace view v_stock_valuation
with (security_invoker = true) as
select
    vps.org_id,
    vps.product_id,
    vps.sku,
    vps.name,
    vps.category_id,
    c.name                                              as category_name,
    vps.stock_quantity,
    vps.cost_price,
    (vps.stock_quantity * vps.cost_price)::numeric(14,2) as stock_value
from v_product_stock vps
left join categories c on c.id = vps.category_id
where vps.is_active;

grant select on v_stock_valuation to authenticated;
