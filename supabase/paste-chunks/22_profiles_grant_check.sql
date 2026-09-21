-- ============================================================================
-- Read-only diagnostic. No transaction, no writes, safe to run at any time.
--
-- Answers one question: what privileges and policies does profiles actually
-- carry right now? Proof 21 failed with "permission denied for table profiles"
-- at a point where, if 0014 had not been applied, the update should have
-- succeeded. Either 0014 is already in place, or authenticated never held
-- UPDATE on this table - and those two have very different consequences for
-- what the proof demonstrated.
-- ============================================================================

-- 1. Table-level privileges. If 0014 ran, UPDATE is absent here.
select 'table-level' as scope,
       grantee,
       privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
order by grantee, privilege_type;

-- 2. Column-level privileges. If 0014 ran, UPDATE appears here for exactly
--    full_name and email and nothing else.
select 'column-level' as scope,
       grantee,
       privilege_type,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
group by grantee, privilege_type
order by grantee, privilege_type;

-- 3. The policies themselves. If 0014 ran, the with-check expression on
--    profiles_update_self mentions org_id.
select polname                                as policy_name,
       polcmd                                 as command,
       pg_get_expr(polqual, polrelid)         as using_expression,
       pg_get_expr(polwithcheck, polrelid)    as with_check_expression
from pg_policy
where polrelid = 'public.profiles'::regclass
order by polname;
