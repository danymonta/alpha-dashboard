-- A client who does not renew, closed by the admin (Dany, 04/10/2026: "se il
-- cliente non rinnova deve mettersi come chiuso e deve andare in una categoria
-- a parte"). New derived state: chiuso, listed after scaduto (the Clienti list
-- is ordered by status). Own migration: a new enum value cannot be used in the
-- transaction that adds it; the next migration uses it.
alter type public.client_status add value if not exists 'chiuso' after 'scaduto';
