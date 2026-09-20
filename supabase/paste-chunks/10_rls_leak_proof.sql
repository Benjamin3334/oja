-- ============================================================================
-- RLS leak proof. NOT a migration and NOT part of the baseline.
--
-- Demonstrates that the four reporting views bypass row-level security,
-- because a PostgreSQL view runs with the privileges of its OWNER rather than
-- its caller, and the owner (postgres) is exempt from RLS on the tables it
-- owns. Fixed by migration 0002.
--
-- Runs in one transaction and ends in rollback, so it changes nothing and can
-- be run repeatedly. Run it before 0002 and again after.
-- ============================================================================

begin;

set local role authenticated;

-- As authenticated with no JWT, auth.uid() is null, so current_org_id() is
-- null, so the policy org_id = current_org_id() matches nothing.
-- The base table MUST therefore return 0. The view reads the same table
-- through the same policy, so it must return 0 as well.
--
--   both 0            -> RLS is holding, no leak
--   table 0, view > 0 -> the view is bypassing RLS. That gap is the bug.
select
  (select count(*) from products)        as rows_via_base_table,
  (select count(*) from v_product_stock) as rows_via_view;

rollback;
