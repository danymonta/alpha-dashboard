-- Dany's call sheet rates calls on five levels, not three (28/09/2026):
-- Ottima, Buona, Discreta, Media, Scarsa. Existing values keep their meaning.
alter type public.call_performance add value if not exists 'ottima' before 'buona';
alter type public.call_performance add value if not exists 'discreta' after 'buona';
