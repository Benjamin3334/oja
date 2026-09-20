-- ============================================================================
-- 0007 - create_organisation_and_profile(): make sign-up actually work.
--
-- THE BUG
--   FR-1.3 says a user either creates an organisation or joins one by invite on
--   first sign-in. Today that is impossible, and the reason is a deadlock in
--   the rules themselves:
--
--     - profiles.org_id is NOT NULL, so a profile cannot exist before an
--       organisation does.
--     - Section 7 of 0001 is an empty placeholder. No trigger creates a profile
--       at sign-up, so a new auth user has no profile at all.
--     - profiles has no INSERT policy, so the app cannot create one.
--     - organisations has no INSERT policy either, so the app cannot create the
--       organisation that the profile would need.
--     - current_org_id() reads profiles, so with no profile it returns null and
--       every policy in the database denies everything.
--
--   A brand new user is therefore permanently stuck: they cannot create the
--   profile, and they cannot create the organisation that would let them.
--   Until now the only way in was to hand-write a profile row in the SQL
--   editor, which is not a product.
--
-- THE FIX
--   One SECURITY DEFINER function doing both inserts in a single transaction.
--   Security definer is what lets it write to two tables that have no insert
--   policy, without opening those tables to the client. profiles.org_id stays
--   NOT NULL, because both rows are created together and the organisation id is
--   known before the profile is inserted.
--
--   Being security definer, it must guard itself, because RLS is not doing it:
--     - auth.uid() null           -> not signed in, refuse.
--     - a profile already exists  -> refuse, or a user could create a second
--                                    organisation and silently abandon the
--                                    first, or escalate themselves to owner of
--                                    a fresh tenant.
--     - blank name                -> refuse, matching the check constraints.
--     - search_path pinned        -> or a caller can prepend their own schema
--                                    and have the body write to their tables.
--
--   The caller becomes 'owner' of the organisation they create. That is the
--   only role that makes sense: someone has to be able to invite the rest.
--
--   The email is copied from auth.users rather than accepted as a parameter,
--   so a caller cannot record an address they do not own.
--
-- THE SLUG
--   organisations.slug is unique globally, not per tenant, so the same shop
--   name chosen by two different people must not collide. The name is
--   lowercased, non-alphanumerics become hyphens, and six random hex characters
--   are appended. Predictable enough to read in a URL, unique enough not to
--   fail on a common name.
--
-- VERIFY AFTER RUNNING
--   As a signed-in user with no profile:
--       select create_organisation_and_profile('Test Shop', 'Test Owner');
--   Then calling it a second time must raise
--   "This account already belongs to an organisation".
-- ============================================================================

create or replace function create_organisation_and_profile(
    p_org_name  text,
    p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_create_organisation_and_profile$
declare
    v_user_id uuid := auth.uid();
    v_email   text;
    v_org_id  uuid;
    v_slug    text;
begin
    if v_user_id is null then
        raise exception 'You must be signed in to create an organisation';
    end if;

    if exists (select 1 from profiles where id = v_user_id) then
        raise exception 'This account already belongs to an organisation';
    end if;

    if length(trim(coalesce(p_org_name, ''))) = 0 then
        raise exception 'An organisation name is required';
    end if;

    if length(trim(coalesce(p_full_name, ''))) = 0 then
        raise exception 'Your full name is required';
    end if;

    -- Taken from the auth record, never from the caller.
    select email into v_email from auth.users where id = v_user_id;

    v_slug := regexp_replace(lower(trim(p_org_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then
        v_slug := 'org';
    end if;
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    insert into organisations (name, slug)
    values (trim(p_org_name), v_slug)
    returning id into v_org_id;

    insert into profiles (id, org_id, full_name, email, role)
    values (v_user_id, v_org_id, trim(p_full_name), coalesce(v_email, ''), 'owner');

    return v_org_id;
end;
$fn_create_organisation_and_profile$;

grant execute on function create_organisation_and_profile(text, text) to authenticated;
