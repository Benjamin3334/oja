-- ============================================================================
-- 0003 - Stop staff fabricating stock, without breaking the till.
--
-- THE BUG
--   0001 section 6 carries this policy, directly under a comment reading
--   "Only managers and owners may manually move stock":
--
--     create policy movements_insert on stock_movements
--         for insert with check (org_id = current_org_id());
--
--   The comment states the intent; the policy does not implement it. It checks
--   the tenant and nothing else, so any staff account can insert any movement
--   it likes - invent stock, or paper over a shortfall after goods have gone.
--   The ledger then records the lie as fact.
--
--   This contradicts the role matrix in PRD section 9.2, where "Receive stock
--   / adjust" is unavailable to staff, and it defeats goal G3, "make every
--   stock change traceable to a person, a time and a reason".
--
-- THE MEASURED FAILURE (before this migration)
--   Acting as a staff member of the seeded organisation:
--       insert into stock_movements (... 'in', 999, 'Fabricated by a staff
--       account' ...) -> returned a row
--       id 25c7cfe3-699b-4b41-be96-de3b36b32817, quantity 999
--   See supabase/paste-chunks/11_staff_movement_proof.sql.
--
-- WHY THE POLICY CANNOT SIMPLY BE TIGHTENED
--   complete_sale() is SECURITY INVOKER, so it writes its 'out' movements as
--   the calling user. Staff must be able to record sales. Restricting the
--   policy to owner/manager alone would therefore break the till: every sale a
--   staff member completed would fail on its own stock deduction.
--
--   The fix is in two halves. Direct inserts are restricted to owner/manager,
--   and sale-driven inserts stop going through the policy at all by making
--   complete_sale() SECURITY DEFINER.
--
-- WHAT SECURITY DEFINER COSTS, AND HOW IT IS PAID FOR
--   SECURITY DEFINER runs the body as the function's owner, which is also the
--   table owner, and a table owner is exempt from RLS. That is what lets the
--   sale deduction through - but it also switches off the tenant isolation
--   that made the function safe. Without a replacement, a caller could pass
--   another organisation's sale id and complete it.
--
--   So the tenant check that RLS used to perform implicitly is now written
--   out explicitly:  if v_org <> current_org_id() then raise.
--
--   current_org_id() still resolves to the CALLER, not the owner: it reads
--   auth.uid(), which comes from the request's JWT claims and is unaffected by
--   the role the function body runs as.
--
--   set search_path = public is mandatory on a SECURITY DEFINER function.
--   Without it a caller can prepend a schema of their own and have the body
--   resolve to their tables instead of ours.
--
-- WHAT IS DELIBERATELY UNCHANGED
--   void_sale() stays SECURITY INVOKER. It already raises unless the caller is
--   an owner or manager, and those roles are exactly the ones the new policy
--   admits, so its compensating 'in' movements still pass.
--
--   The oversell race in complete_sale() - reading stock, then inserting,
--   with no lock between - is untouched here. That is 0004.
--
-- FUTURE DEPENDENCY, WORTH KNOWING
--   If a later migration adds `alter table stock_movements force row level
--   security`, table owners stop being exempt and this function's inserts
--   would start failing. That migration would have to grant complete_sale's
--   owner a bypass or add a policy for it.
--
-- VERIFY AFTER RUNNING
--   1. supabase/paste-chunks/11_staff_movement_proof.sql must now FAIL with
--      "new row violates row-level security policy for table stock_movements".
--   2. supabase/paste-chunks/12_staff_sale_proof.sql must still SUCCEED:
--      a staff member completes a sale and stock falls. Half a fix that blocks
--      fraud by breaking the till is not a fix.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Direct inserts: owner and manager only.
-- ---------------------------------------------------------------------------
drop policy if exists movements_insert on stock_movements;

create policy movements_insert on stock_movements
    for insert
    with check (
        org_id = current_org_id()
        and current_user_role() in ('owner', 'manager')
    );


-- ---------------------------------------------------------------------------
-- 2. Sale-driven inserts: bypass the policy, but check the tenant explicitly.
-- ---------------------------------------------------------------------------
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
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'draft';
    if v_org is null then
        raise exception 'Sale % not found or is not a draft', p_sale_id;
    end if;

    -- The tenant check RLS used to perform for us. SECURITY DEFINER means the
    -- select above can see every organisation's sales, so without this a
    -- caller could complete a sale belonging to someone else.
    if v_org <> current_org_id() then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        -- v_product_stock is security_invoker since 0002, and the invoker here
        -- is the function owner, so this read is not tenant-filtered. It is
        -- safe because product_id comes from this sale's own line items and the
        -- sale has already been confirmed to belong to the caller.
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

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$fn_complete_sale$;
