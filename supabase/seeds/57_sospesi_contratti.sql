-- Demo data for "Sospendi" and the contract links (1.44.0, 21/10/2026): one invented client on hold
-- and one contract link on an invented sale. After seed.sql (clients and sales). Idempotent.

insert into public.clienti_sospensioni (client_id, sospeso_il, motivo)
select s.client_id, public.oggi() - 6, 'Viaggio di lavoro, riprende tra due settimane'
from public.v_client_status s
where s.stato = 'attivo'
order by s.client_id desc
limit 1
on conflict (client_id) do nothing;

insert into public.vendite_contratti (sale_id, url)
select v.sale_id, 'https://drive.google.com/file/d/1SeedContrattoEsempio/view'
from public.v_vendite v
join public.v_client_status s on s.client_id = v.client_id
where s.stato = 'attivo' and v.tipo = 'nuovo'
order by v.client_id
limit 1
on conflict (sale_id) do nothing;
