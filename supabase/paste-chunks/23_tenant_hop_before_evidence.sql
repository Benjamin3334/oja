-- ============================================================================
-- The BEFORE evidence for migration 0014, reconstructed after the fact.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
--
-- WHY THIS EXISTS
--   0014 was applied before proof 21 was run, so the vulnerable behaviour was
--   never recorded on this database - only the refusal that replaced it. The
--   documentation needs both halves, so this script puts the pre-0014 rules
--   back INSIDE a transaction, demonstrates the hop, and rolls the whole thing
--   back.
--
-- IS THIS SAFE
--   Yes, and for a specific reason: DDL in PostgreSQL is transactional. The
--   drop, the old policy, and the grant below are all undone by the rollback
--   at the end, exactly like the data changes. If the session is interrupted
--   the transaction aborts, which restores the same state. The weakened rules
--   exist only inside this uncommitted transaction and are never visible to
--   another session.
--
--   It still deliberately re-opens a security hole for the length of one
--   transaction. Run it once, read the grid, and do not leave it half-run in
--   an open editor tab.
--
-- WHAT IT RESTORES, AND WHY THAT IS THE REAL 0001 STATE
--   profiles_update_self as written in 0001: a check that pins id and role and
--   says nothing about org_id. Plus the table-level UPDATE grant that 0014
--   revoked. Both are needed - the grant alone is not the bug, and the policy
--   alone cannot be reached.
--
-- EXPECTED (final grid):
--   org_after is a DIFFERENT uuid from org_before, ending 9999...0001
--   rival_rows_before = 0    the rival product was invisible
--   rival_rows_after  = 1    it is now readable
--
--   Then run 21_tenant_hop_proof.sql for the after: the same UPDATE refused
--   with "permission denied for table profiles".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 0: put the pre-0014 rules back, inside this transaction only.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_self on profiles;

create policy profiles_update_self on profiles
    for update using (id = auth.uid())
    with check (id = auth.uid()
                and role = (select role from profiles where id = auth.uid()));

grant update on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Phase 1: setup, as the database owner.
-- ---------------------------------------------------------------------------
insert into organisations (id, name, slug)
values ('99999999-0000-0000-0000-000000000001', 'Rival Shop', 'rival-shop-proof');

insert into products (org_id, sku, name, unit_price, cost_price, reorder_level)
values ('99999999-0000-0000-0000-000000000001', 'RIV-001', 'Rival Product',
        500.00, 300.00, 5);

create temp table t_actor on commit drop as
select id, org_id
from profiles
where org_id <> '99999999-0000-0000-0000-000000000001'
order by created_at
limit 1;

do $fn_require_actor$
begin
    if not exists (select 1 from t_actor) then
        raise exception
            'No profile exists yet. Sign up through the app first, then run this.';
    end if;
end;
$fn_require_actor$;

select id as acting_as, org_id as home_org from t_actor;

-- ---------------------------------------------------------------------------
-- Phase 2: become that ordinary signed-in user.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from t_actor),
                      'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_before on commit drop as
select current_org_id() as org_before,
       (select count(*) from products
         where org_id = '99999999-0000-0000-0000-000000000001') as rival_rows_before;

select * from t_before;

-- ---------------------------------------------------------------------------
-- Phase 3: the hole, as it stood before 0014.
-- ---------------------------------------------------------------------------
update profiles
   set org_id = '99999999-0000-0000-0000-000000000001'
 where id = auth.uid()
returning id, org_id, role;

-- ---------------------------------------------------------------------------
-- Phase 4: the damage. Same session, same user, different tenant.
-- ---------------------------------------------------------------------------
select
  (select org_before from t_before)                              as org_before,
  current_org_id()                                               as org_after,
  (select rival_rows_before from t_before)                       as rival_rows_before,
  (select count(*) from products
    where org_id = '99999999-0000-0000-0000-000000000001')       as rival_rows_after;

-- Undoes phase 0 along with everything else. DDL is transactional.
rollback;
