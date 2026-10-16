-- The functions of the reel analysis (1.36.0, 20261016090200_analisi_funzioni.sql):
-- the verdict of the numbers, the requests of the people, the planner, the
-- steps, the cost and the limit, what reaches Claude, the grants.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(224);

-- the seed's posts and counts do not enter these comparisons
update public.instagram_contenuti set eliminato_il = now();
delete from public.instagram_contenuti_dm;
delete from public.instagram_contenuti_dm_giorni;
delete from public.marketing_analisi;
delete from public.instagram_letture;
update public.marketing_lavori_stato set automatiche = true;

-- A reel of the test: published p_ore hours ago; with views it is «lette»; with a
-- photo it has the reading at 72 hours (or p_snap_ore) with the same rates
-- (saved 2%, shares 1% of the views, reach 80%) unless p_saved says otherwise.
create or replace function pg_temp.reel(
  p_n integer, p_ore numeric, p_views integer default null, p_snap integer default null,
  p_saved integer default null, p_snap_ore numeric default 72)
returns text
language plpgsql
as $$
declare
  v_id text := '81' || lpad(p_n::text, 14, '0');
begin
  insert into public.instagram_contenuti
    (media_id, shortcode, permalink, media_type, reel, pubblicato_il, metriche_stato, views, reach, saved, shares)
  values (v_id, 'T81Reel' || lpad(p_n::text, 3, '0'),
          'https://www.instagram.com/reel/T81Reel' || lpad(p_n::text, 3, '0') || '/', 'VIDEO', true,
          now() - p_ore * interval '1 hour',
          case when p_views is not null then 'lette' else 'da_leggere' end,
          p_views, round(p_views * 0.8), round(p_views * 0.02), round(p_views * 0.01));
  if p_snap is not null then
    insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares)
    values (v_id,
            ((now() - (p_ore - p_snap_ore) * interval '1 hour') at time zone 'Europe/Rome')::date,
            now() - (p_ore - p_snap_ore) * interval '1 hour', p_snap_ore,
            p_snap, round(p_snap * 0.8), coalesce(p_saved, round(p_snap * 0.02)), round(p_snap * 0.01));
  end if;
  return v_id;
end;
$$;

create or replace function pg_temp.numeri(p_n integer, p_chiave text)
returns text
language sql
as $$
  select public.analisi_numeri_reel('81' || lpad(p_n::text, 14, '0')) ->> p_chiave;
$$;

create or replace function pg_temp.codice(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The verdict, at the edges of every threshold
-- ---------------------------------------------------------------------------
select is(public.analisi_fascia_pubblico(null, 2, 2), null::text, 'senza views nessuna fascia');
select is(public.analisi_fascia_pubblico(1.3, 0, 0), 'sopra', 'views x1,3: sopra');
select is(public.analisi_fascia_pubblico(1.29, 0, 0), 'nella_media', 'x1,29: nella media');
select is(public.analisi_fascia_pubblico(0.8, 1.5, 0), 'sopra', 'x0,8 con i salvataggi x1,5: sopra');
select is(public.analisi_fascia_pubblico(0.8, 0, 1.5), 'sopra', 'x0,8 con le condivisioni x1,5: sopra');
select is(public.analisi_fascia_pubblico(0.8, 1.49, 1.49), 'nella_media', 'x0,8 con 1,49: nella media');
select is(public.analisi_fascia_pubblico(0.79, 3, 3), 'nella_media', 'x0,79 anche con 3: nella media');
select is(public.analisi_fascia_pubblico(0.7, 0.99, 0.99), 'sotto', 'x0,7 con salvataggi e condivisioni sotto 1: sotto');
select is(public.analisi_fascia_pubblico(0.7, null, null), 'sotto', 'x0,7 senza salvataggi né condivisioni: sotto');
select is(public.analisi_fascia_pubblico(0.7, 1, 0.5), 'nella_media', 'x0,7 con salvataggi x1: nella media');
select is(public.analisi_fascia_pubblico(0.71, 0, 0), 'nella_media', 'x0,71: nella media');

select is(public.analisi_fascia_lead(null, null, null, null), null::text, 'lead non contati: nessuna fascia');
select is(public.analisi_fascia_lead(5, 2, null, null), 'sopra', '2 lead in target: sopra');
select is(public.analisi_fascia_lead(5, 1, null, null), 'nella_media', '1 lead senza confronto: nella media');
select is(public.analisi_fascia_lead(5, 1, 0.25, null), 'sopra', '1 lead e più del 75° percentile: sopra');
select is(public.analisi_fascia_lead(5, 1, 1, null), 'nella_media', '1 lead come il 75° percentile: nella media');
select is(public.analisi_fascia_lead(0, 0, null, 'converting'), 'sotto', 'nessun DM su un Converting: sotto');
select is(public.analisi_fascia_lead(0, 0, null, 'education'), 'nella_media', 'nessun DM su un altro tipo: nella media');
select is(public.analisi_fascia_lead(0, 0, null, null), 'nella_media', 'nessun DM, tipo ignoto: nella media');

select is(public.analisi_verdetto(null, null), null::text, 'niente fasce, niente verdetto');
select is(public.analisi_verdetto('sopra', null), 'spingere', 'pubblico sopra, lead ignoti: spingere');
select is(public.analisi_verdetto('sopra', 'nella_media'), 'spingere', 'pubblico sopra, lead nella media: spingere');
select is(public.analisi_verdetto('sopra', 'sotto'), 'cambiare', 'pubblico sopra ma lead sotto: cambiare');
select is(public.analisi_verdetto('sotto', 'sopra'), 'spingere', 'pubblico sotto ma lead sopra: spingere');
select is(public.analisi_verdetto('sotto', null), 'cambiare', 'pubblico sotto: cambiare');
select is(public.analisi_verdetto('sotto', 'nella_media'), 'cambiare', 'pubblico sotto, lead nella media: cambiare');
select is(public.analisi_verdetto(null, 'sotto'), 'cambiare', 'lead sotto: cambiare');
select is(public.analisi_verdetto('nella_media', 'nella_media'), 'mantenere', 'nella media: mantenere');
select is(public.analisi_verdetto(null, 'nella_media'), 'mantenere', 'solo i lead, nella media: mantenere');

-- ---------------------------------------------------------------------------
-- 2. The age in hours: 71, 72, 167, 168, 335, 336
-- ---------------------------------------------------------------------------
select pg_temp.reel(901, 71);
select pg_temp.reel(902, 72);
select pg_temp.reel(903, 167);
select pg_temp.reel(904, 168);
select pg_temp.reel(905, 335);
select pg_temp.reel(906, 336);
select is(pg_temp.numeri(901, 'eta'), null::text, '71 ore: nessuna età');
select is(pg_temp.numeri(902, 'eta'), '3', '72 ore: 3 giorni');
select is(pg_temp.numeri(903, 'eta'), '3', '167 ore: 3 giorni');
select is(pg_temp.numeri(904, 'eta'), '7', '168 ore: 7 giorni');
select is(pg_temp.numeri(905, 'eta'), '7', '335 ore: 7 giorni');
select is(pg_temp.numeri(906, 'eta'), '0', '336 ore: la vita intera');
select is(pg_temp.numeri(902, 'eta_ore'), '72', 'e dice le ore');
select is(public.analisi_numeri_reel('nonesiste'), null::jsonb, 'un media che non c''è: null');
select throws_ok($$ select public.analisi_numeri_reel('8100000000000902', 5::smallint) $$, '22023', null, 'un''età che non esiste no');
delete from public.instagram_contenuti where media_id like '81000000000009%';

-- ---------------------------------------------------------------------------
-- 3. The comparison at 3 days: the target T (100 hours old) against 8 older reels
-- ---------------------------------------------------------------------------
select pg_temp.reel(1, 100, 2400, 2000, 100);   -- saved rate 5% against the others' 2%
select pg_temp.reel(10 + g, 480 + 40 * g, 3000 + 200 * g, 1000 + 100 * g) from generate_series(1, 8) g;
-- T: views 2000 against the median 1450 (1100..1800 step 100)
select is(pg_temp.numeri(1, 'confronto'), 'stessa_eta', 'a 100 ore il confronto è alla stessa età');
select is(pg_temp.numeri(1, 'eta_confronto'), '3', 'a 3 giorni');
select is(pg_temp.numeri(1, 'reel_di_confronto'), '8', 'con 8 reel');
select is(pg_temp.numeri(1, 'views_mediana'), '1450', 'la mediana delle views a 3 giorni');
select is(pg_temp.numeri(1, 'views_rapporto'), '1.38', 'views x1,38');
select is(pg_temp.numeri(1, 'salvataggi_rapporto'), '2.50', 'i salvataggi: tasso 6,25% contro 2,5%: x2,5');
select is(pg_temp.numeri(1, 'views_percentile'), '100', 'meglio di tutti gli otto');
select is(pg_temp.numeri(1, 'fascia_pubblico'), 'sopra', 'pubblico sopra');
select is(pg_temp.numeri(1, 'fascia_lead'), null::text, 'lead non contati: nessuna fascia');
select is(pg_temp.numeri(1, 'verdetto'), 'spingere', 'verdetto spingere');
select is((public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'contati')::boolean, false, 'i lead non sono contati');
select is(public.analisi_numeri_reel('8100000000000001') -> 'lead' -> 'dm', 'null'::jsonb, 'e i numeri dei lead sono null, mai 0');

-- 7 comparison reels: null
delete from public.instagram_contenuti_misure where media_id = '8100000000000011';
select is(pg_temp.numeri(1, 'confronto'), null::text, 'con 7 reel di confronto il confronto non c''è');
select is(pg_temp.numeri(1, 'views_rapporto'), null::text, 'e nessun rapporto');
select is(pg_temp.numeri(1, 'verdetto'), null::text, 'e nessun verdetto');
insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares)
values ('8100000000000011', ((now() - interval '408 hours') at time zone 'Europe/Rome')::date, now() - interval '408 hours', 72,
        1100, 880, 22, 11);
select is(pg_temp.numeri(1, 'confronto'), 'stessa_eta', 'tornato all''ottavo, il confronto c''è');

-- an eliminated reel, or one never read, is not a comparison
update public.instagram_contenuti set eliminato_il = now() where media_id = '8100000000000012';
select is(pg_temp.numeri(1, 'reel_di_confronto'), '7', 'un reel eliminato non conta');
update public.instagram_contenuti set eliminato_il = null where media_id = '8100000000000012';
update public.instagram_contenuti set metriche_stato = 'senza_permesso' where media_id = '8100000000000013';
select is(pg_temp.numeri(1, 'reel_di_confronto'), '7', 'né uno senza numeri letti');
update public.instagram_contenuti set metriche_stato = 'lette' where media_id = '8100000000000013';
-- the 90-day window before the reel
update public.instagram_contenuti set pubblicato_il = now() - interval '100 days' where media_id = '8100000000000014';
select is(pg_temp.numeri(1, 'reel_di_confronto'), '7', 'né uno di più di 90 giorni prima');
update public.instagram_contenuti set pubblicato_il = now() - interval '600 hours' where media_id = '8100000000000014';
-- a reel published after the target is not a comparison either
update public.instagram_contenuti set pubblicato_il = now() - interval '50 hours' where media_id = '8100000000000015';
select is(pg_temp.numeri(1, 'reel_di_confronto'), '7', 'né uno pubblicato dopo');
update public.instagram_contenuti set pubblicato_il = now() - interval '680 hours' where media_id = '8100000000000015';
select is(pg_temp.numeri(1, 'reel_di_confronto'), '8', 'rimessi a posto: 8');

-- ---------------------------------------------------------------------------
-- 4. The whole life: V (400 hours old) against the 8 older reels' numbers of today
-- ---------------------------------------------------------------------------
select pg_temp.reel(2, 400, 5000);
select is(pg_temp.numeri(2, 'eta'), '0', 'a 400 ore: la vita intera');
select is(pg_temp.numeri(2, 'confronto'), 'vita_intera', 'confronto sulla vita intera');
select is(pg_temp.numeri(2, 'eta_confronto'), null::text, 'senza età di confronto');
select is(pg_temp.numeri(2, 'views_mediana'), '3900', 'la mediana delle views di oggi (3200..4600)');
select is(pg_temp.numeri(2, 'views_rapporto'), '1.28', 'x1,28');
select is(pg_temp.numeri(2, 'fascia_pubblico'), 'nella_media', 'nella media');
select is(pg_temp.numeri(2, 'verdetto'), 'mantenere', 'mantenere');
update public.instagram_contenuti set views = 5200 where media_id = '8100000000000002';
select is(pg_temp.numeri(2, 'fascia_pubblico'), 'sopra', 'x1,33: sopra');
update public.instagram_contenuti set views = 2700, saved = 20, shares = 10 where media_id = '8100000000000002';
select is(pg_temp.numeri(2, 'fascia_pubblico'), 'sotto', 'x0,69 con pochi salvataggi: sotto');

-- ---------------------------------------------------------------------------
-- 5. The leads: only when the Insight counted every day of the window
-- ---------------------------------------------------------------------------
-- T was published on day P (Rome); its window of 3 days is P..P+2
create temp table giorno_t on commit drop as
select ((now() - interval '100 hours') at time zone 'Europe/Rome')::date as p;
insert into public.instagram_contenuti_dm_giorni (giorno)
select p + g from giorno_t, generate_series(0, 1) g;
select is((public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'contati')::boolean, false,
  'manca un giorno su tre: non contati');
insert into public.instagram_contenuti_dm_giorni (giorno) select p + 2 from giorno_t;
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
select 'T81Reel001', p, 3, 1, 1, 1 from giorno_t;
select is((public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'contati')::boolean, true, 'contati');
select is(public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'finestra', 'primi 3 giorni', 'la finestra di 3 giorni');
select is(public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'dm', '3', 'i DM');
select is(pg_temp.numeri(1, 'fascia_lead'), 'nella_media', '1 lead in target senza confronto contato: nella media');
-- the comparison reels' own windows counted: in-target leads 0,0,0,0,0,0,1,2 -> the 75th percentile is 0.25
insert into public.instagram_contenuti_dm_giorni (giorno)
select ((now() - (480 + 40 * g) * interval '1 hour') at time zone 'Europe/Rome')::date + d
from generate_series(1, 8) g, generate_series(0, 2) d
on conflict (giorno) do nothing;
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
select 'T81Reel0' || (10 + g), ((now() - (480 + 40 * g) * interval '1 hour') at time zone 'Europe/Rome')::date,
       case g when 7 then 1 when 8 then 2 else 1 end, case g when 7 then 1 when 8 then 2 else 0 end, 0, 0
from generate_series(1, 8) g;
select is(pg_temp.numeri(1, 'fascia_lead'), 'sopra', '1 lead in target contro un 75° percentile di 0,25: sopra');
select is((public.analisi_numeri_reel('8100000000000001') -> 'lead' ->> 'in_target_p75')::numeric, 0.25, 'il 75° percentile è nei numeri');
update public.instagram_contenuti_dm set lead_in_target = 2, dm = 3 where shortcode = 'T81Reel001';
select is(pg_temp.numeri(1, 'fascia_lead'), 'sopra', '2 lead in target: sopra');
-- no DM at all on a «Converting» reel of the calendar: below, and the verdict is to change
delete from public.instagram_contenuti_dm where shortcode = 'T81Reel001';
select is(pg_temp.numeri(1, 'fascia_lead'), 'nella_media', 'nessun DM: nella media se non è un Converting');
insert into public.marketing_contenuti (id, tipo, nome, reel_type, stato, url)
values ('81810000-0000-4000-8000-0000000000c1', 'reel', 'Contenuto del test 81', 'converting', 'posted',
        'https://www.instagram.com/reel/T81Reel001/');
select is(pg_temp.numeri(1, 'fascia_lead'), 'sotto', 'nessun DM su un Converting collegato: sotto');
select is(pg_temp.numeri(1, 'verdetto'), 'cambiare', 'pubblico sopra e lead sotto: cambiare');
delete from public.marketing_contenuti where id = '81810000-0000-4000-8000-0000000000c1';
-- the whole life counts the first 14 days, always the same
insert into public.instagram_contenuti_dm_giorni (giorno)
select ((now() - interval '400 hours') at time zone 'Europe/Rome')::date + d from generate_series(0, 13) d
on conflict (giorno) do nothing;
select is(public.analisi_numeri_reel('8100000000000002') -> 'lead' ->> 'finestra', 'primi 14 giorni', 'sulla vita intera, 14 giorni');
select is((public.analisi_numeri_reel('8100000000000002') -> 'lead' ->> 'contati')::boolean, true, 'contati');
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
values ('T81Reel002', ((now() - interval '400 hours') at time zone 'Europe/Rome')::date + 14, 9, 9, 9, 9);
select is(public.analisi_numeri_reel('8100000000000002') -> 'lead' ->> 'dm', '0', 'il quindicesimo giorno non conta');

-- ---------------------------------------------------------------------------
-- 6. The requests of the people
-- ---------------------------------------------------------------------------
-- the reels of the previous sections are comparison material: clean the lead rows of them
delete from public.marketing_analisi;
delete from public.instagram_letture;
select pg_temp.reel(3, 50, 800);
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('8100000000000091', 'T81Feed091', 'https://www.instagram.com/p/T81Feed091/', 'IMAGE', false, now() - interval '30 hours'),
  ('8100000000000092', 'T81Gone092', 'https://www.instagram.com/reel/T81Gone092/', 'VIDEO', true, now() - interval '30 hours');
update public.instagram_contenuti set eliminato_il = now() where media_id = '8100000000000092';

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000003') $$), '42501', 'il setter non chiede un''analisi');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000003') $$), '42501', 'il video editor nemmeno');
select is(pg_temp.codice($$ select public.marketing_imposta_costo_max(50) $$), '42501', 'né cambia il limite');
select is(pg_temp.codice($$ select public.marketing_imposta_interruttori(false, false) $$), '42501', 'né gli interruttori');
select is(public.marketing_lavori_situazione() ->> 'automatiche', 'attive', 'ma legge la situazione');
select is(public.marketing_lavori_situazione() -> 'costo_mese', null::jsonb, 'senza il costo');
select is(public.marketing_lavori_situazione() -> 'note_team', null::jsonb, 'né l''interruttore delle note');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_lavori_situazione() $$), '42501', 'il closer non legge la situazione');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('nonesiste') $$), 'P0002', 'un reel che non c''è');
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000091') $$), '22023', 'un carosello o una foto no');
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000092') $$), '22023', 'un reel eliminato no');
select ok(public.marketing_analisi_richiedi('8100000000000003') is not null, 'il marketing chiede l''analisi di un reel');
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000003') $$), '22023', 'la seconda mentre la prima è aperta no');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select row(a.motivo, a.stato, a.periodo_a = public.oggi() - 1, a.periodo_da = public.oggi() - 28)::text
   from public.marketing_analisi a where a.media_id = '8100000000000003'),
  row('richiesta'::text, 'in_coda'::public.analisi_stato, true, true)::text,
  'l''analisi è in coda, con i 28 giorni fino a ieri');
select is(
  (select row(l.richiesta, l.stato, l.motivo, l.priorita)::text from public.instagram_letture l where l.media_id = '8100000000000003'),
  row('completa'::text, 'in_coda'::text, 'richiesta'::text, 2::smallint)::text,
  'e la lettura manca: la mette in coda completa, con priorità 2');

-- a lettura already done is not redone, unless asked
update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where media_id = '8100000000000003';
update public.instagram_letture set stato = 'fatta', trascrizione_esito = 'senza_parlato', visione_esito = 'rifiutata' where media_id = '8100000000000003';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.marketing_analisi_richiedi('8100000000000003') is not null, 'l''admin la chiede di nuovo');
reset role;
set local request.jwt.claims to '{}';
select is((select stato from public.instagram_letture where media_id = '8100000000000003'), 'fatta',
  'una lettura fatta non si rifà da sola');
update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where media_id = '8100000000000003' and stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.marketing_analisi_richiedi('8100000000000003', true) is not null, '«Analizza di nuovo» con p_rileggi');
reset role;
set local request.jwt.claims to '{}';
select is((select row(stato, priorita, tentativi)::text from public.instagram_letture where media_id = '8100000000000003'),
  row('in_coda'::text, 2::smallint, 0::smallint)::text, 'rilegge: di nuovo in coda, senza tentativi');
-- 10 requests a day for the whole team (the failed ones do not count: 89)
update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where media_id = '8100000000000003' and stato = 'in_coda';
insert into public.marketing_analisi (media_id, motivo, stato, contenuto, finita_il, periodo_da, periodo_a)
select '8100000000000003', 'richiesta', 'pronta', '{}'::jsonb, now(), public.oggi() - 28, public.oggi() - 1 from generate_series(1, 10);
select is((select count(*)::integer from public.marketing_analisi where motivo = 'richiesta' and created_at >= public.oggi()::timestamp at time zone 'Europe/Rome'),
  13, '13 richieste oggi nel test');
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000003') $$), '22023', 'l''undicesima del giorno no');
reset role;
set local request.jwt.claims to '{}';
delete from public.marketing_analisi where motivo = 'richiesta';

-- «Analizza di nuovo»: a speech that failed or was off is asked again, one that came out (or a reel without speech) is kept
update public.instagram_letture set stato = 'fatta', trascrizione_esito = 'fallita', visione_esito = 'rifiutata' where media_id = '8100000000000003';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.marketing_analisi_richiedi('8100000000000003', true);
reset role;
set local request.jwt.claims to '{}';
select is((select trascrizione_esito from public.instagram_letture where media_id = '8100000000000003'), null,
  'Whisper fallito: «Analizza di nuovo» chiede di nuovo il parlato');
update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where media_id = '8100000000000003' and stato = 'in_coda';
update public.instagram_letture set stato = 'fatta', trascrizione_esito = 'senza_parlato', visione_esito = 'rifiutata' where media_id = '8100000000000003';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.marketing_analisi_richiedi('8100000000000003', true);
reset role;
set local request.jwt.claims to '{}';
select is((select trascrizione_esito from public.instagram_letture where media_id = '8100000000000003'), 'senza_parlato',
  'un reel senza parlato resta senza parlato: l''audio non cambia');
-- the tiles are not for a Claude token, even the admin's (vede_marketing() is true for a live token)
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"7c000000-0000-4000-8000-0000000000aa"}';
select throws_ok($$ select public.analisi_riepilogo(public.oggi() - 30, public.oggi()) $$, '42501', null, 'analisi_riepilogo: un token di Claude no');
reset role;
set local request.jwt.claims to '{}';
delete from public.marketing_analisi where motivo = 'richiesta';

-- the limit of spending
update public.marketing_lavori_stato set costo_mese_usd = 25;
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_analisi_richiedi('8100000000000003') $$), '22023', 'oltre il limite di spesa no');
select is(public.marketing_lavori_situazione() ->> 'automatiche', 'in_pausa_spesa', 'e la situazione lo dice');
reset role;
set local request.jwt.claims to '{}';
update public.marketing_lavori_stato set mese = (date_trunc('month', public.oggi()) - interval '1 month')::date, costo_mese_usd = 99;
select is(public.marketing_costo_mese(), 0::numeric, 'il costo di un mese passato vale 0');
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select ok(public.marketing_analisi_richiedi('8100000000000003') is not null, 'e non blocca niente');
reset role;
set local request.jwt.claims to '{}';
update public.marketing_lavori_stato set mese = date_trunc('month', public.oggi())::date, costo_mese_usd = 0;
delete from public.marketing_analisi; delete from public.instagram_letture;

-- the admin: limit and switches
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.marketing_imposta_costo_max(40) $$, 'l''admin cambia il limite');
select throws_ok($$ select public.marketing_imposta_costo_max(201) $$, '22023', null, 'tra 0 e 200');
select throws_ok($$ select public.marketing_imposta_costo_max(-1) $$, '22023', null, 'non negativo');
select lives_ok($$ select public.marketing_imposta_interruttori(false, null) $$, 'e le analisi automatiche');
select is(public.marketing_lavori_situazione() ->> 'automatiche', 'spente', 'spente');
select is((public.marketing_lavori_situazione() ->> 'costo_max')::numeric, 40.00, 'l''admin legge il limite');
select is((public.marketing_lavori_situazione() ->> 'note_team')::boolean, true, 'e l''interruttore delle note (acceso)');
select lives_ok($$ select public.marketing_imposta_interruttori(null, false) $$, 'null lascia com''è');
select is(
  (select row(automatiche, note_team)::text from (select (public.marketing_lavori_situazione() ->> 'automatiche_accese')::boolean as automatiche,
                                                          (public.marketing_lavori_situazione() ->> 'note_team')::boolean as note_team) x),
  row(false, false)::text, 'le automatiche spente, le note spente');
select lives_ok($$ select public.marketing_imposta_interruttori(true, true) $$, 'li rimette');
reset role;
set local request.jwt.claims to '{}';
update public.marketing_lavori_stato set costo_max_mese = 25;

-- ---------------------------------------------------------------------------
-- 7. The next job, in order
-- ---------------------------------------------------------------------------
delete from public.marketing_analisi; delete from public.instagram_letture;
delete from public.instagram_contenuti where media_id !~ '^81';
delete from public.instagram_contenuti where media_id in ('8100000000000091', '8100000000000092');
update public.instagram_contenuti set eliminato_il = null;
-- reels of the order test: 20 (5 days old), 21 (2 days), 22 (40 days), 23 (50 days), 24 (10 days), 25 (7 days), 26 (3 days)
select pg_temp.reel(20, 120); select pg_temp.reel(21, 48); select pg_temp.reel(22, 960); select pg_temp.reel(23, 1200);
select pg_temp.reel(24, 240); select pg_temp.reel(25, 168); select pg_temp.reel(26, 72);
insert into public.instagram_letture (media_id, richiesta, motivo, priorita, created_at) values
  ('8100000000000020', 'trascrizione', 'automatica', 1, now() - interval '1 hour'),
  ('8100000000000021', 'trascrizione', 'automatica', 1, now() - interval '1 hour'),
  ('8100000000000022', 'trascrizione', 'recupero', 0, now() - interval '1 hour'),
  ('8100000000000023', 'trascrizione', 'recupero', 0, now() - interval '1 hour'),
  ('8100000000000003', 'completa', 'richiesta', 2, now() - interval '3 hours'),
  ('8100000000000002', 'completa', 'richiesta', 2, now() - interval '2 hours');
insert into public.marketing_analisi (id, media_id, motivo, periodo_da, periodo_a, created_at) values
  ('81810000-0000-4000-8000-0000000000a4', '8100000000000024', 'automatica', public.oggi() - 28, public.oggi() - 1, now()),
  ('81810000-0000-4000-8000-0000000000a5', '8100000000000025', 'automatica', public.oggi() - 28, public.oggi() - 1, now()),
  ('81810000-0000-4000-8000-0000000000a6', '8100000000000026', 'richiesta', public.oggi() - 28, public.oggi() - 1, now());
-- a request waits for its reading: 26 has a reading in coda
insert into public.instagram_letture (media_id, richiesta, motivo, priorita, created_at)
values ('8100000000000026', 'completa', 'richiesta', 2, now() - interval '30 minutes');

create or replace function pg_temp.sequenza(p_adesso timestamptz)
returns text
language plpgsql
as $$
declare
  v record;
  r text[] := '{}';
begin
  loop
    select w.cosa, w.rif into v from public.marketing_scegli_lavoro(p_adesso) w limit 1;
    exit when not found or array_length(r, 1) > 20;
    r := r || (v.cosa || ':' || right(v.rif, 2));
    if v.cosa = 'lettura' then
      update public.instagram_letture set stato = 'fallita', errore = 'x' where media_id = v.rif;
    else
      update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where id = v.rif::uuid;
    end if;
  end loop;
  return array_to_string(r, ' ');
end;
$$;

-- at 03:00 (Rome): the requests first, oldest first; a request whose reading is waiting comes after it;
-- then the newest reel's automatic reading (the speech only), the recoveries; the automatic analyses (a4, a5,
-- left in the queue by a version before 1.39.0) are never picked: Claude works only after a click
select is(
  pg_temp.sequenza(((public.oggi()::timestamp + time '03:00') at time zone 'Europe/Rome')),
  'lettura:03 lettura:02 lettura:26 analisi:a6 lettura:21 lettura:20 lettura:22 lettura:23',
  'l''ordine: richieste, poi letture automatiche della sola trascrizione (reel più recente prima), recuperi; mai un''analisi automatica');
update public.instagram_letture set stato = 'in_coda', errore = null;
update public.marketing_analisi set stato = 'in_coda', errore = null, finita_il = null;
select is(
  pg_temp.sequenza(((public.oggi()::timestamp + time '12:00') at time zone 'Europe/Rome')),
  'lettura:03 lettura:02 lettura:26 analisi:a6',
  'fuori dalla finestra delle 00:00-10:00 solo le richieste');
update public.instagram_letture set stato = 'in_coda', errore = null;
update public.marketing_analisi set stato = 'in_coda', errore = null, finita_il = null;
update public.marketing_lavori_stato set automatiche = false;
select is(
  pg_temp.sequenza(((public.oggi()::timestamp + time '03:00') at time zone 'Europe/Rome')),
  'lettura:03 lettura:02 lettura:26 analisi:a6',
  'con le automatiche spente solo le richieste');
update public.marketing_lavori_stato set automatiche = true;
update public.instagram_letture set stato = 'in_coda', errore = null;
update public.marketing_analisi set stato = 'in_coda', errore = null, finita_il = null;

-- the daily limits: 30 automatic readings started today, 60 recoveries
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
select '8199' || lpad(g::text, 12, '0'), 'T81Tetto' || lpad(g::text, 3, '0'),
       'https://www.instagram.com/reel/T81Tetto' || lpad(g::text, 3, '0') || '/', 'VIDEO', true, now() - interval '3 hours' * g
from generate_series(1, 90) g;
insert into public.instagram_letture (media_id, richiesta, motivo, priorita, stato, errore, iniziata_il)
select '8199' || lpad(g::text, 12, '0'), 'completa', case when g <= 30 then 'automatica' else 'recupero' end,
       case when g <= 30 then 1 else 0 end, 'fallita', 'x', now()
from generate_series(1, 90) g;
update public.instagram_letture set stato = 'fallita', errore = 'x' where media_id in
  ('8100000000000003', '8100000000000002', '8100000000000026');
select is(
  pg_temp.sequenza(((public.oggi()::timestamp + time '03:00') at time zone 'Europe/Rome')),
  'analisi:a6',
  'con 30 letture automatiche e 60 recuperi già fatti oggi resta la richiesta: le altre letture aspettano domani');
update public.marketing_analisi set stato = 'in_coda', errore = null, finita_il = null;
delete from public.instagram_letture where media_id like '8199%';
delete from public.instagram_contenuti where media_id like '8199%';

-- nothing: lease taken, an Insight run active, the limit reached, 3 attempts, a retry in the future
update public.instagram_letture set stato = 'in_coda', errore = null, tentativi = 0;
select ok(exists (select 1 from public.marketing_scegli_lavoro()), 'c''è lavoro');
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'lettura', passo_rif = 'x',
  lease_fino_al = now() + interval '5 minutes';
select ok(not exists (select 1 from public.marketing_scegli_lavoro()), 'con il lease preso niente');
update public.marketing_lavori_stato set lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null;
insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi(), 'manuale', 'in_corso');
select ok(not exists (select 1 from public.marketing_scegli_lavoro()), 'durante un''esecuzione dell''Insight niente');
delete from public.insight_esecuzioni where giorno = public.oggi() and stato = 'in_corso';
update public.marketing_lavori_stato set costo_mese_usd = 25;
select ok(not exists (select 1 from public.marketing_scegli_lavoro()), 'oltre il limite di spesa niente');
update public.marketing_lavori_stato set costo_mese_usd = 0;
update public.instagram_letture set tentativi = 3;
update public.marketing_analisi set tentativi = 3;
select ok(not exists (select 1 from public.marketing_scegli_lavoro()), 'con 3 tentativi non si riprende');
update public.instagram_letture set tentativi = 0, prossimo_il = now() + interval '10 minutes';
update public.marketing_analisi set tentativi = 0, prossimo_il = now() + interval '10 minutes';
select ok(not exists (select 1 from public.marketing_scegli_lavoro()), 'con un nuovo tentativo nel futuro neppure');
update public.instagram_letture set prossimo_il = null;
update public.marketing_analisi set prossimo_il = null;

-- ---------------------------------------------------------------------------
-- 8. Taking a step, finishing it
-- ---------------------------------------------------------------------------
select is(pg_temp.codice($$ select * from public.marketing_prendi_passo(0) $$), '22023', 'la durata del passo è valida');
create temp table passo81 on commit drop as select * from public.marketing_prendi_passo(330);
select is((select cosa from passo81), 'lettura', 'prende un passo');
select is((select stato from public.instagram_letture where media_id = (select rif from passo81)), 'in_corso', 'e il lavoro è in corso');
select is(
  (select row(passo_id = (select passo from passo81), passo_cosa, lease_fino_al > now())::text from public.marketing_lavori_stato),
  row(true, 'lettura'::text, true)::text, 'col suo lease');
select is((select count(*)::integer from public.marketing_prendi_passo(330)), 0, 'un secondo passo mentre il lease è preso: niente');
select is(public.marketing_passo_finito(gen_random_uuid(), 'ok', '{}'), false, 'un altro passo non chiude');
select throws_ok($$ select public.marketing_passo_finito((select passo from passo81), 'boh', '{}') $$, '22023', null, 'un esito che non esiste no');
select throws_ok($$ select public.marketing_passo_finito((select passo from passo81), 'ok', '{"input":-5}') $$, '22023', null,
  'un contatore negativo no');

-- the cost: tokens in SQL, plus the seconds of audio (0.111 $ an hour)
select is(
  public.marketing_passo_finito((select passo from passo81), 'ok',
    '{"input":1000000,"cache_scritti":100000,"cache_letti":1000000,"output":100000,"secondi_audio":3600,"altro":7}'),
  true, 'il passo che ha il lease chiude (le chiavi che non conosce le ignora)');
select is(
  (select row(token_input, token_cache_scritti, token_cache_letti, token_output, secondi_audio, costo_mese_usd)::text
   from public.marketing_lavori_stato),
  row(1000000::bigint, 100000::bigint, 1000000::bigint, 100000::bigint, 3600, 3.5610::numeric)::text,
  'contatori sommati; costo = 2 + 0,25 + 0,2 + 1 $ dei token + 0,111 $ dell''audio');
select is(
  (select row(lease_fino_al is null, passo_id is null, ultimo_esito, ultimo_passo_il is not null)::text from public.marketing_lavori_stato),
  row(true, true, 'ok'::text, true)::text, 'il lease è libero');
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select is(public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":1000000}'), true, 'un secondo passo somma');
select is((select token_input from public.marketing_lavori_stato), 2000000::bigint, 'ai contatori');
-- the turn of the month: a step that ends in a new month starts its counters first
update public.marketing_lavori_stato set mese = (date_trunc('month', public.oggi()) - interval '1 month')::date,
  passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"output":100000}');
select is((select row(mese = date_trunc('month', public.oggi())::date, token_input, token_output, costo_mese_usd)::text from public.marketing_lavori_stato),
  row(true, 0::bigint, 100000::bigint, 1.0000::numeric)::text, 'al cambio di mese riparte da zero');
update public.marketing_lavori_stato set token_output = 0, costo_mese_usd = 0, secondi_audio = 0;

-- ---------------------------------------------------------------------------
-- 9. The end of a reading
-- ---------------------------------------------------------------------------
update public.instagram_letture set stato = 'in_coda', tentativi = 0, ripresa_usata = false;
update public.instagram_letture set stato = 'in_corso', iniziata_il = now() where media_id = '8100000000000020';
select is(public.marketing_lettura_fine('8100000000000021', '{"stato":"fatta"}'), false, 'solo da in corso');
select throws_ok($$ select public.marketing_lettura_fine('8100000000000020', '{"stato":"boh"}') $$, '22023', null, 'uno stato che non c''è no');
-- «resume»: the speech stays, no attempt the first time
select is(public.marketing_lettura_fine('8100000000000020',
  '{"stato":"in_coda","trascrizione_esito":"pronta","trascrizione":"Ciao a tutti","gancio_parlato":"Ciao","video":"letto","ha_audio":true,"durata_ms":42500,"audio_tipo":"ORIGINAL_SOUND"}'),
  true, 'una lettura che non ha tempo per Claude torna in coda');
select is(
  (select row(stato, tentativi, ripresa_usata, trascrizione, video)::text from public.instagram_letture where media_id = '8100000000000020'),
  row('in_coda'::text, 0::smallint, true, 'Ciao a tutti'::text, 'letto'::text)::text,
  'senza tentativo, tenendo la trascrizione');
select is((select row(durata_ms, audio_tipo)::text from public.instagram_contenuti where media_id = '8100000000000020'),
  row(42500, 'ORIGINAL_SOUND'::text)::text, 'e scrive la durata e il tipo di audio del reel');
update public.instagram_letture set stato = 'in_corso' where media_id = '8100000000000020';
select public.marketing_lettura_fine('8100000000000020', '{"stato":"in_coda"}');
select is((select tentativi from public.instagram_letture where media_id = '8100000000000020'), 1::smallint,
  'la seconda «riprendi» conta un tentativo');
update public.instagram_letture set stato = 'in_corso', tentativi = 2 where media_id = '8100000000000020';
select public.marketing_lettura_fine('8100000000000020', '{"stato":"in_coda"}');
select is((select row(stato, errore)::text from public.instagram_letture where media_id = '8100000000000020'),
  row('fallita'::text, 'Il reel è troppo lungo da leggere in un passo: riprova.'::text)::text,
  'a 3 tentativi la lettura è fallita');
-- a retry that counts, with the next time
update public.instagram_letture set stato = 'in_corso', tentativi = 0, ripresa_usata = false where media_id = '8100000000000021';
select public.marketing_lettura_fine('8100000000000021', format('{"stato":"in_coda","tentativo":true,"prossimo_il":"%s"}', (now() + interval '10 minutes'))::jsonb);
select is((select row(stato, tentativi, prossimo_il > now())::text from public.instagram_letture where media_id = '8100000000000021'),
  row('in_coda'::text, 1::smallint, true)::text, 'un 429 rimette in coda con l''ora del prossimo tentativo');
-- done
update public.instagram_letture set stato = 'in_corso' where media_id = '8100000000000021';
select public.marketing_lettura_fine('8100000000000021',
  '{"stato":"fatta","trascrizione_esito":"pronta","trascrizione":"Testo","visione_esito":"pronta","scheda":{"sintesi_visiva":"x"},"fotogrammi":31,"lato_px":896,"fonte_visione":"video"}');
select is((select row(stato, fotogrammi, lato_px, letta_il is not null, prossimo_il is null)::text from public.instagram_letture where media_id = '8100000000000021'),
  row('fatta'::text, 31::smallint, 896::smallint, true, true)::text, 'una lettura fatta');
-- failed
update public.instagram_letture set stato = 'in_corso' where media_id = '8100000000000022';
select public.marketing_lettura_fine('8100000000000022', '{"stato":"fallita","errore":"Il video non si è scaricato."}');
select is((select row(stato, errore)::text from public.instagram_letture where media_id = '8100000000000022'),
  row('fallita'::text, 'Il video non si è scaricato.'::text)::text, 'una lettura fallita porta la sua frase');

-- ---------------------------------------------------------------------------
-- 10. The end of an analysis
-- ---------------------------------------------------------------------------
delete from public.marketing_analisi;
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, iniziata_il) values
  ('81810000-0000-4000-8000-0000000000b1', '8100000000000001', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now());
select is(public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b9', 'pronta', '{}', '{}', '{}', 'm', 'v', null), false,
  'un''analisi che non c''è: false');
select throws_ok($$ select public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b1', 'boh', null, null, null, null, null, null) $$,
  '22023', null, 'uno stato che non c''è no');
select throws_ok($$ select public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b1', 'pronta', null, null, null, null, null, null) $$,
  '22023', null, 'una pronta ha il contenuto');
-- no time: back in the queue without an attempt
select is(public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b1', 'in_coda', null, null, null, null, null, null), true, 'senza tempo');
select is((select row(stato, tentativi)::text from public.marketing_analisi where id = '81810000-0000-4000-8000-0000000000b1'),
  row('in_coda'::public.analisi_stato, 0::smallint)::text, 'torna in coda senza tentativo');
-- a retry with the next time counts
update public.marketing_analisi set stato = 'in_corso', iniziata_il = now() where id = '81810000-0000-4000-8000-0000000000b1';
select public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b1', 'in_coda', null, null, null, null, null, 'x', now() + interval '10 minutes');
select is((select row(stato, tentativi, prossimo_il > now())::text from public.marketing_analisi where id = '81810000-0000-4000-8000-0000000000b1'),
  row('in_coda'::public.analisi_stato, 1::smallint, true)::text, 'un nuovo tentativo conta');
update public.marketing_analisi set stato = 'in_corso', tentativi = 2 where id = '81810000-0000-4000-8000-0000000000b1';
select public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000b1', 'in_coda', null, null, null, null, null, 'Claude non risponde adesso: riprova tra qualche minuto.', now() + interval '10 minutes');
select is((select row(stato, errore)::text from public.marketing_analisi where id = '81810000-0000-4000-8000-0000000000b1'),
  row('fallita'::public.analisi_stato, 'Claude non risponde adesso: riprova tra qualche minuto.'::text)::text, 'al terzo è fallita');

-- ready: the numbers are copied, and only the last 3 ready ones stay (an idea in the calendar saves its analysis)
delete from public.marketing_analisi;
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, finita_il, contenuto, created_at) values
  ('81810000-0000-4000-8000-0000000000c1', '8100000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1, now() - interval '5 days', '{"idee":[{}]}', now() - interval '5 days'),
  ('81810000-0000-4000-8000-0000000000c2', '8100000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1, now() - interval '4 days', '{"idee":[{}]}', now() - interval '4 days'),
  ('81810000-0000-4000-8000-0000000000c3', '8100000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1, now() - interval '3 days', '{"idee":[{}]}', now() - interval '3 days'),
  ('81810000-0000-4000-8000-0000000000c4', '8100000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1, now() - interval '2 days', '{"idee":[{}]}', now() - interval '2 days');
insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
values ('reel', 'Nato da un''idea', '81810000-0000-4000-8000-0000000000c1', 0);
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, iniziata_il)
values ('81810000-0000-4000-8000-0000000000c5', '8100000000000001', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now());
select is(public.marketing_analisi_fine('81810000-0000-4000-8000-0000000000c5', 'pronta',
  '{"verdetto":"spingere","eta_ore":100,"eta_confronto":3}', '{"sintesi":"ok","idee":[]}', '{"fotogrammi":31}', 'claude-sonnet-5-5', '2026-10-16.1', null),
  true, 'un''analisi pronta');
select is(
  (select row(verdetto, eta_ore, eta_confronto, modello, finita_il is not null)::text from public.marketing_analisi where id = '81810000-0000-4000-8000-0000000000c5'),
  row('spingere'::text, 100, 3::smallint, 'claude-sonnet-5-5'::text, true)::text, 'con verdetto, età e modello dai numeri');
select is((select array_agg(right(id::text, 2) order by id) from public.marketing_analisi),
  array['c1', 'c3', 'c4', 'c5'], 'restano le ultime 3 e quella da cui è nata un''idea del calendario');

-- ---------------------------------------------------------------------------
-- 11. The planner
-- ---------------------------------------------------------------------------
delete from public.marketing_contenuti where da_analisi is not null;
delete from public.marketing_analisi;
delete from public.instagram_letture;
update public.instagram_contenuti set eliminato_il = now() where media_id !~ '^8100000000000(0[01]|1[0-8])';
-- new readings: complete up to 28 days, speech only from 29 to 90, nothing beyond
select pg_temp.reel(30, 24); select pg_temp.reel(31, 672); select pg_temp.reel(32, 700); select pg_temp.reel(33, 2160); select pg_temp.reel(34, 2400);
update public.instagram_contenuti set eliminato_il = now() where media_id !~ '^81000000000000(30|31|32|33|34)$';
select public.marketing_pianifica();
select is(
  (select array_agg(right(l.media_id, 2) || ':' || l.richiesta || ':' || l.motivo || ':' || l.priorita order by l.media_id) from public.instagram_letture l),
  array['30:trascrizione:automatica:1', '31:trascrizione:automatica:1', '32:trascrizione:recupero:0', '33:trascrizione:recupero:0'],
  'letture nuove: sempre la sola trascrizione (1.39.0, niente Claude da solo); fino a 28 giorni prima, da 29 a 90 come recupero, oltre niente');
select public.marketing_pianifica();
select is((select count(*)::integer from public.instagram_letture), 4, 'rifatto non cambia niente');
delete from public.instagram_letture;
update public.marketing_lavori_stato set automatiche = false;
select public.marketing_pianifica();
select is((select count(*)::integer from public.instagram_letture), 0, 'con le automatiche spente non pianifica');
update public.marketing_lavori_stato set automatiche = true;
delete from public.instagram_contenuti where media_id ~ '^81000000000000(3[0-4])$';
update public.instagram_contenuti set eliminato_il = null where media_id ~ '^8100000000000(0[01]|1[0-8])';

-- no analysis by itself, whatever the age, the permission, the leads or the reading: T (100 hours) with the 8 comparison reels
update public.instagram_contenuti_stato set permesso_insights = false;
insert into public.instagram_letture (media_id, richiesta, motivo, stato, trascrizione_esito, visione_esito)
values ('8100000000000001', 'completa', 'automatica', 'fatta', 'senza_parlato', 'rifiutata');
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'senza il permesso degli insights nessuna analisi automatica');
update public.instagram_contenuti_stato set permesso_insights = true;
-- T is 100 hours old, its leads (P..P+2) are counted by the section 5 inserts above? clean them to test the wait
delete from public.instagram_contenuti_dm_giorni;
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0,
  'a 100 ore i lead dei primi 3 giorni non sono contati: si aspetta fino a 108 ore');
update public.instagram_contenuti set pubblicato_il = now() - interval '109 hours' where media_id = '8100000000000001';
update public.instagram_contenuti_misure set giorno = ((now() - interval '37 hours') at time zone 'Europe/Rome')::date, letto_il = now() - interval '37 hours'
where media_id = '8100000000000001';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0,
  'a 109 ore non parte nessuna analisi da sola (1.39.0)');
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'e ripianificando ancora niente');
-- with counted leads it starts at 72 hours
delete from public.marketing_analisi;
update public.instagram_contenuti set pubblicato_il = now() - interval '80 hours' where media_id = '8100000000000001';
update public.instagram_contenuti_misure set giorno = ((now() - interval '8 hours') at time zone 'Europe/Rome')::date, letto_il = now() - interval '8 hours'
where media_id = '8100000000000001';
insert into public.instagram_contenuti_dm_giorni (giorno)
select ((now() - interval '80 hours') at time zone 'Europe/Rome')::date + g from generate_series(0, 2) g on conflict (giorno) do nothing;
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'nemmeno con i lead contati a 80 ore');
-- the reading must be done (or failed): not waiting in the queue
delete from public.marketing_analisi;
update public.instagram_letture set stato = 'in_coda', trascrizione_esito = null, visione_esito = null, scheda = null where media_id = '8100000000000001';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'con la lettura ancora in coda non parte');
update public.instagram_letture set created_at = now() - interval '49 hours' where media_id = '8100000000000001';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'né dopo 48 ore di coda');
delete from public.marketing_analisi;
-- under 72 hours: nothing; at 336 hours: the whole life
update public.instagram_contenuti set pubblicato_il = now() - interval '71 hours' where media_id = '8100000000000001';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'sotto le 72 ore niente');
update public.instagram_contenuti set pubblicato_il = now() - interval '400 hours', views = 5200 where media_id = '8100000000000001';
delete from public.instagram_contenuti_misure where media_id = '8100000000000001';
-- three of the comparison reels become newer than T: only 5 older ones are left
update public.instagram_contenuti set pubblicato_il = now() - interval '300 hours' where media_id ~ '^81000000000000(1[1-3])$';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'a 400 ore con meno di 8 reel di confronto più vecchi niente');
update public.instagram_contenuti set pubblicato_il = now() - interval '600 hours' where media_id ~ '^81000000000000(1[1-3])$';
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'né a 336 ore e più sulla vita intera');
update public.instagram_contenuti set pubblicato_il = now() - interval '700 hours' where media_id = '8100000000000001';
delete from public.marketing_analisi;
select public.marketing_pianifica();
select is((select count(*)::integer from public.marketing_analisi), 0, 'oltre 28 giorni (672 ore) non più in automatico');

-- ---------------------------------------------------------------------------
-- 12. The tick
-- ---------------------------------------------------------------------------
delete from public.marketing_analisi; delete from public.instagram_letture;
update public.marketing_lavori_stato set automatiche = false;
update public.marketing_lavori_stato set mese = (date_trunc('month', public.oggi()) - interval '1 month')::date,
  costo_mese_usd = 30, ultimo_esito = 'limite_spesa', ultimo_tick_il = null, token_input = 5;
select public.marketing_tick();
select is(
  (select row(mese = date_trunc('month', public.oggi())::date, costo_mese_usd, token_input, ultimo_esito, ultimo_tick_il is not null)::text
   from public.marketing_lavori_stato),
  row(true, 0.0000::numeric, 0::bigint, null::text, true)::text,
  'il cambio di mese azzera il costo e toglie lo stop del limite: si riparte');
-- the watchdog
insert into public.instagram_letture (media_id, richiesta, motivo, stato, iniziata_il, tentativi)
values ('8100000000000001', 'completa', 'richiesta', 'in_corso', now() - interval '20 minutes', 2);
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, iniziata_il, tentativi)
values ('81810000-0000-4000-8000-0000000000d1', '8100000000000002', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now() - interval '20 minutes', 0);
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'lettura', passo_rif = '8100000000000001',
  lease_fino_al = now() - interval '1 minute';
select public.marketing_tick();
select is((select row(stato, tentativi, errore)::text from public.instagram_letture where media_id = '8100000000000001'),
  row('fallita'::text, 3::smallint, 'Interrotta: il server non ha finito il lavoro. Riprova.'::text)::text,
  'il watchdog: al terzo tentativo la lettura è fallita');
select is((select row(stato, tentativi)::text from public.marketing_analisi where id = '81810000-0000-4000-8000-0000000000d1'),
  row('in_coda'::public.analisi_stato, 1::smallint)::text, 'e un''analisi persa torna in coda con un tentativo');
select is((select lease_fino_al is null and passo_id is null from public.marketing_lavori_stato), true, 'e libera il lease scaduto');
-- the dispatch: the lease is free, work is due, nothing was sent in the last 2 minutes
update public.marketing_analisi set tentativi = 0, stato = 'in_coda' where id = '81810000-0000-4000-8000-0000000000d1';
update public.marketing_lavori_stato set url_passo = 'http://127.0.0.1:3200/api/cron/marketing', inviata_il = null,
  ultimo_esito = 'ok', ultimo_passo_il = now();
select public.marketing_tick();
select isnt((select inviata_il from public.marketing_lavori_stato), null::timestamptz, 'c''è lavoro e il lease è libero: invia');
update public.marketing_lavori_stato set inviata_il = null;
update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now() where id = '81810000-0000-4000-8000-0000000000d1';
select public.marketing_tick();
select is((select inviata_il from public.marketing_lavori_stato), null::timestamptz, 'senza lavoro non invia');
update public.marketing_analisi set stato = 'in_coda', errore = null, finita_il = null where id = '81810000-0000-4000-8000-0000000000d1';
update public.marketing_lavori_stato set inviata_il = now() - interval '30 seconds';
select public.marketing_tick();
select ok((select inviata_il > now() - interval '60 seconds' and inviata_il < now() - interval '20 seconds' from public.marketing_lavori_stato),
  'e se ha inviato da meno di 2 minuti non rimanda');
update public.marketing_lavori_stato set inviata_il = null, ultimo_esito = 'senza_chiave', ultimo_passo_il = now() - interval '10 minutes';
select public.marketing_tick();
select is((select inviata_il from public.marketing_lavori_stato), null::timestamptz, 'senza la chiave di Claude al massimo una volta l''ora');
update public.marketing_lavori_stato set ultimo_passo_il = now() - interval '61 minutes';
select public.marketing_tick();
select isnt((select inviata_il from public.marketing_lavori_stato), null::timestamptz, 'passata l''ora riprova');
update public.marketing_lavori_stato set url_passo = null, inviata_il = null, ultimo_esito = null;
select public.marketing_tick();
select is((select inviata_il from public.marketing_lavori_stato), null::timestamptz, 'senza indirizzo dei passi niente');
select lives_ok($$ select public.marketing_tick() $$, 'il tick non solleva');
select lives_ok($$ select public.marketing_segna_esito('senza_chiave', 'Analisi spente: manca la chiave di Claude su Vercel.') $$, 'la route segna l''esito senza un passo');
select is((select row(ultimo_esito, ultimo_errore)::text from public.marketing_lavori_stato),
  row('senza_chiave'::text, 'Analisi spente: manca la chiave di Claude su Vercel.'::text)::text, 'che resta scritto');
select lives_ok($$ select public.marketing_imposta_url('https://dashboard.percorsoalpha.com/api/cron/marketing') $$, 'l''indirizzo dei passi');
select throws_ok($$ select public.marketing_imposta_url('https://esempio.test/altro') $$, '23514', null, 'solo quello dei passi del marketing');
select lives_ok($$ select public.marketing_imposta_url(null) $$, 'o «manuale»');
update public.marketing_lavori_stato set ultimo_esito = null, ultimo_errore = null, automatiche = true;

-- ---------------------------------------------------------------------------
-- 13. What reaches Claude
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, instagram_handle, setter_id, fonte)
values ('81810000-0000-4000-8000-0000000000e1', 'Gustavo Rossiniello', '@gustavo.rossi81', '22222222-2222-4222-8222-222222222222', 'dm_inbound');
delete from public.setter_daily_reports where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi() - 2;
insert into public.setter_daily_reports (setter_id, data, dm_outbound, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, note)
values ('22222222-2222-4222-8222-222222222222', public.oggi() - 2, 20, 'circa_meta', 'buone',
        'Molti non hanno tempo la sera', 'Chiedevano della sbarra', 'Nota privata di Loris da non mandare');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, esito, qualificata, obiezione_principale, note_closer, note)
values ('81810000-0000-4000-8000-0000000000e2', '81810000-0000-4000-8000-0000000000e1', '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '2 days', 'svolta', 'persa', true,
        'Dice che il prezzo è alto', 'Nota aggiuntiva del closer', 'Nota del setter da non mandare');
update public.marketing_lavori_stato set note_team = true;
select ok((public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'commenti_setter'), 'con le note del team accese: le risposte del setter');
select ok((public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'motivi_closer'), 'e i motivi del closer');
select ok((public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'temi_dm'), 'e i temi dei DM');
select is(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ->> 'note_del_team', 'accese', 'e lo dice');
select ok(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) -> 'commenti_setter' ->> 'testi' like '%Molti non hanno tempo la sera%',
  'il testo di «cosa frenava»');
select ok(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ->> 'motivi_closer' like '%Dice che il prezzo è alto%'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ->> 'motivi_closer' like '%Nota aggiuntiva del closer%',
  'il motivo di non chiusura e le note aggiuntive del closer');
select ok(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1)::text not like '%Nota privata di Loris%'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1)::text not like '%Nota del setter da non mandare%'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1)::text not like '%setter_id%',
  'mai «Altre note», le note del setter sulla call, né chi ha scritto');
select ok(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) -> 'da_oscurare' ? 'gustavo rossiniello'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) -> 'da_oscurare' ? 'gustavo.rossi81'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) -> 'da_oscurare' ? 'loris setter',
  'i nomi da oscurare: il lead, il suo handle, il team che non è admin');
select ok(not (public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) -> 'da_oscurare' ? 'dany'),
  'ma non Dany: è il marchio');
update public.marketing_lavori_stato set note_team = false;
select is(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ->> 'note_del_team', 'spente', 'con le note spente lo dice');
select ok(not (public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'commenti_setter')
  and not (public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'motivi_closer')
  and not (public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1) ? 'temi_dm'),
  'quelle chiavi non ci sono proprio (non vuote)');
select ok(public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1)::text not like '%Molti non hanno tempo%'
  and public.marketing_fonti_analisi(public.oggi() - 28, public.oggi() - 1)::text not like '%prezzo è alto%',
  'e nessun testo delle note nemmeno altrove');
select throws_ok($$ select public.marketing_fonti_analisi(public.oggi(), public.oggi() - 5) $$, '22023', null, 'un periodo rovesciato no');
update public.marketing_lavori_stato set note_team = true;

-- ---------------------------------------------------------------------------
-- 14. The page: the view, the tiles, who reads
-- ---------------------------------------------------------------------------
select ok((select count(*) > 0 from public.v_analisi_reel), 'la view dell''analisi ha i reel');
select is((select count(*)::integer from public.v_analisi_reel where media_id = '8100000000000091'), 0, 'solo i reel, non i caroselli');
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok((select count(*) > 0 from public.v_analisi_reel), 'il video editor legge la view');
select ok((public.analisi_riepilogo(public.oggi() - 90, public.oggi()) ->> 'reel')::integer > 0, 'e le tessere');
select is(jsonb_typeof(public.analisi_riepilogo(public.oggi() - 90, public.oggi()) -> 'da_cambiare'), 'number', 'con i «Da cambiare»');
select throws_ok($$ select public.analisi_riepilogo(public.oggi(), public.oggi() - 1) $$, '22023', null, 'un periodo rovesciato no');
select throws_ok($$ select public.analisi_riepilogo(public.oggi() - 400, public.oggi()) $$, '22023', null, 'né di più di 366 giorni');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.v_analisi_reel), 0, 'il setter non vede niente');
select throws_ok($$ select public.analisi_riepilogo(public.oggi() - 30, public.oggi()) $$, '42501', null, 'né le tessere');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 15. Grants and the scheduler
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(f, ', ' order by f), '') from unnest(array[
     'marketing_tick()', 'marketing_dispatch()', 'marketing_pianifica()', 'marketing_c_e_lavoro()', 'marketing_costo_mese()',
     'marketing_scegli_lavoro(timestamptz)', 'marketing_sveglia()', 'marketing_prendi_passo(integer)',
     'marketing_lettura_fine(text, jsonb)',
     'marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz, jsonb, text)',
     'marketing_passo_finito(uuid, text, jsonb)', 'marketing_fonti_analisi(date, date)', 'marketing_da_oscurare()',
     'marketing_imposta_url(text)', 'marketing_segna_esito(text, text)']) f
   where has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute')),
  '', 'nessuna funzione dei lavori è eseguibile da anon o da una sessione');
select is(
  (select coalesce(string_agg(f, ', ' order by f), '') from unnest(array[
     'marketing_tick()', 'marketing_dispatch()', 'marketing_pianifica()', 'marketing_c_e_lavoro()', 'marketing_costo_mese()',
     'marketing_scegli_lavoro(timestamptz)']) f
   where has_function_privilege('service_role', 'public.' || f, 'execute')),
  '', 'le funzioni interne non le chiama nemmeno il service role');
select ok(
  has_function_privilege('service_role', 'public.marketing_prendi_passo(integer)', 'execute')
  and has_function_privilege('service_role', 'public.marketing_sveglia()', 'execute')
  and has_function_privilege('service_role', 'public.marketing_fonti_analisi(date, date)', 'execute')
  and has_function_privilege('service_role', 'public.marketing_passo_finito(uuid, text, jsonb)', 'execute'),
  'i passi li chiama il service role');
select ok(
  has_function_privilege('authenticated', 'public.marketing_analisi_richiedi(text, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.marketing_imposta_costo_max(numeric)', 'execute')
  and has_function_privilege('authenticated', 'public.marketing_imposta_interruttori(boolean, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.marketing_lavori_situazione()', 'execute'),
  'le quattro funzioni delle persone sì (ognuna controlla il ruolo)');
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname like 'marketing\_%' and pg_get_functiondef(p.oid) like '%net.http_post%'),
  0, 'nessuna funzione eseguibile da una sessione contiene net.http_post');
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proname like 'marketing\_%'
     and not (p.proconfig @> array['search_path=""'])),
  0, 'ogni funzione security definer ha search_path vuoto');
select is((select count(*)::integer from cron.job where jobname = 'marketing-tick' and schedule = '2-59/5 * * * *'), 1,
  'il job marketing-tick gira ogni 5 minuti, sfasato dall''Insight');
select is((select count(*)::integer from cron.job where jobname = 'insight-tick' and schedule = '*/5 * * * *'), 1, 'e quello dell''Insight resta');

select * from finish();
rollback;
