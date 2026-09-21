-- ============================================================================
-- 0014 - A user may not move themselves between organisations.
--
-- THE BUG
--   profiles has two UPDATE policies, and permissive policies are OR-ed:
--
--       create policy profiles_update_self on profiles
--           for update using (id = auth.uid())
--           with check (id = auth.uid()
--                       and role = (select role from profiles
--                                    where id = auth.uid()));
--
--   The check pins id and role and says nothing about org_id. The comment
--   above it in 0001 reads "a user may edit their own name, but NOT their own
--   role (no self-promotion)" - true, and guarding the wrong column. role
--   decides what you may do inside an organisation. org_id decides WHICH
--   ORGANISATION YOU ARE IN, and current_org_id() reads it, and every policy
--   in this database is written against current_org_id().
--
--   One statement therefore moves the caller into another tenant with their
--   role intact:
--
--       update profiles set org_id = '<target>' where id = auth.uid();
--
--   create_organisation_and_profile makes anyone the owner of an organisation
--   they create, so the whole path is: sign up, create a shop, become owner,
--   move to the target - still owner. This defeats section 9.1 principle 1,
--   the claim the entire design rests on, and it is the threat section 9.3
--   lists as "privilege escalation via profile update".
--
--   It is not exploitable by a stranger: org_id references organisations, and
--   org_select exposes only your own, so the ids cannot be enumerated and a
--   uuid is not guessable. It is exploitable by anyone who has ever seen
--   another organisation id.
--
--   is_active was equally unguarded, so a member could reactivate themselves.
--   That matters less today only because nothing reads is_active yet - which
--   is its own gap, and belongs in its own migration.
--
--   MEASURED, before this migration
--   (supabase/paste-chunks/21_tenant_hop_proof.sql):
--       org_before        = 11111111-1111-1111-1111-111111111111
--       org_after         = 99999999-0000-0000-0000-000000000001
--       rival_rows_before = 0
--       rival_rows_after  = 1
--
-- THE FIX, IN TWO LAYERS
--   1. Column privileges, as 0009 did for sales. The client may write exactly
--      two columns of profiles: full_name and email. org_id, role and
--      is_active become unwritable through the API by anyone, whatever the
--      policies say. A predicate is something a future author can forget to
--      extend; a grant has to be widened on purpose.
--
--   2. The predicate is fixed anyway. With the grant gone it cannot be
--      reached, exactly as sales_insert cannot be reached after 0011, and it
--      is kept for the same reason: if a later migration or a Supabase
--      default re-grants UPDATE, the second layer still refuses the hop.
--
-- WHAT THIS DELIBERATELY BREAKS UNTIL 0016
--   Nobody can change a role or deactivate a member through the API, INCLUDING
--   an owner. FR-6.1 has no screen yet, so nothing regresses in the product,
--   and the SQL editor still works for administration because postgres owns
--   the table. Closing the hole first and reopening the capability through a
--   guarded function in 0016 is the safe order; the reverse leaves the hole
--   open while the feature is written.
--
--   profiles_update_by_owner is left in place. With role and is_active
--   ungrantable it now permits only what it should: an owner correcting a
--   colleague name or email.
--
-- VERIFIED AFTER RUNNING
--   21_tenant_hop_proof.sql now fails at phase 3 with, verbatim:
--
--       ERROR: 42501: permission denied for table profiles
--       HINT:  Grant the required privileges to the current role with:
--              GRANT UPDATE ON public.profiles TO authenticated;
--
--   The transaction aborts there, so the final grid never prints. That abort
--   is the pass. Note the hint: Postgres is suggesting precisely the grant
--   this migration removed, which is worth remembering - an error hint is a
--   suggestion from a system that does not know why the privilege is absent.
--
--   The policy was also read back from pg_policy to confirm the with-check
--   expression now names org_id, role and is_active.
--
-- A NOTE ON THE EVIDENCE
--   This migration was applied before its failing case was run, so the
--   vulnerable behaviour was never captured on the live database - only the
--   refusal that replaced it. 23_tenant_hop_before_evidence.sql reconstructs
--   the before state by restoring the 0001 policy and grant inside a single
--   transaction, demonstrating the hop, and rolling back. DDL in PostgreSQL is
--   transactional, so nothing survives the rollback.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column privileges. The table-level grant must be revoked FIRST, or it
--    overrides the column grants that follow.
-- ---------------------------------------------------------------------------
revoke update on profiles from authenticated;
revoke update on profiles from anon;

grant update (full_name, email) on profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The predicate, corrected. Unreachable while the grant above stands, and
--    kept as the second layer for the day it does not.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_self on profiles;

create policy profiles_update_self on profiles
    for update
    using (id = auth.uid())
    with check (
        id = auth.uid()
        -- current_org_id() and current_user_role() are security definer and
        -- read the pre-update snapshot, so each of these pins the column to
        -- what it was before this statement.
        and org_id = current_org_id()
        and role = current_user_role()
        and is_active = (select is_active from profiles where id = auth.uid())
    );

comment on policy profiles_update_self on profiles is
    'A user may edit their own name and email. org_id, role and is_active are
     pinned here and ungrantable since 0014: org_id decides which tenant the
     caller belongs to, so letting them write it defeats every other policy in
     the database.';
