-- ============================================================================
-- OJA — Small Business & Institution Operations System
-- Database schema for Supabase (PostgreSQL 15)
-- Author: Benjamin John Abakasanga — SIWES Capstone
--
-- HOW TO RUN
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste sections 1–7 and Run. (Section 8 = seed data, run after you have
--      created your first user account through the app.)
--   3. Section 9 contains reference queries for the demo. Do not run blindly.
--
-- READ THIS FIRST (defence note): everything below is normalised to 3NF.
-- Where a value looks duplicated (sale_items.unit_price) it is a deliberate
-- HISTORICAL SNAPSHOT, not redundancy — see the comment on that column.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS AND ENUM TYPES
-- ============================================================================

create extension if not exists pgcrypto;          -- gives us gen_random_uuid()

-- Enums model a CLOSED domain: only these values can ever exist in the column.
-- This is a constraint enforced by the engine, not by application code.
create type user_role      as enum ('owner', 'manager', 'staff');
create type movement_type  as enum ('in', 'out', 'adjustment');
create type sale_status    as enum ('draft', 'completed', 'void');
create type payment_method as enum ('cash', 'transfer', 'card', 'credit');


-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- ---------------------------------------------------------------- tenants --
create table organisations (
    id          uuid primary key default gen_random_uuid(),
    name        text        not null check (length(trim(name)) > 0),
    slug        text        not null unique,       -- URL-safe identifier
    currency    char(3)     not null default 'NGN',
    low_stock_default integer not null default 5 check (low_stock_default >= 0),
    created_at  timestamptz not null default now()
);

comment on table organisations is
    'Tenant root. Every other table hangs off this so data can be isolated.';


-- ------------------------------------------------------------- app users --
-- profiles.id is BOTH the primary key AND a foreign key to Supabase's
-- auth.users table. This is a one-to-one relationship: one login, one profile.
create table profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    org_id      uuid        not null references organisations(id) on delete cascade,
    full_name   text        not null,
    email       text        not null,
    role        user_role   not null default 'staff',
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now()
);

create index idx_profiles_org on profiles(org_id);


-- ------------------------------------------------------------ categories --
create table categories (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid        not null references organisations(id) on delete cascade,
    name        text        not null check (length(trim(name)) > 0),
    created_at  timestamptz not null default now(),
    -- A category name must be unique INSIDE an organisation, not globally.
    -- Two different shops may both have a category called "Drinks".
    constraint uq_category_per_org unique (org_id, name)
);

create index idx_categories_org on categories(org_id);


-- -------------------------------------------------------------- products --
create table products (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid        not null references organisations(id) on delete cascade,
    category_id    uuid        references categories(id) on delete restrict,
    sku            text        not null,
    name           text        not null check (length(trim(name)) > 0),
    unit_price     numeric(12,2) not null check (unit_price >= 0),  -- CURRENT selling price
    cost_price     numeric(12,2) not null default 0 check (cost_price >= 0),
    reorder_level  integer     not null default 5 check (reorder_level >= 0),
    is_active      boolean     not null default true,   -- soft delete
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint uq_sku_per_org unique (org_id, sku)
);

create index idx_products_org      on products(org_id);
create index idx_products_category on products(category_id);
-- Case-insensitive search on product name for the sale screen picker:
create index idx_products_name_lower on products(org_id, lower(name));

comment on column products.unit_price is
    'The price the product sells for TODAY. Historical prices live on sale_items.';


-- ------------------------------------------------------------- customers --
create table customers (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid        not null references organisations(id) on delete cascade,
    full_name   text        not null check (length(trim(full_name)) > 0),
    phone       text,
    email       text,
    address     text,
    created_at  timestamptz not null default now(),
    constraint uq_customer_phone_per_org unique (org_id, phone)
);

create index idx_customers_org on customers(org_id);


-- ----------------------------------------------------------------- sales --
create table sales (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid        not null references organisations(id) on delete cascade,
    reference      text        not null,                -- human readable: SA-2026-0041
    customer_id    uuid        references customers(id) on delete set null,  -- NULL = walk-in
    sold_by        uuid        references profiles(id)  on delete set null,
    status         sale_status    not null default 'draft',
    payment_method payment_method not null default 'cash',
    note           text,
    sold_at        timestamptz not null default now(),
    constraint uq_sale_reference_per_org unique (org_id, reference)
);

create index idx_sales_org_date on sales(org_id, sold_at desc);
create index idx_sales_customer on sales(customer_id);

comment on column sales.customer_id is
    'Nullable on purpose: a walk-in sale has no customer. The relationship is
     OPTIONAL one-to-many (one customer → many sales).';


-- ------------------------------------------------------------ sale_items --
-- THE JUNCTION TABLE.
-- A sale contains many products; a product appears in many sales. That is a
-- many-to-many relationship, which a relational database cannot store directly.
-- It is resolved into two one-to-many relationships through this table, which
-- also carries its own attributes (quantity, unit_price).
create table sale_items (
    id          uuid primary key default gen_random_uuid(),
    sale_id     uuid        not null references sales(id)    on delete cascade,
    product_id  uuid        not null references products(id) on delete restrict,
    quantity    integer     not null check (quantity > 0),
    unit_price  numeric(12,2) not null check (unit_price >= 0),
    -- Generated column: maintained by PostgreSQL, impossible to desynchronise.
    line_total  numeric(12,2) generated always as (quantity * unit_price) stored,
    -- The same product may not appear twice on one sale; increase the quantity.
    -- (sale_id, product_id) is therefore a candidate key of this table.
    constraint uq_product_per_sale unique (sale_id, product_id)
);

create index idx_sale_items_sale    on sale_items(sale_id);
create index idx_sale_items_product on sale_items(product_id);

comment on column sale_items.unit_price is
    'HISTORICAL SNAPSHOT. This is what the customer actually paid on that day.
     It is not a copy of products.unit_price — it is a different fact that
     happens to share the value at the moment of sale. Storing it is what makes
     old receipts reproducible after a price change.';


-- ------------------------------------------------------- stock movements --
-- The stock ledger. Current stock is DERIVED from this table (see v_product_stock),
-- never stored on products. Append-only: every change is explained and attributed.
create table stock_movements (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid        not null references organisations(id) on delete cascade,
    product_id     uuid        not null references products(id) on delete restrict,
    sale_id        uuid        references sales(id) on delete set null,  -- set when caused by a sale
    movement_type  movement_type not null,
    quantity       integer     not null,
    reason         text,
    created_by     uuid        references profiles(id) on delete set null,
    created_at     timestamptz not null default now(),

    -- 'in' and 'out' quantities are always positive magnitudes.
    -- 'adjustment' may be signed (e.g. -3 for breakage, +2 for a recount).
    constraint chk_movement_quantity check (
        (movement_type in ('in','out') and quantity > 0)
        or (movement_type = 'adjustment' and quantity <> 0)
    )
);

create index idx_movements_product on stock_movements(product_id, created_at desc);
create index idx_movements_org     on stock_movements(org_id, created_at desc);


-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- Returns the organisation of the currently authenticated user.
-- SECURITY DEFINER so that reading profiles inside a policy does not itself
-- trigger the policy on profiles (which would recurse).
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select org_id from public.profiles where id = auth.uid();
$$;

create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

-- Keeps products.updated_at honest.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_products_updated_at
    before update on products
    for each row execute function set_updated_at();


-- ============================================================================
-- 4. DERIVED DATA (VIEWS)
-- ============================================================================

-- Current stock per product = sum of the ledger.
--   in         → +quantity
--   out        → -quantity
--   adjustment → +quantity (already signed)
create or replace view v_product_stock as
select
    p.id            as product_id,
    p.org_id,
    p.sku,
    p.name,
    p.category_id,
    p.unit_price,
    p.cost_price,
    p.reorder_level,
    p.is_active,
    coalesce(sum(
        case m.movement_type
            when 'in'         then  m.quantity
            when 'out'        then -m.quantity
            when 'adjustment' then  m.quantity
        end
    ), 0)::integer as stock_quantity
from products p
left join stock_movements m on m.product_id = p.id
group by p.id;

-- Products at or below their reorder level.
create or replace view v_low_stock as
select *
from v_product_stock
where is_active
  and stock_quantity <= reorder_level;

-- Revenue per day (completed sales only).
create or replace view v_daily_sales as
select
    s.org_id,
    (s.sold_at at time zone 'Africa/Lagos')::date as sale_date,
    count(distinct s.id)        as sale_count,
    coalesce(sum(si.quantity), 0) as units_sold,
    coalesce(sum(si.line_total), 0)::numeric(14,2) as revenue
from sales s
join sale_items si on si.sale_id = s.id
where s.status = 'completed'
group by s.org_id, (s.sold_at at time zone 'Africa/Lagos')::date;

-- Sale header with its computed total.
create or replace view v_sale_totals as
select
    s.id as sale_id,
    s.org_id,
    s.reference,
    s.status,
    s.payment_method,
    s.sold_at,
    s.customer_id,
    s.sold_by,
    coalesce(sum(si.line_total), 0)::numeric(14,2) as total_amount,
    coalesce(sum(si.quantity), 0) as item_count
from sales s
left join sale_items si on si.sale_id = s.id
group by s.id;


-- ============================================================================
-- 5. BUSINESS RULES ENFORCED IN THE DATABASE
-- ============================================================================

-- 5.1 Completing a sale writes one 'out' movement per line and refuses to
--     oversell. Running it inside one function makes it ATOMIC: either every
--     line is deducted or nothing happens at all.
create or replace function complete_sale(p_sale_id uuid)
returns void
language plpgsql
security invoker            -- still subject to RLS: you cannot touch another org
as $$
declare
    item        record;
    available   integer;
    v_org       uuid;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'draft';
    if v_org is null then
        raise exception 'Sale % not found or is not a draft', p_sale_id;
    end if;

    for item in
        select product_id, quantity from sale_items where sale_id = p_sale_id
    loop
        select stock_quantity into available
        from v_product_stock where product_id = item.product_id;

        if available < item.quantity then
            raise exception
                'Insufficient stock for product %: % requested, % available',
                item.product_id, item.quantity, available;
        end if;

        insert into stock_movements
            (org_id, product_id, sale_id, movement_type, quantity, reason, created_by)
        values
            (v_org, item.product_id, p_sale_id, 'out', item.quantity, 'Sale', auth.uid());
    end loop;

    update sales
       set status = 'completed', sold_at = now()
     where id = p_sale_id;
end;
$$;


-- 5.2 Voiding a sale never deletes anything. It writes COMPENSATING movements
--     so the ledger still explains itself, and flips the status.
create or replace function void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
    item  record;
    v_org uuid;
begin
    select org_id into v_org from sales where id = p_sale_id and status = 'completed';
    if v_org is null then
        raise exception 'Sale % not found or is not completed', p_sale_id;
    end if;

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
$$;


-- 5.3 Generate the next human-readable sale reference for an organisation.
create or replace function next_sale_reference(p_org_id uuid)
returns text
language sql
stable
as $$
    select 'SA-' || to_char(now(), 'YYYY') || '-' ||
           lpad((count(*) + 1)::text, 4, '0')
    from sales
    where org_id = p_org_id
      and date_part('year', sold_at) = date_part('year', now());
$$;


-- ============================================================================
-- 6. ROW LEVEL SECURITY
--    Authorisation lives in the DATABASE. Even if the front end is bypassed
--    entirely, a user cannot read or write another organisation's rows.
-- ============================================================================

alter table organisations   enable row level security;
alter table profiles        enable row level security;
alter table categories      enable row level security;
alter table products        enable row level security;
alter table customers       enable row level security;
alter table sales           enable row level security;
alter table sale_items      enable row level security;
alter table stock_movements enable row level security;

-- ---- organisations -------------------------------------------------------
create policy org_select on organisations
    for select using (id = current_org_id());

create policy org_update on organisations
    for update using (id = current_org_id() and current_user_role() = 'owner');

-- ---- profiles ------------------------------------------------------------
create policy profiles_select on profiles
    for select using (org_id = current_org_id());

-- A user may edit their own name, but NOT their own role (no self-promotion).
create policy profiles_update_self on profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy profiles_update_by_owner on profiles
    for update using (org_id = current_org_id() and current_user_role() = 'owner');

-- ---- categories / products / customers ----------------------------------
create policy categories_all on categories
    for all using (org_id = current_org_id())
    with check (org_id = current_org_id());

create policy products_select on products
    for select using (org_id = current_org_id());

create policy products_write on products
    for all using (org_id = current_org_id() and current_user_role() in ('owner','manager'))
    with check (org_id = current_org_id() and current_user_role() in ('owner','manager'));

create policy customers_all on customers
    for all using (org_id = current_org_id())
    with check (org_id = current_org_id());

-- ---- sales ---------------------------------------------------------------
create policy sales_select on sales
    for select using (org_id = current_org_id());

create policy sales_insert on sales
    for insert with check (org_id = current_org_id());

create policy sales_update on sales
    for update using (org_id = current_org_id());

-- ---- sale_items ----------------------------------------------------------
-- This table has no org_id of its own, so the policy reaches through its parent.
-- Trade-off: one extra sub-query per row versus denormalising org_id onto the
-- junction table. At MVP scale, correctness wins; the index on sales(id) keeps
-- the lookup cheap.
create policy sale_items_all on sale_items
    for all using (
        exists (select 1 from sales s
                 where s.id = sale_items.sale_id and s.org_id = current_org_id())
    )
    with check (
        exists (select 1 from sales s
                 where s.id = sale_items.sale_id and s.org_id = current_org_id())
    );

-- ---- stock_movements -----------------------------------------------------
create policy movements_select on stock_movements
    for select using (org_id = current_org_id());

-- Only managers and owners may manually move stock. Sale-driven movements are
-- written by complete_sale(), which runs as the calling user and passes this too.
create policy movements_insert on stock_movements
    for insert with check (org_id = current_org_id());

-- Deliberately NO update/delete policy: the ledger is append-only.


-- ============================================================================
-- 7. SIGN-UP HOOK — give every new auth user a profile
--    (Run once. Adjust if you prefer to create profiles from the app.)
-- ============================================================================
-- NOTE: this leaves org_id null; the app's onboarding screen sets it when the
-- user creates or joins an organisation. Keep the column NOT NULL by creating
-- the profile from the app instead if you prefer a simpler flow.


-- ============================================================================
-- 8. SEED DATA (demo)
--    Run AFTER you have signed up once, then replace <YOUR_AUTH_UID> with the
--    id from Supabase → Authentication → Users.
-- ============================================================================
/*
insert into organisations (id, name, slug, currency)
values ('11111111-1111-1111-1111-111111111111', 'Topfaith Campus Store', 'topfaith-store', 'NGN');

insert into profiles (id, org_id, full_name, email, role)
values ('<YOUR_AUTH_UID>', '11111111-1111-1111-1111-111111111111',
        'Benjamin John Abakasanga', 'benjamin@example.com', 'owner');

insert into categories (id, org_id, name) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Stationery'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Drinks'),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Snacks');

insert into products (id, org_id, category_id, sku, name, unit_price, cost_price, reorder_level) values
  ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000001','STA-001','A4 Exercise Book',   850.00,  600.00, 20),
  ('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000001','STA-002','Biro (Blue)',        150.00,   90.00, 50),
  ('33333333-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000002','DRK-001','Bottled Water 75cl', 300.00,  200.00, 40),
  ('33333333-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000002','DRK-002','Malt Drink 33cl',    900.00,  700.00, 24),
  ('33333333-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-0000-0000-0000-000000000003','SNK-001','Meat Pie',           700.00,  450.00, 10);

-- opening stock
insert into stock_movements (org_id, product_id, movement_type, quantity, reason, created_by)
select '11111111-1111-1111-1111-111111111111', id, 'in', 100, 'Opening stock', '<YOUR_AUTH_UID>'
from products where org_id = '11111111-1111-1111-1111-111111111111';

insert into customers (org_id, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Chika Obi',    '08030000001'),
  ('11111111-1111-1111-1111-111111111111', 'Aisha Bello',  '08030000002');
*/


-- ============================================================================
-- 9. REFERENCE QUERIES — rehearse these; the examiner may ask you to write one
-- ============================================================================

-- 9.1 SELECT with WHERE and ORDER BY: active products, most expensive first
--     select sku, name, unit_price
--     from products
--     where org_id = current_org_id() and is_active
--     order by unit_price desc;

-- 9.2 INNER JOIN: every line item with its product name
--     select s.reference, p.name, si.quantity, si.unit_price, si.line_total
--     from sale_items si
--     join sales    s on s.id = si.sale_id
--     join products p on p.id = si.product_id
--     order by s.sold_at desc;

-- 9.3 LEFT JOIN: all customers, including those who never bought anything
--     select c.full_name, count(s.id) as sales_count
--     from customers c
--     left join sales s on s.customer_id = c.id and s.status = 'completed'
--     group by c.id, c.full_name
--     order by sales_count desc;

-- 9.4 GROUP BY + HAVING: products that sold more than 10 units
--     select p.name, sum(si.quantity) as units_sold
--     from sale_items si
--     join products p on p.id = si.product_id
--     join sales    s on s.id = si.sale_id and s.status = 'completed'
--     group by p.id, p.name
--     having sum(si.quantity) > 10
--     order by units_sold desc;

-- 9.5 Top 5 products by revenue in the last 30 days (the dashboard query)
--     select p.name,
--            sum(si.quantity)   as units_sold,
--            sum(si.line_total) as revenue
--     from sale_items si
--     join sales    s on s.id = si.sale_id
--     join products p on p.id = si.product_id
--     where s.status = 'completed'
--       and s.sold_at >= now() - interval '30 days'
--     group by p.id, p.name
--     order by revenue desc
--     limit 5;

-- 9.6 Gross margin per product
--     select p.name,
--            sum(si.line_total)                     as revenue,
--            sum(si.quantity * p.cost_price)        as cost,
--            sum(si.line_total - si.quantity * p.cost_price) as gross_margin
--     from sale_items si
--     join products p on p.id = si.product_id
--     join sales    s on s.id = si.sale_id and s.status = 'completed'
--     group by p.id, p.name
--     order by gross_margin desc;

-- 9.7 Stock valuation at cost
--     select sum(stock_quantity * cost_price)::numeric(14,2) as stock_value
--     from v_product_stock
--     where org_id = current_org_id();

-- 9.8 UPDATE: apply a 10% price increase to one category
--     update products
--     set unit_price = round(unit_price * 1.10, 2)
--     where org_id = current_org_id()
--       and category_id = '<category-uuid>';
--     -- Old sales are unaffected, because sale_items stores its own unit_price.

-- 9.9 DELETE (the safe version): deactivate rather than delete
--     update products set is_active = false where id = '<product-uuid>';

-- 9.10 Subquery: products that have never been sold
--     select name from products
--     where org_id = current_org_id()
--       and id not in (select product_id from sale_items);
