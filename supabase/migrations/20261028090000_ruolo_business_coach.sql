-- New role (Dany, 22/10/2026: «Voglio che il business coach abbia accessi in
-- lettura e veda tutto»): an external consultant who reads what the admin reads
-- and never writes. Every write policy and every write function stays an
-- allow-list without this value; the read policies and the read functions come
-- in 20261028090100_business_coach_lettura.sql.
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.app_role add value if not exists 'business_coach' after 'dev';
