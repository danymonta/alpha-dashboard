-- The numbers of the recorded calls (1.37.0, CLAUDE.md section 31). Dany,
-- 14/10/2026: «calcola anche la performance delle call collegate», by period,
-- by source and by the reel the lead comes from. Definitions of section 9:
-- the day is that of programmata_il (Europe/Rome); call = held + no-show
-- (cancelled and waiting-for-confirmation calls out); show rate = held /
-- (held + no-show); close rate = closed / held.
--
-- Who: the admin (all the closers or one) and the closer (always himself, any
-- p_closer is ignored). The setter, the other roles, a disabled account, a
-- Claude OAuth token: 42501. Coverage, length and performance are worked out
-- only on the calls of whoever asks (they value who leads the call): with
-- «all the closers» or another closer they are null. Euros only for the admin.

create function public.call_numeri_periodo(
  p_da date, p_a date, p_per text, p_closer uuid default null)
returns table (
  gruppo text,
  etichetta text,
  media_id text,
  call integer, svolte integer, no_show integer, show_rate numeric,
  qualificate integer, chiuse integer, close_rate numeric, close_rate_qualificate numeric,
  registrate integer, copertura numeric, durata_media_min numeric,
  analizzate integer, in_target_si integer, in_target_no integer, in_target_da_verificare integer, quota_in_target numeric,
  obiezioni jsonb,
  performance jsonb,
  vendite_nuove integer, revenue_nuovi numeric, cash_nuovi numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ruolo public.app_role := public.current_role();
  v_uid uuid := (select auth.uid());
  v_closer uuid;
  v_proprie boolean;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'I numeri delle call li legge l’admin, e il closer per le sue.' using errcode = '42501';
  end if;
  if p_per is null or p_per not in ('totale', 'fonte', 'contenuto') then
    raise exception 'Scegli totale, fonte o contenuto.' using errcode = '22023';
  end if;
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 365 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;
  v_closer := case when v_ruolo = 'closer' then v_uid else p_closer end;
  v_proprie := v_closer is not null and v_closer = v_uid;

  return query
  with base as (
    select c.id, c.stato, c.esito, c.qualificata, c.performance,
           case p_per
             when 'totale' then null::text
             when 'fonte' then coalesce(l.fonte::text, 'altro')
             else coalesce(lc.shortcode, 'non_riconosciuto')
           end as gruppo,
           r.recording_id, r.durata_secondi,
           a.stato as analisi_stato, a.in_target, a.categorie_obiezioni
    from public.calls c
    join public.leads l on l.id = c.lead_id
    left join public.lead_contenuto lc on lc.lead_id = c.lead_id
    left join public.call_registrazioni r on r.call_id = c.id and r.stato = 'collegata'
    left join public.call_analisi a on a.call_id = c.id and a.stato = 'pronta'
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and c.stato in ('svolta', 'no_show')
      and (v_closer is null or c.closer_id = v_closer)
  ),
  vendite as (
    select b.gruppo,
           count(s.id)::integer as n,
           coalesce(sum(s.valore_contratto), 0) as revenue,
           coalesce(sum((select p.importo_incassato from public.payments p
                         where p.sale_id = s.id and p.numero_rata = 1 and p.stato = 'incassata')), 0) as cash
    from base b
    join public.sales s on s.call_id = b.id and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a
    group by b.gruppo
  ),
  obiezioni as (
    select x.gruppo, jsonb_agg(jsonb_build_object('categoria', x.cat, 'quante', x.n) order by x.n desc, x.cat) as elenco
    from (
      select b.gruppo, cat, count(*)::integer as n
      from base b, unnest(b.categorie_obiezioni) as cat
      where b.stato = 'svolta' and b.esito is distinct from 'chiusa' and b.analisi_stato = 'pronta'
      group by b.gruppo, cat
    ) x
    group by x.gruppo
  ),
  perf as (
    select b.gruppo,
           jsonb_build_object(
             'ottima', count(*) filter (where b.performance = 'ottima'),
             'buona', count(*) filter (where b.performance = 'buona'),
             'discreta', count(*) filter (where b.performance = 'discreta'),
             'media', count(*) filter (where b.performance = 'media'),
             'scarsa', count(*) filter (where b.performance = 'scarsa'),
             'senza', count(*) filter (where b.performance is null)) as conteggi
    from base b where b.stato = 'svolta'
    group by b.gruppo
  ),
  gruppi as (
    select b.gruppo,
           count(*)::integer as n_call,
           count(*) filter (where b.stato = 'svolta')::integer as n_svolte,
           count(*) filter (where b.stato = 'no_show')::integer as n_no_show,
           count(*) filter (where b.stato = 'svolta' and (b.qualificata or b.esito = 'chiusa'))::integer as n_qualificate,
           count(*) filter (where b.stato = 'svolta' and b.esito = 'chiusa')::integer as n_chiuse,
           count(*) filter (where b.stato = 'svolta' and b.recording_id is not null)::integer as n_registrate,
           avg(b.durata_secondi) filter (where b.stato = 'svolta' and b.recording_id is not null) as durata,
           count(*) filter (where b.analisi_stato = 'pronta')::integer as n_analizzate,
           count(*) filter (where b.in_target = 'si')::integer as t_si,
           count(*) filter (where b.in_target = 'no')::integer as t_no,
           count(*) filter (where b.in_target = 'da_verificare')::integer as t_dv
    from base b
    group by b.gruppo
  )
  select g.gruppo,
         case p_per
           when 'totale' then 'Tutte le call'
           when 'fonte' then case g.gruppo
                               when 'dm_inbound' then 'Instagram DM inbound'
                               when 'dm_outbound' then 'Instagram DM outbound'
                               when 'referral' then 'Passaparola'
                               when 'organico' then 'Organico'
                               when 'ads' then 'Ads'
                               else 'Altro' end
           else case when g.gruppo = 'non_riconosciuto' then 'Contenuto non riconosciuto'
                     else coalesce((select case when i.reel then 'Reel' else 'Post' end || ' del ' || to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM')
                                           || coalesce(' · ' || m.nome, '')
                                    from public.instagram_contenuti i
                                    left join public.marketing_contenuti m on m.instagram_shortcode = i.shortcode
                                    where i.shortcode = g.gruppo limit 1), 'Contenuto non riconosciuto') end
         end,
         case when p_per = 'contenuto' and g.gruppo <> 'non_riconosciuto'
              then (select i.media_id from public.instagram_contenuti i where i.shortcode = g.gruppo limit 1) end,
         g.n_call, g.n_svolte, g.n_no_show,
         case when g.n_svolte + g.n_no_show > 0 then round(g.n_svolte::numeric / (g.n_svolte + g.n_no_show), 4) end,
         g.n_qualificate, g.n_chiuse,
         case when g.n_svolte > 0 then round(g.n_chiuse::numeric / g.n_svolte, 4) end,
         case when g.n_qualificate > 0 then round(g.n_chiuse::numeric / g.n_qualificate, 4) end,
         case when v_proprie then g.n_registrate end,
         case when v_proprie and g.n_svolte > 0 then round(g.n_registrate::numeric / g.n_svolte, 4) end,
         case when v_proprie and g.durata is not null then round(g.durata / 60.0, 1) end,
         g.n_analizzate, g.t_si, g.t_no, g.t_dv,
         case when g.t_si + g.t_no > 0 then round(g.t_si::numeric / (g.t_si + g.t_no), 4) end,
         coalesce(o.elenco, '[]'::jsonb),
         case when v_proprie then pf.conteggi end,
         case when v_ruolo = 'admin' then coalesce(v.n, 0) end,
         case when v_ruolo = 'admin' then coalesce(v.revenue, 0) end,
         case when v_ruolo = 'admin' then coalesce(v.cash, 0) end
  from gruppi g
  left join vendite v on v.gruppo is not distinct from g.gruppo
  left join obiezioni o on o.gruppo is not distinct from g.gruppo
  left join perf pf on pf.gruppo is not distinct from g.gruppo
  order by g.n_call desc, g.gruppo nulls first;
end;
$$;

revoke all on function public.call_numeri_periodo(date, date, text, uuid) from public, anon;
grant execute on function public.call_numeri_periodo(date, date, text, uuid) to authenticated;

comment on function public.call_numeri_periodo(date, date, text, uuid) is
  'Admin (all the closers or one) and closer (himself): held calls and no-shows of a period, grouped as a total, by the lead''s source or by the post he comes from: show rate, close rate, in target, objections by category, and for the admin cash and revenue of the new clients. Coverage of the recordings, length and performance only on the calls of whoever asks (null otherwise). Denominator zero: null.';
