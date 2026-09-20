-- ============================================================================
-- OJA baseline, chunk 09 of 09: seed demo data
--
-- Generated from supabase/migrations/0001_initial_schema.sql section 8, with
-- the block-comment markers removed so it can be run directly.
--
-- BEFORE RUNNING: replace both occurrences of YOUR_AUTH_UID below with your
-- real auth user id. Find it with:
--     select id, email, created_at from auth.users order by created_at;
--
-- If that returns no rows, sign up through the app at /sign-up first.
-- ============================================================================

insert into organisations (id, name, slug, currency)
values ('11111111-1111-1111-1111-111111111111', 'Topfaith Campus Store', 'topfaith-store', 'NGN');

insert into profiles (id, org_id, full_name, email, role)
values ('YOUR_AUTH_UID', '11111111-1111-1111-1111-111111111111',
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
select '11111111-1111-1111-1111-111111111111', id, 'in', 100, 'Opening stock', 'YOUR_AUTH_UID'
from products where org_id = '11111111-1111-1111-1111-111111111111';

insert into customers (org_id, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Chika Obi',    '08030000001'),
  ('11111111-1111-1111-1111-111111111111', 'Aisha Bello',  '08030000002');
