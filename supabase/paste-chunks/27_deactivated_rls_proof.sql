-- ============================================================================
-- What a deactivated member's valid session can actually reach.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Nothing to substitute. Run it AFTER 0016 and 0017.
--
-- WHY THIS IS THE CHECK THAT MATTERS
--   The /deactivated screen is courtesy. It explains, it does not enforce.
--   Supabase Auth knows nothing about profiles, so a deactivated member still
--   signs in, still holds a valid JWT, and can still issue any query the
--   client could issue - by hand, with curl, long after the interface has
--   stopped offering them a button.
--
--   So the question is not "what does the application show them" but "what
--   does the database return to that token". This script asks the database
--   directly, as that user, with the interface out of the way.
--
-- WHAT IT DOES
--   Takes a real active member, records what they can read, deactivates them,
--   and asks the same questions again in the same session. Then it attempts
--   complete_sale() on a genuine draft sale in their own organisation - the
--   most damaging thing a stale session could try, because it moves stock.
--
--   Every check runs in its own DO block with an exception handler, so a
--   refusal is recorded rather than aborting the run, and the whole report
--   arrives as ONE result set - the Supabase SQL editor only renders the last.
--
-- EXPECTED (final grid):
--   products before        a number greater than zero
--   products after         0
--   sales after            0
--   customers after        0
--   stock_movements after  0
--   v_product_stock after  0
--   own profile after      1     <- the ONE thing still readable, by design
--   complete_sale          refused: Your account is not attached to an
--                                   organisation
--
--   The own-profile row is not a leak. profiles_select_self was added in 0016
--   so the application can tell "removed from an organisation" apart from
--   "never had one" and explain which. It exposes that member's own row and
--   nothing else - note that products, sales and customers all read 0 in the
--   same breath.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: pick an active member, as the database owner.
-- ---------------------------------------------------------------------------
create temp table t_actor on commit drop as
select id, org_id
from profiles
where is_active
order by created_at
limit 1;

do $fn_require_actor$
begin
    if not exists (select 1 from t_actor) then
        raise exception 'No active profile exists. Sign up through the app first.';
    end if;
end;
$fn_require_actor$;

-- A draft sale in their own organisation, for the complete_sale attempt. No
-- line items: the point is whether the tenant guard refuses the caller, not
-- whether stock arithmetic works.
insert into sales (id, org_id, reference, sold_by, status, payment_method)
select '77777777-0000-0000-0000-000000000009',
       org_id, 'SA-DEACTIVATED-TEST', id, 'draft', 'cash'
from t_actor;

-- ---------------------------------------------------------------------------
-- Phase 2: as that member, while still active. The baseline.
-- ---------------------------------------------------------------------------
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from t_actor),
                      'role', 'authenticated')::text,
    true);

set local role authenticated;

create temp table t_report (seq integer, check_name text, outcome text)
on commit drop;

insert into t_report
select 1, 'products before', count(*)::text from products;

-- ---------------------------------------------------------------------------
-- Phase 3: the owner deactivates them. Done as the database owner because
-- since 0014 nobody may write is_active through the API; 0017 restores that
-- to owners through set_member_active(), which is a different test.
-- ---------------------------------------------------------------------------
set local role postgres;

update profiles set is_active = false where id = (select id from t_actor);

-- ---------------------------------------------------------------------------
-- Phase 4: same user, same session, now deactivated. Ask everything again.
-- ---------------------------------------------------------------------------
set local role authenticated;

insert into t_report
select 2, 'products after', count(*)::text from products;

insert into t_report
select 3, 'sales after', count(*)::text from sales;

insert into t_report
select 4, 'customers after', count(*)::text from customers;

insert into t_report
select 5, 'stock_movements after', count(*)::text from stock_movements;

insert into t_report
select 6, 'v_product_stock after', count(*)::text from v_product_stock;

insert into t_report
select 7, 'own profile after', count(*)::text
  from profiles where id = auth.uid();

-- ---------------------------------------------------------------------------
-- Phase 5: the write that would do real damage.
-- ---------------------------------------------------------------------------
do $fn_check_complete$
begin
    perform complete_sale('77777777-0000-0000-0000-000000000009');
    insert into t_report values (8, 'complete_sale', 'ALLOWED - guard failed');
exception when others then
    insert into t_report values (8, 'complete_sale', 'refused: ' || sqlerrm);
end;
$fn_check_complete$;

-- ---------------------------------------------------------------------------
-- Phase 6: one result set, because only the last one is displayed.
-- ---------------------------------------------------------------------------
select check_name, outcome from t_report order by seq;

rollback;
