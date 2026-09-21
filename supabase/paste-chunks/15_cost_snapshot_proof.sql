-- ============================================================================
-- Demonstration for migration 0006: margin computed from a snapshot holds
-- still; margin computed from the current cost price does not.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Run it AFTER 0006. Before 0006 the unit_cost column does not exist.
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID with your auth user id.
--
-- THE SCENARIO
--   Sell 3 A4 exercise books. They sell for 850 and cost 600, so the margin on
--   that sale is 2550 - 1800 = 750, and that is a historical fact.
--
--   Then a supplier raises the price to 900. Nothing about the sale that
--   already happened has changed.
--
-- EXPECTED FINAL GRID
--   revenue                      = 2550.00
--   margin_from_snapshot         =  750.00   <- correct, and unchanged
--   margin_from_current_cost     = -150.00   <- what FR-7.2 used to compute
--
--   The third figure claims a sale that made 750 naira actually lost 150. It
--   moves every time a supplier price moves, retroactively, with no record that
--   anything was restated.
-- ============================================================================

begin;

-- The acting user is resolved, not pasted in. Earlier drafts of these scripts
-- carried a literal auth uid, which meant they only ran for the person who
-- wrote them, and put that person's account id in the repository. The oldest
-- profile is used: the account that created the organisation.
create temp table t_actor on commit drop as
select id from profiles order by created_at limit 1;

do $fn_require_actor$
begin
    if not exists (select 1 from t_actor) then
        raise exception
            'No profile exists yet. Sign up through the app first, then run this.';
    end if;
end;
$fn_require_actor$;

select set_config('request.jwt.claims',
                  json_build_object('sub', (select id from t_actor),
                                    'role', 'authenticated')::text,
                  true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Sell three exercise books at today's cost price.
-- ---------------------------------------------------------------------------
insert into sales (id, org_id, reference, sold_by, status, payment_method)
values ('55555555-0000-0000-0000-000000000001',
        current_org_id(), 'SA-COST-TEST', auth.uid(), 'draft', 'cash');

insert into sale_items (sale_id, product_id, quantity, unit_price)
select '55555555-0000-0000-0000-000000000001', id, 3, unit_price
from products
where org_id = current_org_id() and sku = 'STA-001';

select complete_sale('55555555-0000-0000-0000-000000000001');

-- What was captured at completion.
select si.quantity, si.unit_price, si.unit_cost, si.line_total
from sale_items si
where si.sale_id = '55555555-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- The supplier raises the price. This says nothing about the sale above.
-- ---------------------------------------------------------------------------
update products
   set cost_price = 900.00
 where org_id = current_org_id() and sku = 'STA-001';

-- ---------------------------------------------------------------------------
-- The same sale, measured both ways.
-- ---------------------------------------------------------------------------
select
    sum(si.line_total)                                as revenue,
    sum(si.line_total - si.quantity * si.unit_cost)   as margin_from_snapshot,
    sum(si.line_total - si.quantity * p.cost_price)   as margin_from_current_cost
from sale_items si
join products p on p.id = si.product_id
where si.sale_id = '55555555-0000-0000-0000-000000000001';

rollback;
