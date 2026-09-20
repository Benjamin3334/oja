-- ============================================================================
-- 0009 - Close the sales write hole: status changes only through the functions.
--
-- THE BUG
--   0001 grants updates on sales with nothing but a tenant check:
--
--       create policy sales_update on sales
--           for update using (org_id = current_org_id());
--
--   void_sale() carefully refuses anyone who is not an owner or manager. That
--   guard is worthless, because a staff member never has to call it:
--
--       update sales set status = 'void' where id = '...';
--
--   succeeds directly. The sale is marked void, the role check is skipped, and
--   crucially the compensating 'in' movements are never written - so the stock
--   is never returned. The ledger and the sale now disagree, which is precisely
--   the corruption the append-only design exists to prevent.
--
--   The same route lets a draft be flipped straight to 'completed' without
--   complete_sale() running, so stock is never deducted at all.
--
-- WHY A POLICY CANNOT FIX THIS
--   Row-level security is row-level. A policy decides whether you may update a
--   row; it cannot say "you may change note but not status". USING sees the
--   existing row and WITH CHECK sees the proposed one, but neither can compare
--   a column's old value to its new one, so "status must not change" is not
--   expressible as a policy.
--
--   The right tool is column-level privileges, which PostgreSQL has had for
--   this exact purpose. Note the order: a table-level UPDATE grant overrides
--   any column-level restriction, so the table grant must be revoked FIRST and
--   the permitted columns granted back individually.
--
-- WHAT REMAINS DIRECTLY UPDATABLE
--   customer_id, payment_method and note - the three fields a cashier edits on
--   a draft before completing it.
--
--   Not updatable by anyone through the API: status, sold_at, reference,
--   org_id, sold_by. Every one of those is either set once at insert or owned
--   by a function. A reference that can be edited is not an audit trail, and a
--   sold_by that can be edited defeats G3.
--
-- THE KNOCK-ON: void_sale() MUST BECOME SECURITY DEFINER
--   void_sale() is SECURITY INVOKER, so it writes as the caller. Once
--   `status` is revoked from every API role, the function's own final UPDATE
--   would fail too, for owners and managers alike. It therefore moves to
--   SECURITY DEFINER, exactly as complete_sale() did in 0003.
--
--   And exactly as in 0003, security definer switches off the tenant isolation
--   that RLS was providing, so the check is written out by hand:
--       if v_org <> current_org_id() then raise
--   The existing role check stays, and is now the only thing standing between a
--   staff member and a void - so it matters more than it did before.
--
-- ALSO TIGHTENED
--   sales_update still used the old org-wide predicate from 0001, so a staff
--   member could update a sale that 0008 had already hidden from them - a blind
--   write to a row they cannot read. It now matches the 0008 visibility rule.
--
-- VERIFY AFTER RUNNING
--   As a staff member (demote yourself inside a transaction, then roll back):
--       update sales set status = 'void' where id = '<a sale>';
--         -> ERROR: permission denied for column status
--       select void_sale('<a completed sale>', 'test');
--         -> ERROR: Only an owner or manager may void a sale
--   As an owner, void_sale() must still succeed and write the 'in' movements.
--   And supabase/paste-chunks/12_staff_sale_proof.sql must still pass, because
--   complete_sale() is security definer and unaffected by the revoke.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Align the update policy with the 0008 visibility rule.
-- ---------------------------------------------------------------------------
drop policy if exists sales_update on sales;

create policy sales_update on sales
    for update
    using (
        org_id = current_org_id()
        and (
            sold_by = auth.uid()
            or current_user_role() in ('owner', 'manager')
        )
    )
    with check (
        org_id = current_org_id()
        and (
            sold_by = auth.uid()
            or current_user_role() in ('owner', 'manager')
        )
    );


-- ---------------------------------------------------------------------------
-- 2. Column-level privileges: only three fields are editable directly.
--    The table-level grant must go first, or it overrides the column grants.
-- ---------------------------------------------------------------------------
revoke update on sales from authenticated;
revoke update on sales from anon;

grant update (customer_id, payment_method, note) on sales to authenticated;


-- ---------------------------------------------------------------------------
-- 3. void_sale() becomes security definer so it can still write status.
-- ---------------------------------------------------------------------------
create or replace function void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $fn_void_sale$
declare
    item  record;
    v_org uuid;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'completed';
    if v_org is null then
        raise exception 'Sale % not found or is not completed', p_sale_id;
    end if;

    -- The tenant check RLS used to perform for us. Security definer can see
    -- every organisation's sales, so without this a caller could void someone
    -- else's.
    if v_org <> current_org_id() then
        raise exception 'Sale % does not belong to your organisation', p_sale_id;
    end if;

    -- Now the only thing preventing a staff member from voiding a sale.
    if current_user_role() not in ('owner','manager') then
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
