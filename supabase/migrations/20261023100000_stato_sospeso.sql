-- A client on hold, set by the admin (Dany, 21/10/2026: "clienti in status
-- potrebbero andare in sospeso, chiusi che non hanno rinnovato e attivi").
-- New derived state: sospeso, listed after da_iniziare (the Clienti list is
-- ordered by status). Own migration: a new enum value cannot be used in the
-- transaction that adds it; the next migration uses it.
alter type public.client_status add value if not exists 'sospeso' after 'da_iniziare';
