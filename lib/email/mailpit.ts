/**
 * The emails of the end-to-end tests (release B1a): with E2E_EMAIL_MAILPIT the app sends to
 * the local Mailpit (POST /api/v1/send) instead of Resend, so a test reads the client's code
 * as e2e/accesso-codice.spec.ts reads the team's. The rules of E2E_GRAPH_FINTO: only outside
 * production, only with the dev login on, only http on 127.0.0.1, localhost or [::1];
 * otherwise ignored, with a warning in the logs and no value. Pure, tested.
 */
const HOST_LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function baseMailpit(
  env: { E2E_EMAIL_MAILPIT?: string; NODE_ENV?: string; ENABLE_DEV_LOGIN?: string } = process.env,
): string | null {
  const valore = env.E2E_EMAIL_MAILPIT?.trim()
  if (!valore) return null
  if (env.NODE_ENV === 'production' || env.ENABLE_DEV_LOGIN !== 'true') {
    console.warn('[email] E2E_EMAIL_MAILPIT ignorata: vale solo in locale, col login di sviluppo')
    return null
  }
  try {
    const url = new URL(valore)
    if (url.protocol === 'http:' && HOST_LOOPBACK.has(url.hostname.toLowerCase())) return url.origin
  } catch {
    // not a URL: ignored below
  }
  console.warn('[email] E2E_EMAIL_MAILPIT ignorata: solo http su 127.0.0.1, localhost o [::1]')
  return null
}

/** The body Mailpit's send API wants. */
export function corpoMailpit(m: { a: string[]; oggetto: string; html: string; testo: string; mittente?: string }) {
  return {
    From: { Email: 'percorso@alpha.test', Name: m.mittente ?? 'Percorso Alpha' },
    To: m.a.map((Email) => ({ Email })),
    Subject: m.oggetto,
    Text: m.testo,
    HTML: m.html,
  }
}
