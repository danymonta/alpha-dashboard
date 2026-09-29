-- The admin books calls too (Dany, 29/09/2026). Dany is admin, closer and at
-- times setter: he books calls he set himself, and adds calls that happened but
-- never reached the app (in the past, from "Compila la giornata").
-- 1. fissa_call gains p_setter_id, read only for the admin: himself (default)
--    or an active setter. The setter path is unchanged: setter_id = auth.uid(),
--    any p_setter_id ignored. Lead created or reused for the chosen setter.
-- 2. calls_update_own_setter re-checks the lead on write: a setter cannot
--    repoint his call to another setter's lead (same rule as the insert policy).

-- ---------------------------------------------------------------------------
-- 1. fissa_call: new trailing parameter, so the old signature goes first (two
--    overloads would make every 7-argument call ambiguous)
-- ---------------------------------------------------------------------------
drop function public.fissa_call(text, public.lead_source, public.call_type, date, time, uuid, text);

create function public.fissa_call(
  p_nome text,
  p_fonte public.lead_source,
  p_tipo public.call_type,
  p_data date,
  p_ora time,
  p_closer_id uuid,
  p_instagram_handle text default null,
  p_setter_id uuid default null
)
returns table (id_call uuid, id_lead uuid, lead_esistente boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
  v_handle text := nullif(ltrim(lower(trim(coalesce(p_instagram_handle, ''))), '@'), '');
  v_lead uuid;
  v_stato public.lead_status;
  v_esistente boolean := false;
  v_call uuid;
begin
  if v_ruolo = 'setter' then
    -- the setter books only for himself, whatever is passed
    v_setter := v_utente;
  elsif v_ruolo = 'admin' then
    v_setter := coalesce(p_setter_id, v_utente);
    if v_setter <> v_utente and not exists (
      select 1 from public.profiles p
      where p.id = v_setter
        and p.attivo
        and p.ruolo = 'setter'
    ) then
      raise exception 'Il setter scelto non è attivo o non è un setter'
        using errcode = '22023';
    end if;
  else
    raise exception 'Le call le fissano il setter e l''admin'
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

    -- Same person, second call: reuse the lead of the same setter
    select l.id, l.stato into v_lead, v_stato
    from public.leads l
    where l.setter_id = v_setter
      and lower(l.instagram_handle) = v_handle
    order by l.created_at desc
    limit 1;
  end if;

  if v_lead is null then
    insert into public.leads (nome, instagram_handle, setter_id, fonte, created_by)
    values (trim(p_nome), v_handle, v_setter, p_fonte, v_utente)
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
    -- Italian wall-clock time; Postgres handles DST
    (p_data + p_ora) at time zone 'Europe/Rome',
    v_utente
  )
  returning id into v_call;

  return query select v_call, v_lead, v_esistente;
end;
$$;

comment on function public.fissa_call(text, public.lead_source, public.call_type, date, time, uuid, text, uuid) is
  'Books a call and creates (or reuses) its lead. Setter: always for himself. Admin: for himself or an active setter (p_setter_id).';

revoke all on function public.fissa_call(
  text, public.lead_source, public.call_type, date, time, uuid, text, uuid
) from public, anon;

grant execute on function public.fissa_call(
  text, public.lead_source, public.call_type, date, time, uuid, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The setter's update: the lead must stay his
-- ---------------------------------------------------------------------------
alter policy calls_update_own_setter
  on public.calls
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and public.lead_appartiene_al_setter(lead_id, (select auth.uid()))
  );
