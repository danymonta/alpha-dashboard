-- Fase 4: commission rules are append-only history.
-- A new rule starts on a date and closes the one in force the day before, so
-- commissions already accrued keep the percentage they were accrued with.

create or replace function public.nuova_regola_provvigione(
  p_profile_id uuid,
  p_percentuale numeric,
  p_applica_a public.sale_type[],
  p_valida_dal date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Le regole provvigionali le gestisce l''admin' using errcode = '42501';
  end if;
  if p_percentuale is null or p_percentuale < 0 or p_percentuale > 1 then
    raise exception 'Percentuale non valida' using errcode = '22023';
  end if;
  if p_applica_a is null or cardinality(p_applica_a) = 0 then
    raise exception 'Scegli almeno un tipo di vendita' using errcode = '22023';
  end if;
  if p_valida_dal is null then
    raise exception 'Scegli da quando vale la regola' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.attivo) then
    raise exception 'Collaboratore non trovato o non attivo' using errcode = '22023';
  end if;
  -- history stays readable: a new rule never starts before or with an existing one
  if exists (
    select 1 from public.commission_rules r
    where r.profile_id = p_profile_id and r.valida_dal >= p_valida_dal
  ) then
    raise exception 'Esiste già una regola che parte da questa data o dopo: scegli una data successiva'
      using errcode = '22023';
  end if;

  update public.commission_rules r
  set valida_al = p_valida_dal - 1
  where r.profile_id = p_profile_id
    and r.valida_dal < p_valida_dal
    and (r.valida_al is null or r.valida_al >= p_valida_dal);

  insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal, created_by)
  values (p_profile_id, p_percentuale, p_applica_a, p_valida_dal, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Ending a rule (e.g. a collaborator who leaves): no commission accrues after.
create or replace function public.chiudi_regola_provvigione(p_rule_id uuid, p_valida_al date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le regole provvigionali le gestisce l''admin' using errcode = '42501';
  end if;

  update public.commission_rules r
  set valida_al = p_valida_al
  where r.id = p_rule_id
    and p_valida_al >= r.valida_dal;

  if not found then
    raise exception 'La fine deve cadere dopo l''inizio della regola' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.nuova_regola_provvigione(uuid, numeric, public.sale_type[], date) from public, anon;
grant execute on function public.nuova_regola_provvigione(uuid, numeric, public.sale_type[], date) to authenticated;
revoke all on function public.chiudi_regola_provvigione(uuid, date) from public, anon;
grant execute on function public.chiudi_regola_provvigione(uuid, date) to authenticated;
