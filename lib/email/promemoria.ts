import { formatData } from '@/lib/format'
import { linkWhatsApp, messaggioFeedback, messaggioRinnovo } from '@/lib/whatsapp'

/**
 * The two reminders of a client's path (Dany, 04/10/2026), one email each, to
 * the admins only: "Call dei 3 mesi" 3 months before the end, to collect the
 * feedback, and "Call di rinnovo" 1 month before. The same layout as the invite
 * (lib/email/invito.ts): tables, inline styles, the PNG logo, plain text too.
 * Pure: tested in tests/promemoria-percorso.test.ts, sent by lib/promemoria/percorso.ts.
 */
export type TipoPromemoria = 'feedback_3_mesi' | 'rinnovo_1_mese'

/** One row of public.promemoria_percorso_da_inviare. */
export type Promemoria = {
  client_id: string
  sale_id: string
  tipo: TipoPromemoria
  /** 'invia' = send it now; 'salta' = catch-up, recorded as skipped without sending */
  azione: 'invia' | 'salta' | string
  nome: string | null
  cognome: string | null
  telefono: string | null
  prodotto: string | null
  data_inizio: string
  data_fine: string
  giorni_mancanti: number
}

const BORDEAUX = '#7A1F2B'
const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
/** Once per path end: a corrected end, or a renewal, makes a new one. */
const PIE_DI_PAGINA = 'Ti arriva una volta sola; se cambia la data di fine del percorso, ti arriva di nuovo per quella nuova.'

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function nomeCliente(p: Pick<Promemoria, 'nome' | 'cognome'>): string {
  return [p.nome, p.cognome].map((v) => v?.trim()).filter(Boolean).join(' ') || 'Cliente senza nome'
}

/** "tra 92 giorni", "tra 1 giorno", "oggi": how far the end is. */
export function traQuanto(giorni: number): string {
  if (giorni <= 0) return 'oggi'
  return giorni === 1 ? 'tra 1 giorno' : `tra ${giorni} giorni`
}

/** The links of a reminder: the client sheet, the renewal form, WhatsApp with the message written. */
export function linkPromemoria(p: Promemoria, urlApp: string, oggi: string) {
  const base = urlApp.replace(/\/$/, '')
  const nome = p.nome
  return {
    scheda: `${base}/clients/${p.client_id}`,
    rinnovo: p.tipo === 'rinnovo_1_mese' ? `${base}/sales/new?cliente=${p.client_id}&tipo=rinnovo` : null,
    whatsapp: linkWhatsApp(
      p.telefono,
      p.tipo === 'rinnovo_1_mese' ? messaggioRinnovo({ nome, data_fine: p.data_fine, oggi }) : messaggioFeedback({ nome }),
    ),
    logo: `${base}/brand/percorso-alpha-email.png`,
  }
}

/**
 * The colour and the border sit on the cell, as in the invite: Outlook on the
 * desktop ignores them on a link, and the button would become plain text.
 */
function bottone(href: string, etichetta: string, primario: boolean) {
  const sfondo = primario ? BORDEAUX : '#FFFFFF'
  const colore = primario ? '#FFFFFF' : BORDEAUX
  return `<tr><td style="padding:0 0 10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${sfondo}" style="background:${sfondo};border:1px solid ${BORDEAUX};border-radius:8px;">
              <a href="${escape(href)}" style="display:block;padding:13px 20px;border-radius:8px;font-family:${FONT};font-size:16px;font-weight:600;color:${colore};text-align:center;text-decoration:none;">${escape(etichetta)}</a>
            </td>
          </tr></table>
        </td></tr>`
}

export function emailPromemoria(
  p: Promemoria,
  d: { urlApp: string; oggi: string },
): { oggetto: string; html: string; testo: string } {
  const nome = nomeCliente(p)
  const fine = formatData(p.data_fine)
  const quando = traQuanto(p.giorni_mancanti)
  const link = linkPromemoria(p, d.urlApp, d.oggi)
  const rinnovo = p.tipo === 'rinnovo_1_mese'

  const titolo = rinnovo ? `Call di rinnovo con ${nome}` : `Call dei 3 mesi con ${nome}`
  const oggetto = rinnovo ? `${titolo}: il percorso finisce il ${fine}` : `${titolo}: raccogli il feedback`
  const etichetta = rinnovo ? 'Promemoria · Call di rinnovo' : 'Promemoria · Call dei 3 mesi'
  const fineFrase = p.giorni_mancanti <= 0 ? `finisce oggi, ${fine}` : `finisce il ${fine}, ${quando}`
  const frase = rinnovo
    ? `Il percorso di ${nome} ${fineFrase}: contattalo per la call di rinnovo.`
    : `Il percorso di ${nome} ${fineFrase}: fissa la call dei 3 mesi per raccogliere il suo feedback, com’è andata finora e cosa migliorare.`
  const giorni = p.giorni_mancanti <= 0 ? 'Finisce oggi' : p.giorni_mancanti === 1 ? '1 giorno' : `${p.giorni_mancanti} giorni`

  const dettagli: [string, string][] = [
    ['Cliente', nome],
    ['Percorso', p.prodotto?.trim() || '–'],
    ['Inizio', formatData(p.data_inizio)],
    ['Fine', fine],
    ['Giorni alla fine', giorni],
  ]
  const azioni: [string, string][] = [
    ['Apri la scheda del cliente', link.scheda],
    ...(link.whatsapp ? ([['Scrivi su WhatsApp', link.whatsapp]] as [string, string][]) : []),
    ...(link.rinnovo ? ([['Registra rinnovo', link.rinnovo]] as [string, string][]) : []),
  ]

  const testo = [
    titolo,
    '',
    frase,
    '',
    ...dettagli.map(([k, v]) => `${k}: ${v}`),
    '',
    ...azioni.map(([k, v]) => `${k}: ${v}`),
    '',
    `${PIE_DI_PAGINA} Alpha Management, Percorso Alpha`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(oggetto)}</title>
</head>
<body style="margin:0;padding:0;background:${SFONDO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SFONDO};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px;">
      <tr><td align="center" style="padding:28px 32px 4px;">
        <img src="${escape(link.logo)}" width="96" alt="Percorso Alpha" style="display:block;width:96px;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:16px 32px 0;font-family:${FONT};color:${TESTO};">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.02em;color:${BORDEAUX};text-align:center;text-transform:uppercase;">${escape(etichetta)}</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;text-align:center;">${escape(titolo)}</h1>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.5;text-align:center;">${escape(frase)}</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;border-top:1px solid #E6E3DD;">
          ${dettagli
            .map(
              ([k, v]) =>
                `<tr><td style="padding:8px 0;color:${TENUE};border-bottom:1px solid #E6E3DD;">${escape(k)}</td><td style="padding:8px 0;color:${TESTO};text-align:right;font-weight:600;font-variant-numeric:tabular-nums;border-bottom:1px solid #E6E3DD;">${escape(v)}</td></tr>`,
            )
            .join('')}
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${azioni.map(([etichettaAzione, href], i) => bottone(href, etichettaAzione, i === 0)).join('')}
        </table>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${TENUE};text-align:center;">${escape(PIE_DI_PAGINA)} Alpha Management · Percorso Alpha</p>
  </td></tr>
</table>
</body>
</html>`

  return { oggetto, html, testo }
}
