-- The notification center, demo data (1.41.0): three invented notifications for the admin, one recap not read yet,
-- one path reminder already read and the weekly backup. Invented clients and figures, no real data. The email
-- bodies are small stand-ins of what the app generates. Fixed keys, idempotent. After 25_marketing.sql.

insert into public.notifiche (destinatario_id, tipo, titolo, anteprima, corpo_html, link, email_inviata, chiave, letta_il, created_at)
select p.id, v.tipo, v.titolo, v.anteprima, v.corpo_html, v.link, v.email_inviata, v.chiave, v.letta_il, v.created_at
from public.profiles p
cross join (values
  ('riepilogo_settimana', 'Alpha Management · settimana dal 10/10 al 16/10: 3.200,00 € incassati',
   'Cash della settimana 3.200,00 €, 2 vendite, 4 rate in ritardo.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Settimana dal 10/10 al 16/10</p><p style="margin:0 0 16px;font-size:14px;color:#6B6B70;">Cash incassato 3.200,00 €</p><p style="font-size:14px;margin:0;">2 vendite nuove, 4 rate in ritardo da guardare.</p></td></tr></table></body></html>',
   '/payments', true, 'seed/riepilogo-settimana', null::timestamptz, now() - interval '2 hours'),
  ('promemoria_rinnovo', 'Call di rinnovo con Mario Esempio: il percorso finisce il 18/11/2026',
   'Mario Esempio · Percorso Alpha 6 mesi · tra 30 giorni.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Call di rinnovo con Mario Esempio</p><p style="margin:0;font-size:14px;color:#6B6B70;">Il percorso finisce il 18/11/2026.</p></td></tr></table></body></html>',
   '/rinnovi', true, 'seed/promemoria-rinnovo', now() - interval '3 days', now() - interval '4 days'),
  ('backup', 'Backup settimanale Alpha Management · 12/10/2026',
   'Il backup è stato mandato per email: tienila, l''allegato è la copia completa del database.',
   '<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 4px;font-size:18px;font-weight:600;">Backup del 12/10/2026</p><p style="margin:0;font-size:14px;color:#6B6B70;">Il file è nell''email.</p></td></tr></table></body></html>',
   '/settings/export', true, 'seed/backup', now() - interval '6 days', now() - interval '7 days')
) as v(tipo, titolo, anteprima, corpo_html, link, email_inviata, chiave, letta_il, created_at)
where p.id = '11111111-1111-4111-8111-111111111111'
on conflict (destinatario_id, chiave) do nothing;
