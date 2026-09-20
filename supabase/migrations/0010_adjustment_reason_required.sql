-- ============================================================================
-- 0010 - An adjustment must say why.
--
-- THE BUG
--   FR-3.5 specifies "Adjustment: signed quantity + mandatory reason (damage,
--   count correction, theft)". The database does not agree:
--
--       reason  text        -- nullable, no constraint
--
--   So an adjustment can be recorded with no explanation at all. That is the
--   one movement type where the explanation IS the record: an 'in' is a
--   delivery and an 'out' is a sale, both self-describing, but an adjustment
--   only means something if it says whether the stock was damaged, miscounted
--   or stolen.
--
--   Goal G3 is "make every stock change traceable to a person, a time AND A
--   REASON". Two of the three were enforced; the third was a convention.
--
--   Leaving it to the application would also contradict the argument the rest
--   of this schema makes - overselling, tenant isolation and the append-only
--   ledger are all enforced by the engine precisely because a client can be
--   bypassed.
--
-- THE FIX
--   A check constraint. Blank is rejected as well as null, because a required
--   field that accepts a single space is not required.
--
--   'in' and 'out' are deliberately left alone. complete_sale() and
--   void_sale() write their own reasons, and constraining those types would
--   couple this migration to the wording those functions happen to use.
--
-- EXISTING ROWS
--   The constraint is validated against them on creation. Seeded movements are
--   all 'in' with 'Opening stock', so nothing should fail. If it does, an
--   adjustment without a reason already exists and must be dealt with
--   deliberately rather than by weakening the constraint.
--
-- VERIFY AFTER RUNNING
--   insert into stock_movements (org_id, product_id, movement_type, quantity)
--   values (current_org_id(), '<a product>', 'adjustment', -3);
--     -> ERROR: new row violates check constraint "chk_adjustment_has_reason"
-- ============================================================================

alter table stock_movements
    add constraint chk_adjustment_has_reason
    check (
        movement_type <> 'adjustment'
        or (reason is not null and length(trim(reason)) > 0)
    );
