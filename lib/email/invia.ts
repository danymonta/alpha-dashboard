import 'server-only'

import { baseMailpit, corpoMailpit } from '@/lib/email/mailpit'

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
  /**
   * Resend's Idempotency-Key: the same key with the same email within 24 hours
   * is sent once (a retry after a lost answer never doubles it).
   */
  idempotenza?: string
  /** Gives up after this long (the answer may be lost, the email maybe sent). */
  timeoutMs?: number
}): Promise<EsitoInvio> {
  // the end-to-end tests: the local Mailpit instead of Resend (lib/email/mailpit.ts)
  const mailpit = baseMailpit()
  if (mailpit) return inviaAMailpit(mailpit, m)

  const chiave = process.env.RESEND_API_KEY
  const mittente = process.env.EMAIL_MITTENTE
  if (!chiave || !mittente) return { inviata: false, motivo: 'non_configurata' }

  try {
    const risposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chiave}`,
        'Content-Type': 'application/json',
        ...(m.idempotenza ? { 'Idempotency-Key': m.idempotenza } : {}),
      },
      ...(m.timeoutMs ? { signal: AbortSignal.timeout(m.timeoutMs) } : {}),
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

async function inviaAMailpit(
  base: string,
  m: { a: string | string[]; oggetto: string; html: string; testo: string; timeoutMs?: number },
): Promise<EsitoInvio> {
  try {
    const risposta = await fetch(`${base}/api/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(m.timeoutMs ?? 8000),
      body: JSON.stringify(corpoMailpit({ a: Array.isArray(m.a) ? m.a : [m.a], oggetto: m.oggetto, html: m.html, testo: m.testo })),
    })
    if (!risposta.ok) {
      console.error('[email] Mailpit non ha accettato:', risposta.status)
      return { inviata: false, motivo: 'errore' }
    }
    return { inviata: true }
  } catch {
    console.error('[email] Mailpit non risponde')
    return { inviata: false, motivo: 'errore' }
  }
}
