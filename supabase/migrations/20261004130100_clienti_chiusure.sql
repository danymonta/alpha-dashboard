-- "Non rinnova" (Dany, 04/10/2026): the admin closes a client who does not
-- renew, and the client goes into a category of his own.
--
-- - clienti_chiusure: one row per closed client (day and optional reason).
--   Its own table (CLAUDE.md section 6): the admin does everything; the closer
--   of the client reads it, so the status he reads through v_client_status
--   (security_invoker) says chiuso like the admin's; nobody else. Written by
--   the admin's server actions only (Zod), "Riapri" deletes the row.
-- - v_clienti_chiusi: the closures in force. Buying again reopens the client
--   by itself: a nuovo or rinnovo sale signed after the closing day ends it
--   (an upsell does not). The row stays: deleting that sale closes him again.
-- - v_client_status: chiuso wins over every other state, even while the path
--   is still running (the coach keeps working on the project until the end:
--   nothing about projects changes).
-- - promemoria_percorso_da_inviare: no "call dei 3 mesi" or "call di rinnovo"
--   for a closed client. Nothing is recorded for him: reopened, he gets the
--   reminders still due (the catch-up rule of 20261004110000 applies).
-- Metrics computed from the sale dates (cash, revenue, renewal rate, active
-- clients) do not change.

create table public.clienti_chiusure (
  client_id uuid primary key references public.clients (id) on delete cascade,
  chiuso_il date not null,
  motivo text
    constraint clienti_chiusure_motivo
    check (motivo is null or (char_length(motivo) <= 500 and btrim(motivo) <> '')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clienti_chiusure_updated_at
  before update on public.clienti_chiusure
  for each row execute function public.set_updated_at();

-- The closing day: never in the future, never before the client's latest
-- path was signed (such a closure would be over before it starts).
create or replace function public.clienti_chiusure_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ultima date;
begin
  if new.chiuso_il > public.oggi() then
    raise exception 'Il giorno della chiusura non può essere nel futuro' using errcode = '22023';
  end if;
  select max(s.data_vendita) into v_ultima
  from public.sales s
  where s.client_id = new.client_id and s.tipo in ('nuovo', 'rinnovo');
  if v_ultima is not null and new.chiuso_il < v_ultima then
    raise exception 'Il % ha firmato il suo ultimo percorso: la chiusura va da quel giorno in poi',
      to_char(v_ultima, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger clienti_chiusure_coerenza
  before insert or update on public.clienti_chiusure
  for each row execute function public.clienti_chiusure_coerenza();

alter table public.clienti_chiusure enable row level security;
revoke all on public.clienti_chiusure from anon;

create policy clienti_chiusure_admin on public.clienti_chiusure for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The closer reads the closure of the clients he reads (clients RLS decides
-- which: born from his calls), never writes it.
create policy clienti_chiusure_closer_lettura on public.clienti_chiusure for select to authenticated
  using (
    public.current_role() = 'closer'
    and exists (select 1 from public.clients c where c.id = clienti_chiusure.client_id)
  );

comment on table public.clienti_chiusure is
  'Clients the admin closed ("Non rinnova"): day and optional reason. A nuovo/rinnovo sale signed later reopens the client (v_clienti_chiusi). Admin writes, the client''s closer reads.';

-- ---------------------------------------------------------------------------
-- The closures in force: no nuovo or rinnovo sale signed after the closing day.
-- ---------------------------------------------------------------------------
create view public.v_clienti_chiusi
with (security_invoker = true)
as
select ch.client_id, ch.chiuso_il, ch.motivo, ch.created_at
from public.clienti_chiusure ch
where not exists (
  select 1 from public.sales s
  where s.client_id = ch.client_id
    and s.tipo in ('nuovo', 'rinnovo')
    and s.data_vendita > ch.chiuso_il
);

revoke all on public.v_clienti_chiusi from anon;

comment on view public.v_clienti_chiusi is
  'Closures in force: the client closed by the admin has not signed a nuovo or rinnovo sale since.';

-- ---------------------------------------------------------------------------
-- Derived client status (20261004120100) with chiuso first.
-- ---------------------------------------------------------------------------
create or replace view public.v_client_status
with (security_invoker = true)
as
with ultima_vendita as (
  select
    s.client_id,
    count(*) as numero_vendite,
    max(s.data_fine) as data_fine_ultima,
    bool_or(public.oggi() between s.data_inizio and s.data_fine) as attiva,
    bool_or(s.data_inizio > public.oggi()) as da_iniziare
  from public.sales s
  group by s.client_id
)
select
  c.id as client_id,
  c.nome,
  c.cognome,
  coalesce(u.numero_vendite, 0) as numero_vendite,
  u.data_fine_ultima,
  (case
    when ch.client_id is not null then 'chiuso'
    when u.client_id is null then 'mai_attivato'
    when u.attiva and u.data_fine_ultima <= public.oggi() + 30 then 'in_scadenza'
    when u.attiva then 'attivo'
    when u.da_iniziare then 'da_iniziare'
    when u.data_fine_ultima >= public.oggi() - 90 then 'scaduto'
    else 'ex_cliente'
  end)::public.client_status as stato
from public.clients c
left join ultima_vendita u on u.client_id = c.id
left join public.v_clienti_chiusi ch on ch.client_id = c.id;

revoke all on public.v_client_status from anon;

comment on view public.v_client_status is
  'Client status: chiuso (closed by the admin, wins over everything), then from sales: attivo, in_scadenza (<= 30gg), da_iniziare, scaduto (< 90gg), ex_cliente, mai_attivato.';

-- ---------------------------------------------------------------------------
-- Path reminders (20261004110000) without the closed clients.
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
      -- nor a client the admin closed ("Non rinnova", 04/10/2026): nothing is
      -- recorded, so reopened he gets the reminders still due
      and not exists (select 1 from public.v_clienti_chiusi ch where ch.client_id = p.cliente)
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
  'Path reminders due on a day (feedback 3 months before the end, renewal 1 month before), not yet handled, never for a closed client. service_role only: the daily cron.';

revoke all on function public.promemoria_percorso_da_inviare(date) from public, anon, authenticated;
grant execute on function public.promemoria_percorso_da_inviare(date) to service_role;
