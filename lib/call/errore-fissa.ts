/**
 * What the setter (or the admin) reads when public.fissa_call does not book the call, and the
 * line the server writes in the logs (Dany, 14/11/2026: «aggiungi il log e il messaggio più
 * preciso», after Loris got «Non è stato possibile fissare la call. Riprova.» with no way to
 * know why). The log has the code and the database's own words, never the lead: fissa_call
 * raises only fixed sentences, and Postgres names a policy or a constraint, never a value
 * (the values are in `details`, which is not logged).
 */

export type ErroreDb = { code?: string | null; message?: string | null }

/** Sentences of the database that are already worded for the person (raise … using errcode). */
const GIA_SCRITTO = new Set(['22023'])

const MESSAGGI = {
  rete: 'Il server non ha raggiunto il database: controlla la connessione e riprova tra qualche secondo.',
  lento: 'Il database ha impiegato troppo a rispondere: riprova tra qualche secondo.',
  aggiornamento: 'L’app si sta aggiornando: ricarica la pagina e riprova.',
  permesso: (codice: string) =>
    `Il database non ti lascia fissare questa call (codice ${codice}): esci, rientra nell’app e riprova. Se succede ancora, avvisa Dany con questo codice.`,
  dati: (codice: string) =>
    `I dati di questo lead non si salvano (codice ${codice}): avvisa Dany con il nome e l’handle del lead.`,
  altro: (codice: string) =>
    `Non è stato possibile fissare la call (codice ${codice}). Riprova; se succede ancora, avvisa Dany con questo codice.`,
} as const

export const ERRORE_FISSA = MESSAGGI

function codiceDi(e: ErroreDb): string {
  const c = (e.code ?? '').trim()
  return c === '' ? 'rete' : c.slice(0, 12)
}

/** The sentence for the person: precise, with the code when it is not one of ours. */
export function messaggioErroreFissa(e: ErroreDb): string {
  const codice = (e.code ?? '').trim()
  const testo = (e.message ?? '').trim()
  if (GIA_SCRITTO.has(codice) && testo) return testo
  if (codice === '' || /fetch failed|network|ECONN|ETIMEDOUT|socket/i.test(testo)) return MESSAGGI.rete
  if (codice === '57014') return MESSAGGI.lento
  if (codice === 'PGRST202' || codice === 'PGRST203') return MESSAGGI.aggiornamento
  if (codice === '42501') {
    // a row-level security refusal speaks English; the function's own refusals are ours
    if (!testo || /row-level security|permission denied/i.test(testo)) return MESSAGGI.permesso(codice)
    return testo
  }
  if (codice.startsWith('23')) return MESSAGGI.dati(codice)
  return MESSAGGI.altro(codiceDi(e))
}

/** The log line: the code and the database's words, cut short, never `details` or the input. */
export function rigaLogErroreFissa(e: ErroreDb): string {
  const testo = (e.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  return `[fissa-call] non fissata: codice=${codiceDi(e)} messaggio=${JSON.stringify(testo)}`
}
