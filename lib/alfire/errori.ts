import { APICallError, RetryError, StreamProviderError } from 'ai'

/** After its last retry the SDK wraps the provider's error: the cause is inside. */
function causa(error: unknown): unknown {
  return RetryError.isInstance(error) ? (error.lastError ?? error) : error
}

/** Groq and OpenAI answer {"error":{"message":"…"}}: the message says which limit. */
function testoFornitore(e: APICallError): string {
  try {
    const corpo = JSON.parse(e.responseBody ?? '') as { error?: { message?: unknown } }
    if (typeof corpo.error?.message === 'string') return corpo.error.message
  } catch {
    // not JSON: the SDK's own message below
  }
  return e.message
}

/** The provider's words, whatever the error looks like. */
function testoErrore(e: unknown): string {
  if (APICallError.isInstance(e)) return testoFornitore(e)
  if (StreamProviderError.isInstance(e)) return `${e.code ?? ''} ${e.message}`
  return e instanceof Error ? e.message : String(e)
}

/**
 * Groq refuses a tool call the model got wrong: a tool it was not given, or
 * arguments that do not fit the schema. Asked again, the same step usually
 * comes out right, so these are retried before the chat hears of them.
 */
export function erroreStrumentoRiprovabile(error: unknown): boolean {
  return /tool call validation failed|tool_use_failed|failed to call a function|failed_generation/i.test(
    testoErrore(causa(error)),
  )
}

/** No organization ids in the chat, and a line, not a page. */
function breve(testo: string): string {
  return testo.replace(/org_[A-Za-z0-9]+/g, 'org_…').replace(/\s+/g, ' ').trim().slice(0, 180)
}

/** "Please try again in 7.5s" / "in 12m30.4s" / "in 1h2m3s" → "tra 8 secondi" / "tra 13 minuti" / "tra circa 1 ora". */
export function attesa(testo: string): string | null {
  const m = testo.match(/try again in\s+((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?)/i)?.[1]
  if (!m) return null
  const ore = Number(m.match(/(\d+)h/)?.[1] ?? 0)
  const minuti = Number(m.match(/(\d+)m(?!s)/)?.[1] ?? 0)
  const secondi = Number(m.match(/([\d.]+)s/)?.[1] ?? 0)
  const totale = Math.ceil(ore * 3600 + minuti * 60 + secondi)
  if (totale <= 0) return null
  if (totale < 90) return `tra ${totale} secondi`
  if (totale < 90 * 60) return `tra ${Math.ceil(totale / 60)} minuti`
  const h = Math.round(totale / 3600)
  return `tra circa ${h} ${h === 1 ? 'ora' : 'ore'}`
}

/**
 * What the chat says when the model does not answer. The free tier's limits
 * are the usual cause: which one, and when it comes back. The admin also sees
 * the provider's words for anything unexpected.
 */
export function messaggioErroreAlfire(error: unknown, { admin }: { admin: boolean }): string {
  const e = causa(error)
  if (erroreStrumentoRiprovabile(e)) {
    return 'Alfire non è riuscito a usare lo strumento giusto nemmeno riprovando. Ripeti la richiesta con parole semplici, ad esempio «registra l’incasso di 400 € di Mario Rossi».'
  }
  if (!APICallError.isInstance(e)) {
    return admin && e instanceof Error && e.message ? `Alfire non ha risposto: ${breve(e.message)}` : 'Alfire non ha risposto. Riprova.'
  }
  const testo = testoFornitore(e)
  const tra = attesa(testo)
  const stato = e.statusCode ?? 0

  if (stato === 429) {
    if (/per day|\((TPD|RPD)\)/i.test(testo)) {
      return `Alfire ha finito i messaggi gratuiti di oggi (limite giornaliero di Groq). Torna disponibile ${tra ?? 'domani'}.`
    }
    return `Alfire ha raggiunto il limite gratuito di questo minuto. Riprova ${tra ?? 'tra un minuto'}.`
  }
  if (stato === 413) return 'La richiesta è troppo grande per il piano gratuito di Groq: premi «Nuova chat» e riprova.'
  if (stato === 401 || stato === 403) return 'La chiave di Alfire non è valida: controlla ALFIRE_API_KEY su Vercel.'
  if (stato === 404 || (stato === 400 && /model/i.test(testo))) {
    return admin ? `Il modello di Alfire non è disponibile su Groq: ${breve(testo)}` : 'Alfire non è disponibile in questo momento.'
  }
  if (stato >= 500) return 'Groq non risponde in questo momento. Riprova tra poco.'
  return admin ? `Alfire non ha risposto: ${breve(testo)}` : 'Alfire non ha risposto. Riprova.'
}

/** For the server log: status and the provider's words, never the key. */
export function dettaglioErroreAlfire(error: unknown): string {
  const e = causa(error)
  if (APICallError.isInstance(e)) return `${e.statusCode ?? '?'} ${breve(testoFornitore(e))}`
  return e instanceof Error ? breve(e.message) : String(e)
}
