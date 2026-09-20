-- ============================================================================
-- Failing case for migration 0011: a sale can be inserted already completed,
-- skipping complete_sale() entirely, so the stock never moves.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Run it BEFORE 0011 (the insert succeeds - that is the bug) and again AFTER
-- 0011 (the insert must fail with "permission denied for table sales").
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID with your auth user id.
--
-- WHY THIS IS THE SAME SHAPE AS 0009
--   0009 found that sales_update let a staff account write status directly and
--   fixed it with column-level privileges. The identical hole is still open on
--   INSERT: sales_insert checks org_id and nothing else, and Supabase grants
--   authenticated table-level INSERT, so every remaining column is the client
--   to choose.
--
-- WHAT COMPLETE_SALE DOES THAT AN INSERT DOES NOT
--   1. locks the product row and refuses to oversell     (0004)
--   2. writes one 'out' movement per line                (FR-4.4)
--   3. snapshots unit_cost while it is still true        (0006)
--   4. only then sets status = 'completed'
--   An insert with status = 'completed' does the fourth and none of the rest,
--   so the sale claims to have happened and the ledger has never heard of it.
--   Nothing reconciles the two afterwards.
--
-- SOLD_BY IS THE SECOND HALF
--   sold_by is client-supplied too. Below it is set to null, so the sale is
--   attributed to nobody; any other profile id in the organisation would be
--   accepted just as readily. Worse in combination with 0008: a sale
--   attributed to someone else disappears from the staff member who made it,
--   so the forgery conceals itself.
--
-- EXPECTED BEFORE 0011 (final grid):
--   sale_status        = completed
--   stock_after        = 100    <- WRONG. A real sale of 3 leaves 97.
--   movements_written  = 0      <- WRONG. complete_sale() writes 1.
--   unit_cost_snapshot = null   <- WRONG. 0006 fills this at completion.
--   sold_by_recorded   = false  <- WRONG. Nobody is accountable for the sale.
--
-- EXPECTED AFTER 0011:
--   the INSERT raises: permission denied for table sales
-- ============================================================================

begin;

select set_config('request.jwt.claims',
                  '{"sub":"YOUR_AUTH_UID","role":"authenticated"}',
                  true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Phase 1: the baseline. Whatever STA-001 holds before anything is written.
-- ---------------------------------------------------------------------------
select stock_quantity as stock_before
from v_product_stock
where org_id = current_org_id() and sku = 'STA-001';

-- ---------------------------------------------------------------------------
-- Phase 2: the hole. A sale is inserted in its final state. Note that the
-- reference is chosen by the client as well, so next_sale_reference() and its
-- per-year counter are bypassed too and the sequence can be written out of
-- order or duplicated up to the unique constraint.
-- BEFORE 0011 this returns a row. AFTER 0011 it must raise.
-- ---------------------------------------------------------------------------
insert into sales (id, org_id, reference, sold_by, status, payment_method)
values ('77777777-0000-0000-0000-000000000001',
        current_org_id(), 'SA-FORGED-001', null, 'completed', 'cash')
returning id, reference, status, sold_by;

insert into sale_items (sale_id, product_id, quantity, unit_price)
select '77777777-0000-0000-0000-000000000001', id, 3, unit_price
from products
where org_id = current_org_id() and sku = 'STA-001';

-- ---------------------------------------------------------------------------
-- Phase 3: the damage. The sale says completed; the stock never moved.
-- ---------------------------------------------------------------------------
select
  (select status from sales
     where id = '77777777-0000-0000-0000-000000000001')             as sale_status,
  (select stock_quantity from v_product_stock
     where org_id = current_org_id() and sku = 'STA-001')           as stock_after,
  (select count(*) from stock_movements
     where sale_id = '77777777-0000-0000-0000-000000000001')        as movements_written,
  (select unit_cost from sale_items
     where sale_id = '77777777-0000-0000-0000-000000000001')        as unit_cost_snapshot,
  (select sold_by is not null from sales
     where id = '77777777-0000-0000-0000-000000000001')             as sold_by_recorded;

rollback;
