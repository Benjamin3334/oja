-- ============================================================================
-- 0017 - An owner may change roles and deactivate members, through a door.
--
-- NOT A BUG FIX. 0014 through 0016 closed holes; this one restores a
-- capability those migrations deliberately removed, which is why it comes
-- last. Stating that plainly matters: the proof script for this migration
-- verifies guards rather than demonstrating a prior defect, because before it
-- these functions simply did not exist.
--
-- WHY IT IS NEEDED
--   FR-6.1 requires an owner to change roles and deactivate members. 0014
--   revoked UPDATE on profiles and granted back only full_name and email, so
--   role and is_active are unwritable through the API by ANYONE, including an
--   owner. That was the correct order - close the hole, then reopen the
--   capability behind a check - but it leaves FR-6.1 with no path at all.
--   Today deactivation is possible only in the SQL editor.
--
-- WHY FUNCTIONS RATHER THAN RE-GRANTING THE COLUMNS
--   Granting UPDATE (role, is_active) back to authenticated would restore the
--   0014 hole, because a column grant cannot express "only an owner, only
--   within their own organisation, and never the last owner". A policy cannot
--   express the last part either: it sees one row at a time and cannot count
--   what would remain afterwards. That requires a function.
--
-- THE GUARDS, AND WHY EACH ONE EXISTS
--   1. Signed in, attached to an organisation, and an owner. Checked with IS
--      DISTINCT FROM rather than <>, which is the lesson of 0015: a NULL role
--      compared with <> yields NULL, and IF NULL THEN does not fire.
--   2. The member must belong to the caller organisation. Security definer
--      sees every tenant, so RLS is not doing this.
--   3. An owner may not deactivate themselves. It is almost always a misclick,
--      and it locks the person out with no route back through the interface.
--   4. An organisation must keep at least one ACTIVE owner. Without this, an
--      organisation can reach a state with nobody able to invite, promote or
--      recover anything, and the only way back is database access - which is
--      exactly what this project has kept out of the application.
--
--   Guard 4 takes a row lock before counting. Two owners demoting each other
--   at the same moment would otherwise both see "another owner remains", and
--   both would succeed: the classic check-then-act race, the same one 0004
--   closed on stock. Locking the owner rows serialises the pair, so the second
--   transaction counts after the first has committed and is refused.
--
-- WHAT IS DELIBERATELY ALLOWED
--   An owner may demote themselves while another active owner remains. It is
--   recoverable - the other owner can promote them back - and forbidding it
--   would stop a shop handing over ownership.
--
--   Reactivating a member needs no guard beyond ownership. Restoring access is
--   not the dangerous direction.
--
-- VERIFY AFTER RUNNING
--   Run supabase/paste-chunks/26_member_management_proof.sql. As the only
--   owner, both dangerous moves must be refused by name, and a role change
--   that breaks no rule must succeed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Change a member role.
-- ---------------------------------------------------------------------------
create or replace function set_member_role(
    p_member_id uuid,
    p_role      user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $fn_set_member_role$
declare
    v_caller_org   uuid      := current_org_id();
    v_caller_role  user_role := current_user_role();
    v_member_org   uuid;
    v_member_role  user_role;
begin
    if auth.uid() is null then
        raise exception 'You must be signed in';
    end if;

    if v_caller_org is null then
        raise exception 'Your account is not attached to an organisation';
    end if;

    -- IS DISTINCT FROM, not <>. A NULL role must fail this, not skip it.
    if v_caller_role is distinct from 'owner' then
        raise exception 'Only an owner can change roles';
    end if;

    select org_id, role into v_member_org, v_member_role
      from profiles
     where id = p_member_id;

    if v_member_org is null then
        raise exception 'That member was not found';
    end if;

    if v_member_org <> v_caller_org then
        raise exception 'That member does not belong to your organisation';
    end if;

    if v_member_role = p_role then
        return;   -- nothing to do
    end if;

    -- Guard 4. Lock the owner rows BEFORE counting, or two owners demoting
    -- each other simultaneously would both pass this check.
    if v_member_role = 'owner' then
        perform 1
           from profiles
          where org_id = v_caller_org
            and role = 'owner'
            for update;

        if not exists (
            select 1 from profiles
             where org_id = v_caller_org
               and role = 'owner'
               and is_active
               and id <> p_member_id
        ) then
            raise exception
                'An organisation must keep at least one active owner';
        end if;
    end if;

    update profiles set role = p_role where id = p_member_id;
end;
$fn_set_member_role$;

grant execute on function set_member_role(uuid, user_role) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Activate or deactivate a member.
-- ---------------------------------------------------------------------------
create or replace function set_member_active(
    p_member_id uuid,
    p_active    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn_set_member_active$
declare
    v_caller_org   uuid      := current_org_id();
    v_caller_role  user_role := current_user_role();
    v_member_org   uuid;
    v_member_role  user_role;
    v_member_active boolean;
begin
    if auth.uid() is null then
        raise exception 'You must be signed in';
    end if;

    if v_caller_org is null then
        raise exception 'Your account is not attached to an organisation';
    end if;

    if v_caller_role is distinct from 'owner' then
        raise exception 'Only an owner can deactivate a member';
    end if;

    -- Guard 3, before anything else touches the row. Checked on the caller id
    -- rather than on the member record, so it holds even if the row lookup
    -- below were ever changed.
    if p_member_id = auth.uid() and not p_active then
        raise exception 'You cannot deactivate your own account';
    end if;

    select org_id, role, is_active
      into v_member_org, v_member_role, v_member_active
      from profiles
     where id = p_member_id;

    if v_member_org is null then
        raise exception 'That member was not found';
    end if;

    if v_member_org <> v_caller_org then
        raise exception 'That member does not belong to your organisation';
    end if;

    if v_member_active = p_active then
        return;   -- nothing to do
    end if;

    -- Guard 4, again with the lock taken before the count. Only deactivation
    -- can empty an organisation of owners; restoring access cannot.
    if not p_active and v_member_role = 'owner' then
        perform 1
           from profiles
          where org_id = v_caller_org
            and role = 'owner'
            for update;

        if not exists (
            select 1 from profiles
             where org_id = v_caller_org
               and role = 'owner'
               and is_active
               and id <> p_member_id
        ) then
            raise exception
                'An organisation must keep at least one active owner';
        end if;
    end if;

    update profiles set is_active = p_active where id = p_member_id;
end;
$fn_set_member_active$;

grant execute on function set_member_active(uuid, boolean) to authenticated;
