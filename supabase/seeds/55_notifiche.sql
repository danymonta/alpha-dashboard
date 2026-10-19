-- The notification center, demo data (1.41.0, alerts 1.42.0): three invented notifications for the admin, one recap not read yet,
-- one path reminder already read and the weekly backup. Invented clients and figures, no real data. The email
-- bodies are small stand-ins of what the app generates. Fixed keys, idempotent. After 25_marketing.sql.

insert into public.notifiche (id, destinatario_id, tipo, titolo, anteprima, corpo_html, link, email_inviata, chiave, letta_il, created_at)
select v.id, p.id, v.tipo, v.titolo, v.anteprima, v.corpo_html, v.link, v.email_inviata, v.chiave, v.letta_il, v.created_at
from public.profiles p
cross join (values
  ('dd000001-0000-4000-8000-000000000001'::uuid, 'riepilogo_settimana', 'Alpha Management · settimana dal 10/10 al 16/10: 3.200,00 € incassati',
   'Cash della settimana 3.200,00 €, 2 vendite, 4 rate in ritardo.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Settimana dal 10/10 al 16/10</p><p style="margin:0 0 16px;font-size:14px;color:#6B6B70;">Cash incassato 3.200,00 €</p><p style="font-size:14px;margin:0;">2 vendite nuove, 4 rate in ritardo da guardare.</p></td></tr></table></body></html>',
   '/payments', true, 'seed/riepilogo-settimana', null::timestamptz, now() - interval '2 hours'),
  ('dd000001-0000-4000-8000-000000000002'::uuid, 'promemoria_rinnovo', 'Call di rinnovo con Mario Esempio: il percorso finisce il 18/11/2026',
   'Mario Esempio · Percorso Alpha 6 mesi · tra 30 giorni.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Call di rinnovo con Mario Esempio</p><p style="margin:0;font-size:14px;color:#6B6B70;">Il percorso finisce il 18/11/2026.</p></td></tr></table></body></html>',
   '/rinnovi', true, 'seed/promemoria-rinnovo', now() - interval '3 days', now() - interval '4 days'),
  ('dd000001-0000-4000-8000-000000000003'::uuid, 'backup', 'Backup settimanale Alpha Management · 12/10/2026',
   'Il backup è stato mandato per email: tienila, l''allegato è la copia completa del database.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Backup del 12/10/2026</p><p style="margin:0;font-size:14px;color:#6B6B70;">Il file è nell''email.</p></td></tr></table></body></html>',
   '/settings/export', true, 'seed/backup', now() - interval '6 days', now() - interval '7 days')
) as v(id, tipo, titolo, anteprima, corpo_html, link, email_inviata, chiave, letta_il, created_at)
where p.id = '11111111-1111-4111-8111-111111111111'
on conflict (destinatario_id, chiave) do nothing;

-- The in-app alerts of 1.42.0 (no email, no HTML): one of each kind, invented clients and figures. Their keys
-- start with seed/, so the real writers never collide with them.
insert into public.notifiche (id, destinatario_id, tipo, titolo, anteprima, dettagli, link, email_inviata, chiave, canale, letta_il, created_at)
select v.id, p.id, v.tipo, v.titolo, v.anteprima, v.dettagli, v.link, false, v.chiave, 'app', v.letta_il, v.created_at
from public.profiles p
cross join (values
  ('dd000001-0000-4000-8000-000000000004'::uuid, 'rate_in_ritardo', '2 rate sono andate in ritardo',
   '800,00 € da incassare, la più vecchia scaduta il 12/10/2026.',
   '["Mario Esempio · Rata 2 di 4 · 500,00 € · scaduta il 12/10/2026", "Giulia Prova · Rata 1 di 3 · 300,00 € · scaduta il 17/10/2026"]'::jsonb,
   '/payments?vista=ritardo', 'seed/rate-in-ritardo', null::timestamptz, now() - interval '1 hour'),
  ('dd000001-0000-4000-8000-000000000005'::uuid, 'chiave_in_scadenza', 'Il token di Instagram scade il 24/10/2026: rigeneralo in Impostazioni › Chiavi e collegamenti',
   'Mancano 5 giorni. Dopo non si leggono più i DM, i post e l’Insight.',
   '["Senza un token valido si fermano il tracciamento dei DM, la lettura dei post per il calendario dei contenuti e l’Insight.", "Meta › Alpha DM Reader › Instagram › Genera token: la guida passo passo è nella scheda Instagram."]'::jsonb,
   '/settings/chiavi', 'seed/instagram-token-scade', null::timestamptz, now() - interval '3 hours'),
  ('dd000001-0000-4000-8000-000000000006'::uuid, 'chiave_rifiutata', 'Fathom ha rifiutato la chiave API: generane una nuova in Impostazioni › Chiavi e collegamenti',
   'Le registrazioni delle call non si leggono e le analisi di Claude sulle call restano ferme.',
   '["Fathom › My Settings › API Access › Generate Api Key: la guida è nella scheda Fathom."]'::jsonb,
   '/settings/chiavi', 'seed/fathom-chiave-rifiutata', now() - interval '1 day', now() - interval '2 days'),
  ('dd000001-0000-4000-8000-000000000007'::uuid, 'proposta_da_approvare', 'Da approvare: il tracciamento di Loris di ieri, domenica 18/10',
   'Sono i numeri contati dai DM: confermali, correggili o tieni quelli del setter.',
   null::jsonb,
   '/setting#da-approvare', 'seed/proposta', null::timestamptz, now() - interval '5 hours'),
  ('dd000001-0000-4000-8000-000000000008'::uuid, 'spesa_claude', 'La spesa di Claude è all’80% del limite: le analisi dei reel',
   '20,40 $ su 25,00 $ questo mese. Al limite le analisi dei reel si fermano fino al 1° novembre.',
   '["Puoi alzare il limite del mese nelle impostazioni."]'::jsonb,
   '/settings/instagram#analisi-reel', 'seed/spesa-reel-80', now() - interval '2 hours', now() - interval '8 hours')
) as v(id, tipo, titolo, anteprima, dettagli, link, chiave, letta_il, created_at)
where p.id = '11111111-1111-4111-8111-111111111111'
on conflict (destinatario_id, chiave) do nothing;
