-- Guided onboarding, release B1a (1.78.0): contents, consents and videos of the client's path
-- (docs/onboarding/rilascio-b.md, «Schema di B1a», 2).
--
-- * onboarding_passi_def.sblocco: obiettivo and programma are opened by the team, never by the automatic unlock.
-- * contenuti_blocchi: the minimal CMS (the block of every content of the client, onboarding and, from v3,
--   training). The admin writes it; the client receives it only from percorso_cliente().
-- * clienti_consensi_testi and clienti_consensi: the versions of the consent texts and the consents given.
-- * onboarding_video_visti: the seconds of a video seen by a client.
-- * The backup skips the registrations, the limits and the health data of B1b; the preview of a deletion
--   says the client's access and, for «Elimina onboarding», what goes; onboarding_pulizia every night.

-- ---------------------------------------------------------------------------
-- 1. Who opens a step
-- ---------------------------------------------------------------------------
alter table public.onboarding_passi_def
  add column sblocco text not null default 'automatico' check (sblocco in ('automatico', 'team'));

comment on column public.onboarding_passi_def.sblocco is
  'automatico: onboarding_sblocca opens the step when the steps of sblocca_dopo are done; team: only the team opens it (obiettivo, programma).';

update public.onboarding_passi_def set sblocco = 'team' where versione = 1 and chiave in ('obiettivo', 'programma');

-- ---------------------------------------------------------------------------
-- 2. The minimal CMS
-- ---------------------------------------------------------------------------
create table public.contenuti_blocchi (
  id uuid primary key default gen_random_uuid(),
  versione_flusso integer not null default 1,
  pagina text not null check (pagina in ('passo', 'dopo_lancio')),
  -- with pagina 'passo': the key of the step
  passo text,
  ordine integer not null,
  tipo text not null check (tipo in ('testo', 'avviso', 'video', 'regola', 'voce', 'pulsante', 'domande')),
  titolo text check (char_length(titolo) <= 120),
  -- Markdown
  corpo text check (char_length(corpo) <= 8000),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  url text check (url ~ '^https://' and char_length(url) <= 500),
  -- a compulsory video must be seen at 90%; rules and items are always compulsory
  obbligatorio boolean not null default false,
  pubblicato boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contenuti_blocchi_pagina check ((pagina = 'passo') = (passo is not null)),
  constraint contenuti_blocchi_video check (tipo <> 'video' or youtube_id is not null),
  constraint contenuti_blocchi_pulsante check (tipo <> 'pulsante' or (url is not null and nullif(btrim(titolo), '') is not null)),
  constraint contenuti_blocchi_titolo check (tipo not in ('regola', 'voce') or nullif(btrim(titolo), '') is not null),
  foreign key (versione_flusso, passo) references public.onboarding_passi_def (versione, chiave)
);
create index contenuti_blocchi_passo_idx on public.contenuti_blocchi (versione_flusso, pagina, passo, ordine);

comment on table public.contenuti_blocchi is
  'The minimal CMS (1.78.0): the blocks of the client''s pages (a step of a version of the flow, or the page after the launch), in order. The admin writes them; the client receives the published ones only from percorso_cliente(), and only for the steps it has unlocked.';

create trigger contenuti_blocchi_set_updated_at before update on public.contenuti_blocchi
  for each row execute function public.set_updated_at();

alter table public.contenuti_blocchi enable row level security;

create policy contenuti_blocchi_admin on public.contenuti_blocchi
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy contenuti_blocchi_mai_da_oauth on public.contenuti_blocchi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.contenuti_blocchi from anon;
revoke all on public.contenuti_blocchi from authenticated;
grant select, insert, update, delete on public.contenuti_blocchi to authenticated;

-- The seed, version 1. «[Da scrivere: …]» and the placeholder id of the video mark what Dany writes before
-- the area opens (B2 refuses to open it while they are there).
insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, corpo, youtube_id, obbligatorio) values
  (1, 'passo', 'benvenuto', 1, 'testo', 'Benvenuto a bordo',
   E'Benvenuto a bordo, [Nome]. Questo sarà il tuo campo base durante tutto il percorso: un luogo che ti aiuta ad avere sempre tutto in ordine e chiari i prossimi passi.\n\nDany',
   null, false),
  (1, 'passo', 'benvenuto', 2, 'video', 'Il video di benvenuto',
   '[Da scrivere: due righe su cosa racconta Dany nel video.]',
   'XXXXXXXXXXX', true),
  (1, 'passo', 'benvenuto', 3, 'testo', 'Il tuo team',
   'Ti seguono il tuo coach e le persone del team che lavorano con lui: chi rivede i video dei tuoi allenamenti e il tuo Personal Success Manager. Le trovi qui con foto e ruolo.',
   null, false),
  (1, 'passo', 'regole', 1, 'testo', 'Le regole del percorso',
   'Poche regole, chiare: servono a te per avere risposte veloci e a noi per seguirti bene. Spuntale una per una.',
   null, false),
  (1, 'passo', 'regole', 2, 'regola', 'Telegram per imprevisti e dubbi',
   'Per un imprevisto o un dubbio scrivi nel tuo gruppo privato su Telegram: è lì che ti rispondiamo.',
   null, true),
  (1, 'passo', 'regole', 3, 'regola', 'Coach Plus per i dati',
   'Misure, foto, allenamenti e questionario giornaliero vanno su Coach Plus, non in chat.',
   null, true),
  (1, 'passo', 'regole', 4, 'regola', 'Le call si confermano',
   'Ogni call la confermi tu: una call non confermata non resta in calendario.',
   null, true),
  (1, 'passo', 'regole', 5, 'regola', 'Preavviso di 24-48 ore',
   'Se devi spostare una call, avvisa almeno 24-48 ore prima.',
   null, true),
  (1, 'passo', 'regole', 6, 'regola', 'Notifiche di Telegram attive',
   'Tieni attive le notifiche del gruppo privato, così non perdi i messaggi del tuo coach.',
   null, true),
  (1, 'passo', 'regole', 7, 'regola', 'Nella community ci si presenta',
   'Appena entri nella community ti presenti nel topic «Presentazioni».',
   null, true),
  (1, 'passo', 'regole', 8, 'regola', 'Le domande personali nel gruppo privato',
   'Nella community le domande utili a tutti; quelle su di te nel tuo gruppo privato.',
   null, true),
  (1, 'passo', 'regole', 9, 'regola', 'Rispetto per tutti',
   '[Da scrivere: le regole della community, come nel messaggio fissato.]',
   null, true);

-- ---------------------------------------------------------------------------
-- 3. Consents
-- ---------------------------------------------------------------------------
create table public.clienti_consensi_testi (
  tipo text not null check (tipo in ('salute')),
  versione text not null check (versione ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'),
  -- the sha256 of the text in lib/percorso/consensi.ts: a test checks they are the same
  testo_sha256 text not null check (testo_sha256 ~ '^[0-9a-f]{64}$'),
  in_vigore boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tipo, versione)
);
create unique index clienti_consensi_testi_in_vigore on public.clienti_consensi_testi (tipo) where in_vigore;

comment on table public.clienti_consensi_testi is
  'The versions of the texts of the client''s consents (the texts are in lib/percorso/consensi.ts, their sha256 here). One version in force per kind. Seeded by the migrations; the admin reads it.';

insert into public.clienti_consensi_testi (tipo, versione, testo_sha256, in_vigore) values
  ('salute', '2026-11-12', 'ffe5a1110f2e400ba634e3d65570073e4c0823d6d33a0439d92aa9def82c5200', true);

alter table public.clienti_consensi_testi enable row level security;

create policy clienti_consensi_testi_admin_lettura on public.clienti_consensi_testi
  for select to authenticated using ((select public.is_admin()));
create policy clienti_consensi_testi_mai_da_oauth on public.clienti_consensi_testi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_consensi_testi from anon;
revoke all on public.clienti_consensi_testi from authenticated;
grant select on public.clienti_consensi_testi to authenticated;

create table public.clienti_consensi (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tipo text not null check (tipo in ('salute')),
  versione text not null,
  dato_il timestamptz not null default now(),
  -- revoked, or replaced by the consent to a newer version of the text (revocato_da null)
  revocato_il timestamptz,
  -- the admin who registered the revocation (B1b)
  revocato_da uuid references public.profiles (id) on delete set null,
  foreign key (tipo, versione) references public.clienti_consensi_testi (tipo, versione),
  constraint clienti_consensi_revoca check (revocato_da is null or revocato_il is not null)
);
create unique index clienti_consensi_uno_vivo on public.clienti_consensi (client_id, tipo) where revocato_il is null;

comment on table public.clienti_consensi is
  'The consents a client gave (the version of the text and when), and their revocation. The admin reads them; the client gives them only from percorso_avanza and consenso_dai. One living consent per client and kind: a consent to a newer version closes the one before.';

alter table public.clienti_consensi enable row level security;

create policy clienti_consensi_admin_lettura on public.clienti_consensi
  for select to authenticated using ((select public.is_admin()));
create policy clienti_consensi_mai_da_oauth on public.clienti_consensi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_consensi from anon;
revoke all on public.clienti_consensi from authenticated;
grant select on public.clienti_consensi to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The seconds of a video seen
-- ---------------------------------------------------------------------------
create table public.onboarding_video_visti (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  blocco_id uuid references public.contenuti_blocchi (id) on delete cascade,
  -- the first one the player declared
  durata integer not null check (durata between 1 and 10800),
  -- one bit per second
  visti varbit not null,
  percentuale numeric(5, 2) generated always as (round(bit_count(visti)::numeric * 100 / durata, 2)) stored,
  -- the first time past 90%
  visto_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_video_visti_lunghezza check (length(visti) = durata),
  -- B2 replaces it with num_nonnulls(blocco_id, consegna_id) = 1
  constraint onboarding_video_visti_cosa check (blocco_id is not null)
);
create unique index onboarding_video_visti_blocco on public.onboarding_video_visti (client_id, blocco_id)
  where blocco_id is not null;

comment on table public.onboarding_video_visti is
  'The seconds of a video of the CMS a client has seen (one bit per second), its percentage and when it passed 90%. The admin reads them; the client writes them only from video_progresso.';

create trigger onboarding_video_visti_set_updated_at before update on public.onboarding_video_visti
  for each row execute function public.set_updated_at();

alter table public.onboarding_video_visti enable row level security;

create policy onboarding_video_visti_admin_lettura on public.onboarding_video_visti
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_video_visti_mai_da_oauth on public.onboarding_video_visti
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_video_visti from anon;
revoke all on public.onboarding_video_visti from authenticated;
grant select on public.onboarding_video_visti to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The backup: the body of 20261108090000, with the registrations, the limits and the health data of B1b
--    (named already: they are never forgotten) among the tables it skips
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
                            'onboarding_allegati')
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
-- 6. The preview of a deletion: the body of 20261108090100; «cliente» says the client's access, and
--    «onboarding» what «Elimina onboarding» takes away
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
        -- and the client's access to the path (1.78.0)
        'accesso_cliente', exists (select 1 from public.clienti_account where client_id = p_id)
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

-- ---------------------------------------------------------------------------
-- 7. What is kept and for how long (decision 8): every night at 02:50 UTC
-- ---------------------------------------------------------------------------
create function public.onboarding_pulizia()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chiusi uuid[];
  n_chiusi integer;
  n_video integer;
  n_registrazioni integer;
  n_limiti integer;
  n_token integer;
  n_eventi integer;
begin
  -- the accounts whose last path (nuovo or rinnovo) ended more than 12 months ago: closed, their videos gone.
  -- The questionnaire and the files stay (B1b).
  with chiusi as (
    update public.clienti_account a
    set stato = 'chiuso', chiuso_il = now()
    where a.stato in ('attivo', 'sospeso')
      and (
        select max(s.data_fine)
        from public.sales s
        where s.client_id = a.client_id and s.tipo in ('nuovo', 'rinnovo')
      ) < (public.oggi() - interval '12 months')::date
    returning a.client_id
  )
  select coalesce(array_agg(client_id), '{}') into v_chiusi from chiusi;
  n_chiusi := cardinality(v_chiusi);

  delete from public.onboarding_video_visti v where v.client_id = any (v_chiusi);
  get diagnostics n_video = row_count;

  delete from public.onboarding_registrazioni r where r.chiave_scade_il < now() - interval '1 day';
  get diagnostics n_registrazioni = row_count;

  delete from public.clienti_accesso_limiti l
  where l.dal < now() - interval '1 day'
    and (l.ultimo_invio_il is null or l.ultimo_invio_il < now() - interval '1 day');
  get diagnostics n_limiti = row_count;

  delete from public.onboarding_inviti_token t
  using public.onboarding_inviti i
  where i.id = t.invito_id
    and (
      (i.stato = 'revocato' and i.revocato_il < now() - interval '30 days')
      or (i.stato = 'scaduto' and coalesce(i.scade_il, i.updated_at) < now() - interval '30 days')
      -- an active link past its days and never opened again (it becomes scaduto only on /join)
      or (i.stato = 'attivo' and i.scade_il is not null and i.scade_il < now() - interval '30 days')
    );
  get diagnostics n_token = row_count;

  delete from public.onboarding_eventi e where e.created_at < now() - interval '24 months';
  get diagnostics n_eventi = row_count;

  return jsonb_build_object(
    'account_chiusi', n_chiusi,
    'video', n_video,
    'registrazioni', n_registrazioni,
    'limiti', n_limiti,
    'token', n_token,
    'eventi', n_eventi
  );
end;
$$;

comment on function public.onboarding_pulizia() is
  'Every night (pg_cron onboarding-pulizia): closes the accounts of the clients whose last path ended more than 12 months ago (their videos seen go; questionnaire and files stay), deletes the registrations expired since a day, the limits older than a day, the tokens in clear of links expired or revoked since 30 days, the log older than 24 months. Returns the counts. Service role only.';

revoke all on function public.onboarding_pulizia() from public, anon, authenticated;
grant execute on function public.onboarding_pulizia() to service_role;

select cron.schedule('onboarding-pulizia', '50 2 * * *', 'select public.onboarding_pulizia()');
