-- "Nuova call": the setter books a call and the lead is born with it.
-- One transaction, so a failed call never leaves an orphan lead behind (the
-- setter cannot delete leads). security invoker: RLS applies as usual.

create or replace function public.fissa_call(
  p_nome text,
  p_fonte public.lead_source,
  p_tipo public.call_type,
  p_data date,
  p_ora time,
  p_closer_id uuid,
  p_instagram_handle text default null
)
returns table (id_call uuid, id_lead uuid, lead_esistente boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setter uuid := (select auth.uid());
  v_handle text := nullif(ltrim(lower(trim(coalesce(p_instagram_handle, ''))), '@'), '');
  v_lead uuid;
  v_stato public.lead_status;
  v_esistente boolean := false;
  v_call uuid;
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'Solo il setter fissa una call da questa schermata'
      using errcode = '42501';
  end if;

  if nullif(trim(p_nome), '') is null then
    raise exception 'Il nome del lead è obbligatorio' using errcode = '22023';
  end if;

  -- Whoever runs the call must be able to close it
  if not exists (
    select 1 from public.profiles p
    where p.id = p_closer_id
      and p.attivo
      and p.ruolo in ('admin', 'closer')
  ) then
    raise exception 'Il closer scelto non è attivo o non può chiudere'
      using errcode = '22023';
  end if;

  if v_handle is not null then
    v_handle := '@' || v_handle;

    -- Same person, second call (e.g. strategy after discovery): reuse the lead
    select l.id, l.stato into v_lead, v_stato
    from public.leads l
    where l.setter_id = v_setter
      and lower(l.instagram_handle) = v_handle
    order by l.created_at desc
    limit 1;
  end if;

  if v_lead is null then
    insert into public.leads (nome, instagram_handle, setter_id, fonte, created_by)
    values (trim(p_nome), v_handle, v_setter, p_fonte, v_setter)
    returning id into v_lead;
  else
    v_esistente := true;
    -- A lost lead that books again is back in play
    if v_stato = 'perso' then
      update public.leads set stato = 'call_fissata' where id = v_lead;
    end if;
  end if;

  insert into public.calls (
    lead_id, setter_id, closer_id, tipo, programmata_il, created_by
  )
  values (
    v_lead,
    v_setter,
    p_closer_id,
    p_tipo,
    -- the setter types Italian wall-clock time; Postgres handles DST
    (p_data + p_ora) at time zone 'Europe/Rome',
    v_setter
  )
  returning id into v_call;

  return query select v_call, v_lead, v_esistente;
end;
$$;

revoke all on function public.fissa_call(
  text, public.lead_source, public.call_type, date, time, uuid, text
) from public, anon;

grant execute on function public.fissa_call(
  text, public.lead_source, public.call_type, date, time, uuid, text
) to authenticated;
