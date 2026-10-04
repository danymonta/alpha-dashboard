-- A path not started yet has not ended (04/10/2026). Since 02/10/2026 a new
-- sale starts a week after it is signed, and v_client_status called the client
-- "scaduto" until then. New state: da_iniziare, listed after in_scadenza.
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.client_status add value if not exists 'da_iniziare' after 'in_scadenza';
