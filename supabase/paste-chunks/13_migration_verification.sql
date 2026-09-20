-- ============================================================================
-- Verification for migrations 0002 - 0008.
--
-- NOT a migration. Read-only: it queries the system catalogues only, so it
-- changes nothing and needs no transaction.
--
-- Run it AFTER applying 0004, 0005, 0007 and 0008. Every row must show
-- actual = expected. Anything else names the migration that did not take.
-- ============================================================================

select '0002 views run as invoker' as check_name,
       (select count(*)::text from pg_class
         where relkind = 'v'
           and relname in ('v_product_stock','v_low_stock','v_daily_sales','v_sale_totals')
           and array_to_string(reloptions, ',') like '%security_invoker=true%') as actual,
       '4' as expected

union all
select '0003 movements_insert checks role',
       (select case when pg_get_expr(polwithcheck, polrelid) like '%current_user_role%'
                    then 'yes' else 'no' end
          from pg_policy where polname = 'movements_insert'),
       'yes'

union all
select '0003 complete_sale is security definer',
       (select case when prosecdef then 'yes' else 'no' end
          from pg_proc where proname = 'complete_sale'),
       'yes'

union all
select '0003 complete_sale checks the tenant',
       (select case when prosrc like '%current_org_id()%' then 'yes' else 'no' end
          from pg_proc where proname = 'complete_sale'),
       'yes'

union all
select '0004 complete_sale locks the product row',
       (select case when prosrc like '%for update%' then 'yes' else 'no' end
          from pg_proc where proname = 'complete_sale'),
       'yes'

union all
select '0005 counter table exists',
       (select case when to_regclass('public.sale_reference_counters') is null
                    then 'no' else 'yes' end),
       'yes'

union all
select '0005 next_sale_reference stopped counting rows',
       (select case when prosrc like '%count(*)%' then 'still counting' else 'uses counter' end
          from pg_proc where proname = 'next_sale_reference'),
       'uses counter'

union all
select '0007 create_organisation_and_profile exists',
       (select case when count(*) = 0 then 'no' else 'yes' end
          from pg_proc where proname = 'create_organisation_and_profile'),
       'yes'

union all
select '0007 it is security definer',
       (select case when bool_or(prosecdef) then 'yes' else 'no' end
          from pg_proc where proname = 'create_organisation_and_profile'),
       'yes'

union all
select '0008 sales_select scopes by sold_by',
       (select case when pg_get_expr(polqual, polrelid) like '%sold_by%' then 'yes' else 'no' end
          from pg_policy where polname = 'sales_select'),
       'yes'

union all
select '0008 sale_items_all scopes by sold_by',
       (select case when pg_get_expr(polqual, polrelid) like '%sold_by%' then 'yes' else 'no' end
          from pg_policy where polname = 'sale_items_all'),
       'yes';
