/**
 * The invite email: HTML that holds up in Gmail, Apple Mail and Outlook
 * (tables, inline styles, a PNG logo), plus the plain-text version.
 * Pure: tested in tests/email-invito.test.ts, sent by lib/email/invia.ts.
 */
const BORDEAUX = '#7A1F2B'
const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'

function escape(testo: string) {
  return testo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type DatiInvito = {
  email: string
  /** "Setter", "Closer"…, already in Italian */
  ruolo: string
  /** Who invites, e.g. "Dany Montagnolo" */
  invitatoDa: string
  /** https://…/login */
  urlLogin: string
  /** https://…/brand/percorso-alpha-email.png */
  urlLogo: string
}

export function emailInvito(d: DatiInvito): { oggetto: string; html: string; testo: string } {
  const oggetto = 'Ti aspettiamo nel team di Percorso Alpha'
  const nomeInvito = escape(d.invitatoDa.split(' ')[0] ?? d.invitatoDa)

  const testo = [
    'Ciao!',
    '',
    `${d.invitatoDa} ti ha invitato nello spazio di lavoro del team di Percorso Alpha, come ${d.ruolo}.`,
    '',
    `Entra da qui con il tuo account Google (${d.email}):`,
    d.urlLogin,
    '',
    'Usa proprio questo indirizzo: l’accesso è riservato a chi è stato invitato.',
    '',
    'A presto,',
    'Percorso Alpha',
  ].join('\n')

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${oggetto}</title>
</head>
<body style="margin:0;padding:0;background:${SFONDO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SFONDO};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px;">
      <tr><td align="center" style="padding:32px 32px 8px;">
        <img src="${escape(d.urlLogo)}" width="112" alt="Percorso Alpha" style="display:block;width:112px;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:16px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;text-align:center;">Benvenuto nel team</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;text-align:center;">
          ${nomeInvito} ti ha invitato nello spazio di lavoro di <strong>Percorso Alpha</strong>, come <strong>${escape(d.ruolo)}</strong>.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="${BORDEAUX}" style="border-radius:8px;">
            <a href="${escape(d.urlLogin)}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">Entra con Google</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TENUE};">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;text-align:center;">
          Usa l’account Google di <strong style="color:${TESTO};">${escape(d.email)}</strong>: l’accesso è riservato a chi è stato invitato.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;text-align:center;">
          Se il bottone non funziona, copia questo indirizzo nel browser:<br>
          <a href="${escape(d.urlLogin)}" style="color:${BORDEAUX};word-break:break-all;">${escape(d.urlLogin)}</a>
        </p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${TENUE};">Percorso Alpha · coaching di trasformazione fisica</p>
  </td></tr>
</table>
</body>
</html>`

  return { oggetto, html, testo }
}
