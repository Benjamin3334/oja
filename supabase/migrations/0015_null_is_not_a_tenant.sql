-- ============================================================================
-- 0015 - NULL is not a tenant, and it is not a role.
--
-- THE BUG
--   complete_sale() and void_sale() are security definer. They see every
--   organisation, so RLS cannot help them and they check the tenant
--   themselves. Both check it the same way:
--
--       if v_org <> current_org_id() then
--           raise exception 'Sale % does not belong to your organisation';
--       end if;
--
--   In SQL, anything <> NULL is NULL - not true, not false. IF NULL THEN does
--   not fire. So when current_org_id() returns NULL, the comparison decides
--   nothing, the raise is skipped, and the function proceeds exactly as if the
--   tenant had matched.
--
--   void_sale() repeats the shape on the role:
--
--       if current_user_role() not in ('owner','manager') then
--
--   NULL NOT IN (...) is also NULL, so that guard is skipped as well. One
--   caller, both protections silently absent.
--
--   The guards are not missing. They are written, they are correct-looking,
--   and they are the ones 0003 and 0009 added on purpose. They simply do not
--   hold for the one input nobody tested them with.
--
-- WHO HAS A NULL ORGANISATION
--   current_org_id() reads profiles, so any signed-in auth user without a
--   profile row gets NULL. That is precisely the state between signing up and
--   completing onboarding - a normal step in this application. It is not an
--   exotic condition; it is a screen in the product.
--
--   MEASURED, before this migration
--   (supabase/paste-chunks/24_null_tenant_bypass_proof.sql), as a signed-in
--   user with no profile:
--       caller_org        = null
--       sale_status       = completed
--   A caller belonging to no organisation flipped somebody else sale to
--   completed. The caller must know the uuid of a draft sale in the target
--   organisation, and ids are not enumerable through the API - the same
--   precondition as 0014.
--
-- HOW FAR IT GETS TODAY: LATENT, NOT EXPLOITABLE
--   An earlier run of the proof gave the sale a line item and failed at
--   complete_sale line 32 with
--
--       insert or update on table "stock_movements" violates foreign key
--       constraint "stock_movements_created_by_fkey"
--
--   Reaching line 32 proves the tenant guard was skipped - the function was
--   already deep in its body. What stopped the attack was unrelated:
--   created_by references profiles(id), and a caller with no profile cannot
--   satisfy it. The ledger write is incidentally protected by a foreign key
--   that nobody designed as a security control.
--
--   So on today schema this is a latent defect rather than a live one, and
--   this migration is worth applying for what happens next rather than for
--   what is reachable now. That distinction belongs in the write-up: the
--   guard is broken, the consequence is currently contained by an accident.
--
--   The containment does not survive the is_active work. A deactivated member
--   HAS a profile row, so the foreign key is satisfied, and the only thing
--   that would give them a NULL organisation is that very change. Fix the
--   comparison first and a deactivation stays a deactivation; fix it second
--   and a deactivation becomes a privilege.
--
-- WHY THIS COMES BEFORE THE is_active WORK
--   The planned next migration makes current_org_id() return NULL for a
--   deactivated member, so that every policy denies them. Shipping that first
--   would have handed every deactivated member this bypass, turning a
--   deactivation into a privilege. The NULL has to stop being read as a match
--   before NULL can be used to mean "no access".
--
-- THE FIX
--   Resolve the caller organisation and role into variables, refuse NULL
--   explicitly, and only then compare. The comparison itself is unchanged;
--   what changes is that the absent case is now a case rather than a gap.
--
--   Both functions are rewritten in full because create or replace has no
--   patch form. Everything else is carried forward unaltered: the tenant check
--   from 0003, the row lock and oversell check from 0004, the cost snapshot
--   from 0006, the price snapshot from 0012, and the void role check and
--   compensating movements from 0009.
--
-- WHY NOT FIX current_org_id() INSTEAD
--   Making it raise rather than return NULL would push the error into every
--   policy that calls it, so an ordinary SELECT by a user mid-onboarding would
--   fail with an exception instead of returning no rows. Policies are supposed
--   to filter, not throw. The right place for the check is the function that
--   is about to act on the answer.
--
-- VERIFY AFTER RUNNING
--   Re-run 24_null_tenant_bypass_proof.sql: phase 3 must raise and the final
--   grid must not print. Then confirm the ordinary path still works - complete
--   a draft sale through the till as a signed-in member and watch stock fall.
-- ============================================================================

create or replace function complete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_complete_sale$
declare
    item        record;
    available   integer;
    v_org       uuid;
    v_caller    uuid;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'draft';
    if v_org is null then
        raise exception 'Sale % not found or is not a draft', p_sale_id;
    end if;

    -- 0015: resolve first and refuse the absent case explicitly. Comparing
    -- against a NULL organisation decides nothing and skips the guard.
    v_caller := current_org_id();
    if v_caller is null then
        raise exception 'Your account is not attached to an organisation';
    end if;

    -- The tenant check RLS used to perform for us (0003).
    if v_org <> v_caller then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        -- Serialise concurrent sales of this product (0004).
        perform 1 from products where id = item.product_id for update;

        select stock_quantity into available
        from v_product_stock where product_id = item.product_id;

        if available < item.quantity then
            raise exception
                'Insufficient stock for product %: % requested, % available',
                item.product_id, item.quantity, available;
        end if;

        insert into stock_movements
            (org_id, product_id, sale_id, movement_type, quantity, reason, created_by)
        values
            (v_org, item.product_id, p_sale_id, 'out', item.quantity, 'Sale', auth.uid());
    end loop;

    -- 0006 recorded what the goods cost us; 0012 records what they sold for.
    -- Same row, same statement, same instant.
    update sale_items si
       set unit_cost  = p.cost_price,
           unit_price = p.unit_price
      from products p
     where si.sale_id = p_sale_id
       and si.product_id = p.id;

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$fn_complete_sale$;


-- ---------------------------------------------------------------------------
-- void_sale(): the same NULL tenant gap, plus the same gap on the role.
-- Body carried forward from 0009; only the two guards change.
-- ---------------------------------------------------------------------------
create or replace function void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $fn_void_sale$
declare
    item     record;
    v_org    uuid;
    v_caller uuid;
    v_role   user_role;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'completed';
    if v_org is null then
        raise exception 'Sale % not found or is not completed', p_sale_id;
    end if;

    v_caller := current_org_id();
    if v_caller is null then
        raise exception 'Your account is not attached to an organisation';
    end if;

    -- The tenant check RLS used to perform for us. Security definer can see
    -- every organisation sales, so without this a caller could void someone
    -- else sale.
    if v_org <> v_caller then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    -- The only thing preventing a staff member from voiding a sale. NULL NOT
    -- IN (...) is NULL, so an absent role used to skip this entirely.
    v_role := current_user_role();
    if v_role is null or v_role not in ('owner','manager') then
        raise exception 'Only an owner or manager may void a sale';
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        insert into stock_movements
            (org_id, product_id, sale_id, movement_type, quantity, reason, created_by)
        values
            (v_org, item.product_id, p_sale_id, 'in', item.quantity,
             coalesce('Void: ' || p_reason, 'Void'), auth.uid());
    end loop;

    update sales set status = 'void', note = coalesce(p_reason, note) where id = p_sale_id;
end;
$fn_void_sale$;
