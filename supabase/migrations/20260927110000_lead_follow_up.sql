-- Pipeline: Call fissata -> Follow-up -> Cliente / Perso (Dany, 26/09/2026).
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.lead_status add value if not exists 'follow_up' after 'call_fissata';
