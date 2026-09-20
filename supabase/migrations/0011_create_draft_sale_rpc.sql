-- ============================================================================
-- 0011 - create_draft_sale(): a sale may only be born as a draft.
--
-- THE BUG
--   sales_insert checks one thing:
--
--       create policy sales_insert on sales
--           for insert with check (org_id = current_org_id());
--
--   Supabase grants authenticated table-level INSERT on public tables, and RLS
--   filters rows, not columns. So every other column on a new sale is the
--   client to choose, including the two that matter:
--
--     status   - insert 'completed' and complete_sale() never runs. No product
--                row is locked, the oversell check in 0004 never fires, no
--                'out' movement is written, and unit_cost is never snapshotted.
--                The sale claims to have happened; the ledger has never heard
--                of it, and nothing reconciles the two afterwards.
--
--     sold_by  - set it to null, or to a colleague, and the sale is attributed
--                to whoever the client named. With 0008 in force this hides
--                itself: a sale attributed to someone else vanishes from the
--                staff member who actually made it.
--
--   This is 0009 on the other verb. That migration found the identical hole on
--   UPDATE and closed it with column-level privileges; INSERT was left open.
--
--   MEASURED, as authenticated, before this migration
--   (supabase/paste-chunks/16_sale_insert_hole_proof.sql):
--       sale_status        = completed
--       stock_after        = 100     -- a real sale of 3 leaves 97
--       movements_written  = 0
--       unit_cost_snapshot = null
--       sold_by_recorded   = false
--   After it, the insert raises: permission denied for table sales
--
-- THE FIX
--   The client stops inserting sales at all. One security-definer function
--   creates the row, and it sets the three facts the client was never entitled
--   to decide: status is always 'draft', sold_by is always auth.uid(), and the
--   reference always comes from next_sale_reference().
--
--   Being security definer it must guard itself, because RLS is no longer
--   doing it:
--     - auth.uid() null        -> not signed in, refuse.
--     - no organisation        -> refuse; current_org_id() would be null and
--                                 the row would be orphaned.
--     - customer from another  -> refuse. The foreign key only proves the
--       organisation              customer exists, not that it is yours, and a
--                                 security definer function can see every
--                                 tenant's customers.
--     - search_path pinned     -> or a caller can prepend their own schema and
--                                 have the body write to their tables.
--
--   WHY NOT COLUMN-LEVEL GRANTS, AS IN 0009
--   They would close status and sold_by, but reference is not null with no
--   default, so the client would still have to supply it - and could write any
--   string, out of sequence, up to the unique constraint. Calling
--   next_sale_reference() inside the same transaction as the insert also means
--   a failed insert rolls the counter back instead of burning a number.
--
--   sales_insert is deliberately left in place. With the grant gone it can
--   never be reached, but if a later migration or a Supabase default re-grants
--   INSERT, the policy is still there to keep the row inside its own tenant.
--
-- WHAT THIS DOES NOT COVER
--   sale_items.unit_price is still supplied by the client and complete_sale()
--   never overwrites it, so a line can still be sold at any price. That is a
--   different bug on a different table and belongs in its own migration.
--
-- CONSEQUENCE FOR EXISTING SCRIPTS
--   Proof scripts 12 and 14 insert into sales directly and will fail after
--   this migration. They are records of the state they were written against,
--   not a suite that has to keep passing; rewrite them onto create_draft_sale()
--   only if you need to re-run them.
--
-- VERIFY AFTER RUNNING
--   Re-run 16_sale_insert_hole_proof.sql: the insert in phase 2 must raise
--   "permission denied for table sales". Then:
--       select create_draft_sale();
--   must return a uuid whose row reads status = 'draft', sold_by = your uid,
--   and a reference in sequence.
-- ============================================================================

create or replace function create_draft_sale(
    p_customer_id    uuid           default null,
    p_payment_method payment_method default 'cash',
    p_note           text           default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_create_draft_sale$
declare
    v_user_id uuid := auth.uid();
    v_org_id  uuid;
    v_sale_id uuid;
begin
    if v_user_id is null then
        raise exception 'You must be signed in to start a sale';
    end if;

    v_org_id := current_org_id();

    if v_org_id is null then
        raise exception 'Your account does not belong to an organisation';
    end if;

    if p_customer_id is not null
       and not exists (
           select 1 from customers
            where id = p_customer_id
              and org_id = v_org_id
       )
    then
        raise exception 'That customer does not belong to your organisation';
    end if;

    insert into sales
        (org_id, reference, customer_id, sold_by, status, payment_method, note)
    values
        (v_org_id,
         next_sale_reference(v_org_id),
         p_customer_id,
         v_user_id,
         'draft',
         p_payment_method,
         p_note)
    returning id into v_sale_id;

    return v_sale_id;
end;
$fn_create_draft_sale$;

grant execute on function create_draft_sale(uuid, payment_method, text)
    to authenticated;

-- The grant is the control now. Without it the policy above is unreachable.
revoke insert on sales from authenticated;
revoke insert on sales from anon;
