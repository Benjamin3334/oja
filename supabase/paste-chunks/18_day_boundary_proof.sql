-- ============================================================================
-- The day boundary, for migration 0013 and for the dashboard fix beside it.
--
-- NOT a migration. Reads nothing and writes nothing - it evaluates date
-- arithmetic, so it is safe to run at any time, before or after 0013, and
-- needs no auth uid substituted.
--
-- WHY IT IS AN EXPRESSION AND NOT A TRANSACTION
--   Demonstrating this against real rows would mean inserting a sale with a
--   chosen sold_at. Since 0009 the client may update only customer_id,
--   payment_method and note, and since 0011 it may not insert into sales at
--   all - sold_at is set by complete_sale to now(). Both of those are
--   deliberate, so the proof works on the arithmetic itself rather than
--   asking for the protections to be relaxed to demonstrate a bug in date
--   handling.
--
-- THE BUG
--   sold_at is timestamptz. Grouping it by ::date groups by the UTC calendar
--   day. Lagos is UTC+1 with no daylight saving, so the first hour of every
--   Lagos day - 00:00 to 00:59 - is still YESTERDAY in UTC.
--
--   A shop open late therefore sees a sale made at half past midnight
--   counted in the previous day takings. Nothing errors and no total is
--   short overall; the money simply lands on the wrong row, which is worse,
--   because the daily figures still add up to the correct grand total.
--
-- EXPECTED OUTPUT
--   Row 1 (a sale at 00:30 Lagos):
--     day_if_grouped_by_utc = 2026-09-21   <- WRONG, this is yesterday
--     day_in_lagos          = 2026-09-22
--   Row 2 (a sale at 12:00 Lagos): both columns read 2026-09-22, which is
--   why the fault is easy to miss - it only appears in the first hour.
-- ============================================================================

select
    'sale at 00:30 Lagos'                                        as scenario,
    '2026-09-21 23:30:00+00'::timestamptz                        as sold_at,
    ('2026-09-21 23:30:00+00'::timestamptz)::date                as day_if_grouped_by_utc,
    (('2026-09-21 23:30:00+00'::timestamptz)
        at time zone 'Africa/Lagos')::date                       as day_in_lagos

union all

select
    'sale at 12:00 Lagos',
    '2026-09-22 11:00:00+00'::timestamptz,
    ('2026-09-22 11:00:00+00'::timestamptz)::date,
    (('2026-09-22 11:00:00+00'::timestamptz)
        at time zone 'Africa/Lagos')::date;


-- ----------------------------------------------------------------------------
-- After 0013, this must return rows grouped on the Lagos boundary. As a staff
-- account it returns only that person sales, which is why section 9.2 keeps
-- staff off the reports page entirely.
-- ----------------------------------------------------------------------------
-- select * from v_revenue_by_day order by day desc limit 7;
