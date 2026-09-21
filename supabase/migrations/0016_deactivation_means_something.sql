-- ============================================================================
-- 0016 - Deactivating a member actually removes their access.
--
-- THE BUG
--   profiles.is_active has existed since 0001. FR-6.1 promises "Owner can
--   change roles and deactivate members". Nothing in the database reads the
--   column:
--
--       create or replace function current_org_id() ... as $$
--           select org_id from public.profiles where id = auth.uid();
--       $$;
--
--   current_user_role() is identical. Every policy in the schema is written
--   against those two functions, so a deactivated member keeps their
--   organisation, keeps their role, and keeps every permission they had a
--   moment earlier.
--
--   That is worse than an unimplemented feature. An unimplemented feature is
--   absent and obviously so. This one is present, will be wired to a switch on
--   the staff screen, and is wrong: an owner who removes someone they no
--   longer trust is told the job is done, and it is not.
--
--   MEASURED, before this migration
--   (supabase/paste-chunks/25_deactivation_proof.sql): after setting
--   is_active = false, the same session still reported the same organisation,
--   the same role, and the same product count.
--
-- THE FIX
--   Both helpers require is_active. Because every policy resolves through
--   them, one change denies a deactivated member everything - products,
--   sales, customers, the ledger - without touching a single policy. That is
--   the dividend of routing authorisation through two functions in 0001
--   rather than repeating a sub-query in thirty places.
--
--   current_user_role() is included deliberately. Leaving it would keep a
--   deactivated owner's role intact for every current_user_role() = 'owner'
--   test, so they would lose the tenant but keep the privilege - a worse state
--   than before, because it is inconsistent.
--
-- WHY THIS COULD NOT SHIP BEFORE 0015
--   These functions now return NULL for a deactivated member, and until 0015
--   a NULL organisation was read as a match by complete_sale() and
--   void_sale(): anything <> NULL is NULL, and IF NULL THEN does not fire.
--   Shipping this first would have let every deactivated member complete and
--   void sales in any organisation whose sale id they knew. Their profile row
--   still exists, so the created_by foreign key that incidentally contained
--   that hole for profile-less callers would not have stopped them.
--   Deactivation would have been a promotion.
--
-- THE SELF-READ POLICY, AND WHY IT IS PART OF THIS CHANGE
--   profiles_select is org_id = current_org_id(), which is now NULL for a
--   deactivated member - so they cannot read their own profile row either.
--   The application calls getCurrentProfile() and gets nothing back, which is
--   indistinguishable from a brand new user who has not onboarded, and the app
--   shell would send them to /onboarding. There they would be refused by
--   create_organisation_and_profile because a profile already exists.
--
--   A removed member would meet an error loop instead of an explanation. So
--   this migration also adds a policy letting anyone read their OWN row,
--   always. It exposes nothing new - it is their row - and it is what lets the
--   application say "your access to this organisation has been removed"
--   instead of behaving as though it is broken.
--
-- WHAT THIS DOES NOT DO
--   Supabase Auth knows nothing about profiles, so a deactivated member can
--   still sign in and receive a valid session. They simply arrive to an
--   application where every query returns nothing. Telling them why is
--   application work, in the app shell, and is the follow-up to this
--   migration rather than part of it.
--
--   Nobody can set is_active through the API at all, including an owner, since
--   0014 revoked the column. Migration 0017 restores that capability through a
--   guarded function. Until then deactivation is done in the SQL editor, which
--   is also how the proof script does it.
--
-- VERIFY AFTER RUNNING
--   Re-run 25_deactivation_proof.sql. After deactivation the same session must
--   report org_after = null, role_after = null, products_after = 0, and
--   own_profile_after = true.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The two helpers every policy resolves through.
--    security definer and a pinned search_path are carried forward from 0001:
--    reading profiles inside a policy on profiles would otherwise recurse.
-- ---------------------------------------------------------------------------
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn_current_org_id$
    select org_id
      from public.profiles
     where id = auth.uid()
       and is_active;
$fn_current_org_id$;

create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $fn_current_user_role$
    select role
      from public.profiles
     where id = auth.uid()
       and is_active;
$fn_current_user_role$;


-- ---------------------------------------------------------------------------
-- 2. A member may always read their own row, active or not, so the
--    application can explain rather than appear broken. Reads auth.uid()
--    only, so it cannot recurse into the policy it sits beside.
-- ---------------------------------------------------------------------------
create policy profiles_select_self on profiles
    for select using (id = auth.uid());

comment on policy profiles_select_self on profiles is
    'Always readable by its owner. profiles_select is scoped by
     current_org_id(), which returns NULL once a member is deactivated, so
     without this a removed member could not read the row that explains why
     they have lost access.';
