import { CIFRE_CODICE, VALIDITA_CODICE_MINUTI } from '@/lib/validation/accesso'

/**
 * Sign-in with a code or a link sent by email: the words, and how Supabase's
 * answers become them. Pure, so it is tested without a server. The rule that
 * shapes it: asking for a code never says whether the address has an account,
 * so a missing, invited-but-never-signed-in or deactivated address gets the
 * same answer as a real one.
 */

/** The shape of an auth-js error that matters here (AuthError has these fields). */
export type ErroreAuth = { code?: string | null; status?: number | null; name?: string | null } | null | undefined

export const PAROLE_ACCESSO = {
  titolo: 'Oppure entra con un codice via email',
  introduzione: `Scrivi l’indirizzo con cui sei nel team: ti mandiamo un link e un codice di ${CIFRE_CODICE} cifre.`,
  /** The same sentence for every address, registered or not. */
  inviata: 'Se l’indirizzo è registrato, ti abbiamo scritto: apri il link o inserisci il codice.',
  validita: `Il link e il codice valgono ${VALIDITA_CODICE_MINUTI} minuti. Controlla anche la cartella dello spam.`,
  codiceErrato: 'Il codice non è valido o è scaduto. Controlla le cifre o chiedine uno nuovo.',
  linkScaduto: 'Il link è scaduto o è già stato usato: chiedine uno nuovo.',
  troppeRichieste: 'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.',
  nonDisponibile: 'Non riusciamo a completare la richiesta in questo momento. Riprova tra poco.',
  connessione: 'Connessione assente. Riprova.',
  disattivato: 'Account disattivato. Contatta l’amministratore.',
} as const

export function testoAttesa(secondi: number): string {
  return `Invia di nuovo tra ${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`
}

function nonRiuscito(errore: ErroreAuth) {
  // no status at all = the request never reached Supabase (network), 5xx = it failed there
  return !!errore && (errore.status == null || errore.status === 0 || errore.status >= 500)
}

/**
 * The answer to "send me a code". Everything that depends on the address (no
 * account, no profile, deactivated, the per-address pause between two emails)
 * is the same "sent" answer; only what does not depend on it is told.
 */
export type EsitoRichiesta = 'inviata' | 'troppe-richieste' | 'non-disponibile'

export function esitoRichiestaCodice(errore: ErroreAuth): EsitoRichiesta {
  if (!errore) return 'inviata'
  // the limit per IP does not depend on the address; the one per address and the email quota do not tell more
  if (errore.code === 'over_request_rate_limit') return 'troppe-richieste'
  if (nonRiuscito(errore)) return 'non-disponibile'
  return 'inviata'
}

/** The answer to a typed code. */
export type EsitoCodice = 'errato' | 'troppe-richieste' | 'non-disponibile'

export function esitoVerificaCodice(errore: NonNullable<ErroreAuth>): EsitoCodice {
  if (errore.code === 'over_request_rate_limit' || errore.status === 429) return 'troppe-richieste'
  if (nonRiuscito(errore)) return 'non-disponibile'
  return 'errato'
}

/** The link opened from the email: used or expired, or something else went wrong (shown as the generic failure). */
export function motivoLoginPerLink(errore: NonNullable<ErroreAuth>): 'link-scaduto' | 'callback' {
  if (errore.status === 429 || nonRiuscito(errore)) return 'callback'
  return 'link-scaduto'
}

export function messaggioRichiesta(esito: EsitoRichiesta): string {
  switch (esito) {
    case 'inviata':
      return PAROLE_ACCESSO.inviata
    case 'troppe-richieste':
      return PAROLE_ACCESSO.troppeRichieste
    case 'non-disponibile':
      return PAROLE_ACCESSO.nonDisponibile
  }
}

export function messaggioCodice(esito: EsitoCodice): string {
  switch (esito) {
    case 'errato':
      return PAROLE_ACCESSO.codiceErrato
    case 'troppe-richieste':
      return PAROLE_ACCESSO.troppeRichieste
    case 'non-disponibile':
      return PAROLE_ACCESSO.nonDisponibile
  }
}
