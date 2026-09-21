-- ============================================================================
-- Verification for migration 0017: the two guards on member management.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Nothing to substitute. RUN IT AFTER 0017.
--
-- WHY THIS ONE IS AN AFTER-ONLY CHECK
--   0014 to 0016 fixed defects, so each had a "before" worth measuring. 0017
--   adds a capability that 0014 deliberately removed, so before it the only
--   observable behaviour is "function does not exist". There is nothing
--   interesting to record from that. What matters here is whether the guards
--   actually hold, so this script exercises them and prints what each one did.
--
-- HOW IT REPORTS
--   Each check runs inside its own DO block with an exception handler, so a
--   refusal is CAUGHT and written to a table instead of aborting the
--   transaction. That means all four checks run and you see one grid, rather
--   than the script stopping at the first successful guard.
--
--   PL/pgSQL exception blocks open a subtransaction, so a caught error rolls
--   back only the statement that raised it. The outer transaction survives.
--
-- WHAT IT ASSUMES
--   That the signed-in owner is the ONLY active owner in their organisation,
--   which is the state after a normal sign-up. If a second owner exists, the
--   two last-owner checks will legitimately report ALLOWED, because in that
--   case the rule permits it - and the grid will say so rather than failing.
--
-- EXPECTED (final grid), as the only owner:
--   deactivate self             refused: You cannot deactivate your own account
--   demote self as last owner   refused: An organisation must keep at least one
--                                        active owner
--   deactivate a stranger       refused: That member was not found
--   no-op role change           allowed - changes nothing and breaks no rule
--   role after all checks       owner
--   is_active after all checks  true
--
-- ONE RESULT SET ON PURPOSE
--   The Supabase SQL editor shows only the LAST result set a script produces.
--   Everything worth reading is therefore collected into one table and
--   selected once, at the end. Earlier drafts of this script printed the guard
--   outcomes and then the state check separately, and the guard outcomes were
--   the half that disappeared.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: find the owner, as the database owner.
-- ---------------------------------------------------------------------------
create temp table t_owner on commit drop as
select id, org_id, role
from profiles
where role = 'owner' and is_active
order by created_at
limit 1;

do $fn_require_owner$
begin
    if not exists (select 1 from t_owner) then
        raise exception
            'No active owner exists. Sign up through the app first.';
    end if;
end;
$fn_require_owner$;

select id as acting_as,
       org_id as home_org,
       (select count(*) from profiles p
         where p.org_id = t_owner.org_id
           and p.role = 'owner' and p.is_active) as active_owners
from t_owner;

-- ---------------------------------------------------------------------------
-- Phase 2: become that owner.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from t_owner),
                      'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_results (
    seq     integer,
    check_name text,
    outcome text
) on commit drop;

-- ---------------------------------------------------------------------------
-- Guard 3: an owner may not deactivate themselves.
-- ---------------------------------------------------------------------------
do $fn_check_self_deactivate$
begin
    perform set_member_active((select id from t_owner), false);
    insert into t_results values (1, 'deactivate self', 'ALLOWED - guard failed');
exception when others then
    insert into t_results values (1, 'deactivate self', 'refused: ' || sqlerrm);
end;
$fn_check_self_deactivate$;

-- ---------------------------------------------------------------------------
-- Guard 4: the last active owner may not be demoted.
-- ---------------------------------------------------------------------------
do $fn_check_last_owner$
begin
    perform set_member_role((select id from t_owner), 'staff');
    insert into t_results values (2, 'demote self as last owner', 'ALLOWED - correct only if another active owner exists');
exception when others then
    insert into t_results values (2, 'demote self as last owner', 'refused: ' || sqlerrm);
end;
$fn_check_last_owner$;

-- ---------------------------------------------------------------------------
-- Tenant check: a member id that is not in this organisation.
-- ---------------------------------------------------------------------------
do $fn_check_stranger$
begin
    perform set_member_active(gen_random_uuid(), false);
    insert into t_results values (3, 'deactivate a stranger', 'ALLOWED - guard failed');
exception when others then
    insert into t_results values (3, 'deactivate a stranger', 'refused: ' || sqlerrm);
end;
$fn_check_stranger$;

-- ---------------------------------------------------------------------------
-- The permitted path: setting a role to the one already held changes nothing
-- and must not raise.
-- ---------------------------------------------------------------------------
do $fn_check_noop$
begin
    perform set_member_role((select id from t_owner), 'owner');
    insert into t_results values (4, 'no-op role change', 'allowed');
exception when others then
    insert into t_results values (4, 'no-op role change', 'REFUSED - wrong: ' || sqlerrm);
end;
$fn_check_noop$;

-- ---------------------------------------------------------------------------
-- Phase 3: the report.
--
-- The state check is folded into the same table rather than being a second
-- SELECT, because the Supabase SQL editor displays only the LAST result set of
-- a script. A report split across two selects loses the half that matters.
--
-- The owner can read their own row here without switching back to postgres,
-- thanks to profiles_select_self from 0016.
-- ---------------------------------------------------------------------------
insert into t_results
select 5, 'role after all checks', role::text
  from profiles where id = (select id from t_owner);

insert into t_results
select 6, 'is_active after all checks', is_active::text
  from profiles where id = (select id from t_owner);

select check_name, outcome from t_results order by seq;

rollback;
