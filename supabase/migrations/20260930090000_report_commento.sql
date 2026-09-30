-- What the leads say, for marketing (Dany, 30/09/2026).
--
-- 1. The setter's comment on his day: "nel report giornaliero è fondamentale
--    che integri anche un commento insieme ai dati, ma bisogna guidarlo nel
--    compilarlo: i lead erano in target o com'erano? com'era la qualità delle
--    conversazioni? Utile perché lato marketing raccolgo queste informazioni e
--    adattiamo i contenuti."
--    Four guided answers, filled with the volumes, right under the conversations:
--      lead_in_target          quasi_tutti (3 su 4 o più), circa_meta (1 su 2), pochi (1 su 4 o meno)
--      qualita_conversazioni   buone, medie, scarse
--      cosa_frenava            what held the leads back from booking the call, optional.
--                              Not the price: "l'obiezione sul prezzo difficilmente
--                              ce l'avrà il setter, c'è anche il closer"
--      domande_contenuti       what leads asked and which content made them write, optional
--    The note the report always had stays, as "Altre note". The words shown for
--    each value live in lib/setting/commento.ts.
--    The two scales are asked on days with activity, but never block a save: the
--    setter's own screen says "Da completare" until both are set. Nothing in the
--    database counts or lists the days left incomplete (CLAUDE.md section 17).
--    RLS is unchanged: the setter writes only his own rows, the admin every row.
--
-- 2. The closer's side: "il closer deve inserire motivo di non chiusura sempre".
--    It is the column calls.obiezione_principale, shown as "Motivo di non
--    chiusura". Required for a held call ending in follow_up or persa by the
--    shared Zod schema (lib/validation/esito.ts), which binds the outcome sheet,
--    the server action and Alfire. No database constraint: the calls recorded
--    before today have no reason and must stay editable.
--
-- 3. Two admin-only reads for the marketing section of Setting and for Alfire.

create type public.quota_in_target as enum ('quasi_tutti', 'circa_meta', 'pochi');
create type public.qualita_conversazioni as enum ('buone', 'medie', 'scarse');

alter table public.setter_daily_reports
  add column lead_in_target public.quota_in_target,
  add column qualita_conversazioni public.qualita_conversazioni,
  add column cosa_frenava text
    constraint setter_daily_reports_cosa_frenava_lunghezza check (char_length(cosa_frenava) <= 1000),
  add column domande_contenuti text
    constraint setter_daily_reports_domande_contenuti_lunghezza check (char_length(domande_contenuti) <= 1000);

comment on column public.setter_daily_reports.lead_in_target is
  'How many of the day''s leads were in target (man 25+, wants to change his body, can train at home): quasi_tutti = 3 in 4 or more, circa_meta = about 1 in 2, pochi = 1 in 4 or less. Null = not answered.';
comment on column public.setter_daily_reports.qualita_conversazioni is
  'How the day''s conversations went: buone (real answers, a call gets proposed), medie (short answers, stop after 2-3 messages), scarse (cold or just curious, vanish). Null = not answered.';
comment on column public.setter_daily_reports.cosa_frenava is
  'What held the day''s leads back from booking the call, as the setter wrote it. For marketing. Price objections are the closer''s (calls.obiezione_principale).';
comment on column public.setter_daily_reports.domande_contenuti is
  'What the leads asked, and which content made them write. For marketing.';
comment on column public.calls.obiezione_principale is
  'Motivo di non chiusura: why a held call ended in follow_up or persa, written by the closer. Required by the app from 30/09/2026 (lib/validation/esito.ts); older calls may have none.';

-- ---------------------------------------------------------------------------
-- The setters' side, for marketing. Admin only.
--
-- Two kinds of rows:
--   'scala'   for each scale, every level (zero included): the reported days
--             at that level, the days that answered the scale, and the share;
--   'giorno'  every day with something written (cosa_frenava,
--             domande_contenuti or note), newest first, with the setter's name
--             and both scales.
-- p_setter narrows everything to one person. The admin reads the content;
-- no row says which days are missing an answer.
-- ---------------------------------------------------------------------------
create or replace function public.commenti_setter_periodo(
  p_da date,
  p_a date,
  p_setter uuid default null,
  p_limite integer default 200
)
returns table (
  tipo text,                                            -- 'scala' | 'giorno'
  scala text,                                           -- 'scala' rows: lead_in_target | qualita_conversazioni
  livello text,                                         -- 'scala' rows: the level
  giorni integer,                                       -- 'scala' rows: days at that level
  su_giorni integer,                                    -- 'scala' rows: days that answered the scale
  quota numeric,                                        -- 'scala' rows: giorni / su_giorni, null when nobody answered
  report_id uuid,                                       -- 'giorno' rows from here on
  data date,
  setter_id uuid,
  setter text,
  lead_in_target public.quota_in_target,
  qualita_conversazioni public.qualita_conversazioni,
  cosa_frenava text,
  domande_contenuti text,
  note text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- enough days to read; never the whole history in one answer
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.is_admin() then
    raise exception 'I commenti per il marketing li legge solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with base as (
    select r.id, r.data, r.setter_id, r.lead_in_target, r.qualita_conversazioni,
      nullif(btrim(r.cosa_frenava), '') as cosa_frenava,
      nullif(btrim(r.domande_contenuti), '') as domande_contenuti,
      nullif(btrim(r.note), '') as note
    from public.setter_daily_reports r
    where r.data between p_da and p_a
      and (p_setter is null or r.setter_id = p_setter)
  ),
  livelli as (
    select 'lead_in_target'::text as scala, l::text as livello, 1 as ordine_scala, o::integer as ordine
    from unnest(enum_range(null::public.quota_in_target)) with ordinality as t(l, o)
    union all
    select 'qualita_conversazioni'::text, l::text, 2, o::integer
    from unnest(enum_range(null::public.qualita_conversazioni)) with ordinality as t(l, o)
  ),
  risposte as (
    select 'lead_in_target'::text as scala, b.lead_in_target::text as livello
    from base b where b.lead_in_target is not null
    union all
    select 'qualita_conversazioni'::text, b.qualita_conversazioni::text
    from base b where b.qualita_conversazioni is not null
  ),
  conteggi as (
    select l.scala, l.livello, l.ordine_scala, l.ordine, count(x.livello)::integer as giorni
    from livelli l
    left join risposte x on x.scala = l.scala and x.livello = l.livello
    group by l.scala, l.livello, l.ordine_scala, l.ordine
  ),
  scale as (
    select c.*, (sum(c.giorni) over (partition by c.scala))::integer as su_giorni
    from conteggi c
  ),
  scritti as (
    select b.*, pr.nome as setter_nome
    from base b
    left join public.profiles pr on pr.id = b.setter_id
    where b.cosa_frenava is not null or b.domande_contenuti is not null or b.note is not null
    order by b.data desc, pr.nome nulls last, b.id
    limit v_limite
  ),
  righe as (
    select
      'scala'::text as tipo, s.scala, s.livello, s.giorni, s.su_giorni,
      round(s.giorni::numeric / nullif(s.su_giorni, 0), 4) as quota,
      null::uuid as report_id, null::date as data, null::uuid as setter_id, null::text as setter,
      null::public.quota_in_target as lead_in_target,
      null::public.qualita_conversazioni as qualita_conversazioni,
      null::text as cosa_frenava, null::text as domande_contenuti, null::text as note,
      s.ordine_scala, s.ordine, null::text as ordine_nome
    from scale s
    union all
    select
      'giorno', null, null, null, null, null,
      w.id, w.data, w.setter_id, w.setter_nome, w.lead_in_target, w.qualita_conversazioni,
      w.cosa_frenava, w.domande_contenuti, w.note,
      3, null, w.setter_nome
    from scritti w
  )
  select
    r.tipo, r.scala, r.livello, r.giorni, r.su_giorni, r.quota,
    r.report_id, r.data, r.setter_id, r.setter, r.lead_in_target, r.qualita_conversazioni,
    r.cosa_frenava, r.domande_contenuti, r.note
  from righe r
  order by r.ordine_scala, r.ordine nulls last, r.data desc nulls last, r.ordine_nome nulls last, r.report_id;
end;
$$;

comment on function public.commenti_setter_periodo(date, date, uuid, integer) is
  'Admin only: the setters'' comments on their days in a period (optionally one setter), for marketing. Days per level of each scale, then the days with something written, newest first.';

revoke all on function public.commenti_setter_periodo(date, date, uuid, integer) from public, anon;
grant execute on function public.commenti_setter_periodo(date, date, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The closers' side, for marketing. Admin only.
--
-- The held calls of the period (by Europe/Rome day of programmata_il) that did
-- not close, follow_up or persa, with something written: the reason for not
-- closing, the call's notes, or both. Newest first. p_setter narrows it to the
-- calls that setter booked, like the setters' side of the same section.
-- ---------------------------------------------------------------------------
create or replace function public.motivi_non_chiusura_periodo(
  p_da date,
  p_a date,
  p_setter uuid default null,
  p_limite integer default 200
)
returns table (
  call_id uuid,
  data date,
  programmata_il timestamptz,
  lead text,
  closer text,
  esito public.call_outcome,
  qualificata boolean,
  motivo text,
  note text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.is_admin() then
    raise exception 'I motivi di non chiusura per il marketing li legge solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  select
    c.id,
    (c.programmata_il at time zone 'Europe/Rome')::date,
    c.programmata_il,
    l.nome,
    pc.nome,
    c.esito,
    c.qualificata,
    nullif(btrim(c.obiezione_principale), ''),
    nullif(btrim(c.note), '')
  from public.calls c
  left join public.leads l on l.id = c.lead_id
  left join public.profiles pc on pc.id = c.closer_id
  where c.stato = 'svolta'
    and c.esito in ('follow_up', 'persa')
    and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    and (p_setter is null or c.setter_id = p_setter)
    and (nullif(btrim(c.obiezione_principale), '') is not null or nullif(btrim(c.note), '') is not null)
  order by c.programmata_il desc, c.id
  limit v_limite;
end;
$$;

comment on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) is
  'Admin only: the held calls of a period that did not close (follow_up, persa) with the closer''s reason for not closing or notes, newest first; optionally only the calls one setter booked.';

revoke all on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) from public, anon;
grant execute on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) to authenticated;
