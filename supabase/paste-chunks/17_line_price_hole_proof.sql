-- ============================================================================
-- Failing case for migration 0012: a line can be sold at any price the client
-- names, and completing the sale does not correct it.
--
-- NOT a migration. One transaction, ends in rollback, changes nothing.
-- RUN THIS AFTER 0011 - it starts the sale with create_draft_sale(), which is
-- the only way to open a sale once 0011 has revoked INSERT on sales.
-- Run it BEFORE 0012 (the line stays at 0.00 - that is the bug) and again
-- AFTER 0012 (completion must rewrite it to 850.00).
--
-- BEFORE RUNNING: replace every YOUR_AUTH_UID with your auth user id.
--
-- THE HOLE
--   sale_items.unit_price is supplied by whoever inserts the line, and
--   complete_sale() never touches it. 0006 taught the function to snapshot
--   unit_cost from the product at completion; unit_price was left exactly as
--   the client sent it.
--
--   So a staff member sells two exercise books at 0.00. Everything else in the
--   system behaves correctly, which is what makes this hard to notice: the
--   stock is deducted properly, the ledger line is written, the cost snapshot
--   is taken. Only the money is wrong. Revenue, profit and the customer's
--   lifetime spend are all computed from line_total, so all three are wrong
--   together and consistently - there is no disagreement anywhere to flag.
--
--   line_total does not help. It is a generated column, quantity * unit_price,
--   maintained by PostgreSQL and impossible to desynchronise - which means it
--   faithfully computes the wrong number.
--
-- EXPECTED BEFORE 0012 (final grid), against seeded STA-001 at 850.00:
--   sale_status          = completed
--   unit_price_on_line   = 0.00      <- WRONG. The product sells for 850.00.
--   line_total           = 0.00      <- WRONG. Two books is 1700.00.
--   product_price_today  = 850.00
--   unit_cost_snapshot   = 600.00    <- correct, and that is the point: the
--                                       cost is recorded while the price is
--                                       fiction, so the sale reports a loss
--                                       of 1200.00 that never happened.
--   stock_moved          = 2         <- correct. The goods really did leave.
--
-- EXPECTED AFTER 0012:
--   unit_price_on_line   = 850.00
--   line_total           = 1700.00
-- ============================================================================

begin;

select set_config('request.jwt.claims',
                  '{"sub":"57f6a574-7001-468c-bb48-5bb9f76806f8","role":"authenticated"}',
                  true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Phase 1: open a draft the legitimate way. Held in a temp table because
-- create_draft_sale() mints the id, so there is no constant to refer back to.
-- ---------------------------------------------------------------------------
create temp table t_sale on commit drop as
select create_draft_sale() as id;

select s.reference, s.status, s.sold_by = auth.uid() as sold_by_is_me
from sales s
where s.id = (select id from t_sale);

-- ---------------------------------------------------------------------------
-- Phase 2: the hole. Two exercise books, priced at nothing.
-- ---------------------------------------------------------------------------
insert into sale_items (sale_id, product_id, quantity, unit_price)
select (select id from t_sale), id, 2, 0.00
from products
where org_id = current_org_id() and sku = 'STA-001';

-- ---------------------------------------------------------------------------
-- Phase 3: complete it properly. Every protection in 0003, 0004 and 0006 runs.
-- None of them is about price.
-- ---------------------------------------------------------------------------
select complete_sale((select id from t_sale));

-- ---------------------------------------------------------------------------
-- Phase 4: the damage. The goods left the shop; the money did not arrive.
-- ---------------------------------------------------------------------------
select
  (select status from sales where id = (select id from t_sale))     as sale_status,
  (select unit_price from sale_items
     where sale_id = (select id from t_sale))                       as unit_price_on_line,
  (select line_total from sale_items
     where sale_id = (select id from t_sale))                       as line_total,
  (select unit_price from products
     where org_id = current_org_id() and sku = 'STA-001')           as product_price_today,
  (select unit_cost from sale_items
     where sale_id = (select id from t_sale))                       as unit_cost_snapshot,
  (select coalesce(sum(quantity), 0) from stock_movements
     where sale_id = (select id from t_sale)
       and movement_type = 'out')                                   as stock_moved;

rollback;
