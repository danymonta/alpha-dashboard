-- Weekly content email (Dany, 22/10/2026: "ogni fine settimana una mail con l'andamento dei contenuti:
-- quanti lead in target e quanti fuori, nuovi clienti, nuove call, e cosa cambiare nei contenuti,
-- incrociando anche le call di Fathom").
--
-- A short extract for the admins, summed in SQL for the daily cron (no session, so security definer
-- and only the service role executes it, like riepilogo_settimana and riepilogo_tempo_team).
-- Nothing here calls Claude: it only reads what the app already stored (the Insight's chats, the
-- reel scores and analyses a person asked for, the Fathom analyses of the calls).
--
-- Numbers only, no names of leads or clients: the leads are counted from insight_chat (the Insight's
-- latest state of each conversation), the calls and sales from the app, the Fathom side from
-- call_analisi. Content names come from the editorial plan or the caption.
--
-- A lead "of the week" is a lead chat (never a non-lead, an under-14 chat or an excluded one) whose
-- first message fell in the week: its origin day when the origin was found, otherwise the first
-- message of a chat read from its start. In target is Claude's latest classification of the chat.

create or replace function public.riepilogo_contenuti_settimana(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb;
begin
  if p_da is null or p_a is null or p_da > p_a or p_a - p_da > 30 then
    raise exception 'Periodo non valido' using errcode = '22023';
  end if;

  with chat as (
    select c.canale, c.origine_tipo, c.origine_shortcode, c.ultimo_target,
           coalesce(
             c.origine_giorno,
             case when c.completa
                       and jsonb_typeof(c.messaggi) = 'array' and jsonb_array_length(c.messaggi) > 0
                       and (c.messaggi -> 0 ->> 'il') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                  then ((c.messaggi -> 0 ->> 'il')::timestamptz at time zone 'Europe/Rome')::date end
           ) as arrivo
    from public.insight_chat c
    where not c.non_lead
      and not c.minore_14
      and not (c.canale = 'instagram' and c.username is not null
               and exists (select 1 from public.instagram_esclusi e where e.username = c.username))
      and not (c.canale = 'messenger' and c.utente_id is not null
               and exists (select 1 from public.messenger_esclusi e where e.utente_id = c.utente_id))
  ),
  lead as (
    select * from chat where arrivo between p_da and p_a
  ),
  per_post as (
    select l.origine_shortcode as shortcode,
           count(*)::integer as lead,
           count(*) filter (where l.ultimo_target = 'si')::integer as in_target,
           count(*) filter (where l.ultimo_target = 'no')::integer as fuori_target
    from lead l
    where l.origine_shortcode is not null
    group by l.origine_shortcode
  ),
  -- the posts that brought leads this week, best first: in target, then all leads, then views
  migliori as (
    select pp.shortcode, pp.lead, pp.in_target, pp.fuori_target,
           p.permalink, p.giorno, p.reel, p.media_type, p.views,
           coalesce(nullif(btrim(p.nome), ''), nullif(btrim(split_part(btrim(p.didascalia_inizio), E'\n', 1)), ''), 'Senza titolo') as titolo,
           p.punteggio_fascia, p.punteggio_totale
    from per_post pp
    left join public.v_pubblicati p on p.shortcode = pp.shortcode
    order by pp.in_target desc, pp.lead desc, p.views desc nulls last, pp.shortcode
    limit 5
  ),
  -- the reels published this week that should be redone: by the score when a person asked for it, by
  -- the verdict of the numbers otherwise. The first problem of the score is the thing to change.
  da_cambiare as (
    select p.shortcode, p.permalink, p.giorno, p.views, p.punteggio_totale, p.punteggio_fascia, p.verdetto_oggi,
           coalesce(nullif(btrim(p.nome), ''), nullif(btrim(split_part(btrim(p.didascalia_inizio), E'\n', 1)), ''), 'Senza titolo') as titolo,
           (select a.punteggio -> 'problemi_prioritari' -> 0 ->> 'problema'
              from public.marketing_analisi a
             where a.media_id = p.media_id and a.stato = 'pronta' and a.punteggio is not null
             order by a.finita_il desc nulls last, a.created_at desc limit 1) as problema
    from public.v_pubblicati p
    where p.reel and not p.eliminato
      and p.giorno between p_da and p_a
      and (p.punteggio_fascia in ('rifare_le_parti_deboli', 'riscrivere', 'scartare')
           or (p.punteggio_fascia is null and p.verdetto_oggi = 'cambiare'))
    order by p.punteggio_totale asc nulls last, p.views asc nulls last, p.shortcode
    limit 3
  ),
  call_fathom as (
    select c.id, a.in_target, a.categorie_obiezioni, r.recording_id, a.stato as stato_analisi
    from public.calls c
    left join public.call_registrazioni r on r.call_id = c.id and r.stato = 'collegata'
    left join public.call_analisi a on a.call_id = c.id and a.stato = 'pronta'
    where c.stato = 'svolta'
      and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  obiezioni as (
    select o.categoria, count(*)::integer as n
    from call_fathom f, unnest(f.categorie_obiezioni) as o(categoria)
    where f.stato_analisi = 'pronta'
    group by o.categoria
    order by count(*) desc, o.categoria
    limit 3
  )
  select jsonb_build_object(
    'da', p_da,
    'a', p_a,
    'lead', jsonb_build_object(
      'totale', (select count(*) from lead),
      'in_target', (select count(*) from lead where ultimo_target = 'si'),
      'fuori_target', (select count(*) from lead where ultimo_target = 'no'),
      'da_verificare', (select count(*) from lead where ultimo_target is distinct from 'si' and ultimo_target is distinct from 'no'),
      'da_un_contenuto', (select count(*) from lead where origine_shortcode is not null),
      'da_storie', (select count(*) from lead where origine_tipo = 'storia' and origine_shortcode is null)
    ),
    'nuovi_clienti', (select count(distinct s.client_id) from public.sales s
                      where s.tipo = 'nuovo' and s.data_vendita between p_da and p_a),
    'rinnovi', (select count(distinct s.client_id) from public.sales s
                where s.tipo = 'rinnovo' and s.data_vendita between p_da and p_a),
    'call', jsonb_build_object(
      -- fixed in the week by the setters (not follow-up calls: the closer fixes those)
      'fissate', (select count(*) from public.calls c
                  where not c.di_follow_up
                    and (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a),
      'svolte', (select count(*) from public.calls c
                 where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
      'no_show', (select count(*) from public.calls c
                  where c.stato = 'no_show' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
      'chiuse', (select count(*) from public.calls c
                 where c.esito = 'chiusa' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
      -- held calls still without an outcome (the closer registers it)
      'da_registrare', (select count(*) from public.calls c
                        where c.stato = 'programmata' and c.programmata_il < now()
                          and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a)
    ),
    'contenuti', jsonb_build_object(
      'pubblicati', (select count(*) from public.v_pubblicati p
                     where not p.eliminato and p.giorno between p_da and p_a),
      'reel_non_valutati', (select count(*) from public.v_pubblicati p
                            where p.reel and not p.eliminato and p.giorno between p_da and p_a
                              and p.punteggio_totale is null),
      'migliori', coalesce((select jsonb_agg(jsonb_build_object(
                    'permalink', m.permalink, 'titolo', m.titolo, 'giorno', m.giorno,
                    'tipo', case when m.reel then 'Reel' when m.media_type = 'CAROUSEL_ALBUM' then 'Carosello' else 'Post' end,
                    'views', m.views, 'lead', m.lead, 'in_target', m.in_target, 'fuori_target', m.fuori_target,
                    'punteggio', m.punteggio_totale, 'fascia', m.punteggio_fascia)
                    order by m.in_target desc, m.lead desc, m.views desc nulls last, m.shortcode) from migliori m), '[]'::jsonb),
      'da_cambiare', coalesce((select jsonb_agg(jsonb_build_object(
                    'permalink', d.permalink, 'titolo', d.titolo, 'giorno', d.giorno, 'views', d.views,
                    'punteggio', d.punteggio_totale, 'fascia', d.punteggio_fascia, 'verdetto', d.verdetto_oggi,
                    'problema', d.problema)
                    order by d.punteggio_totale asc nulls last, d.views asc nulls last, d.shortcode) from da_cambiare d), '[]'::jsonb)
    ),
    'fathom', jsonb_build_object(
      'svolte', (select count(*) from call_fathom),
      'registrate', (select count(*) from call_fathom where recording_id is not null),
      'analizzate', (select count(*) from call_fathom where stato_analisi = 'pronta'),
      'in_target', (select count(*) from call_fathom where stato_analisi = 'pronta' and in_target = 'si'),
      'fuori_target', (select count(*) from call_fathom where stato_analisi = 'pronta' and in_target = 'no'),
      'obiezioni', coalesce((select jsonb_agg(jsonb_build_object('categoria', o.categoria, 'n', o.n)
                    order by o.n desc, o.categoria) from obiezioni o), '[]'::jsonb)
    )
  ) into v_risultato;

  return v_risultato;
end;
$$;

comment on function public.riepilogo_contenuti_settimana(date, date) is
  'The admins'' weekly content email (Sunday evening, Monday to Sunday): the leads of the week from the Insight''s chats (total, in target, outside target, to verify, from a content), new clients and renewals, calls fixed, held, no show, closed and still to register, the best contents by leads in target, the reels of the week to redo (score band or verdict, with the first problem of the score) and the held calls seen through Fathom (recorded, analysed, in target, most frequent objections). Numbers only, no names of people; nothing calls Claude. Service role only; 31 days at most.';

revoke all on function public.riepilogo_contenuti_settimana(date, date) from public, anon, authenticated;
grant execute on function public.riepilogo_contenuti_settimana(date, date) to service_role;

-- the notification of the email (the app saves a copy of every email it sends, 1.41.0)
alter table public.notifiche drop constraint notifiche_tipo_check;
alter table public.notifiche
  add constraint notifiche_tipo_check check (tipo in (
    'riepilogo_settimana', 'tempo_team', 'contenuti_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo',
    'rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude'
  ));
