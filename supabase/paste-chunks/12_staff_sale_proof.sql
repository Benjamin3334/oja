-- ============================================================================
-- Regression test for migration 0003: a staff member can still record a sale.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Run it before 0003 (should pass) and after 0003 (must still pass).
--
-- WHY THIS EXISTS
--   0003 restricts direct stock_movements inserts to owner and manager. The
--   risk is that it also blocks the 'out' movements that completing a sale
--   writes, which would stop staff selling anything at all. complete_sale() is
--   made SECURITY DEFINER to avoid that. This script proves it worked.
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID with your auth user id.
--
-- EXPECTED RESULT (final grid):
--   stock_after       = 97     (opening stock 100, minus 3 sold)
--   movements_written = 1      (one 'out' movement, attributed to the staff user)
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

-- Become a staff member of your own organisation, for this transaction only.
update profiles set role = 'staff' where id = (select id from t_actor);

select set_config('request.jwt.claims',
                  json_build_object('sub', (select id from t_actor),
                                    'role', 'authenticated')::text,
                  true);

set local role authenticated;

-- Confirm the setup. my_role must read 'staff', or the test proves nothing.
select auth.uid() as who_am_i,
       current_org_id() as my_org,
       current_user_role() as my_role;

-- A staff member builds a sale: three A4 exercise books.
insert into sales (id, org_id, reference, sold_by, status, payment_method)
values ('77777777-0000-0000-0000-000000000001',
        current_org_id(), 'SA-TEST-0001', auth.uid(), 'draft', 'cash');

insert into sale_items (sale_id, product_id, quantity, unit_price)
select '77777777-0000-0000-0000-000000000001', id, 3, unit_price
from products
where org_id = current_org_id() and sku = 'STA-001';

-- The moment of truth: this writes the 'out' movement.
select complete_sale('77777777-0000-0000-0000-000000000001');

-- Stock must have fallen from 100 to 97, with exactly one movement recorded.
select
  (select stock_quantity from v_product_stock
     where org_id = current_org_id() and sku = 'STA-001')          as stock_after,
  (select count(*) from stock_movements
     where sale_id = '77777777-0000-0000-0000-000000000001')       as movements_written;

rollback;
