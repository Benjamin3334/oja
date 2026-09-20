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

-- Become a staff member of your own organisation, for this transaction only.
update profiles set role = 'staff' where id = '57f6a574-7001-468c-bb48-5bb9f76806f8';

select set_config('request.jwt.claims',
                  '{"sub":"57f6a574-7001-468c-bb48-5bb9f76806f8","role":"authenticated"}',
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
