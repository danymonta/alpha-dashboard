-- Projects area demo data. Invented people and clients only.
-- Two more sign-in accounts (password alpha1234, like seed.sql):
--   coach@alpha.test   Marco Coach  coach, PM manager
--   editor@alpha.test  Sara Editor  video editor, PM employee
-- Six projects across the departments, dated around today. Fixed ids and
-- "on conflict do nothing": running it again changes nothing already there.
-- The seed setter stays outside every project (supabase/tests/19 relies on it).

-- ---------------------------------------------------------------------------
-- 1. People
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('coach@alpha.test', 'coach'),
  ('editor@alpha.test', 'editor')
on conflict (email) do update set ruolo = excluded.ruolo, revocato = false;

do $$
declare
  v_utenti jsonb := jsonb_build_array(
    jsonb_build_object('id', '44444444-4444-4444-8444-444444444444', 'email', 'coach@alpha.test',  'nome', 'Marco Coach'),
    jsonb_build_object('id', '55555555-5555-4555-8555-555555555555', 'email', 'editor@alpha.test', 'nome', 'Sara Editor')
  );
  v_u jsonb;
begin
  for v_u in select * from jsonb_array_elements(v_utenti) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      (v_u ->> 'id')::uuid,
      'authenticated',
      'authenticated',
      v_u ->> 'email',
      extensions.crypt('alpha1234', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_u ->> 'nome'),
      now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      (v_u ->> 'id')::uuid,
      (v_u ->> 'id'),
      jsonb_build_object('sub', v_u ->> 'id', 'email', v_u ->> 'email', 'email_verified', true),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

update public.profiles set livello_pm = 'manager' where id = '44444444-4444-4444-8444-444444444444';
update public.profiles set livello_pm = 'employee' where id = '55555555-5555-4555-8555-555555555555';

-- ---------------------------------------------------------------------------
-- 2. Projects
--   ...001 Fitness Coaching, client path from the template, linked to a seed client
--   ...002 Fitness Coaching, client path from the template, no client link, admin outside
--   ...003 Contenuti e Video, reels of the month, with sub-tasks
--   ...004 Vendite e Marketing, with the seed closer
--   ...005 Amministrazione, completed
--   ...006 Contenuti e Video, paused
-- ---------------------------------------------------------------------------
-- A paid instalment in seed.sql already opened the automatic project of the
-- client ...001 links (one project per client, 02/10/2026): the demo path,
-- with its fixed id, takes its place.
delete from public.pm_progetti p
where p.id <> 'bbbbbbb1-0000-4000-8000-000000000001'
  and p.client_id = (
    select c.id
    from public.clients c
    join public.v_client_status s on s.client_id = c.id
    where s.stato = 'attivo'
    order by c.created_at desc, c.id
    limit 1
  )
  and not exists (select 1 from public.pm_progetti x where x.id = 'bbbbbbb1-0000-4000-8000-000000000001');

insert into public.pm_progetti (
  id, reparto_id, nome, descrizione, client_id, stato, data_inizio, data_fine, responsabile_id, created_by
)
select
  x.id::uuid,
  (select r.id from public.pm_reparti r where r.nome = x.reparto),
  x.nome,
  x.descrizione,
  x.client_id,
  x.stato::public.pm_stato_progetto,
  x.inizio,
  x.fine,
  x.responsabile::uuid,
  x.autore::uuid
from (
  select
    'bbbbbbb1-0000-4000-8000-000000000001' as id,
    'Fitness Coaching' as reparto,
    coalesce('Percorso ' || c.nome || coalesce(' ' || c.cognome, ''), 'Percorso cliente di prova') as nome,
    'Percorso di 90 giorni: onboarding, programmazione, check e rinnovo.' as descrizione,
    c.id as client_id,
    'attivo' as stato,
    public.oggi() - 40 as inizio,
    public.oggi() - 40 + 89 as fine,
    '44444444-4444-4444-8444-444444444444' as responsabile,
    '11111111-1111-4111-8111-111111111111' as autore
  from (select 1) uno
  left join lateral (
    select c.id, c.nome, c.cognome
    from public.clients c
    join public.v_client_status s on s.client_id = c.id
    where s.stato = 'attivo'
    order by c.created_at desc, c.id
    limit 1
  ) c on true
  union all
  select 'bbbbbbb1-0000-4000-8000-000000000002', 'Fitness Coaching', 'Percorso Tiziano Mele',
    'Nuovo cliente da referral, parte con il percorso di 90 giorni.', null, 'attivo',
    public.oggi() - 8, public.oggi() - 8 + 89,
    '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444'
  union all
  select 'bbbbbbb1-0000-4000-8000-000000000003', 'Contenuti e Video', 'Reel del mese',
    'Quattro reel su allenamento a corpo libero, dalla scaletta alla pubblicazione.', null, 'attivo',
    public.oggi() - 12, public.oggi() + 18,
    '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111'
  union all
  select 'bbbbbbb1-0000-4000-8000-000000000004', 'Vendite e Marketing', 'Funnel webinar di gennaio',
    'Webinar gratuito con call di vendita dopo l’evento.', null, 'attivo',
    public.oggi() - 5, public.oggi() + 60,
    '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'
  union all
  select 'bbbbbbb1-0000-4000-8000-000000000005', 'Amministrazione', 'Chiusura del trimestre',
    'Documenti per la commercialista e controllo degli abbonamenti.', null, 'completato',
    public.oggi() - 30, public.oggi() - 2,
    '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'
  union all
  select 'bbbbbbb1-0000-4000-8000-000000000006', 'Contenuti e Video', 'Libreria esercizi in video',
    'Un video breve per ogni esercizio del programma. In pausa fino a gennaio.', null, 'in_pausa',
    public.oggi() - 60, null,
    '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111'
) x
on conflict (id) do nothing;

insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
select m.progetto_id::uuid, m.profile_id::uuid, '11111111-1111-4111-8111-111111111111'
from (values
  ('bbbbbbb1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333'),
  ('bbbbbbb1-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000006', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000006', '55555555-5555-4555-8555-555555555555')
) as m(progetto_id, profile_id)
where exists (select 1 from public.pm_progetti p where p.id = m.progetto_id::uuid)
on conflict (progetto_id, profile_id) do nothing;

-- the client's path has its coach (02/10/2026): Marco, a member of it
update public.pm_progetti
set coach_id = '44444444-4444-4444-8444-444444444444'
where id = 'bbbbbbb1-0000-4000-8000-000000000001' and client_id is not null and coach_id is null;

-- ---------------------------------------------------------------------------
-- 3. The two client paths, from the dated path the "Percorso cliente"
--    template had before 02/10/2026 (written here: the template is now the 8
--    undated buckets of a client's path), the way pm_crea_progetto builds
--    them. Status follows the dates: done well before today, in progress once
--    started, one update left late on purpose.
-- ---------------------------------------------------------------------------
do $$
declare
  v_coach uuid := '44444444-4444-4444-8444-444444444444';
  v_editor uuid := '55555555-5555-4555-8555-555555555555';
  v_p record;
begin
  create temp table voci_demo (tasklist text, titolo text, descrizione text, ordine int, inizio_giorni int, durata_giorni int)
    on commit drop;
  insert into voci_demo (tasklist, titolo, ordine, inizio_giorni, durata_giorni) values
    ('Onboarding', 'Questionario iniziale e obiettivi', 1, 0, 2),
    ('Onboarding', 'Invio accessi e materiali di benvenuto', 2, 0, 2),
    ('Onboarding', 'Call di onboarding', 3, 1, 3),
    ('Onboarding', 'Scrittura programmazione', 4, 2, 5),
    ('Percorso', 'Assistenza chat', 10, 0, 90),
    ('Percorso', 'Revisione video settimanale', 11, 7, 77),
    ('Percorso', 'Call di check', 12, 14, 7),
    ('Percorso', 'Aggiornamento programmazione', 13, 28, 7),
    ('Percorso', 'Call di check di metà percorso', 14, 42, 7),
    ('Percorso', 'Aggiornamento programmazione di metà percorso', 15, 45, 7),
    ('Chiusura e rinnovo', 'Call di rinnovo', 20, 75, 7),
    ('Chiusura e rinnovo', 'Raccolta feedback e testimonianza', 21, 84, 7);

  for v_p in
    select p.id, p.data_inizio as inizio, p.created_by as autore
    from public.pm_progetti p
    where p.id in ('bbbbbbb1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000002')
  loop
    insert into public.pm_tasklist (id, progetto_id, nome, ordine, data_inizio, data_fine, created_by)
    select
      md5(v_p.id::text || '/lista/' || v.tasklist)::uuid,
      v_p.id,
      v.tasklist,
      min(v.ordine),
      v_p.inizio + min(v.inizio_giorni),
      v_p.inizio + max(v.inizio_giorni + v.durata_giorni) - 1,
      v_p.autore
    from voci_demo v
    group by v.tasklist
    on conflict (id) do nothing;

    insert into public.pm_task (
      id, progetto_id, tasklist_id, titolo, descrizione, ordine, data_inizio, scadenza,
      stato, priorita, stima_minuti, created_by
    )
    select
      md5(v_p.id::text || '/task/' || v.titolo)::uuid,
      v_p.id,
      md5(v_p.id::text || '/lista/' || v.tasklist)::uuid,
      v.titolo,
      v.descrizione,
      v.ordine,
      v_p.inizio + v.inizio_giorni,
      v_p.inizio + v.inizio_giorni + v.durata_giorni - 1,
      (case
        when v.titolo = 'Aggiornamento programmazione' and v_p.inizio + v.inizio_giorni <= public.oggi() then 'in_revisione'
        when v_p.inizio + v.inizio_giorni + v.durata_giorni - 1 < public.oggi() - 2 then 'completato'
        when v_p.inizio + v.inizio_giorni <= public.oggi() then 'in_corso'
        else 'da_fare'
      end)::public.pm_stato_task,
      (case
        when v.titolo in ('Call di onboarding', 'Scrittura programmazione') then 'alta'
        when v.titolo = 'Assistenza chat' then 'bassa'
        else 'media'
      end)::public.pm_priorita,
      case
        when v.titolo like 'Call%' then 45
        when v.titolo like '%programmazione%' then 120
        else null
      end,
      v_p.autore
    from voci_demo v
    order by v.ordine
    on conflict (id) do nothing;

    -- who works on them: the weekly video review is the coach's and the editor's together
    insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
    select md5(v_p.id::text || '/task/' || v.titolo)::uuid, x.persona, v_p.autore
    from voci_demo v
    cross join lateral unnest(
      case
        when v.titolo = 'Revisione video settimanale' then array[v_coach, v_editor]
        when v.titolo in ('Invio accessi e materiali di benvenuto', 'Raccolta feedback e testimonianza') then array[v_editor]
        else array[v_coach]
      end
    ) as x(persona)
    where exists (select 1 from public.pm_task t where t.id = md5(v_p.id::text || '/task/' || v.titolo)::uuid)
    on conflict (task_id, profile_id) do nothing;
  end loop;
end $$;

-- the first program, split into its parts
insert into public.pm_task (id, progetto_id, parent_id, titolo, ordine, stato, stima_minuti, created_by)
select
  md5('bbbbbbb1-0000-4000-8000-000000000001/sotto/' || s.titolo)::uuid,
  'bbbbbbb1-0000-4000-8000-000000000001',
  md5('bbbbbbb1-0000-4000-8000-000000000001/task/Scrittura programmazione')::uuid,
  s.titolo,
  s.ordine,
  'completato',
  s.stima,
  '44444444-4444-4444-8444-444444444444'
from (values
  ('Scheda forza A: spinta', 1, 40),
  ('Scheda forza B: trazione e gambe', 2, 40),
  ('Mobilità e riscaldamento', 3, 20)
) as s(titolo, ordine, stima)
where exists (
  select 1 from public.pm_task t
  where t.id = md5('bbbbbbb1-0000-4000-8000-000000000001/task/Scrittura programmazione')::uuid
)
on conflict (id) do nothing;

insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
select t.id, '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444'
from public.pm_task t
where t.parent_id = md5('bbbbbbb1-0000-4000-8000-000000000001/task/Scrittura programmazione')::uuid
on conflict (task_id, profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The other projects: lists and tasks written by hand
-- ---------------------------------------------------------------------------
insert into public.pm_tasklist (id, progetto_id, nome, ordine, data_inizio, data_fine, created_by)
select
  md5(l.progetto_id || '/lista/' || l.nome)::uuid,
  l.progetto_id::uuid,
  l.nome,
  l.ordine,
  l.inizio,
  l.fine,
  '11111111-1111-4111-8111-111111111111'
from (values
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pre-produzione', 1, public.oggi() - 12, public.oggi() - 1),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio', 2, public.oggi() - 3, public.oggi() + 8),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pubblicazione', 3, public.oggi() + 9, public.oggi() + 18),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Strategia', 1, public.oggi() - 5, public.oggi() + 14),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Materiali', 2, public.oggi() + 7, public.oggi() + 45),
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Chiusura', 1, public.oggi() - 30, public.oggi() - 2),
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Esercizi base', 1, public.oggi() - 60, null)
) as l(progetto_id, nome, ordine, inizio, fine)
where exists (select 1 from public.pm_progetti p where p.id = l.progetto_id::uuid)
on conflict (id) do nothing;

insert into public.pm_task (
  id, progetto_id, tasklist_id, titolo, ordine, data_inizio, scadenza, stato, priorita,
  stima_minuti, created_by
)
select
  md5(t.progetto_id || '/task/' || t.titolo)::uuid,
  t.progetto_id::uuid,
  case when t.lista is null then null else md5(t.progetto_id || '/lista/' || t.lista)::uuid end,
  t.titolo,
  t.ordine,
  t.inizio,
  t.scadenza,
  t.stato::public.pm_stato_task,
  t.priorita::public.pm_priorita,
  t.stima,
  '11111111-1111-4111-8111-111111111111'
from (values
  -- Reel del mese
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pre-produzione', 'Scaletta dei quattro reel', 1,
    public.oggi() - 12, public.oggi() - 10, 'completato', 'media', 60),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pre-produzione', 'Script: trasformazione in 90 giorni', 2,
    public.oggi() - 10, public.oggi() - 7, 'completato', 'alta', 90),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pre-produzione', 'Riprese degli esercizi a corpo libero', 3,
    public.oggi() - 6, public.oggi() - 1, 'in_corso', 'alta', 180),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio', 'Montaggio reel 1: la routine del mattino', 1,
    public.oggi() - 3, public.oggi() + 1, 'in_revisione', 'alta', 240),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio', 'Montaggio reel 2: errori comuni nelle trazioni', 2,
    public.oggi() + 1, public.oggi() + 5, 'da_fare', 'media', 240),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio', 'Copertine e miniature', 3,
    public.oggi() + 4, public.oggi() + 8, 'da_fare', 'bassa', 60),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pubblicazione', 'Calendario di pubblicazione', 1,
    public.oggi() + 9, public.oggi() + 10, 'da_fare', 'media', 30),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Pubblicazione', 'Caption e hashtag', 2,
    public.oggi() + 10, public.oggi() + 12, 'da_fare', 'bassa', 45),
  -- Funnel webinar di gennaio
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Strategia', 'Definire l’offerta del webinar', 1,
    public.oggi() - 5, public.oggi() + 3, 'in_corso', 'alta', 120),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Strategia', 'Script della call di vendita dopo il webinar', 2,
    public.oggi() + 2, public.oggi() + 14, 'da_fare', 'alta', 120),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Materiali', 'Pagina di registrazione', 1,
    public.oggi() + 7, public.oggi() + 20, 'da_fare', 'media', 180),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Materiali', 'Sequenza email di promemoria', 2,
    public.oggi() + 15, public.oggi() + 25, 'da_fare', 'media', 90),
  -- Chiusura del trimestre
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Chiusura', 'Raccolta delle fatture dei fornitori', 1,
    public.oggi() - 30, public.oggi() - 20, 'completato', 'media', 60),
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Chiusura', 'Invio dei documenti alla commercialista', 2,
    public.oggi() - 20, public.oggi() - 10, 'completato', 'alta', 30),
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Chiusura', 'Controllo degli abbonamenti software', 3,
    public.oggi() - 10, public.oggi() - 2, 'completato', 'bassa', 45),
  -- Libreria esercizi in video
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Esercizi base', 'Elenco degli esercizi da girare', 1,
    public.oggi() - 60, public.oggi() - 50, 'completato', 'media', 60),
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Esercizi base', 'Riprese degli esercizi di spinta', 2,
    null, null, 'da_fare', 'media', null),
  ('bbbbbbb1-0000-4000-8000-000000000006', null, 'Scegliere la musica di sottofondo', 3,
    null, null, 'da_fare', 'bassa', null)
) as t(progetto_id, lista, titolo, ordine, inizio, scadenza, stato, priorita, stima)
where exists (select 1 from public.pm_progetti p where p.id = t.progetto_id::uuid)
on conflict (id) do nothing;

-- who works on them: a task can have more than one person (Dany, 29/09/2026),
-- some here have two; the rest have one, three have nobody yet
insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
select md5(a.progetto_id || '/task/' || a.titolo)::uuid, a.persona::uuid, '11111111-1111-4111-8111-111111111111'
from (values
  -- Reel del mese
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Scaletta dei quattro reel', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Script: trasformazione in 90 giorni', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Riprese degli esercizi a corpo libero', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Riprese degli esercizi a corpo libero', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio reel 1: la routine del mattino', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Montaggio reel 2: errori comuni nelle trazioni', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Copertine e miniature', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Calendario di pubblicazione', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000003', 'Calendario di pubblicazione', '55555555-5555-4555-8555-555555555555'),
  -- Funnel webinar di gennaio
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Definire l’offerta del webinar', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Script della call di vendita dopo il webinar', '33333333-3333-4333-8333-333333333333'),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Script della call di vendita dopo il webinar', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000004', 'Pagina di registrazione', '11111111-1111-4111-8111-111111111111'),
  -- Chiusura del trimestre
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Raccolta delle fatture dei fornitori', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Invio dei documenti alla commercialista', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000005', 'Controllo degli abbonamenti software', '11111111-1111-4111-8111-111111111111'),
  -- Libreria esercizi in video
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Elenco degli esercizi da girare', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Riprese degli esercizi di spinta', '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbb1-0000-4000-8000-000000000006', 'Riprese degli esercizi di spinta', '44444444-4444-4444-8444-444444444444')
) as a(progetto_id, titolo, persona)
where exists (select 1 from public.pm_task t where t.id = md5(a.progetto_id || '/task/' || a.titolo)::uuid)
on conflict (task_id, profile_id) do nothing;

-- the first reel, split into its steps
insert into public.pm_task (id, progetto_id, parent_id, titolo, ordine, stato, created_by)
select
  md5('bbbbbbb1-0000-4000-8000-000000000003/sotto/' || s.titolo)::uuid,
  'bbbbbbb1-0000-4000-8000-000000000003',
  md5('bbbbbbb1-0000-4000-8000-000000000003/task/Montaggio reel 1: la routine del mattino')::uuid,
  s.titolo,
  s.ordine,
  s.stato::public.pm_stato_task,
  '55555555-5555-4555-8555-555555555555'
from (values
  ('Taglio e ritmo', 1, 'completato'),
  ('Sottotitoli', 2, 'completato'),
  ('Musica e mix audio', 3, 'in_corso')
) as s(titolo, ordine, stato)
where exists (
  select 1 from public.pm_task t
  where t.id = md5('bbbbbbb1-0000-4000-8000-000000000003/task/Montaggio reel 1: la routine del mattino')::uuid
)
on conflict (id) do nothing;

insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
select t.id, '55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555'
from public.pm_task t
where t.parent_id = md5('bbbbbbb1-0000-4000-8000-000000000003/task/Montaggio reel 1: la routine del mattino')::uuid
on conflict (task_id, profile_id) do nothing;
