-- Structural guarantees: no table without RLS, no view that bypasses it,
-- no security definer function with a mutable search_path.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(6);

-- Every table of the data model exists
select is(
  (select count(*)::int
   from pg_tables
   where schemaname = 'public'
     and tablename in (
       'profiles', 'invites', 'setter_daily_reports', 'leads', 'calls',
       'clients', 'products', 'sales', 'payments',
       'commission_rules', 'commission_payouts', 'expenses', 'audit_log'
     )),
  13,
  'tutte e 13 le tabelle del modello dati esistono'
);

-- RLS on every table in public, no exceptions
select is(
  (select coalesce(string_agg(tablename, ', ' order by tablename), '')
   from pg_tables
   where schemaname = 'public'
     and not rowsecurity),
  '',
  'ogni tabella in public ha RLS abilitata'
);

-- Every table has at least one policy (RLS without policies = silent denial)
select is(
  (select coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
   from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename
     )),
  '',
  'ogni tabella ha almeno una policy'
);

-- The most likely security bug of this project: a view without security_invoker
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce(
       (select option_value
        from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'),
       'false'
     ) <> 'true'),
  '',
  'ogni view è security_invoker'
);

-- security definer functions must pin search_path
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
       where cfg like 'search_path=%'
     )),
  '',
  'ogni funzione security definer ha search_path impostato'
);

-- anon must never reach the economics tables
select is(
  (select coalesce(string_agg(distinct table_name, ', '), '')
   from information_schema.role_table_grants
   where grantee = 'anon'
     and table_schema = 'public'),
  '',
  'il ruolo anon non ha alcun permesso sulle tabelle di public'
);

select * from finish();
rollback;
