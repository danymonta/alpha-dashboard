-- New role (Dany, 08/10/2026): the Marketing area (the content calendar), plus
-- Progetti like the video editor. Never money, leads, calls, clients or DMs:
-- every Economics policy is an allow-list, so the new value gets nothing there
-- (products too, from 20261009120200).
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.app_role add value if not exists 'marketing' after 'editor';
