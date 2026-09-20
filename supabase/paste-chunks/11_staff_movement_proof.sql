-- ============================================================================
-- Failing case for migration 0003: a staff member can fabricate stock.
--
-- NOT a migration. Runs in one transaction and ends in rollback, so it changes
-- nothing. Run it before 0003 and again after.
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID below with your auth user id.
--     select id, email, created_at from auth.users order by created_at;
--
-- THE BUG
--   0001 section 6 carries this policy:
--
--     create policy movements_insert on stock_movements
--         for insert with check (org_id = current_org_id());
--
--   The comment directly above it in 0001 reads "Only managers and owners may
--   manually move stock." The policy does not say that. It checks the tenant
--   and nothing else, so any staff member can insert any movement they like:
--   inflate stock, or paper over a shortfall after taking goods.
--
--   That contradicts the role matrix in PRD section 9.2, where "Receive stock
--   / adjust" is marked unavailable to staff, and it undermines goal G3,
--   "make every stock change traceable to a person, a time and a reason".
--
-- WHAT THIS SCRIPT DOES
--   Temporarily demotes your own profile to 'staff' inside the transaction,
--   adopts your identity as an ordinary authenticated user, and then tries to
--   invent 999 units of stock. Today the insert succeeds and returns a row.
--   After 0003 it must fail with:
--       new row violates row-level security policy for table "stock_movements"
-- ============================================================================

begin;

-- Become a staff member of your own organisation, for this transaction only.
update profiles set role = 'staff' where id = '57f6a574-7001-468c-bb48-5bb9f76806f8';

select set_config('request.jwt.claims',
                  '{"sub":"57f6a574-7001-468c-bb48-5bb9f76806f8","role":"authenticated"}',
                  true);

set local role authenticated;

-- Confirm the setup before trusting the result below.
select auth.uid() as who_am_i,
       current_org_id() as my_org,
       current_user_role() as my_role;   -- must read 'staff'

-- A staff member inventing stock out of nothing.
-- Today: returns one row. After 0003: raises a policy violation.
insert into stock_movements (org_id, product_id, movement_type, quantity, reason, created_by)
select org_id, id, 'in', 999, 'Fabricated by a staff account', auth.uid()
from products
where org_id = current_org_id()
limit 1
returning id, product_id, quantity, reason;

rollback;
