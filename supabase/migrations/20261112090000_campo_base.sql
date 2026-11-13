-- The client's home base (1.83.0, CLAUDE.md section 34, «Campo base del cliente»; Dany, 13/11/2026: the
-- dashboard of Notion and the Aula of Skool in one place, the history of the check-ups with the coach, the
-- goals timeline stays on Coach Plus, the community on Telegram).
--
-- * contenuti_blocchi: three new pages of the CMS (home, regole, community), seeded with Dany's own copy of the
--   Notion dashboard (no client data).
-- * aula_moduli, aula_lezioni: the library of the Aula (the admin writes it, like the CMS); aula_progressi: what
--   a client completed and the seconds of a video lesson seen (the same rules as video_progresso).
-- * clienti_checkup: the check-up calls with the coach (day, Fathom link, topic, recap, tasks for the next call);
--   clienti_checkup_appunti: the notes of the team on a check-up, apart, never to the client.
-- * The bucket «aula-copertine»: public, the admin writes the covers of the modules.
-- * The functions: of the client (campo_base_cliente, aula_lezione_completa, aula_video_progresso, each
--   starting from cliente_corrente()), of the team (campo_base_vede, campo_base_team, checkup_salva,
--   checkup_elimina: the admin, who is in charge of the client's onboarding, the coach of his project; never an
--   OAuth token), and internal ones without grants.
-- * The backup skips the notes (like the questionnaire); the deletion of a client says the check-ups.
--
-- Who reads what (Dany, 13/11/2026): the client sees of his calls the day, the topic, the recap, the tasks and
-- the Fathom link, never the notes; the admin, the people in charge of his onboarding (coach, reviewer,
-- responsible) and the coach of his project read and write all of it. No count or comparison per
-- collaborator (section 17): a check-up keeps who held it, never a list by person.

-- ---------------------------------------------------------------------------
-- 1. The CMS: three new pages
-- ---------------------------------------------------------------------------
alter table public.contenuti_blocchi drop constraint contenuti_blocchi_pagina_check;
alter table public.contenuti_blocchi
  add constraint contenuti_blocchi_pagina_check check (pagina in ('passo', 'dopo_lancio', 'home', 'regole', 'community'));

comment on table public.contenuti_blocchi is
  'The minimal CMS (1.79.0): the blocks of the client''s pages (a step of a version of the flow, the page after the launch, and from 1.83.0 the tabs Home, Regole and Community of the home base), in order. The admin writes them; the client receives the published ones only from percorso_cliente() and campo_base_cliente().';

-- Dany's own copy of the Notion dashboard (13/11/2026): texts of the brand, not of a client
insert into public.contenuti_blocchi (versione_flusso, pagina, ordine, tipo, titolo, corpo)
values
  (1, 'home', 1, 'testo', 'Benvenuto a bordo, [Nome]',
   E'Questo sarà il tuo campo base durante tutto il percorso. Un luogo che ti aiuterà ad avere sempre tutto in ordine e chiari i prossimi passi.\n\nBuon lavoro,\nDany'),
  (1, 'home', 2, 'avviso', 'Assistenza chat e call',
   E'Per prenotare la call di checkup con il tuo coach ti mandiamo ogni 2 settimane un link in chat su Telegram.\n\nIl supporto in chat è disponibile 24 ore su 24, con risposta fuori dagli orari di lavoro solo per le urgenze.\n\n**Orari**: lunedì - sabato, 8.00 - 16.00'),
  (1, 'home', 3, 'voce', 'Non negoziabile: compila il questionario giornaliero su Coach Plus', null),
  (1, 'home', 4, 'voce', 'Traccia quello che mangi per una settimana al mese', 'Segui la guida «Come tracciare quello che mangi» nell''Aula.'),
  (1, 'home', 5, 'voce', 'Traccia il peso una volta a settimana su Coach Plus', null),
  (1, 'home', 6, 'voce', 'Carica le foto del fisico una volta al mese', 'Segui la guida «Come fare le foto al tuo fisico» nell''Aula.'),
  (1, 'community', 1, 'testo', 'La community su Telegram',
   E'La community di Percorso Alpha vive su Telegram: lì trovi gli altri allievi, gli annunci e le sfide del mese.\n\nNel tuo gruppo privato parli con il tuo coach.');

-- ---------------------------------------------------------------------------
-- 2. The Aula
-- ---------------------------------------------------------------------------
create table public.aula_moduli (
  id uuid primary key default gen_random_uuid(),
  titolo text not null check (char_length(btrim(titolo)) between 1 and 120),
  descrizione text check (char_length(descrizione) <= 500),
  -- a cover in the bucket «aula-copertine» (or any https image the admin pastes)
  copertina_url text check (copertina_url ~ '^https://' and char_length(copertina_url) <= 500),
  -- without a cover: an icon of a closed list on the brand's gradient
  icona text not null default 'libro'
    check (icona in ('libro', 'mappa', 'carrello', 'forchetta', 'telefono', 'video', 'fotocamera', 'cervello', 'manubrio', 'fiamma', 'stella', 'chiave')),
  ordine integer not null default 0,
  -- bozza: never to the client; pubblicato: open; prossimamente: shown, locked; bloccato: shown with the padlock
  stato text not null default 'bozza' check (stato in ('bozza', 'pubblicato', 'prossimamente', 'bloccato')),
  -- open during the onboarding too (the others open after the launch)
  durante_onboarding boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aula_moduli_ordine_idx on public.aula_moduli (ordine, created_at);

create table public.aula_lezioni (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.aula_moduli (id) on delete cascade,
  titolo text not null check (char_length(btrim(titolo)) between 1 and 120),
  ordine integer not null default 0,
  tipo text not null check (tipo in ('video', 'testo', 'pdf', 'link')),
  -- Markdown: the text of a lesson, or the words under a video, a PDF or a link
  corpo text check (char_length(corpo) <= 20000),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  url text check (url ~ '^https://' and char_length(url) <= 500),
  obbligatoria boolean not null default false,
  pubblicata boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aula_lezioni_video check (tipo <> 'video' or youtube_id is not null),
  constraint aula_lezioni_url check (tipo not in ('pdf', 'link') or url is not null)
);
create index aula_lezioni_modulo_idx on public.aula_lezioni (modulo_id, ordine, created_at);

create table public.aula_progressi (
  client_id uuid not null references public.clients (id) on delete cascade,
  lezione_id uuid not null references public.aula_lezioni (id) on delete cascade,
  -- a video lesson: its length and a bit per second seen (the rules of video_progresso)
  durata integer check (durata between 30 and 10800),
  visti varbit,
  completata_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, lezione_id),
  constraint aula_progressi_video check ((durata is null) = (visti is null) and (visti is null or length(visti) = durata))
);

comment on table public.aula_moduli is
  'The modules of the Aula of the home base (1.83.0): the admin writes them; the client receives them only from campo_base_cliente() (never a draft), the team from campo_base_team().';
comment on table public.aula_lezioni is
  'The lessons of a module of the Aula (1.83.0): a video (seen at 90%), a text, a PDF or a link (completed with a tap).';
comment on table public.aula_progressi is
  'What a client completed in the Aula and the seconds of a video lesson seen (1.83.0). Written only by aula_lezione_completa and aula_video_progresso; the admin reads it.';

create trigger aula_moduli_set_updated_at before update on public.aula_moduli
  for each row execute function public.set_updated_at();
create trigger aula_lezioni_set_updated_at before update on public.aula_lezioni
  for each row execute function public.set_updated_at();
create trigger aula_progressi_set_updated_at before update on public.aula_progressi
  for each row execute function public.set_updated_at();

alter table public.aula_moduli enable row level security;
alter table public.aula_lezioni enable row level security;
alter table public.aula_progressi enable row level security;

create policy aula_moduli_admin on public.aula_moduli
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aula_moduli_mai_da_oauth on public.aula_moduli
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

create policy aula_lezioni_admin on public.aula_lezioni
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aula_lezioni_mai_da_oauth on public.aula_lezioni
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

create policy aula_progressi_admin_lettura on public.aula_progressi
  for select to authenticated using ((select public.is_admin()));
create policy aula_progressi_mai_da_oauth on public.aula_progressi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.aula_moduli, public.aula_lezioni, public.aula_progressi from anon;
revoke all on public.aula_progressi from authenticated;
grant select on public.aula_progressi to authenticated;

-- Dany's resources of the Notion dashboard, as drafts with their names only: he writes the lessons
insert into public.aula_moduli (titolo, descrizione, icona, ordine, stato, durante_onboarding, created_by)
values
  ('Attrezzatura da comprare', 'Cosa ti serve per allenarti a casa, e cosa no.', 'carrello', 1, 'bozza', true, null),
  ('Come tracciare quello che mangi', 'La settimana al mese in cui tracci tutto, passo per passo.', 'forchetta', 2, 'bozza', true, null),
  ('Come utilizzare Coach Plus', 'L''app dei tuoi allenamenti: questionari, peso, video e progressi.', 'telefono', 3, 'bozza', true, null),
  ('Come registrare gli allenamenti', 'Come riprenderti perché il coach veda la tecnica.', 'video', 4, 'bozza', true, null),
  ('Come fare le foto al tuo fisico', 'Luce, posizioni e frequenza delle foto dei progressi.', 'fotocamera', 5, 'bozza', true, null),
  ('Modulo Mindset', 'In arrivo.', 'cervello', 6, 'bozza', false, null);

-- ---------------------------------------------------------------------------
-- 3. The cover of a module: a public bucket, the admin writes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aula-copertine', 'aula-copertine', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy aula_copertine_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'aula-copertine' and (select public.is_admin()));
create policy aula_copertine_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'aula-copertine' and (select public.is_admin()))
  with check (bucket_id = 'aula-copertine' and (select public.is_admin()));
create policy aula_copertine_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'aula-copertine' and (select public.is_admin()));
create policy aula_copertine_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'aula-copertine' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. The check-ups
-- ---------------------------------------------------------------------------
-- the tasks for the next call: an array of 0-20 non-empty texts of at most 300 characters
create function public.checkup_compiti_validi(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
    and jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 20
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 300
    );
$$;
revoke all on function public.checkup_compiti_validi(jsonb) from public, anon, authenticated;

create table public.clienti_checkup (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  giorno date not null,
  -- who held the call (kept, never listed by person)
  coach_id uuid references public.profiles (id) on delete set null,
  fathom_url text check (fathom_url ~ '^https://fathom\.video/' and char_length(fathom_url) <= 500),
  argomento text check (char_length(argomento) <= 200),
  -- Markdown: «Nome, grazie della call, oggi abbiamo parlato di…»
  resoconto text check (char_length(resoconto) <= 8000),
  compiti jsonb not null default '[]'::jsonb check (public.checkup_compiti_validi(compiti)),
  -- the checkpoint call of the onboarding this is the recap of
  call_id uuid references public.clienti_call (id) on delete set null,
  -- the page of Notion it was imported from (scripts/import-checkup-notion.ts): one import only
  notion_rif text unique check (char_length(notion_rif) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clienti_checkup_cliente_idx on public.clienti_checkup (client_id, giorno desc);
create unique index clienti_checkup_call on public.clienti_checkup (call_id) where call_id is not null;

create table public.clienti_checkup_appunti (
  checkup_id uuid primary key references public.clienti_checkup (id) on delete cascade,
  testo text not null check (char_length(testo) <= 30000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clienti_checkup is
  'The check-up calls of a client with his coach (1.83.0): day, Fathom link, topic, recap and tasks for the next call. The client reads them from campo_base_cliente(); the team from campo_base_team(); written only by checkup_salva and checkup_elimina (and the import).';
comment on table public.clienti_checkup_appunti is
  'The notes of the team on a check-up (1.83.0): never to the client, never in the email backup, an email, a notification, the log, Alfire or Claude. Read only by the admin (RLS) and from campo_base_team().';

create trigger clienti_checkup_set_updated_at before update on public.clienti_checkup
  for each row execute function public.set_updated_at();
create trigger clienti_checkup_appunti_set_updated_at before update on public.clienti_checkup_appunti
  for each row execute function public.set_updated_at();

alter table public.clienti_checkup enable row level security;
alter table public.clienti_checkup_appunti enable row level security;

create policy clienti_checkup_admin_lettura on public.clienti_checkup
  for select to authenticated using ((select public.is_admin()));
create policy clienti_checkup_mai_da_oauth on public.clienti_checkup
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy clienti_checkup_appunti_admin_lettura on public.clienti_checkup_appunti
  for select to authenticated using ((select public.is_admin()));
create policy clienti_checkup_appunti_mai_da_oauth on public.clienti_checkup_appunti
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_checkup, public.clienti_checkup_appunti from anon, authenticated;
grant select on public.clienti_checkup, public.clienti_checkup_appunti to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Who is the team of a client
-- ---------------------------------------------------------------------------
-- The admin, a person in charge of his registered onboarding, the coach of his project; never an OAuth token.
create function public.campo_base_vede(p_client_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.da_client_oauth() or (select auth.uid()) is null or p_client_id is null then
    return false;
  end if;
  return public.is_admin()
    or public.onboarding_incaricato(p_client_id)
    or (public.pm_coach_del_cliente(p_client_id) and public.pm_livello_corrente() is not null);
end;
$$;

comment on function public.campo_base_vede(uuid) is
  'True when the caller is the team of this client for the home base (1.83.0): the admin, a person in charge of his registered onboarding, or the coach of his project, with an active account; false for an OAuth token. Answers only about the caller.';

revoke all on function public.campo_base_vede(uuid) from public, anon;
grant execute on function public.campo_base_vede(uuid) to authenticated;

-- paused for the team (not the admin): the path or the account suspended
create function public.campo_base_in_pausa(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.stato = 'sospeso')
      or exists (select 1 from public.clienti_account a where a.client_id = p_client_id and a.stato = 'sospeso');
$$;
revoke all on function public.campo_base_in_pausa(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The document of the home base: one internal function for the client and the team
-- ---------------------------------------------------------------------------
create function public.campo_base_di(p_client_id uuid, p_team boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_versione integer;
  v_lanciato boolean;
  v_imp public.onboarding_impostazioni;
  v_coach jsonb;
  v_prossima jsonb;
  v_aula jsonb;
  v_checkup jsonb;
  v_home jsonb;
  v_regole jsonb;
  v_regole_passo jsonb;
  v_community jsonb;
  v_gruppo text;
begin
  select coalesce(max(p.versione_flusso), 1) into v_versione from public.onboarding_percorsi p where p.client_id = p_client_id;
  v_lanciato := exists (
      select 1 from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'programma' and s.stato = 'fatto'
    ) or exists (select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.stato = 'completato');
  select * into v_imp from public.onboarding_impostazioni;

  -- the blocks of a page of the home base (no video counts here: a video is shown, never recorded)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'titolo', b.titolo, 'corpo', b.corpo,
           'youtube_id', b.youtube_id, 'url', b.url, 'obbligatorio', b.obbligatorio
         ) order by b.ordine, b.created_at) filter (where b.pagina = 'home'), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'titolo', b.titolo, 'corpo', b.corpo,
           'youtube_id', b.youtube_id, 'url', b.url, 'obbligatorio', b.obbligatorio
         ) order by b.ordine, b.created_at) filter (where b.pagina = 'regole'), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'titolo', b.titolo, 'corpo', b.corpo,
           'youtube_id', b.youtube_id, 'url', b.url, 'obbligatorio', b.obbligatorio
         ) order by b.ordine, b.created_at) filter (where b.pagina = 'community'), '[]'::jsonb)
    into v_home, v_regole, v_community
  from public.contenuti_blocchi b
  where b.versione_flusso = v_versione and b.pagina in ('home', 'regole', 'community') and b.pubblicato;

  -- the rules the client accepted in the onboarding: all in one place
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'titolo', b.titolo, 'corpo', b.corpo,
           'youtube_id', b.youtube_id, 'url', b.url, 'obbligatorio', b.obbligatorio
         ) order by b.ordine, b.created_at), '[]'::jsonb)
    into v_regole_passo
  from public.contenuti_blocchi b
  where b.versione_flusso = v_versione and b.pagina = 'passo' and b.passo = 'regole' and b.pubblicato and b.tipo = 'regola';

  -- the reference coach: the coach of the onboarding, else the coach of the project (name, photo and role only)
  select jsonb_build_object('nome', pr.nome, 'foto_url', pr.foto_url, 'ruolo', 'Fitness Coach')
    into v_coach
  from public.profiles pr
  where pr.id = coalesce(
          (select i.coach_id from public.onboarding_incarichi i where i.client_id = p_client_id),
          (select g.coach_id from public.pm_progetti g where g.client_id = p_client_id limit 1)
        )
    and pr.attivo;

  -- the next call booked with the team (the onboarding call or a checkpoint)
  select jsonb_build_object(
           'tipo', c.tipo,
           'giorno', (c.inizio at time zone 'Europe/Rome')::date,
           'ora', to_char(c.inizio at time zone 'Europe/Rome', 'HH24:MI'),
           'inizio', c.inizio,
           'meet_url', c.meet_url
         )
    into v_prossima
  from public.clienti_call c
  where c.client_id = p_client_id and c.stato = 'prenotata' and c.inizio > now() - interval '1 hour'
  order by c.inizio
  limit 1;

  select t.gruppo_privato_url into v_gruppo from public.clienti_telegram t where t.client_id = p_client_id;

  -- the Aula: never a draft; a module opens when published and (launched, or open during the onboarding);
  -- the content of a lesson only in an open module
  select coalesce(jsonb_agg(m.doc order by m.ordine, m.created_at), '[]'::jsonb)
    into v_aula
  from (
    select mo.ordine, mo.created_at,
           jsonb_build_object(
             'id', mo.id,
             'titolo', mo.titolo,
             'descrizione', mo.descrizione,
             'copertina_url', mo.copertina_url,
             'icona', mo.icona,
             'stato', mo.stato,
             'durante_onboarding', mo.durante_onboarding,
             'aperto', mo.stato = 'pubblicato' and (v_lanciato or mo.durante_onboarding),
             'lezioni_totali', (select count(*) from public.aula_lezioni l where l.modulo_id = mo.id and l.pubblicata),
             'lezioni_completate', (
               select count(*) from public.aula_lezioni l
               join public.aula_progressi g on g.lezione_id = l.id and g.client_id = p_client_id
               where l.modulo_id = mo.id and l.pubblicata and g.completata_il is not null),
             'lezioni', (
               select coalesce(jsonb_agg(
                        jsonb_build_object(
                          'id', l.id,
                          'titolo', l.titolo,
                          'tipo', l.tipo,
                          'obbligatoria', l.obbligatoria,
                          'completata_il', g.completata_il,
                          'percentuale', case when g.durata is null then 0
                                              else round(bit_count(g.visti)::numeric * 100 / g.durata, 2) end
                        )
                        || case when mo.stato = 'pubblicato' and (v_lanciato or mo.durante_onboarding or p_team)
                             then jsonb_build_object('corpo', l.corpo, 'youtube_id', l.youtube_id, 'url', l.url)
                             else '{}'::jsonb end
                        order by l.ordine, l.created_at), '[]'::jsonb)
               from public.aula_lezioni l
               left join public.aula_progressi g on g.lezione_id = l.id and g.client_id = p_client_id
               where l.modulo_id = mo.id and l.pubblicata)
           ) as doc
    from public.aula_moduli mo
    where mo.stato <> 'bozza'
  ) m;

  -- the check-ups, the most recent first; the team reads the notes too
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', k.id,
             'giorno', k.giorno,
             'argomento', k.argomento,
             'resoconto', k.resoconto,
             'compiti', k.compiti,
             'fathom_url', k.fathom_url
           )
           || case when p_team then jsonb_build_object(
                'appunti', (select a.testo from public.clienti_checkup_appunti a where a.checkup_id = k.id),
                'coach', (select pr.nome from public.profiles pr where pr.id = k.coach_id),
                'call_id', k.call_id,
                'importato', k.notion_rif is not null)
              else '{}'::jsonb end
           order by k.giorno desc, k.created_at desc), '[]'::jsonb)
    into v_checkup
  from public.clienti_checkup k
  where k.client_id = p_client_id;

  return jsonb_build_object(
    'nome', public.onboarding_nome_cliente(p_client_id),
    'lanciato', v_lanciato,
    'home', v_home,
    'regole', v_regole,
    'regole_percorso', v_regole_passo,
    'community', v_community,
    'link_community', v_imp.link_community,
    'gruppo_privato_url', v_gruppo,
    'coach', v_coach,
    'prossima_call', v_prossima,
    'aula', v_aula,
    'checkup', v_checkup
  );
end;
$$;
revoke all on function public.campo_base_di(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The client's functions
-- ---------------------------------------------------------------------------
create function public.campo_base_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  return public.campo_base_di(v_cliente, false);
end;
$$;

comment on function public.campo_base_cliente() is
  'The home base of the client (1.83.0): { nome, lanciato, home, regole, regole_percorso, community (blocks), link_community, gruppo_privato_url, coach { nome, foto_url, ruolo }, prossima_call, aula [{ id, titolo, descrizione, copertina_url, icona, stato, durante_onboarding, aperto, lezioni_totali, lezioni_completate, lezioni [{ id, titolo, tipo, obbligatoria, completata_il, percentuale, corpo, youtube_id, url (open modules only) }] }], checkup [{ id, giorno, argomento, resoconto, compiti, fathom_url }] }. Never the notes of the team. Only the caller''s own client (cliente_corrente(), else 42501).';

revoke all on function public.campo_base_cliente() from public, anon;
grant execute on function public.campo_base_cliente() to authenticated;

-- the open lesson of a published module the client may open, locked for update
create function public.aula_lezione_aperta(p_cliente uuid, p_lezione uuid)
returns public.aula_lezioni
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.aula_lezioni;
  v_ok boolean;
begin
  select x.* into l
  from public.aula_lezioni x
  join public.aula_moduli m on m.id = x.modulo_id
  where x.id = p_lezione and x.pubblicata and m.stato = 'pubblicato'
    and (m.durante_onboarding
         or exists (select 1 from public.onboarding_passi s where s.client_id = p_cliente and s.passo = 'programma' and s.stato = 'fatto')
         or exists (select 1 from public.onboarding_percorsi p where p.client_id = p_cliente and p.stato = 'completato'));
  v_ok := found;
  if not v_ok then
    raise exception 'Questa lezione non è ancora disponibile.' using errcode = '22023';
  end if;
  return l;
end;
$$;
revoke all on function public.aula_lezione_aperta(uuid, uuid) from public, anon, authenticated;

create function public.aula_lezione_completa(p_lezione uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  l public.aula_lezioni;
  v_quando timestamptz;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  l := public.aula_lezione_aperta(v_cliente, p_lezione);
  if l.tipo = 'video' then
    raise exception 'Questa lezione si completa guardando il video.' using errcode = '22023';
  end if;
  insert into public.aula_progressi (client_id, lezione_id, completata_il)
  values (v_cliente, l.id, now())
  on conflict (client_id, lezione_id) do update
    set completata_il = coalesce(aula_progressi.completata_il, excluded.completata_il)
  returning completata_il into v_quando;
  return jsonb_build_object('completata_il', v_quando);
end;
$$;

comment on function public.aula_lezione_completa(uuid) is
  '«Segna come completata» on a lesson of the Aula that is not a video (1.83.0): the client''s own (cliente_corrente(), else 42501), only in an open module (22023).';

revoke all on function public.aula_lezione_completa(uuid) from public, anon;
grant execute on function public.aula_lezione_completa(uuid) to authenticated;

create function public.aula_video_progresso(p_lezione uuid, p_durata integer, p_intervalli int4range[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  l public.aula_lezioni;
  r public.aula_progressi;
  v_durata integer;
  v_bit varbit;
  v_int int4range;
  v_da integer;
  v_a integer;
  v_percentuale numeric;
  v_dal timestamptz;
  v_quando timestamptz;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  l := public.aula_lezione_aperta(v_cliente, p_lezione);
  if l.tipo <> 'video' then
    raise exception 'Video non valido' using errcode = '22023';
  end if;
  if p_intervalli is null or cardinality(p_intervalli) > 50 then
    raise exception 'Intervalli non validi' using errcode = '22023';
  end if;

  select * into r from public.aula_progressi g where g.client_id = v_cliente and g.lezione_id = l.id for update;
  if found and r.durata is not null then
    v_durata := r.durata;
    v_bit := r.visti;
    v_dal := r.created_at;
  else
    -- the rules of video_progresso: the length is the player's, at least 30 seconds, and the seconds never run
    -- ahead of the clock
    if p_durata is null or p_durata not between 30 and 10800 then
      raise exception 'Durata non valida' using errcode = '22023';
    end if;
    v_durata := p_durata;
    v_bit := repeat('0', v_durata)::varbit;
    v_dal := coalesce(r.created_at, now());
  end if;

  foreach v_int in array p_intervalli loop
    if v_int is null or isempty(v_int) or lower_inf(v_int) or upper_inf(v_int) then
      raise exception 'Intervalli non validi' using errcode = '22023';
    end if;
    v_da := lower(v_int);
    v_a := upper(v_int);
    if v_da < 0 or v_da >= v_durata or v_a > v_durata + 2 then
      raise exception 'Intervalli non validi' using errcode = '22023';
    end if;
    v_a := least(v_a, v_durata);
    v_bit := v_bit | (repeat('0', v_da) || repeat('1', v_a - v_da) || repeat('0', v_durata - v_a))::varbit;
  end loop;

  if bit_count(v_bit) > 2 * extract(epoch from now() - v_dal) + 30 then
    raise exception 'Intervalli non validi' using errcode = '22023';
  end if;

  v_percentuale := round(bit_count(v_bit)::numeric * 100 / v_durata, 2);

  insert into public.aula_progressi (client_id, lezione_id, durata, visti, completata_il)
  values (v_cliente, l.id, v_durata, v_bit, case when v_percentuale >= 90 then now() end)
  on conflict (client_id, lezione_id) do update
    set durata = excluded.durata,
        visti = excluded.visti,
        completata_il = coalesce(aula_progressi.completata_il, excluded.completata_il)
  returning completata_il into v_quando;

  return jsonb_build_object('percentuale', v_percentuale, 'visto', v_quando is not null);
end;
$$;

comment on function public.aula_video_progresso(uuid, integer, int4range[]) is
  'The seconds of a video lesson of the Aula seen by the client (1.83.0), with the rules of video_progresso; the lesson is completed at 90%. The client''s own (42501), only in an open module (22023).';

revoke all on function public.aula_video_progresso(uuid, integer, int4range[]) from public, anon;
grant execute on function public.aula_video_progresso(uuid, integer, int4range[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The team's functions
-- ---------------------------------------------------------------------------
create function public.campo_base_team(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.clients;
begin
  if not public.campo_base_vede(p_client_id) then
    raise exception 'Questo cliente non è tra i tuoi.' using errcode = '42501';
  end if;
  select * into c from public.clients x where x.id = p_client_id;
  if c.id is null then
    raise exception 'Questo cliente non è tra i tuoi.' using errcode = '42501';
  end if;
  -- paused: for the team only the name and «In pausa», never why (the admin reads everything)
  if not public.is_admin() and public.campo_base_in_pausa(p_client_id) then
    return jsonb_build_object('nome', c.nome, 'cognome', c.cognome, 'in_pausa', true);
  end if;
  return public.campo_base_di(p_client_id, true)
    || jsonb_build_object(
         'nome', c.nome,
         'cognome', c.cognome,
         'in_pausa', false,
         'registrato', exists (select 1 from public.clienti_account a where a.client_id = p_client_id),
         -- the videos of the Aula seen, by lesson (the onboarding's are in onboarding_scheda_incaricato)
         'onboarding', exists (select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.giorno_zero is not null),
         'call_checkpoint', (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'id', k.id,
                    'giorno', (k.inizio at time zone 'Europe/Rome')::date,
                    'ora', to_char(k.inizio at time zone 'Europe/Rome', 'HH24:MI')
                  ) order by k.inizio desc), '[]'::jsonb)
           from public.clienti_call k
           where k.client_id = p_client_id and k.tipo = 'checkpoint' and k.stato = 'svolta'
             and not exists (select 1 from public.clienti_checkup x where x.call_id = k.id))
       );
end;
$$;

comment on function public.campo_base_team(uuid) is
  'The home base of a client for his team (1.83.0): campo_base_di with the notes of the check-ups, who held them, plus nome, cognome, in_pausa, registrato, onboarding and call_checkpoint (the checkpoints done without a recap). The admin, a person in charge of his registered onboarding, the coach of his project (campo_base_vede, else 42501); paused, the team reads only the name.';

revoke all on function public.campo_base_team(uuid) from public, anon;
grant execute on function public.campo_base_team(uuid) to authenticated;

-- the guard of the team's writes: campo_base_vede and not paused
create function public.campo_base_guardia(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.campo_base_vede(p_client_id) then
    raise exception 'Il resoconto delle call lo scrivono l''admin e il team del cliente.' using errcode = '42501';
  end if;
  if public.campo_base_in_pausa(p_client_id) then
    raise exception 'L''onboarding di questo cliente è in pausa.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.campo_base_guardia(uuid) from public, anon, authenticated;

-- A check-up written or corrected: { giorno, fathom_url, argomento, resoconto, compiti, appunti, call_id }.
-- p_id null: a new one. A key absent from p_dati keeps the saved value; null empties it.
create function public.checkup_salva(p_client_id uuid, p_id uuid, p_dati jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.clienti_checkup;
  v_id uuid;
  v_giorno date;
  v_url text;
  v_compiti jsonb;
  v_call uuid;
begin
  perform public.campo_base_guardia(p_client_id);
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then
    raise exception 'Dati non validi' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into k from public.clienti_checkup x where x.id = p_id and x.client_id = p_client_id for update;
    if k.id is null then
      raise exception 'Questa call non c''è più.' using errcode = 'P0002';
    end if;
  end if;

  if p_dati ? 'giorno' then
    begin
      v_giorno := (p_dati ->> 'giorno')::date;
    exception when others then
      raise exception 'Giorno non valido' using errcode = '22023';
    end;
  else
    v_giorno := k.giorno;
  end if;
  if v_giorno is null then
    raise exception 'Scegli il giorno della call.' using errcode = '22023';
  end if;
  if v_giorno > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La call non può essere nel futuro.' using errcode = '22023';
  end if;

  v_url := case when p_dati ? 'fathom_url' then nullif(btrim(p_dati ->> 'fathom_url'), '') else k.fathom_url end;
  if v_url is not null and v_url !~ '^https://fathom\.video/' then
    raise exception 'Il link deve essere di Fathom (https://fathom.video/…).' using errcode = '22023';
  end if;

  v_compiti := case when p_dati ? 'compiti' then coalesce(p_dati -> 'compiti', '[]'::jsonb) else coalesce(k.compiti, '[]'::jsonb) end;
  if jsonb_typeof(v_compiti) = 'null' then v_compiti := '[]'::jsonb; end if;
  if not public.checkup_compiti_validi(v_compiti) then
    raise exception 'Al massimo 20 compiti, di al massimo 300 caratteri.' using errcode = '22023';
  end if;

  v_call := case when p_dati ? 'call_id' then nullif(p_dati ->> 'call_id', '')::uuid else k.call_id end;
  if v_call is not null and not exists (
    select 1 from public.clienti_call c where c.id = v_call and c.client_id = p_client_id and c.tipo = 'checkpoint'
  ) then
    raise exception 'Questa call non è un checkpoint del cliente.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.clienti_checkup (client_id, giorno, coach_id, fathom_url, argomento, resoconto, compiti, call_id, created_by)
    values (
      p_client_id, v_giorno, (select auth.uid()), v_url,
      nullif(btrim(p_dati ->> 'argomento'), ''), nullif(btrim(p_dati ->> 'resoconto'), ''), v_compiti, v_call, (select auth.uid())
    )
    returning id into v_id;
  else
    update public.clienti_checkup x
    set giorno = v_giorno,
        fathom_url = v_url,
        argomento = case when p_dati ? 'argomento' then nullif(btrim(p_dati ->> 'argomento'), '') else x.argomento end,
        resoconto = case when p_dati ? 'resoconto' then nullif(btrim(p_dati ->> 'resoconto'), '') else x.resoconto end,
        compiti = v_compiti,
        call_id = v_call
    where x.id = p_id;
    v_id := p_id;
  end if;

  if p_dati ? 'appunti' then
    if nullif(btrim(p_dati ->> 'appunti'), '') is null then
      delete from public.clienti_checkup_appunti a where a.checkup_id = v_id;
    else
      insert into public.clienti_checkup_appunti (checkup_id, testo, updated_by)
      values (v_id, p_dati ->> 'appunti', (select auth.uid()))
      on conflict (checkup_id) do update set testo = excluded.testo, updated_by = excluded.updated_by;
    end if;
  end if;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'Questo checkpoint ha già il suo resoconto.' using errcode = '23505';
  when check_violation then
    raise exception 'Un campo è troppo lungo: controlla argomento, resoconto e appunti.' using errcode = '22023';
end;
$$;

comment on function public.checkup_salva(uuid, uuid, jsonb) is
  'A check-up of a client written (p_id null) or corrected (1.83.0): giorno (never in the future), fathom_url (https://fathom.video/ only), argomento, resoconto, compiti (0-20 texts), appunti (the team''s notes, apart), call_id (a checkpoint of the client). The admin and the team of the client (campo_base_vede, else 42501), not paused (22023). Returns { id }.';

revoke all on function public.checkup_salva(uuid, uuid, jsonb) from public, anon;
grant execute on function public.checkup_salva(uuid, uuid, jsonb) to authenticated;

create function public.checkup_elimina(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select k.client_id into v_client from public.clienti_checkup k where k.id = p_id;
  if v_client is null then
    if public.da_client_oauth() or (select auth.uid()) is null then
      raise exception 'Il resoconto delle call lo scrivono l''admin e il team del cliente.' using errcode = '42501';
    end if;
    return false;
  end if;
  perform public.campo_base_guardia(v_client);
  delete from public.clienti_checkup k where k.id = p_id;
  return true;
end;
$$;

comment on function public.checkup_elimina(uuid) is
  'A check-up deleted, with its notes (1.83.0): the admin and the team of the client (42501 for the others), not paused. False when it is not there any more.';

revoke all on function public.checkup_elimina(uuid) from public, anon;
grant execute on function public.checkup_elimina(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The backup skips the notes of the team, with the questionnaire
-- ---------------------------------------------------------------------------
create or replace function public.backup_completo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb := '{}'::jsonb;
  v_tabella text;
  v_righe jsonb;
begin
  for v_tabella in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not like 'insight\_%'
      and c.relname not in ('call_valutazioni', 'call_spunti_setter', 'notifiche', 'onboarding_inviti_token',
                            'onboarding_registrazioni', 'clienti_accesso_limiti', 'onboarding_questionari',
                            'onboarding_allegati', 'clienti_checkup_appunti')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. The preview of a deletion: the body of 20261109100000; «cliente» says the check-ups too
-- ---------------------------------------------------------------------------
create or replace function public.anteprima_eliminazione(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;

  case p_tipo
    when 'persona' then
      return jsonb_build_object(
        'report', (select count(*) from public.setter_daily_reports where setter_id = p_id),
        'regole', (select count(*) from public.commission_rules where profile_id = p_id),
        'pagamenti_provvigioni', (select count(*) from public.commission_payouts where profile_id = p_id),
        'vendite', (select count(*) from public.sales where setter_id = p_id or closer_id = p_id),
        'call', (select count(*) from public.calls where setter_id = p_id or closer_id = p_id),
        'lead', (select count(*) from public.leads where setter_id = p_id),
        'progetti', (select count(*) from public.pm_membri where profile_id = p_id),
        'voci_tempo', (select count(*) from public.pm_tempo where profile_id = p_id),
        'note', (select count(*) from public.pm_note where autore_id = p_id)
      );
    when 'cliente' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where client_id = p_id),
        'rate', (select count(*) from public.payments p join public.sales s on s.id = p.sale_id where s.client_id = p_id),
        'incassato', (
          select public.euro_testo(coalesce(sum(p.importo_incassato), 0))
          from public.payments p join public.sales s on s.id = p.sale_id
          where s.client_id = p_id and p.importo_incassato is not null
        ),
        'progetti', (select count(*) from public.pm_progetti where client_id = p_id),
        'cartella_drive', (select count(*) from public.clienti_cartelle where client_id = p_id),
        -- the onboarding (invite, path, steps, log, Telegram) goes with the client (1.77.0)
        'onboarding', (
          exists (select 1 from public.onboarding_inviti where client_id = p_id)
          or exists (select 1 from public.onboarding_percorsi where client_id = p_id)
        ),
        -- and the client's access to the path (1.79.0)
        'accesso_cliente', exists (select 1 from public.clienti_account where client_id = p_id),
        -- and the questionnaire with its files (1.80.0)
        'questionario', (
          exists (select 1 from public.onboarding_questionari where client_id = p_id)
          or exists (select 1 from public.onboarding_allegati where client_id = p_id and stato <> 'da_cancellare')
        ),
        -- and the check-ups with the coach, with their notes (1.83.0)
        'checkup', (select count(*) from public.clienti_checkup where client_id = p_id)
      );
    when 'onboarding' then
      return jsonb_build_object(
        'task_onboarding', (
          select count(*)
          from public.pm_task t
          join public.pm_progetti pg on pg.id = t.progetto_id
          where pg.client_id = p_id and t.chiave_onboarding is not null
        ),
        'passi', (select count(*) from public.onboarding_passi where client_id = p_id),
        'eventi', (select count(*) from public.onboarding_eventi where client_id = p_id),
        'accesso_cliente', exists (select 1 from public.clienti_account where client_id = p_id)
      );
    when 'vendita' then
      return jsonb_build_object(
        'rate', (select count(*) from public.payments where sale_id = p_id),
        'rate_incassate', (select count(*) from public.payments where sale_id = p_id and stato = 'incassata'),
        'incassato', (
          select public.euro_testo(coalesce(sum(importo_incassato), 0))
          from public.payments where sale_id = p_id and importo_incassato is not null
        )
      );
    when 'lead' then
      return jsonb_build_object(
        'call', (select count(*) from public.calls where lead_id = p_id),
        'clienti_collegati', (select count(*) from public.clients where lead_id = p_id)
      );
    when 'prodotto' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where product_id = p_id),
        'call', (select count(*) from public.calls where prodotto_proposto_id = p_id)
      );
    when 'reparto' then
      return jsonb_build_object(
        'progetti', (select count(*) from public.pm_progetti where reparto_id = p_id),
        'modelli', (select count(*) from public.pm_modelli where reparto_id = p_id)
      );
    else
      raise exception 'Tipo non valido' using errcode = '22023';
  end case;
end;
$$;

