-- The pipeline status is set by hand, by the setter who owns the lead or by the
-- closer of one of its calls. The closer has no update policy on leads (RLS is
-- per row, it would open every column): this function changes only `stato`.

create or replace function public.aggiorna_stato_lead(
  p_lead_id uuid,
  p_stato public.lead_status
)
returns public.lead_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
  v_ammesso boolean;
begin
  select l.setter_id into v_setter from public.leads l where l.id = p_lead_id;

  v_ammesso := found and (
    v_ruolo = 'admin'
    or (v_ruolo = 'setter' and v_setter = v_utente)
    or (v_ruolo = 'closer' and exists (
      select 1 from public.calls c
      where c.lead_id = p_lead_id and c.closer_id = v_utente
    ))
  );

  -- same answer whether the lead does not exist or is not yours
  if not coalesce(v_ammesso, false) then
    raise exception 'Lead non trovato o non tuo' using errcode = '42501';
  end if;

  update public.leads set stato = p_stato where id = p_lead_id;
  return p_stato;
end;
$$;

revoke all on function public.aggiorna_stato_lead(uuid, public.lead_status) from public, anon;
grant execute on function public.aggiorna_stato_lead(uuid, public.lead_status) to authenticated;
