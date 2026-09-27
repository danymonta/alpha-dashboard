-- A client only on projects of a department that works on clients; the overview counts in SQL.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(6);

select is(
  (select array_agg(nome order by nome) from public.pm_reparti where progetti_con_cliente),
  array['Fitness Coaching'],
  'di partenza solo il Fitness Coaching lega i progetti ai clienti'
);

select throws_ok(
  $$ insert into public.pm_progetti (reparto_id, nome, client_id, created_by)
     select (select id from public.pm_reparti where nome = 'Vendite e Marketing'), 'Funnel con cliente',
            (select id from public.clients limit 1), '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'Questo reparto non lavora sui clienti: togli il cliente o scegli un reparto per clienti',
  'un progetto di Vendite e Marketing non prende un cliente'
);

select lives_ok(
  $$ insert into public.pm_progetti (reparto_id, nome, client_id, created_by)
     select (select id from public.pm_reparti where nome = 'Fitness Coaching'), 'Percorso di prova',
            (select id from public.clients limit 1), '11111111-1111-4111-8111-111111111111' $$,
  'uno del Fitness Coaching sì'
);

select throws_ok(
  $$ update public.pm_progetti set reparto_id = (select id from public.pm_reparti where nome = 'Amministrazione')
     where nome = 'Percorso di prova' $$,
  '22023', null,
  'spostarlo in un reparto senza clienti col cliente attaccato no'
);

select throws_ok(
  $$ update public.pm_reparti set progetti_con_cliente = false where nome = 'Fitness Coaching' $$,
  '22023', 'Il reparto ha progetti legati a un cliente: togli prima il cliente da quei progetti',
  'e il reparto non si spegne finché ha progetti con cliente'
);

-- overview of a project with known tasks
insert into public.pm_progetti (id, reparto_id, nome, created_by)
select 'eeee0000-0000-4000-8000-000000000001', (select id from public.pm_reparti where nome = 'Amministrazione'), 'Panoramica nota',
       '11111111-1111-4111-8111-111111111111';
insert into public.pm_task (progetto_id, titolo, stato, scadenza, created_by) values
  ('eeee0000-0000-4000-8000-000000000001', 'a', 'da_fare', public.oggi() - 2, '11111111-1111-4111-8111-111111111111'),
  ('eeee0000-0000-4000-8000-000000000001', 'b', 'in_corso', public.oggi() + 3, '11111111-1111-4111-8111-111111111111'),
  ('eeee0000-0000-4000-8000-000000000001', 'c', 'completato', public.oggi() - 5, '11111111-1111-4111-8111-111111111111');
insert into public.pm_tempo (profile_id, progetto_id, data, minuti)
values ('11111111-1111-4111-8111-111111111111', 'eeee0000-0000-4000-8000-000000000001', public.oggi(), 90),
       ('11111111-1111-4111-8111-111111111111', 'eeee0000-0000-4000-8000-000000000001', public.oggi() - 20, 30);

select is(
  (select row(da_fare, in_corso, in_revisione, completati, in_ritardo, senza_assegnatario, in_scadenza_7_giorni,
              minuti_totali, minuti_ultimi_7_giorni)::text
   from public.pm_panoramica_progetto('eeee0000-0000-4000-8000-000000000001')),
  '(1,1,0,1,1,2,1,120,90)',
  'la panoramica conta stati, ritardi, scadenze e tempo in SQL'
);

select * from finish();
rollback;
