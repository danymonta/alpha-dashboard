-- A request that failed does not use up the day (1.37.1, 20261019090100_richieste_fallite_non_contano.sql):
-- Dany's two failed briefs left him «Gli spunti di oggi sono già stati chiesti». The limits count the
-- requests that went well or are still going. (The call counter is checked in 84.)
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

delete from public.marketing_spunti;
delete from public.marketing_analisi;

-- the brief: 2 a day, one at a time; failed ones do not count
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'la prima richiesta');
reset role;
update public.marketing_spunti set stato = 'fallita', errore = 'x', finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'la seconda');
reset role;
update public.marketing_spunti set stato = 'fallita', errore = 'x', finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'dopo due fallite la terza passa');
reset role;
update public.marketing_spunti set stato = 'pronta', contenuto = '{}'::jsonb, finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'una riuscita conta uno: la quarta passa ancora');
reset role;
update public.marketing_spunti set stato = 'pronta', contenuto = '{}'::jsonb, finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), '22023', 'con due riuscite il limite c''è: la quinta no, riprova domani');
reset role;
select is((select count(*)::integer from public.marketing_spunti where motivo = 'richiesta' and stato = 'fallita'), 2, 'le due fallite restano scritte');

-- the analysis of a reel by hand: 10 a day, the failed ones do not count
insert into public.marketing_analisi (media_id, motivo, stato, errore, finita_il, periodo_da, periodo_a)
select i.media_id, 'richiesta', 'fallita', 'x', now(), public.oggi() - 28, public.oggi() - 1
from (select media_id from public.instagram_contenuti where (reel or media_type = 'VIDEO') and eliminato_il is null limit 1) i, generate_series(1, 12);
select is((select count(*)::integer from public.marketing_analisi where motivo = 'richiesta' and stato = 'fallita'), 12, '12 richieste fallite oggi');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.codice(format($$ select public.marketing_analisi_richiedi(%L) $$, (select media_id from public.marketing_analisi limit 1))), 'ok',
  'dopo 12 fallite la richiesta di un reel passa');
reset role;

select * from finish();
rollback;
