-- Dany, 04/10/2026.
--
-- A. Two reminders by email for every client's path, sent by the daily cron
--    (/api/cron/giornaliero) to the active admins only: the coaches never see a
--    client's money, and these emails speak of paths, never of collaborators
--    (CLAUDE.md section 17).
--    - "Call dei 3 mesi": 3 months before the end, to collect feedback. Only
--      for a path longer than 3 months (a 3-month path gets the renewal one only).
--    - "Call di rinnovo": 1 month before the end, to talk about the renewal.
--    The path is the client's latest nuovo or rinnovo sale (an upsell never
--    counts), its data_fine. A client who already has a later nuovo/rinnovo
--    sale renewed: the old end gets nothing. An ended path gets nothing, an
--    interrupted one (interrompi_percorso) neither.
--    Each reminder goes once per path end: promemoria_percorso records it,
--    keyed by client, kind and the data_fine it refers to, so a renewal or a
--    corrected end makes new reminders for the new end. The cron books a
--    reminder (in_invio) before sending it, so two runs of the cron on the
--    same evening never send it twice, and marks it sent only after Resend
--    accepted the email: a failed one is freed and goes again the next
--    evening, one left booked by a run that died frees itself after 30
--    minutes. Catch-up (first run, a missed evening): a client past both
--    thresholds gets only the renewal one, the feedback one is recorded as
--    skipped.
--    promemoria_percorso_da_inviare() computes them and
--    promemoria_percorso_prenota() books them: service_role only, like
--    riepilogo_serale. The table: the admin reads it, no session writes it.
--
-- B. The link to the client's Google Drive folder (for the invoices, later):
--    its own table (section 6: sensitive data in separate tables), admin only.
--    A closer who reads his clients never reads it. Deleting the client takes it
--    with him; the deletion preview says so.

-- ---------------------------------------------------------------------------
-- A. Reminders sent
-- ---------------------------------------------------------------------------
create type public.promemoria_tipo as enum ('feedback_3_mesi', 'rinnovo_1_mese');
create type public.promemoria_esito as enum ('in_invio', 'inviato', 'saltato', 'interrotto');

create table public.promemoria_percorso (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tipo public.promemoria_tipo not null,
  -- the end of the path the reminder refers to: a new end is a new reminder
  data_fine date not null,
  sale_id uuid references public.sales (id) on delete set null,
  -- in_invio: a run of the cron is sending it right now (booked, freed after
  -- 30 minutes if that run died); inviato: Resend accepted it; saltato:
  -- catch-up, the renewal one went instead; interrotto: the path was
  -- interrupted at this end
  esito public.promemoria_esito not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promemoria_percorso_una_volta unique (client_id, tipo, data_fine)
);

create index promemoria_percorso_sale_idx on public.promemoria_percorso (sale_id);

create trigger promemoria_percorso_updated_at
  before update on public.promemoria_percorso
  for each row execute function public.set_updated_at();

alter table public.promemoria_percorso enable row level security;
revoke all on public.promemoria_percorso from anon;
-- only the cron (service_role) and the interruption helper below write it
revoke insert, update, delete, truncate on public.promemoria_percorso from authenticated;

create policy promemoria_percorso_admin_lettura on public.promemoria_percorso for select to authenticated
  using (public.is_admin());

comment on table public.promemoria_percorso is
  'Path reminders already handled, once per client, kind and path end: being sent, sent, skipped (catch-up) or interrupted. Admin reads, the cron writes.';

-- ---------------------------------------------------------------------------
-- The reminders due on p_giorno (the cron passes today in Europe/Rome).
-- azione: 'invia' = send it now; 'salta' = the catch-up case, record it as
-- skipped without sending (the renewal one of the same path goes instead).
-- A reminder booked by a run of the cron (in_invio) is not due while that run
-- may still be sending it: after 30 minutes (the function lives 60 seconds)
-- that run died, and it is due again.
-- ---------------------------------------------------------------------------
create or replace function public.promemoria_percorso_da_inviare(p_giorno date)
returns table (
  client_id uuid,
  sale_id uuid,
  tipo public.promemoria_tipo,
  azione text,
  nome text,
  cognome text,
  telefono text,
  prodotto text,
  data_inizio date,
  data_fine date,
  giorni_mancanti integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with percorso as (
    -- the path: the latest nuovo or rinnovo sale of each client, upsells never
    select distinct on (s.client_id)
      s.client_id as cliente,
      s.id as vendita,
      s.data_inizio as inizio,
      s.data_fine as fine,
      coalesce(pr.nome, s.prodotto_personalizzato) as nome_prodotto,
      -- the end the product's duration gives (null off the catalogue)
      (s.data_inizio + make_interval(months => pr.durata_mesi))::date - 1 as fine_prevista
    from public.sales s
    left join public.products pr on pr.id = s.product_id
    where s.tipo in ('nuovo', 'rinnovo')
    order by s.client_id, s.data_fine desc, s.data_inizio desc, s.created_at desc, s.id
  ),
  in_corso as (
    select
      p.*,
      p_giorno >= (p.fine - interval '1 month')::date as rinnovo_dovuto,
      -- longer than 3 months: a 3-month path has no "call dei 3 mesi". Its end
      -- is start + 3 months - 1 day; typed by hand it may be start + 3 months,
      -- or a few days later from a start at the end of a month (months last 28
      -- to 31 days: 30/11 -> 01/03): up to 3 days past start + 3 months it is
      -- still a 3-month path
      p.fine > (p.inizio + interval '3 months')::date + 3
        and p_giorno >= (p.fine - interval '3 months')::date as feedback_dovuto
    from percorso p
    where p.fine >= p_giorno                     -- an ended path gets nothing
      and not exists (                           -- nor an interrupted one: at the
        select 1 from public.promemoria_percorso x   -- end the interruption set, or
        where x.esito = 'interrotto'                 -- moved since and still short
          and ((x.client_id = p.cliente and x.data_fine = p.fine)
            or (x.sale_id = p.vendita and (p.fine_prevista is null or p.fine < p.fine_prevista)))
      )
  ),
  dovuti as (
    select i.cliente, i.vendita, i.inizio, i.fine, i.nome_prodotto,
      'rinnovo_1_mese'::public.promemoria_tipo as tipo_promemoria, 'invia' as cosa_fare
    from in_corso i
    where i.rinnovo_dovuto
    union all
    -- catch-up: past both thresholds, only the renewal one goes
    select i.cliente, i.vendita, i.inizio, i.fine, i.nome_prodotto,
      'feedback_3_mesi'::public.promemoria_tipo,
      case when i.rinnovo_dovuto then 'salta' else 'invia' end
    from in_corso i
    where i.feedback_dovuto
  )
  select d.cliente, d.vendita, d.tipo_promemoria, d.cosa_fare,
    c.nome, c.cognome, c.telefono, d.nome_prodotto, d.inizio, d.fine,
    (d.fine - p_giorno)::integer
  from dovuti d
  join public.clients c on c.id = d.cliente
  where not exists (                             -- once per client, kind and end
    select 1 from public.promemoria_percorso x
    where x.client_id = d.cliente and x.tipo = d.tipo_promemoria and x.data_fine = d.fine
      -- booked by a run of the cron that may still be sending it
      and (x.esito <> 'in_invio' or x.updated_at >= now() - interval '30 minutes')
  )
  order by (d.tipo_promemoria = 'rinnovo_1_mese') desc, d.fine, c.nome, c.cognome, d.cliente;
$$;

comment on function public.promemoria_percorso_da_inviare(date) is
  'Path reminders due on a day (feedback 3 months before the end, renewal 1 month before), not yet handled. service_role only: the daily cron.';

revoke all on function public.promemoria_percorso_da_inviare(date) from public, anon, authenticated;
grant execute on function public.promemoria_percorso_da_inviare(date) to service_role;

-- ---------------------------------------------------------------------------
-- The cron takes a reminder before acting on it: 'in_invio' books it before
-- the email (two runs on the same evening: only one gets it, only one sends),
-- 'saltato' records the catch-up. Returns the row when this call took it,
-- null when it was already handled or another run is sending it. A booking
-- older than 30 minutes belongs to a run that died: it is taken over.
-- The cron then marks the booking 'inviato' (Resend accepted the email) or
-- deletes it (refused: it goes again the next evening).
-- ---------------------------------------------------------------------------
create or replace function public.promemoria_percorso_prenota(
  p_client_id uuid,
  p_tipo public.promemoria_tipo,
  p_data_fine date,
  p_sale_id uuid,
  p_esito public.promemoria_esito default 'in_invio'
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_esito is null or p_esito not in ('in_invio', 'saltato') then
    raise exception 'Il cron prenota un invio o salta un promemoria' using errcode = '22023';
  end if;

  insert into public.promemoria_percorso as x (client_id, tipo, data_fine, sale_id, esito, created_by)
  values (p_client_id, p_tipo, p_data_fine, p_sale_id, p_esito, null)
  on conflict (client_id, tipo, data_fine) do update
    set esito = excluded.esito, sale_id = excluded.sale_id
    where x.esito = 'in_invio' and x.updated_at < now() - interval '30 minutes'
  returning x.id into v_id;

  return v_id;
end;
$$;

comment on function public.promemoria_percorso_prenota(uuid, public.promemoria_tipo, date, uuid, public.promemoria_esito) is
  'The daily cron books a path reminder before sending it (in_invio) or records the catch-up (saltato): the row id when this call took it, null otherwise. service_role only.';

revoke all on function public.promemoria_percorso_prenota(uuid, public.promemoria_tipo, date, uuid, public.promemoria_esito)
  from public, anon, authenticated;
grant execute on function public.promemoria_percorso_prenota(uuid, public.promemoria_tipo, date, uuid, public.promemoria_esito)
  to service_role;

-- ---------------------------------------------------------------------------
-- An interrupted path gets no reminder at its new end. Called by
-- interrompi_percorso (security invoker, the admin's session): the table has
-- no write policy, so this one writes it, after its own check.
-- ---------------------------------------------------------------------------
create or replace function public.promemoria_percorso_interrotto(p_sale_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin interrompe un percorso' using errcode = '42501';
  end if;

  -- what was already sent or skipped stays as it is; a booking (in_invio) is
  -- not sent any more
  insert into public.promemoria_percorso as x (client_id, tipo, data_fine, sale_id, esito)
  select s.client_id, t.tipo, s.data_fine, s.id, 'interrotto'
  from public.sales s
  cross join unnest(enum_range(null::public.promemoria_tipo)) as t(tipo)
  where s.id = p_sale_id and s.tipo in ('nuovo', 'rinnovo')
  on conflict (client_id, tipo, data_fine) do update
    set esito = 'interrotto', sale_id = excluded.sale_id
    where x.esito = 'in_invio';
end;
$$;

comment on function public.promemoria_percorso_interrotto(uuid) is
  'Admin only: the path of this sale was interrupted at its current end, no reminder for it.';

revoke all on function public.promemoria_percorso_interrotto(uuid) from public, anon;
grant execute on function public.promemoria_percorso_interrotto(uuid) to authenticated;

-- interrompi_percorso as in 20260928240000, plus the line that stops the reminders
create or replace function public.interrompi_percorso(
  p_sale_id uuid,
  p_ultimo_giorno date,
  p_togli_rate boolean,
  p_esegui boolean default false
)
returns table (
  rate_tolte integer,
  importo_tolto numeric,
  valore_prima numeric,
  valore_dopo numeric,
  rate_restanti integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_tolte integer := 0;
  v_importo numeric(12, 2) := 0;
  v_totali integer;
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin interrompe un percorso' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Vendita non trovata' using errcode = 'P0002';
  end if;
  if p_ultimo_giorno is null or p_ultimo_giorno < v_sale.data_inizio or p_ultimo_giorno > v_sale.data_fine then
    raise exception 'L''ultimo giorno va dal % al %',
      to_char(v_sale.data_inizio, 'DD/MM/YYYY'), to_char(v_sale.data_fine, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if p_togli_rate then
    select count(*)::integer, coalesce(sum(p.importo_previsto), 0)::numeric(12, 2)
      into v_tolte, v_importo
    from public.payments p
    where p.sale_id = p_sale_id and p.stato in ('prevista', 'fallita') and p.scadenza > p_ultimo_giorno;
  end if;

  select count(*)::integer into v_totali from public.payments p where p.sale_id = p_sale_id;
  if v_totali - v_tolte = 0 then
    raise exception 'Non resterebbe nessuna rata: se non ha pagato niente, elimina la vendita'
      using errcode = '22023';
  end if;

  if p_esegui then
    if v_tolte > 0 then
      delete from public.payments p
      where p.sale_id = p_sale_id and p.stato in ('prevista', 'fallita') and p.scadenza > p_ultimo_giorno;
    end if;
    update public.sales s
    set data_fine = p_ultimo_giorno,
        valore_contratto = s.valore_contratto - v_importo,
        numero_rate = v_totali - v_tolte
    where s.id = p_sale_id;
    -- who stops gets no "call dei 3 mesi" and no "call di rinnovo" (04/10/2026)
    perform public.promemoria_percorso_interrotto(p_sale_id);
  end if;

  return query select v_tolte, v_importo, v_sale.valore_contratto,
    (v_sale.valore_contratto - v_importo)::numeric(12, 2), v_totali - v_tolte;
end;
$$;

comment on function public.interrompi_percorso(uuid, date, boolean, boolean) is
  'Admin only: ends a sale early; optionally drops the unpaid instalments after that day and lowers the contract. No path reminder for it afterwards.';

revoke all on function public.interrompi_percorso(uuid, date, boolean, boolean) from public, anon;
grant execute on function public.interrompi_percorso(uuid, date, boolean, boolean) to authenticated;

-- Paths interrupted before today that still end in the future: the end was
-- brought forward (audit_log of sales) and is now shorter than the product's
-- duration, as the client sheet calls a path "Interrotto". Catalogue products
-- only, like the sheet: off the catalogue there is no duration to tell an
-- interruption from a corrected typo, and a wrong mark would silence the
-- client's reminders for good. Once, here.
insert into public.promemoria_percorso (client_id, tipo, data_fine, sale_id, esito, created_by)
select s.client_id, t.tipo, s.data_fine, s.id, 'interrotto', null
from public.sales s
left join public.products pr on pr.id = s.product_id
cross join unnest(enum_range(null::public.promemoria_tipo)) as t(tipo)
where s.tipo in ('nuovo', 'rinnovo')
  and s.data_fine >= public.oggi()
  and pr.durata_mesi is not null
  and s.data_fine < (s.data_inizio + make_interval(months => pr.durata_mesi))::date - 1
  and exists (
    select 1 from public.audit_log a
    where a.tabella = 'sales' and a.record_id = s.id and a.azione = 'update'
      and (a.dati_dopo ->> 'data_fine')::date = s.data_fine
      and (a.dati_prima ->> 'data_fine')::date > s.data_fine
  )
on conflict (client_id, tipo, data_fine) do nothing;

-- ---------------------------------------------------------------------------
-- B. The client's Google Drive folder: admin only
-- ---------------------------------------------------------------------------
create table public.clienti_cartelle (
  client_id uuid primary key references public.clients (id) on delete cascade,
  url text not null
    constraint clienti_cartelle_url_drive
    check (url ~ '^https://drive\.google\.com/[^[:space:]]+$' and char_length(url) <= 500),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clienti_cartelle_updated_at
  before update on public.clienti_cartelle
  for each row execute function public.set_updated_at();

alter table public.clienti_cartelle enable row level security;
revoke all on public.clienti_cartelle from anon;

create policy clienti_cartelle_admin on public.clienti_cartelle for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.clienti_cartelle is
  'The link to the client''s Google Drive folder (https://drive.google.com/...). Admin only, never the closer or the setter.';

-- The deletion preview of a client also says the folder link goes (the
-- folder on Drive stays): the function of 20261002090000 plus 'cartella_drive'.
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
        'cartella_drive', (select count(*) from public.clienti_cartelle where client_id = p_id)
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

revoke all on function public.anteprima_eliminazione(text, uuid) from public, anon;
grant execute on function public.anteprima_eliminazione(text, uuid) to authenticated;
