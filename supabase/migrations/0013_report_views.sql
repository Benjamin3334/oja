-- ============================================================================
-- 0013 - Report views: aggregation belongs in SQL.
--
-- WHY VIEWS AND NOT QUERIES
--   FR-7.1 requires revenue "driven by SQL aggregation, not client-side
--   loops", and FR-7.2 and FR-7.3 are group-by aggregates. PostgREST cannot
--   express GROUP BY, HAVING, or a join between two tables with a sum over
--   one of them. Without views the application would have to fetch every
--   sale_item and add them up in TypeScript, which is the thing the
--   requirement forbids.
--
--   Views also put the report definitions IN THE SCHEMA, as readable SQL,
--   rather than hiding them inside application code. Reference queries 9.4
--   to 9.7 in 0001 exist to be rehearsed; these are those queries, promoted
--   from comments to objects the database actually evaluates.
--
-- SECURITY_INVOKER IS NOT OPTIONAL
--   A view runs as its OWNER by default, and the owner here is postgres, who
--   owns the underlying tables and therefore bypasses their policies. That is
--   exactly the leak migration 0002 measured and closed - 0, 5 through the
--   view against 0, 0 through the base table. Every view below is declared
--   security_invoker = true so RLS runs as the caller, and each one is scoped
--   to the caller organisation by the policies on sales, sale_items and
--   products rather than by a where clause here.
--
-- CONSEQUENCE OF 0008 THAT THE APPLICATION MUST HONOUR
--   sales is scoped by sold_by, so a staff member reading v_revenue_by_day or
--   v_product_performance sees only their own sales. Those two views are
--   therefore per-person for staff, and the figures would read as the whole
--   shop while being a fraction of it. Section 9.2 says staff may not view
--   reports at all, so the route gates the page to owner and manager. The
--   views are not the control; the route is, and the policies behind them.
--
-- MARGIN USES THE SNAPSHOT, NOT THE CURRENT COST
--   FR-7.2 is explicit: margin is revenue minus quantity times
--   sale_items.unit_cost, the cost captured when the sale completed (0006).
--   Reference query 9.6 in 0001 uses products.cost_price and is WRONG for
--   this purpose - it would let a supplier renegotiation today silently
--   restate last quarter margins, which is the precise failure the price
--   snapshot in section 6.2 exists to prevent. v_product_performance below
--   is the corrected form.
--
-- THE DAY BOUNDARY IS LAGOS, NOT UTC
--   sold_at is timestamptz, so grouping it directly groups by UTC day. A shop
--   in Lagos closing at 21:00 is fine, but a sale at 00:30 local is 23:30 the
--   previous day in UTC and would land in yesterday takings. Section 11 of
--   the PRD names this risk. Every date_trunc below therefore converts first.
--
--   The zone is hard-coded. organisations carries a currency but no timezone,
--   and adding one is a schema change with a backfill, not a report. For a
--   single-country MVP this is correct and stated; a second country makes it
--   a column.
--
-- WEEK AND MONTH
--   Only a daily view is defined. A week or a month is then a sum of at most
--   31 pre-aggregated day rows, which is not the client-side loop FR-7.1
--   forbids - the join and the per-line summation, the parts that scale with
--   the number of sales, have already happened in SQL.
--
-- VERIFY AFTER RUNNING
--   select * from v_revenue_by_day order by day desc limit 7;
--   select * from v_product_performance order by gross_margin desc;
--   select sum(stock_value) from v_stock_valuation;
--   Then, as a staff account, confirm the first two return only your sales.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. FR-7.1 - revenue by day.
--    Voided sales are excluded: a void returns the goods and the money, so
--    counting it would report revenue the shop does not have. Drafts are
--    excluded because nothing has been sold yet.
-- ---------------------------------------------------------------------------
create or replace view v_revenue_by_day
with (security_invoker = true) as
select
    s.org_id,
    (s.sold_at at time zone 'Africa/Lagos')::date as day,
    count(distinct s.id)                          as sale_count,
    coalesce(sum(si.quantity), 0)                 as items_sold,
    coalesce(sum(si.line_total), 0)::numeric(14,2) as revenue
from sales s
join sale_items si on si.sale_id = s.id
where s.status = 'completed'
group by s.org_id, (s.sold_at at time zone 'Africa/Lagos')::date;

comment on view v_revenue_by_day is
    'FR-7.1. One row per organisation per LAGOS calendar day, completed sales
     only. Week and month totals are sums of these rows.';


-- ---------------------------------------------------------------------------
-- 2. FR-7.2 - product performance.
--    This is reference query 9.6, corrected. 9.6 multiplies by
--    products.cost_price; this multiplies by sale_items.unit_cost, the cost
--    recorded at the moment the sale completed.
--
--    unit_cost is nullable: 0006 added the column, and any sale completed
--    before that migration has none. coalesce to 0 would silently report
--    those lines as pure profit, so they are summed as null-free zero cost
--    ONLY through an explicit coalesce, and the count of such lines is
--    exposed so a reader can see how much of the margin is approximate.
-- ---------------------------------------------------------------------------
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

comment on view v_product_performance is
    'FR-7.2. Units, revenue and gross margin per product. Margin uses
     sale_items.unit_cost, the snapshot taken at completion (0006), NOT
     products.cost_price - using the current cost against historical revenue
     would let a supplier renegotiation restate past margins. Reference query
     9.6 in 0001 predates 0006 and is superseded by this view.
     lines_without_cost counts sale lines completed before 0006, whose cost is
     unknown and treated as zero.';


-- ---------------------------------------------------------------------------
-- 3. FR-7.3 - stock valuation.
--    Here products.cost_price IS the right column, and the contrast with the
--    view above is the point: valuing stock you hold TODAY asks what it would
--    cost to replace today. Valuing a sale that already happened asks what it
--    cost then. Same arithmetic, different question, different column.
--
--    Built on v_product_stock so the derived-stock rule holds: stock is the
--    sum of the movement ledger, never a stored column.
-- ---------------------------------------------------------------------------
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

comment on view v_stock_valuation is
    'FR-7.3. Stock at cost, per product, with its category for the breakdown.
     Uses products.cost_price - the CURRENT cost - because this values goods
     still on the shelf, not goods already sold. Inactive products are
     excluded: they are not stock the shop intends to sell.';


-- ---------------------------------------------------------------------------
-- 4. Grants. RLS still applies underneath; select is only the right to ask.
-- ---------------------------------------------------------------------------
grant select on v_revenue_by_day     to authenticated;
grant select on v_product_performance to authenticated;
grant select on v_stock_valuation     to authenticated;
