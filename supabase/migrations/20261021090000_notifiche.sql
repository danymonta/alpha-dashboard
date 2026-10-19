-- The notification center (1.41.0, CLAUDE.md sections 8, 10, 15 and 17).
--
-- Dany, 19/10/2026: "tutte le notifiche o mail che mi arrivano devono essere salvate in una sezione di notifiche
-- con pallino rosso dentro all'app e il mio account così che le posso consultare da lì in alto a destra".
-- Every email the app sends to a profile of the app (the weekly recap, the weekly backup, the path reminders) is
-- also saved here, for that recipient, the moment the server sends it, whether or not the email could leave.
--
--  1. public.notifiche: one row per recipient and per email. RLS: a person reads, marks as read and deletes
--     only their own, with an active account; no session inserts (the server writes, with the service_role,
--     through notifiche_registra). Nobody else reads them, the admin included: a reminder belongs to its
--     recipient (CLAUDE.md section 17, no surveillance).
--  2. notifiche_registra: the one writer. Idempotent on (recipient, chiave): a second run of the cron the same
--     evening never doubles a notification; a retry that finally sends the email only turns email_inviata on.
--  3. notifiche_pulizia + the pg_cron job notifiche-pulizia: nothing older than 12 months stays.
--  4. backup_completo() does not read notifiche: the rows copy emails that carry the clients' money and the
--     backup goes by email to several admins.
--
-- No created_by (they are sent by the app, not by a person) and no updated_at (only letta_il ever changes): an
-- exception to the table conventions, like insight_fatto (CLAUDE.md section 8).

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table public.notifiche (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.profiles (id) on delete cascade,
  -- extensible with a migration that rewrites the check: one value per kind of email
  tipo text not null
    check (tipo in ('riepilogo_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo')),
  -- the subject of the email
  titolo text not null check (char_length(titolo) between 1 and 300),
  -- one short line of plain text, for the list
  anteprima text not null default '' check (char_length(anteprima) <= 300),
  -- the email as our own code generated it (never user input), bounded: shown in a sandboxed iframe
  corpo_html text not null check (char_length(corpo_html) between 1 and 200000),
  -- an internal path only: starts with one slash, never two (//host), no backslash, no space or control character
  link text
    check (link is null
           or (char_length(link) <= 500 and link ~ '^/' and link !~ '^//' and link !~ '[\\[:space:][:cntrl:]]')),
  -- the notification exists even when the email did not leave (no Resend key, Resend refused)
  email_inviata boolean not null default false,
  -- stable per email: the recipient never gets the same one twice (Resend's idempotency key, or the like)
  chiave text not null check (char_length(chiave) between 1 and 200),
  letta_il timestamptz,
  created_at timestamptz not null default now(),
  unique (destinatario_id, chiave)
);

create index notifiche_destinatario_recenti on public.notifiche (destinatario_id, created_at desc);
create index notifiche_non_lette on public.notifiche (destinatario_id) where letta_il is null;

comment on table public.notifiche is
  'In-app copy of every email the app sends to a profile (recap, backup, path reminders). Read, marked as read and deleted only by the recipient; written only by notifiche_registra (service_role). No created_by and no updated_at: sent by the app, only letta_il changes.';

alter table public.notifiche enable row level security;

-- a person reads only their own, with an active account (current_role() is null for a disabled account and for a
-- Claude OAuth token). The admin reads nobody else's.
create policy notifiche_lettura on public.notifiche
  for select to authenticated
  using (destinatario_id = (select auth.uid()) and (select public.current_role()) is not null);

-- marking as read: only their own rows, and only the letta_il column (column grant below)
create policy notifiche_segna_lette on public.notifiche
  for update to authenticated
  using (destinatario_id = (select auth.uid()) and (select public.current_role()) is not null)
  with check (destinatario_id = (select auth.uid()) and (select public.current_role()) is not null);

create policy notifiche_eliminazione on public.notifiche
  for delete to authenticated
  using (destinatario_id = (select auth.uid()) and (select public.current_role()) is not null);

-- no insert policy: no session creates a notification

-- Claude connected (1.34.0, section 28) never reaches a notification: same expression as the other tables
create policy notifiche_mai_da_oauth on public.notifiche
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.notifiche from anon;
revoke all on public.notifiche from authenticated;
grant select, delete on public.notifiche to authenticated;
grant update (letta_il) on public.notifiche to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The writer (service_role only)
-- ---------------------------------------------------------------------------
create function public.notifiche_registra(
  p_destinatari uuid[],
  p_tipo text,
  p_titolo text,
  p_anteprima text,
  p_corpo_html text,
  p_link text,
  p_email_inviata boolean,
  p_chiave text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- one row per existing profile; a repeated chiave only turns email_inviata on (a retry that finally sent
  -- the email) and never touches letta_il, the text or the time
  insert into public.notifiche (destinatario_id, tipo, titolo, anteprima, corpo_html, link, email_inviata, chiave)
  select p.id, p_tipo, p_titolo, coalesce(p_anteprima, ''), p_corpo_html, p_link, coalesce(p_email_inviata, false), p_chiave
  from public.profiles p
  where p.id = any (coalesce(p_destinatari, '{}'::uuid[]))
  on conflict (destinatario_id, chiave) do update
    set email_inviata = public.notifiche.email_inviata or excluded.email_inviata;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.notifiche_registra(uuid[], text, text, text, text, text, boolean, text) is
  'service_role only: saves one notification per recipient (an existing profile), idempotent on (recipient, chiave): a repeat only turns email_inviata on. The checks of the table (kind, sizes, internal link) raise 23514. Returns the rows written.';
revoke all on function public.notifiche_registra(uuid[], text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.notifiche_registra(uuid[], text, text, text, text, text, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Retention: 12 months
-- ---------------------------------------------------------------------------
create function public.notifiche_pulizia()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.notifiche where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.notifiche_pulizia() is
  'pg_cron every night: deletes the notifications older than 12 months. Returns the rows deleted.';
revoke all on function public.notifiche_pulizia() from public, anon, authenticated, service_role;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'notifiche-pulizia';
select cron.schedule('notifiche-pulizia', '40 2 * * *', 'select public.notifiche_pulizia()');

-- ---------------------------------------------------------------------------
-- 4. The backup does not read notifiche
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
      and c.relname not in ('call_valutazioni', 'call_spunti_setter', 'notifiche')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;
comment on function public.backup_completo() is
  'service_role only: every table of public read at the time of the call (a table added later is never forgotten), the Instagram proposals included, never the insight_* tables (third-party DM text kept at most 30 days), call_valutazioni and call_spunti_setter (read only by the person they are about) nor notifiche (copies of emails that carry the clients'' money, and the backup goes to several admins). Never the tokens and keys: they are in Vault.';
revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;
