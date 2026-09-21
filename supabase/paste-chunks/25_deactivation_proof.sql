-- ============================================================================
-- Failing case for migration 0016: deactivating a member changes a boolean
-- and nothing else.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Nothing to substitute.
--
-- THE BUG
--   profiles.is_active exists, FR-6.1 promises "Owner can change roles and
--   deactivate members", and nothing in the database reads the column.
--
--       create or replace function current_org_id() ... as $$
--           select org_id from public.profiles where id = auth.uid();
--       $$;
--
--   No is_active. current_user_role() is the same. Every policy in the schema
--   is written against those two functions, so a deactivated member keeps
--   their organisation, keeps their role, and keeps every permission they had
--   the moment before. The owner sees a switch move. The member notices
--   nothing at all.
--
--   This is worse than an unimplemented feature. An unimplemented feature is
--   absent; this one is present, visible in the UI, and wrong. An owner who
--   deactivates someone they no longer trust has been told the job is done.
--
-- WHAT THIS SCRIPT DOES
--   Picks a real member, confirms they can read their organisation products,
--   deactivates them as the database owner, and then asks the same questions
--   again as that same user. Before 0016 every answer is unchanged.
--
-- EXPECTED BEFORE 0016 (final grid):
--   org_before          = <a uuid>
--   org_after           = the SAME uuid   <- WRONG, still attached
--   role_after          = their role      <- WRONG, still privileged
--   products_after      = same count      <- WRONG, still reading everything
--
-- EXPECTED AFTER 0016:
--   org_after           = null
--   role_after          = null
--   products_after      = 0
--   own_profile_after   = true   they can still read their own row, which is
--                                how the application tells them why
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: pick a member, as the database owner.
-- ---------------------------------------------------------------------------
create temp table t_actor on commit drop as
select id, org_id, role
from profiles
where is_active
order by created_at
limit 1;

do $fn_require_actor$
begin
    if not exists (select 1 from t_actor) then
        raise exception
            'No active profile exists. Sign up through the app first.';
    end if;
end;
$fn_require_actor$;

select id as acting_as, org_id as home_org, role from t_actor;

-- ---------------------------------------------------------------------------
-- Phase 2: as that member, while still active. The baseline.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from t_actor),
                      'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_before on commit drop as
select current_org_id()                    as org_before,
       current_user_role()::text           as role_before,
       (select count(*) from products)     as products_before;

select * from t_before;

-- ---------------------------------------------------------------------------
-- Phase 3: the owner deactivates them. Done as the database owner because
-- since 0014 nobody may write is_active through the API at all - that is the
-- capability migration 0017 restores, through a guarded function.
-- ---------------------------------------------------------------------------
set local role postgres;

update profiles set is_active = false where id = (select id from t_actor);

-- ---------------------------------------------------------------------------
-- Phase 4: same user, same session, now deactivated. Ask again.
-- ---------------------------------------------------------------------------
set local role authenticated;

select
  (select org_before from t_before)                  as org_before,
  current_org_id()                                   as org_after,
  (select role_before from t_before)                 as role_before,
  current_user_role()::text                          as role_after,
  (select products_before from t_before)             as products_before,
  (select count(*) from products)                    as products_after,
  exists (select 1 from profiles where id = auth.uid()) as own_profile_after;

rollback;
