-- Marketing area demo data (1.32.0). Invented people and contents only.
-- One more sign-in account (password alpha1234, like seed.sql):
--   marketing@alpha.test  Giulia Marketing  marketing, PM employee, member of
--                         the reels project (Contenuti e Video)
-- Twelve contents of the calendar around today: every Status, two on the same
-- day, one without Post Date, two carousels, one posted with its URL and View
-- Count. Fixed ids and "on conflict do nothing": running it again changes
-- nothing already there. Before 30_tutorial.sql, so the tour stays closed for
-- this account too.
-- The id 66666666-... is taken by supabase/tests/02_setter_daily_reports.sql.

-- ---------------------------------------------------------------------------
-- 1. The account
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('marketing@alpha.test', 'marketing')
on conflict (email) do update set ruolo = excluded.ruolo, revocato = false;

do $$
declare
  v_utenti jsonb := jsonb_build_array(
    jsonb_build_object('id', '61616161-6161-4161-8161-616161616161', 'email', 'marketing@alpha.test', 'nome', 'Giulia Marketing')
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

-- ---------------------------------------------------------------------------
-- 2. Member of the reels project (10_progetti.sql, Contenuti e Video)
-- ---------------------------------------------------------------------------
insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
select 'bbbbbbb1-0000-4000-8000-000000000003'::uuid,
       '61616161-6161-4161-8161-616161616161'::uuid,
       '11111111-1111-4111-8111-111111111111'::uuid
where exists (select 1 from public.pm_progetti p where p.id = 'bbbbbbb1-0000-4000-8000-000000000003')
  and exists (select 1 from public.profiles p where p.id = '61616161-6161-4161-8161-616161616161')
on conflict (progetto_id, profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Twelve contents (Reel Topic and Carousel Topic), dated around today
-- ---------------------------------------------------------------------------
insert into public.marketing_contenuti (
  id, tipo, nome, reel_type, formato, inspiration, stato, post_date, audio, url, view_count,
  messaggio, bozza, commenti, finale, created_by
)
select
  x.id::uuid, x.tipo::public.contenuto_tipo, x.nome,
  x.reel_type::public.contenuto_reel_type, x.formato::public.contenuto_format,
  x.inspiration, x.stato::public.contenuto_status,
  public.oggi() + x.giorni, x.audio, x.url, x.view_count,
  x.messaggio, x.bozza, x.commenti, x.finale,
  '11111111-1111-4111-8111-111111111111'::uuid
from (values
  ('ccccccc1-0000-4000-8000-000000000001', 'reel', 'Trazioni senza sbarra: tre alternative con quello che hai in casa',
   'education', 'raw_talking_head', 'https://www.instagram.com/reel/IspiraDemo1/', 'posted', -12,
   'Audio originale', 'https://www.instagram.com/reel/SeedDemo01/', 12480,
   'Non serve una sbarra per allenare la schiena: bastano un tavolo robusto, un asciugamano e una porta.',
   E'Hook: Niente sbarra? Nessun problema.\nLine: Il tavolo: rematore inverso, petto sotto il bordo.\nLine: L''asciugamano nella porta: tirata isometrica.\nLine: Lo zaino carico: rematore a un braccio.\nCTA: Salva il video e provalo stasera.',
   E'Accorciare la parte sul tavolo.\nAggiungere i sottotitoli.',
   E'Hook: Niente sbarra? Nessun problema.\n\nLine: Il tavolo di casa diventa una sbarra: rematore inverso, petto sotto il bordo, corpo dritto.\nLine: Un asciugamano chiuso nella porta: tiri per dieci secondi, riposi, ripeti.\nLine: Lo zaino con i libri: rematore a un braccio, schiena piatta.\n\nCTA: Salva il video e provalo stasera.'),
  ('ccccccc1-0000-4000-8000-000000000002', 'reel', 'Tre errori negli addominali che rallentano i risultati',
   'attraction', 'split', null, 'posted', -9,
   null, null, null,
   'Gli addominali si vedono quando si scende di grasso, non con mille crunch.',
   E'Hook: Fai mille crunch e non vedi niente?\nLine: Errore 1: solo crunch.\nLine: Errore 2: niente progressione.\nLine:\nCTA: Scrivimi ADDOMINALI.',
   null, null),
  ('ccccccc1-0000-4000-8000-000000000003', 'carousel', 'Allenarsi a casa dopo i 30: la settimana tipo',
   'education', null, 'https://www.instagram.com/p/IspiraDemo3/', 'posted', -6,
   null, null, null,
   'Tre allenamenti da 40 minuti bastano, se sono fatti bene.',
   E'Slide 1: Allenarsi a casa dopo i 30\nSlide 2: Lunedì, spinta\nSlide 3: Mercoledì, trazione\nSlide 4: Venerdì, gambe\nSlide 5: Salva e condividi',
   null,
   'La settimana tipo che uso con chi lavora tutto il giorno: tre allenamenti, zero attrezzi.'),
  ('ccccccc1-0000-4000-8000-000000000004', 'reel', 'Piegamenti: dalla versione sulle ginocchia al primo vero piegamento',
   'converting', 'transformation', null, 'to_be_posted', -1,
   'Trend della settimana', null, null,
   'Il primo piegamento vero arriva in quattro settimane, se si parte dal gradino giusto.',
   E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000005', 'reel', 'Cosa mangiare la sera senza rovinare la giornata',
   'education', 'green_screen', 'https://www.instagram.com/reel/IspiraDemo5/', 'to_be_edited', 0,
   null, null, null,
   'La cena non è il problema: è la somma della giornata.',
   E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000006', 'reel', 'Plank fatto bene: i tre dettagli che nessuno guarda',
   'radio', 'reaction', null, 'to_be_recorded', 0,
   null, null, null,
   null, E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000007', 'reel', 'Squat a corpo libero: quanto scendere davvero',
   'education', 'b_roll', null, 'to_be_recorded', 3,
   null, null, null,
   null, E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000008', 'carousel', 'Cinque abitudini che contano più dell''allenamento',
   'attraction', null, null, 'to_be_edited', 5,
   null, null, null,
   'Sonno, passi, proteine, acqua, costanza.',
   null, null, null),
  ('ccccccc1-0000-4000-8000-000000000009', 'reel', 'Storia di un allievo: dalla scrivania alla prima trazione',
   'converting', 'storytelling', null, 'not_started', 8,
   null, null, null,
   null, E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000010', 'reel', 'Workshop: la routine del mattino in dieci minuti',
   'workshop', 'show_and_tell', null, 'not_started', 12,
   null, null, null,
   null, E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000011', 'reel', 'Opinione: gli integratori non servono a chi inizia',
   'radio', 'text_opinion', null, 'canceled', -4,
   null, null, null,
   'Sostituito dal reel sulle abitudini.', E'Hook:\nLine:\nLine:\n…\nCTA:', null, null),
  ('ccccccc1-0000-4000-8000-000000000012', 'reel', 'Idea: stretching dopo una giornata in macchina',
   null, null, null, 'not_started', null,
   null, null, null,
   null, E'Hook:\nLine:\nLine:\n…\nCTA:', null, null)
) as x(id, tipo, nome, reel_type, formato, inspiration, stato, giorni, audio, url, view_count,
       messaggio, bozza, commenti, finale)
on conflict (id) do nothing;
