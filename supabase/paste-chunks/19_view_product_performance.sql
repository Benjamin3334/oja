-- ============================================================================
-- Chunk 19 - migration 0013, view 2 of 3: v_product_performance (FR-7.2).
--
-- Paste aid only. supabase/migrations/0013_report_views.sql remains the
-- committed source of truth; this is that view, on its own, because the whole
-- migration in one paste did not reach the end.
--
-- Margin uses sale_items.unit_cost, the snapshot taken when the sale completed
-- (0006), NOT products.cost_price. Using today cost against historical revenue
-- would let a supplier renegotiation restate last quarter margins - the exact
-- failure the unit_price snapshot exists to prevent. Reference query 9.6 in
-- 0001 predates 0006 and is superseded by this view.
--
-- security_invoker = true is not optional: a view runs as its owner, and the
-- owner here owns the base tables and so bypasses their policies. That is the
-- leak measured in 0002.
-- ============================================================================

create or replace view v_product_performance
with (security_invoker = true) as
select
    s.org_id,
    p.id                                              as product_id,
    p.sku,
    p.name,
    p.category_id,
    sum(si.quantity)                                  as units_sold,
    sum(si.line_total)::numeric(14,2)                 as revenue,
    sum(si.quantity * coalesce(si.unit_cost, 0))::numeric(14,2)
                                                      as cost_of_goods,
    (sum(si.line_total) - sum(si.quantity * coalesce(si.unit_cost, 0)))::numeric(14,2)
                                                      as gross_margin,
    count(*) filter (where si.unit_cost is null)      as lines_without_cost,
    max(s.sold_at)                                    as last_sold_at
from sale_items si
join sales    s on s.id = si.sale_id
join products p on p.id = si.product_id
where s.status = 'completed'
group by s.org_id, p.id, p.sku, p.name, p.category_id;

grant select on v_product_performance to authenticated;
