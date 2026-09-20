-- ============================================================================
-- Failing case for migration 0009: a staff account can void a sale directly,
-- skipping void_sale() and leaving the stock unreturned.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- Run it BEFORE 0009 (the void succeeds - that is the bug) and again AFTER
-- 0009 (the void must fail with "permission denied for column status").
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID with your auth user id.
--
-- WHY THIS IS WORSE THAN A MISSING ROLE CHECK
--   void_sale() does two things: it flips the status AND it writes compensating
--   'in' movements that put the stock back. A direct UPDATE does only the
--   first. So the sale reads as void while the stock stays deducted: the ledger
--   and the sale disagree, which is exactly the corruption the append-only
--   design exists to prevent. Nothing in the system flags it afterwards.
--
-- EXPECTED BEFORE 0009 (final grid):
--   sale_status            = void
--   stock_after_void       = 97     <- WRONG. Voiding should return it to 100.
--   compensating_movements = 0      <- WRONG. void_sale() would have written 1.
--
-- EXPECTED AFTER 0009:
--   the UPDATE raises: permission denied for column status of relation "sales"
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Phase 1: act as the owner and record a real sale, so there is something
-- worth voiding. Stock falls from 100 to 97.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  '{"sub":"YOUR_AUTH_UID","role":"authenticated"}',
                  true);

set local role authenticated;

select current_user_role() as role_in_phase_1;   -- must read 'owner'

insert into sales (id, org_id, reference, sold_by, status, payment_method)
values ('66666666-0000-0000-0000-000000000001',
        current_org_id(), 'SA-VOID-TEST', auth.uid(), 'draft', 'cash');

insert into sale_items (sale_id, product_id, quantity, unit_price)
select '66666666-0000-0000-0000-000000000001', id, 3, unit_price
from products
where org_id = current_org_id() and sku = 'STA-001';

select complete_sale('66666666-0000-0000-0000-000000000001');

-- Baseline: 97, and one 'out' movement.
select stock_quantity as stock_after_sale
from v_product_stock
where org_id = current_org_id() and sku = 'STA-001';

-- ---------------------------------------------------------------------------
-- Phase 2: become a staff member. Done through the owner policy while still
-- acting as the owner, before the demotion takes effect.
-- ---------------------------------------------------------------------------
update profiles set role = 'staff' where id = auth.uid();

select current_user_role() as role_in_phase_2;   -- must read 'staff'

-- ---------------------------------------------------------------------------
-- Phase 3: the hole. A staff member voids a sale without calling void_sale(),
-- so its role check never runs and no compensating movement is written.
-- BEFORE 0009 this returns a row. AFTER 0009 it must raise.
-- ---------------------------------------------------------------------------
update sales
   set status = 'void'
 where id = '66666666-0000-0000-0000-000000000001'
returning id, status;

-- ---------------------------------------------------------------------------
-- Phase 4: the damage. The sale says void; the stock says otherwise.
-- ---------------------------------------------------------------------------
select
  (select status from sales
     where id = '66666666-0000-0000-0000-000000000001')            as sale_status,
  (select stock_quantity from v_product_stock
     where org_id = current_org_id() and sku = 'STA-001')          as stock_after_void,
  (select count(*) from stock_movements
     where sale_id = '66666666-0000-0000-0000-000000000001'
       and movement_type = 'in')                                   as compensating_movements;

rollback;
