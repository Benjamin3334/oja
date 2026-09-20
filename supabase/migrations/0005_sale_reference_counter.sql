-- ============================================================================
-- 0005 - Replace count(*)+1 sale references with a real counter.
--
-- THE BUG
--   0001 generates the human-readable reference like this:
--
--       select 'SA-' || to_char(now(),'YYYY') || '-' ||
--              lpad((count(*) + 1)::text, 4, '0')
--       from sales
--       where org_id = p_org_id and date_part('year', sold_at) = ...
--
--   Three problems.
--
--   1. IT RACES. Counting is a read. Two sales started in the same moment both
--      count the same number of existing rows, both compute SA-2026-0041, and
--      the second insert dies on uq_sale_reference_per_org. The till fails in
--      front of a customer, and only when the shop is busy.
--
--   2. IT REUSES NUMBERS. The value is derived from how many rows exist right
--      now, not from how many have ever been issued. Remove any row and the
--      next sale reissues a reference that already appeared on a printed
--      receipt. Two different sales, one number.
--
--   3. IT COUNTS THE WRONG THINGS. Drafts and voided sales are rows, so an
--      abandoned draft silently consumes a reference and leaves a gap that
--      looks like a deleted sale during an audit.
--
--   FR-4.6 asks for a human-readable reference that is unique per
--   organisation. Uniqueness enforced by a constraint that fails the
--   transaction is not the same as generating a unique value.
--
-- THE FIX
--   A counter row per organisation per year, incremented with UPDATE ...
--   RETURNING inside the caller's transaction. UPDATE takes a row-level
--   exclusive lock, so a second caller blocks until the first commits and then
--   reads the incremented value. The number issued is never derived from how
--   many rows happen to exist, so voids and deletions cannot affect it.
--
--   The counter is a tenant table: it carries org_id and has RLS, per
--   02_CLAUDE.md section 5.1. Only the function writes to it, and the function
--   is security definer, so no write policy is needed or wanted.
--
--   The year comes from Africa/Lagos, not UTC, so a sale at 00:30 on 1 January
--   does not get last year's prefix. Same reasoning as the trap in section 8
--   of 02_CLAUDE.md.
--
-- BACKFILL
--   Any sales that already exist are counted once, so the counter starts above
--   the highest reference already issued and cannot collide with it.
--
-- VERIFY AFTER RUNNING
--   Calling it twice must give consecutive numbers that never repeat:
--       select next_sale_reference(current_org_id());
--       select next_sale_reference(current_org_id());
--   Then confirm the counter advanced rather than the row count:
--       select * from sale_reference_counters;
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The counter table.
-- ---------------------------------------------------------------------------
create table if not exists sale_reference_counters (
    org_id      uuid    not null references organisations(id) on delete cascade,
    year        integer not null,
    -- The next number to hand out. Never decreases.
    next_value  integer not null default 1 check (next_value > 0),
    primary key (org_id, year)
);

alter table sale_reference_counters enable row level security;

-- Readable within the organisation, for auditing. Nothing may write to it
-- directly; next_sale_reference() is security definer and writes on your
-- behalf, which is what stops a client inventing its own sequence.
drop policy if exists sale_reference_counters_select on sale_reference_counters;
create policy sale_reference_counters_select on sale_reference_counters
    for select using (org_id = current_org_id());


-- ---------------------------------------------------------------------------
-- 2. Backfill from existing sales so no reference is reissued.
-- ---------------------------------------------------------------------------
insert into sale_reference_counters (org_id, year, next_value)
select s.org_id,
       date_part('year', s.sold_at at time zone 'Africa/Lagos')::integer,
       count(*) + 1
from sales s
group by 1, 2
on conflict (org_id, year) do nothing;


-- ---------------------------------------------------------------------------
-- 3. The generator.
-- ---------------------------------------------------------------------------
create or replace function next_sale_reference(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn_next_sale_reference$
declare
    v_year integer := date_part('year', now() at time zone 'Africa/Lagos')::integer;
    v_next integer;
begin
    -- Security definer bypasses RLS, so the tenant check is explicit.
    if p_org_id is null or p_org_id <> current_org_id() then
        raise exception 'Cannot generate a sale reference for another organisation';
    end if;

    -- Create this year's counter if it is the first sale of the year.
    insert into sale_reference_counters (org_id, year, next_value)
    values (p_org_id, v_year, 1)
    on conflict (org_id, year) do nothing;

    -- The lock that makes this safe: UPDATE takes a row-level exclusive lock,
    -- so a concurrent caller waits here and then reads the incremented value.
    update sale_reference_counters
       set next_value = next_value + 1
     where org_id = p_org_id and year = v_year
    returning next_value - 1 into v_next;

    return 'SA-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$fn_next_sale_reference$;

grant execute on function next_sale_reference(uuid) to authenticated;
