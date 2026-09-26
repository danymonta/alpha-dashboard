-- Audit: who changed an amount and when. Visible to the admin only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(4);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- the instalment this test touches: counts must not depend on other data
create temp table bersaglio on commit drop as
select id from public.payments order by created_at limit 1;
grant select on bersaglio to authenticated;

update public.payments
set importo_previsto = importo_previsto + 1
where id = (select id from bersaglio);

select is(
  (select count(*)::int
   from public.audit_log
   where tabella = 'payments'
     and azione = 'update'
     and record_id = (select id from bersaglio)
     and utente_id = '11111111-1111-4111-8111-111111111111'
     and created_at = now()),
  1,
  'la modifica di un importo finisce nell''audit log con l''utente che l''ha fatta'
);

select isnt(
  (select dati_prima from public.audit_log
   where tabella = 'payments' and azione = 'update'
     and record_id = (select id from bersaglio) and created_at = now()),
  null,
  'l''audit log conserva il valore precedente'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.audit_log),
  0,
  'il setter non legge l''audit log'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.audit_log),
  0,
  'il closer non legge l''audit log'
);

select * from finish();
rollback;
