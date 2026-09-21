-- ============================================================================
-- Failing case for migration 0015: a caller with no organisation passes the
-- tenant check inside complete_sale() and void_sale().
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Nothing to substitute.
--
-- THE BUG
--   Both functions are security definer, so they see every tenant and must
--   check the tenant themselves. They check it like this:
--
--       if v_org <> current_org_id() then
--           raise exception 'Sale % does not belong to your organisation';
--       end if;
--
--   In SQL, anything <> NULL evaluates to NULL, not to true. And IF NULL THEN
--   does not fire. So when current_org_id() returns NULL the comparison is
--   neither true nor false, the raise is skipped, and the function carries on
--   as though the tenant matched.
--
--   void_sale() has the same shape twice over:
--
--       if current_user_role() not in ('owner','manager') then
--
--   NULL NOT IN (...) is also NULL, so the role check is skipped too.
--
-- HOW FAR THE ATTACK ACTUALLY GETS TODAY, AND WHY THAT MATTERS
--   An earlier version of this script gave the sale a line item, and it failed
--   at complete_sale line 32 with:
--
--       insert or update on table "stock_movements" violates foreign key
--       constraint "stock_movements_created_by_fkey"
--
--   That is worth reading carefully. Reaching line 32 proves the tenant guard
--   was skipped - the function was already deep in its body. The attack was
--   then stopped by something else entirely: created_by references
--   profiles(id), and a caller with no profile cannot satisfy it.
--
--   So the bug is LATENT rather than exploitable today, and what contains it
--   is a foreign key nobody designed as a security control.
--
--   That containment does not survive migration 0016. A DEACTIVATED member
--   has a profile row, so the foreign key is satisfied; the only thing that
--   would make current_org_id() return NULL for them is the very change 0016
--   makes. Fixing the NULL comparison first is what stops a deactivation from
--   becoming a privilege.
--
--   This version therefore gives the sale NO line items. The movement loop
--   never runs, so the foreign key is never reached, and what remains is the
--   guard on its own: a caller belonging to no organisation flipping somebody
--   else sale to completed.
--
-- EXPECTED BEFORE 0015 (final grid):
--   caller_org        = null        the caller belongs to no organisation
--   sale_status       = completed   <- WRONG, a stranger completed it
--   movements_written = 0           no lines, so no ledger writes either way
--
-- EXPECTED AFTER 0015:
--   complete_sale raises 'Your account is not attached to an organisation'
--   and the transaction aborts before the grid prints.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: setup, as the database owner. A draft sale in a real organisation,
-- deliberately with no lines, so the foreign key on created_by cannot mask
-- the thing being measured.
-- ---------------------------------------------------------------------------
create temp table t_target on commit drop as
select id as org_id from organisations order by created_at limit 1;

do $fn_require_target$
begin
    if not exists (select 1 from t_target) then
        raise exception 'No organisation exists yet.';
    end if;
end;
$fn_require_target$;

insert into sales (id, org_id, reference, sold_by, status, payment_method)
select '88888888-0000-0000-0000-000000000001',
       org_id, 'SA-NULL-TENANT-TEST', null, 'draft', 'cash'
from t_target;

select org_id as target_org from t_target;

-- ---------------------------------------------------------------------------
-- Phase 2: become a signed-in user who has no profile. This is the state a
-- real user occupies between sign-up and onboarding.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_caller on commit drop as
select current_org_id() as caller_org;

select * from t_caller;   -- must be null

-- ---------------------------------------------------------------------------
-- Phase 3: the hole. The tenant check compares against NULL and is skipped.
-- BEFORE 0015 this succeeds. AFTER 0015 it must raise.
-- ---------------------------------------------------------------------------
select complete_sale('88888888-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Phase 4: the damage. Somebody else sale is completed by a caller who
-- belongs to no organisation at all.
-- ---------------------------------------------------------------------------
set local role postgres;

select
  (select caller_org from t_caller)                              as caller_org,
  (select status from sales
    where id = '88888888-0000-0000-0000-000000000001')           as sale_status,
  (select count(*) from stock_movements
    where sale_id = '88888888-0000-0000-0000-000000000001')      as movements_written;

rollback;
