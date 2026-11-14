-- 1.84.0 (Dany, 14/11/2026): the client goes on while the coach confirms the call (the community opens as soon as
-- the call is booked, the call itself still waits for the confirmation), and the addresses that receive the email
-- of a questionnaire sent (Impostazioni › Onboarding).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

-- Giorgio Neri of the seed: questionnaire sent, the call booked and to be confirmed
select is((select stato from public.onboarding_passi where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'prenotazione'),
  'inviato', 'la prenotazione è inviata al coach');
select is((select stato from public.onboarding_passi where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'community'),
  'disponibile', 'la community è già aperta: il cliente non aspetta la conferma');
select is((select stato from public.onboarding_passi where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'call'),
  'bloccato', 'la call di onboarding resta del team finché il coach non la conferma');

-- the same with a step put back and sent again: the trigger opens what comes after it
update public.onboarding_passi set stato = 'bloccato' where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'community';
update public.onboarding_passi set stato = 'disponibile' where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'prenotazione';
update public.onboarding_passi set stato = 'inviato' where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'prenotazione';
select is((select stato from public.onboarding_passi where client_id = '0b0b0000-0000-4000-8000-000000000003' and passo = 'community'),
  'disponibile', 'una prenotazione appena inviata apre la community');

-- the addresses of the email of the questionnaire
select ok(public.onboarding_email_valide('{dany@esempio.it,coach@esempio.it}'), 'due indirizzi validi');
select ok(not public.onboarding_email_valide('{Dany@Esempio.it}'), 'solo minuscolo');
select ok(not public.onboarding_email_valide(array(select 'p' || g || '@esempio.it' from generate_series(1, 11) g)), 'al massimo 10');
select throws_ok($$ update public.onboarding_impostazioni set email_questionario = '{non-una-email}' $$, '23514', null,
  'la colonna rifiuta un indirizzo non valido');

select * from finish();
rollback;
