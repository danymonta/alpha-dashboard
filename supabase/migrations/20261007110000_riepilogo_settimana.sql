-- The weekly summary (Dany, 07/10/2026: "non mi inviare ogni giorno la mail
-- con gli incassi e il recap del setter, mi basta ogni venerdì sera quindi una
-- volta a settimana"). The admins' email leaves the evening and goes out on
-- Friday evening (Europe/Rome), with the week from Saturday to Friday: seven
-- days, so nothing falls between two emails. The cron stays daily (it keeps
-- Supabase awake, sends the Monday backup and the path reminders).
--
-- riepilogo_settimana(p_da, p_a): riepilogo_serale (20260929160000) over an
-- interval. The same fields, with da and a instead of giorno: every cash-in and
-- every sale with its own day, oldest first; late and due in the next 7 days
-- counted from p_a, as riepilogo_serale counted them from its day (the late
-- clients: the 8 late the longest, and how many they are). In more:
-- the conversations and the calls booked of the setters' reports, the
-- no-shows (calls by day of programmata_il in Europe/Rome, like held and
-- closed), and the cash in its four parts (section 9: new clients of the
-- period, instalments of clients already in, renewals, upsells), so the email
-- never adds up amounts. A valid interval: da <= a, 31 days at most (22023).
-- Team totals and clients only: nobody is named for what they filled in or
-- not (section 17). Only the cron (service role) reads it.
--
-- riepilogo_serale has no reader any more: it goes.

create function public.riepilogo_settimana(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido: la data di inizio deve venire prima della fine'
      using errcode = '22023';
  end if;
  if p_a - p_da > 30 then
    raise exception 'Periodo non valido: al massimo 31 giorni' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'da', p_da,
    'a', p_a,
    'cash', (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) from public.payments p
             where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a),
    -- the four parts add up to cash: a new sale signed from p_da on is a new
    -- client of the period (an advance cashed before the signature included)
    'cash_per_parte', (select jsonb_build_object(
                  'nuovi_clienti', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= p_da), 0)::numeric(12, 2),
                  'rate_precedenti', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita < p_da), 0)::numeric(12, 2),
                  'rinnovo', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2),
                  'upsell', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2))
               from public.payments p join public.sales s on s.id = p.sale_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a),
    'incassi', coalesce((select jsonb_agg(jsonb_build_object(
                  'giorno', p.incassato_il,
                  'cliente', concat_ws(' ', cl.nome, cl.cognome),
                  'importo', p.importo_incassato,
                  'metodo', p.metodo,
                  'rimborso', p.stato = 'rimborsata',
                  'tipo', s.tipo,
                  'numero_rata', p.numero_rata,
                  'numero_rate', s.numero_rate,
                  'parte', case
                             when s.tipo = 'nuovo' and s.data_vendita >= p_da then 'nuovi_clienti'
                             when s.tipo = 'nuovo' then 'rate_precedenti'
                             else s.tipo::text
                           end)
                  order by p.incassato_il, p.importo_incassato desc, p.id)
               from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a), '[]'::jsonb),
    'vendite', coalesce((select jsonb_agg(jsonb_build_object(
                  'giorno', s.data_vendita,
                  'cliente', concat_ws(' ', cl.nome, cl.cognome), 'tipo', s.tipo, 'valore', s.valore_contratto)
                  order by s.data_vendita, s.valore_contratto desc, s.id)
               from public.sales s join public.clients cl on cl.id = s.client_id
               where s.data_vendita between p_da and p_a), '[]'::jsonb),
    'vendite_per_tipo', (select jsonb_build_object(
                  'nuovo', count(*) filter (where s.tipo = 'nuovo'),
                  'rinnovo', count(*) filter (where s.tipo = 'rinnovo'),
                  'upsell', count(*) filter (where s.tipo = 'upsell'))
               from public.sales s where s.data_vendita between p_da and p_a),
    'in_ritardo', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p where p.stato = 'prevista' and p.scadenza < p_a),
    -- the 8 clients late the longest (each by his oldest late instalment): the
    -- limit comes after the order by due date, never by the client's uuid
    'clienti_in_ritardo', coalesce((select jsonb_agg(x.nome order by x.scadenza, x.nome) from (
                   select d.nome, d.scadenza from (
                     select distinct on (s.client_id) concat_ws(' ', cl.nome, cl.cognome) as nome, p.scadenza
                     from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
                     where p.stato = 'prevista' and p.scadenza < p_a
                     order by s.client_id, p.scadenza) d
                   order by d.scadenza, d.nome limit 8) x), '[]'::jsonb),
    -- all of them: the email says "e altri N" when the names are cut
    'clienti_in_ritardo_totale', (select count(distinct s.client_id)
                   from public.payments p join public.sales s on s.id = p.sale_id
                   where p.stato = 'prevista' and p.scadenza < p_a),
    'in_scadenza_7_giorni', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p
                   where p.stato = 'prevista' and p.scadenza between p_a + 1 and p_a + 7),
    'dm_totali', (select coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0) from public.setter_daily_reports r
                  where r.data between p_da and p_a),
    'conversazioni', (select coalesce(sum(r.conversazioni), 0) from public.setter_daily_reports r
                      where r.data between p_da and p_a),
    'call_prenotate', (select coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0) from public.setter_daily_reports r
                       where r.data between p_da and p_a),
    'call_svolte', (select count(*) from public.calls c
                    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
    'no_show', (select count(*) from public.calls c
                where c.stato = 'no_show' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
    'chiuse', (select count(*) from public.calls c
               where c.esito = 'chiusa' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a)
  );
end;
$$;

comment on function public.riepilogo_settimana(date, date) is
  'The admins'' weekly email (Friday evening, Saturday to Friday): cash (and its four parts), cash-ins and sales of [p_da, p_a] each with its day, oldest first; late and due in the next 7 days from p_a, with the 8 clients late the longest and how many are late; DM, conversations, calls booked (setters'' reports), held, no show, closed (calls by day of programmata_il). Team totals and clients only. Service role only; 31 days at most.';

-- only the cron (service role) reads it
revoke all on function public.riepilogo_settimana(date, date) from public, anon, authenticated;
grant execute on function public.riepilogo_settimana(date, date) to service_role;

-- the evening summary has no reader any more
drop function public.riepilogo_serale(date);
