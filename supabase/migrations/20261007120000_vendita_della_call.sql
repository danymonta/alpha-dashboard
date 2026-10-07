-- The sale of a closed call (07/10/2026, "Vendita da registrare"): a closed
-- call booked in the app without its sale shows «Vendita da registrare» to its
-- closer and the admin. The mark of the imported calls, and two holes under
-- that net, closed here.
--
-- 0. calls.importata: the calls imported from Dany's call sheet never ask for
--    their sale (their sales came from the Excel, without the call). An
--    explicit mark, never the missing author: elimina_persona empties
--    calls.created_by too, and the closed calls of a deleted setter or closer
--    would stop asking, commission lost. Written by scripts/import-prospect.ts
--    (service role); no session but the admin's changes it (42501).
-- 1. call_ha_vendita(calls): a computed field, whether the call has its sale.
--    The closer reads only the sales he closed (sales_select_own_closer): a
--    sale of his call that carries another closer (changed on the sale, or the
--    call handed to him after the sale) did not exist for him, and the call
--    asked for its sale forever, with a "Registra la vendita" that always
--    failed (sales_una_per_call). security definer, only a boolean, only on a
--    call the caller reads as its closer or as the admin; no amount leaves.
-- 2. A sale registered without the call (Vendite › Nuova vendita without the
--    call, Alfire without call_id) could not be tied to it afterwards: the
--    call kept asking, and "Registra la vendita" made a second client and a
--    second sale (money and commission counted twice). The admin now ties it:
--    vendite_da_collegare(call) proposes the sales without a call of a client
--    with the lead's name or handle (or born from the lead), then those signed
--    within a month of the call; collega_vendita_call(call, sale) writes
--    sales.call_id, one sale per call (sales_una_per_call). Nothing else of the
--    sale changes (setter, closer, amounts: the sale's own sheet). Only the
--    admin ties (42501): the closer asks him. The call's closer reads the
--    candidates among his own sales (vendite_da_collegare filtered on
--    auth.uid()), so the new sale warns him before he makes a second one.

-- ---------------------------------------------------------------------------
-- 0. calls.importata
-- ---------------------------------------------------------------------------
alter table public.calls add column importata boolean not null default false;

comment on column public.calls.importata is
  'True on the calls imported from Dany''s call sheet (scripts/import-prospect.ts): their sales came from the Excel without the call, so a closed one never asks for its sale («Vendita da registrare»). Written by the import (no session) and the admin only.';

-- The imported calls already there: no author (the import has no session;
-- every app path writes created_by) and the import's lead or its type (the
-- import writes strategy, the app books only discovery). A call without
-- author that is neither, of a person deleted before today, keeps asking.
-- Triggers off for this one update: updated_at stays the day of the import.
alter table public.calls disable trigger user;
update public.calls c
set importata = true
where c.created_by is null
  and (
    c.tipo = 'strategy'
    or exists (
      select 1 from public.leads l
      where l.id = c.lead_id and l.note = 'Importato dal foglio delle call'
    )
  );
alter table public.calls enable trigger user;

create function public.calls_importata_coerenza()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  -- the admin writes everything; the import, seeds and the service role have no session
  if v_ruolo is null or v_ruolo = 'admin' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.importata)
     or (tg_op = 'UPDATE' and new.importata is distinct from old.importata) then
    raise exception 'Una call importata la segna solo l''import' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.calls_importata_coerenza() is
  'calls.importata: no session but the admin''s inserts a call marked imported or changes the mark (42501). The import, seeds and the service role have no session.';

create trigger calls_importata_coerenza
  before insert or update on public.calls
  for each row execute function public.calls_importata_coerenza();

-- ---------------------------------------------------------------------------
-- 1. call_ha_vendita
-- ---------------------------------------------------------------------------
create function public.call_ha_vendita(c public.calls)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sales s where s.call_id = c.id)
  -- only on a call the caller reads as the admin or as its closer, checked on
  -- the stored row (never on the row passed in): null otherwise
  where exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.is_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
      )
  )
$$;

comment on function public.call_ha_vendita(public.calls) is
  'Computed field: whether a sale is tied to the call (sales.call_id), whatever RLS lets the caller read of sales. Only for the admin and the call''s closer, on the stored row; null otherwise. A boolean, never an amount.';

revoke all on function public.call_ha_vendita(public.calls) from public, anon;
grant execute on function public.call_ha_vendita(public.calls) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. vendite_da_collegare: the sales the admin may tie to a closed call
-- ---------------------------------------------------------------------------
create function public.vendite_da_collegare(p_call_id uuid)
returns table (
  sale_id uuid,
  cliente text,
  tipo public.sale_type,
  data_vendita date,
  valore_contratto numeric,
  setter text,
  stesso_cliente boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_admin boolean := public.is_admin();
  v_closer uuid;
  v_giorno date;
  v_lead uuid;
  v_nome text;
  v_handle text;
begin
  if not v_admin and public.current_role() is distinct from 'closer' then
    raise exception 'Le vendite da collegare alla call le vedono il suo closer e l''admin.' using errcode = '42501';
  end if;

  -- RLS: the closer reads only the calls assigned to him
  select c.closer_id,
         (c.programmata_il at time zone 'Europe/Rome')::date,
         c.lead_id,
         lower(btrim(regexp_replace(l.nome, '\s+', ' ', 'g'))),
         nullif(lower(ltrim(btrim(l.instagram_handle), '@')), '')
    into v_closer, v_giorno, v_lead, v_nome, v_handle
  from public.calls c
  left join public.leads l on l.id = c.lead_id
  where c.id = p_call_id;

  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if not v_admin and v_closer is distinct from v_utente then
    raise exception 'Le vendite da collegare alla call le vedono il suo closer e l''admin.' using errcode = '42501';
  end if;

  return query
  with candidate as (
    select
      s.id,
      concat_ws(' ', cl.nome, cl.cognome) as cliente_,
      s.tipo as tipo_,
      s.data_vendita as data_,
      s.valore_contratto as valore_,
      pr.nome as setter_,
      (
        cl.lead_id = v_lead
        or lower(btrim(regexp_replace(concat_ws(' ', cl.nome, cl.cognome), '\s+', ' ', 'g'))) = v_nome
        or (v_handle is not null and nullif(lower(ltrim(btrim(cl.instagram_handle), '@')), '') = v_handle)
      ) as stesso
    from public.sales s
    join public.clients cl on cl.id = s.client_id
    left join public.profiles pr on pr.id = s.setter_id
    where s.call_id is null
      -- the closer only his own sales (RLS says the same; amounts filtered on the caller)
      and (v_admin or s.closer_id = v_utente)
  )
  select k.id, k.cliente_, k.tipo_, k.data_, k.valore_, k.setter_, coalesce(k.stesso, false)
  from candidate k
  where coalesce(k.stesso, false) or k.data_ between v_giorno - 31 and v_giorno + 31
  order by coalesce(k.stesso, false) desc, abs(k.data_ - v_giorno), k.data_ desc, k.id
  limit 20;
end;
$$;

comment on function public.vendite_da_collegare(uuid) is
  'The sales without a call the admin may tie to a closed call: first those of a client with the lead''s name or Instagram handle (or born from the lead), then those signed within 31 days of the call, nearest first; 20 at most. The admin, and the call''s closer among his own sales (the new sale warns him of one already there; only the admin ties it). 42501 for everyone else.';

revoke all on function public.vendite_da_collegare(uuid) from public, anon;
grant execute on function public.vendite_da_collegare(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. collega_vendita_call: tie a sale registered without the call to it
-- ---------------------------------------------------------------------------
-- security invoker: the admin writes sales under RLS as everywhere, and the
-- audit trigger records him.
create function public.collega_vendita_call(p_call_id uuid, p_sale_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_esito public.call_outcome;
  v_call_della_vendita uuid;
begin
  if not public.is_admin() then
    raise exception 'La vendita la collega alla call solo l''admin.' using errcode = '42501';
  end if;

  -- the call, locked: two taps at once tie one sale
  select c.esito into v_esito
  from public.calls c
  where c.id = p_call_id
  for update;
  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if v_esito is distinct from 'chiusa' then
    raise exception 'La call non risulta chiusa: registra prima l''esito' using errcode = '22023';
  end if;

  select s.call_id into v_call_della_vendita
  from public.sales s
  where s.id = p_sale_id
  for update;
  if not found then
    raise exception 'Vendita non trovata.' using errcode = 'P0002';
  end if;

  -- already tied to this call: nothing to do
  if v_call_della_vendita = p_call_id then
    return;
  end if;
  if v_call_della_vendita is not null then
    raise exception 'Questa vendita è già collegata a un''altra call.' using errcode = '22023';
  end if;
  if exists (select 1 from public.sales s where s.call_id = p_call_id) then
    raise exception 'Questa call ha già una vendita registrata' using errcode = '23505';
  end if;

  update public.sales set call_id = p_call_id where id = p_sale_id;
end;
$$;

comment on function public.collega_vendita_call(uuid, uuid) is
  'Ties a sale registered without the call to a closed call (sales.call_id): one sale per call, a sale tied to another call stays where it is. Nothing else of the sale changes. Admin only (42501).';

revoke all on function public.collega_vendita_call(uuid, uuid) from public, anon;
grant execute on function public.collega_vendita_call(uuid, uuid) to authenticated;
