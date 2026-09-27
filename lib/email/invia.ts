import 'server-only'

/**
 * Transactional email through Resend (https://resend.com), plain REST, no SDK.
 * Not configured (no RESEND_API_KEY or EMAIL_MITTENTE): nothing is sent and the
 * caller falls back to "copy the link".
 */
export type EsitoInvio = { inviata: true } | { inviata: false; motivo: 'non_configurata' | 'errore' }

export function emailConfigurata() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_MITTENTE)
}

export async function inviaEmail(m: {
  a: string | string[]
  oggetto: string
  html: string
  testo: string
  allegati?: { nome: string; contenuto: Buffer }[]
}): Promise<EsitoInvio> {
  const chiave = process.env.RESEND_API_KEY
  const mittente = process.env.EMAIL_MITTENTE
  if (!chiave || !mittente) return { inviata: false, motivo: 'non_configurata' }

  try {
    const risposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: mittente,
        to: Array.isArray(m.a) ? m.a : [m.a],
        subject: m.oggetto,
        html: m.html,
        text: m.testo,
        ...(m.allegati?.length
          ? { attachments: m.allegati.map((f) => ({ filename: f.nome, content: f.contenuto.toString('base64') })) }
          : {}),
      }),
    })
    if (!risposta.ok) {
      console.error('[email] invio non riuscito:', risposta.status, await risposta.text())
      return { inviata: false, motivo: 'errore' }
    }
    return { inviata: true }
  } catch (e) {
    console.error('[email] invio non riuscito:', e)
    return { inviata: false, motivo: 'errore' }
  }
}
