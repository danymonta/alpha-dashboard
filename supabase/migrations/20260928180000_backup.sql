-- Weekly backup (Dany, 27/09/2026): Supabase Free keeps no backups. Every table
-- of the public schema, read at the time of the call, so a table added later is
-- never forgotten. Only the service role (the cron and the admin download route,
-- server side) may call it: it bypasses RLS by design.
create or replace function public.backup_completo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb := '{}'::jsonb;
  v_tabella text;
  v_righe jsonb;
begin
  for v_tabella in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;

revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;
