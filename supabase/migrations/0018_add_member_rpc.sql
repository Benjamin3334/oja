-- ============================================================================
-- 0018 - add_member_by_email(): an owner can actually add a member.
--
-- THE GAP
--   FR-6.1 gives an owner the power to change roles and deactivate members,
--   and 0017 built both. Neither creates a member. The /staff page says people
--   are "invited" and offers no control that does it, so the only way a second
--   person has ever joined an organisation is a hand-written INSERT in the SQL
--   editor. The capability was described in the interface and did not exist.
--
-- WHY A FUNCTION AND NOT A POLICY
--   profiles has no INSERT policy at all, by design since 0007: a client that
--   could insert profiles could invent its own membership. The row also has to
--   be written on behalf of SOMEBODY ELSE - a different auth user - which no
--   RLS predicate can express, because policies answer "may this caller touch
--   this row", not "may this caller create a row for another person".
--
--   It also has to read auth.users, which is not exposed to the client at all
--   and must not be: that table is every account on the project, across every
--   tenant. Reading it inside a definer function, and returning nothing from it
--   but a yes or no, is the whole reason this is a function.
--
-- THE GUARDS, AND WHY EACH ONE IS THERE
--   1. Signed in. auth.uid() is null for an anonymous caller, and everything
--      below would otherwise compare against nothing.
--
--   2. Attached to an organisation. current_org_id() is null for a member with
--      no profile and, since 0016, for a deactivated one. Checked explicitly
--      rather than compared, because 0015 established what happens when NULL
--      meets a comparison: it yields NULL, IF NULL THEN does not fire, and the
--      guard is silently skipped.
--
--   3. An ACTIVE owner. current_user_role() also returns null for a
--      deactivated member since 0016, so IS DISTINCT FROM is used rather than
--      <> - the same NULL trap. A removed owner must not be able to staff an
--      organisation they have been removed from.
--
--   4. Role is manager or staff. An owner is made by PROMOTING an existing
--      member through set_member_role, which carries the last-owner guard from
--      0017. Allowing an owner to be created here would let someone add a
--      second owner who could then demote the first - a coup in two calls -
--      and the promotion path is where that decision belongs.
--
--   5. The account must already exist. This function cannot create an auth
--      user: sign-up is where a person chooses their own password, and an
--      owner who could mint accounts for other people would be choosing it for
--      them. So the email is looked up, and an unknown address is refused with
--      an instruction rather than an error.
--
--   6. Not yourself. Adding yourself is either a mistake or an attempt to
--      change your own role sideways; both are refused, and set_member_role
--      exists for the legitimate version.
--
--   7. Already in THIS organisation, and belongs to ANOTHER one, are separate
--      messages. "Already a member" is reassurance; "belongs to another
--      organisation" is a refusal the owner cannot resolve themselves. Telling
--      them apart is the difference between a shrug and a support ticket.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It does not move a member between organisations. That is the tenant hop
--   0014 was written to close, and doing it here on an owner's say-so would
--   reopen it through the front door.
--
--   It does not email anybody. There is no invitation flow in this MVP; the
--   person signs up first and the owner then adds the address they used. The
--   /staff page says exactly that, so the interface no longer describes a
--   mechanism that is not there.
--
-- THE NAME
--   Taken from the account's own sign-up metadata, where signUp stores
--   full_name, falling back to the part of the email before the @. The owner
--   never types it: a member's name belongs to that member, and an owner
--   typing it would make the staff list a record of what the owner remembers.
--
-- VERIFY AFTER RUNNING
--   As an owner: select add_member_by_email('someone@example.com', 'staff');
--   An address with no account must raise "No Oja account uses that email".
--   Your own address must raise "You cannot add yourself". A second call for
--   the same person must raise "Already a member".
-- ============================================================================

create or replace function add_member_by_email(
    p_email text,
    p_role  user_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_add_member_by_email$
declare
    v_caller_org   uuid      := current_org_id();
    v_caller_role  user_role := current_user_role();
    v_email        text      := lower(trim(coalesce(p_email, '')));
    v_user_id      uuid;
    v_user_email   text;
    v_full_name    text;
    v_existing_org uuid;
begin
    -- 1. Signed in.
    if auth.uid() is null then
        raise exception 'You must be signed in';
    end if;

    -- 2. Attached to an organisation. Explicit null test, not a comparison.
    if v_caller_org is null then
        raise exception 'Your account is not attached to an organisation';
    end if;

    -- 3. An active owner. IS DISTINCT FROM, so a null role fails rather than
    --    slipping past (the lesson of 0015).
    if v_caller_role is distinct from 'owner' then
        raise exception 'Only an owner can add a member';
    end if;

    -- 4. Owners are made by promotion, not by adding.
    if p_role is null or p_role not in ('manager', 'staff') then
        raise exception
            'Choose manager or staff. An owner is made by promoting an existing member';
    end if;

    if v_email = '' then
        raise exception 'Enter an email address';
    end if;

    -- 5. The account must already exist. Matched on lower(email), because
    --    addresses are not case sensitive in practice and an owner will type
    --    them however they were written down.
    select u.id,
           u.email,
           coalesce(
               nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
               split_part(u.email, '@', 1)
           )
      into v_user_id, v_user_email, v_full_name
      from auth.users u
     where lower(u.email) = v_email;

    if v_user_id is null then
        raise exception
            'No Oja account uses that email. Ask them to sign up first.';
    end if;

    -- 6. Not yourself.
    if v_user_id = auth.uid() then
        raise exception 'You cannot add yourself';
    end if;

    -- 7. Already here, or somewhere else - two different answers.
    select p.org_id into v_existing_org
      from profiles p
     where p.id = v_user_id;

    if v_existing_org = v_caller_org then
        raise exception 'Already a member.';
    end if;

    if v_existing_org is not null then
        raise exception 'That account belongs to another organisation.';
    end if;

    insert into profiles (id, org_id, full_name, email, role, is_active)
    values (v_user_id, v_caller_org, v_full_name, v_user_email, p_role, true);

    return v_user_id;
end;
$fn_add_member_by_email$;

grant execute on function add_member_by_email(text, user_role) to authenticated;
