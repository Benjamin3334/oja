-- ============================================================================
-- Failing case for migration 0014: a user can move themselves into another
-- organisation and read everything in it.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Run it BEFORE 0014 (the update succeeds - that is the bug) and again AFTER
-- 0014 (the update must be refused).
--
-- NOTHING TO SUBSTITUTE. Earlier proof scripts asked for YOUR_AUTH_UID to be
-- pasted in by hand. This one reads an existing profile and impersonates that
-- user, because a placeholder left unreplaced fails with an unrelated-looking
-- uuid parse error from inside current_org_id().
--
-- THE BUG
--   profiles carries two UPDATE policies, and permissive policies are OR-ed:
--
--       create policy profiles_update_self on profiles
--           for update using (id = auth.uid())
--           with check (id = auth.uid()
--                       and role = (select role from profiles
--                                    where id = auth.uid()));
--
--   The check pins id and role. It says nothing about org_id.
--
--   The comment above it in 0001 reads "a user may edit their own name, but
--   NOT their own role (no self-promotion)". That is true, and it is guarding
--   the wrong column. role decides what you may do inside your organisation;
--   org_id decides WHICH ORGANISATION YOU ARE IN. current_org_id() reads it,
--   and every policy in the database is written against current_org_id().
--
--   So one UPDATE relocates the caller into another tenant, with their role
--   carried across intact. Since create_organisation_and_profile makes anyone
--   the owner of an organisation they create, the full path is: sign up,
--   create your own shop, become owner, then move to the target - still owner.
--
-- WHAT STOPS THIS BEING TRIVIAL
--   org_id references organisations(id), so the value must be a real
--   organisation, and org_select only exposes your own, so the ids cannot be
--   enumerated through the API. A uuid is not guessable. This is not
--   exploitable by a stranger. It is exploitable by anyone who has ever seen
--   another organisation id: a former member, a screenshot, a log line.
--
-- PHASE 1 RUNS AS THE DATABASE OWNER
--   The second organisation is created before dropping to the authenticated
--   role, because no client may insert an organisation (0011). That is setup,
--   not part of the attack. The attack itself, phase 3, runs as an ordinary
--   authenticated user with nothing but their own session.
--
-- EXPECTED BEFORE 0014 (final grid):
--   org_after is a DIFFERENT uuid from org_before, ending 9999...0001
--   rival_rows_before = 0    the rival product was invisible
--   rival_rows_after  = 1    it is now readable
--
-- EXPECTED AFTER 0014:
--   the UPDATE in phase 3 is refused with a permission error naming profiles.
--   The transaction aborts there, so the final grid does not print - that
--   abort IS the pass.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: setup, as the database owner. A second organisation with one
-- product in it, standing in for somebody else shop, and the identity this
-- proof will act as.
-- ---------------------------------------------------------------------------
insert into organisations (id, name, slug)
values ('99999999-0000-0000-0000-000000000001', 'Rival Shop', 'rival-shop-proof');

insert into products (org_id, sku, name, unit_price, cost_price, reorder_level)
values ('99999999-0000-0000-0000-000000000001', 'RIV-001', 'Rival Product',
        500.00, 300.00, 5);

-- The oldest real profile, whoever that is. Its organisation becomes "home".
create temp table t_actor on commit drop as
select id, org_id
from profiles
where org_id <> '99999999-0000-0000-0000-000000000001'
order by created_at
limit 1;

do $fn_require_actor$
begin
    if not exists (select 1 from t_actor) then
        raise exception
            'No profile exists yet. Sign up through the app first, then run this.';
    end if;
end;
$fn_require_actor$;

select id as acting_as, org_id as home_org from t_actor;

-- ---------------------------------------------------------------------------
-- Phase 2: become that ordinary signed-in user and record the starting point.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from t_actor),
                      'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_before on commit drop as
select current_org_id() as org_before,
       (select count(*) from products
         where org_id = '99999999-0000-0000-0000-000000000001') as rival_rows_before;

select * from t_before;

-- ---------------------------------------------------------------------------
-- Phase 3: the hole. One statement, no privileges beyond the caller own row.
-- BEFORE 0014 this returns a row. AFTER 0014 it must be refused.
-- ---------------------------------------------------------------------------
update profiles
   set org_id = '99999999-0000-0000-0000-000000000001'
 where id = auth.uid()
returning id, org_id, role;

-- ---------------------------------------------------------------------------
-- Phase 4: the damage. Same session, same user, different tenant.
-- ---------------------------------------------------------------------------
select
  (select org_before from t_before)                              as org_before,
  current_org_id()                                               as org_after,
  (select rival_rows_before from t_before)                       as rival_rows_before,
  (select count(*) from products
    where org_id = '99999999-0000-0000-0000-000000000001')       as rival_rows_after;

rollback;
