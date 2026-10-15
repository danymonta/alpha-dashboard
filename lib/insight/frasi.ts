import 'server-only'

import { ErroreInstagram } from '@/lib/instagram/richieste'
import type { CodiceErroreBlocco, MotivoFallimento } from '@/lib/insight/contratti'
import { AVVISO_STATISTICHE } from '@/lib/insight/stato'

/**
 * The sentences of a run of the Insight (1.35.0, CLAUDE.md section 29): what
 * the admin reads when a run fails («L’aggiornamento non è riuscito: …», the
 * page and Impostazioni) and the warnings a run leaves (insight_esecuzioni
 * .avvisi, and the recap's own for its channel).
 *
 * Fixed sentences only (C18): a failure is chosen by the error's type, class
 * or code, never built from its message (Meta's and Anthropic's messages may
 * quote a request, a DM or a token). The progress of a run keeps the warnings
 * as codes (CodiceAvviso), never as text; the sentences are taken from here
 * when they are written.
 */

export const FRASI_INSIGHT = {
  /** the route, without ANTHROPIC_API_KEY on Vercel */
  nonConfigurato: 'Insight non configurato: manca ANTHROPIC_API_KEY su Vercel.',
  /** no Instagram token in Vault */
  senzaToken: 'Instagram non è collegato: incolla il token in Impostazioni › Instagram e Messenger.',
  /** code 190 */
  token:
    'Il token di Instagram è scaduto o non è più valido: generane uno nuovo dal pannello Meta e incollalo in Impostazioni › Instagram e Messenger.',
  limite: 'Instagram ha limitato le letture per troppe richieste: riprova più tardi con Aggiorna dati.',
  rete: 'Instagram non ha risposto: riprova più tardi con Aggiorna dati.',
  meta: 'Instagram ha rifiutato la lettura delle chat: riprova più tardi con Aggiorna dati.',
  tempo: 'Le chat da leggere erano troppe per il tempo a disposizione: riprova con Aggiorna dati.',
  account: 'Instagram non ha detto quale account è collegato: incolla di nuovo il token in Impostazioni › Instagram e Messenger.',
  database: 'Il gestionale non è riuscito a leggere o salvare i dati del recap: riprova con Aggiorna dati.',
  /** Anthropic: authentication, permission, credit or spend limit (C46) */
  claude:
    'Recap non generato: Claude ha rifiutato la richiesta (chiave, credito o limite di spesa): controlla la console Anthropic e la chiave su Vercel.',
  /** Anthropic: a request this code built wrong (BadRequestError) */
  richiesta: 'Recap non generato: Claude non ha accettato la richiesta. Riprova con Aggiorna dati e avvisa chi gestisce l’app.',
  /** the cap of INSIGHT_COSTO_MAX_USD (D19) */
  costo: (chat: number) => `Recap non generato: troppe chat in un solo aggiornamento (${chat}).`,
  /** insight_tick's watchdog (the same sentence is written in SQL) */
  interrotto: 'Aggiornamento interrotto: il server non ha completato i passi. Riprova con Aggiorna dati.',
  imprevisto: 'Aggiornamento non riuscito per un errore imprevisto: riprova con Aggiorna dati.',
} as const

/** The warnings of a run, as the progress keeps them. */
export const AVVISI_INSIGHT = {
  statistiche: AVVISO_STATISTICHE,
  chat_non_lette: 'Alcune chat Instagram non sono state lette: nel recap c’è la loro ultima versione salvata. Riprova con Aggiorna dati.',
  instagram_limitato: 'Instagram ha limitato le letture: alcune chat non sono aggiornate. Riprova più tardi con Aggiorna dati.',
  chat_troppe: 'Troppe chat aggiornate in un giorno: lette le più recenti.',
  contenuti_non_letti: 'Post e reel non letti da Instagram: la tabella dei contenuti usa i dati già salvati.',
  messenger_token:
    'Messenger non letto: il token della Pagina è scaduto o non è più valido. Incollane uno nuovo in Impostazioni › Instagram e Messenger.',
  messenger_non_letto: 'Messenger non letto: Meta non ha risposto. Riprova più tardi con Aggiorna dati.',
  messenger_chat_non_lette: 'Alcune chat Messenger non sono state lette: nel recap c’è la loro ultima versione salvata.',
  conteggi: 'Conteggi per contenuto non aggiornati: riprova con Aggiorna dati.',
} as const

export type CodiceAvviso = keyof typeof AVVISI_INSIGHT

/** The channel a warning belongs to (the recap of that channel carries it). */
export const CANALE_AVVISO: Record<CodiceAvviso, 'instagram' | 'messenger' | 'esecuzione'> = {
  statistiche: 'instagram',
  chat_non_lette: 'instagram',
  instagram_limitato: 'instagram',
  chat_troppe: 'instagram',
  contenuti_non_letti: 'instagram',
  messenger_token: 'messenger',
  messenger_non_letto: 'messenger',
  messenger_chat_non_lette: 'messenger',
  conteggi: 'esecuzione',
}

export function eCodiceAvviso(valore: unknown): valore is CodiceAvviso {
  return typeof valore === 'string' && Object.hasOwn(AVVISI_INSIGHT, valore)
}

/** The sentences of some warning codes, without repetitions, in their order. */
export function frasiAvvisi(codici: readonly unknown[]): string[] {
  return [...new Set(codici.filter(eCodiceAvviso))].map((c) => AVVISI_INSIGHT[c])
}

/** Why a run stops, as the code knows it (never the error's message). */
export type MotivoInsight =
  | MotivoFallimento
  | 'account'
  | 'non_configurato'
  | 'claude'
  | 'richiesta'
  | 'imprevisto'

/** An error of the Insight's own: its reason, and a message that is the reason's sentence. */
export class ErroreInsight extends Error {
  readonly motivo: MotivoInsight
  constructor(motivo: MotivoInsight) {
    super(fraseDelMotivo(motivo))
    this.name = 'ErroreInsight'
    this.motivo = motivo
  }
}

export function fraseDelMotivo(motivo: MotivoInsight): string {
  switch (motivo) {
    case 'senza_token':
      return FRASI_INSIGHT.senzaToken
    case 'token':
      return FRASI_INSIGHT.token
    case 'limite':
      return FRASI_INSIGHT.limite
    case 'rete':
      return FRASI_INSIGHT.rete
    case 'tempo':
      return FRASI_INSIGHT.tempo
    case 'meta':
      return FRASI_INSIGHT.meta
    case 'database':
      return FRASI_INSIGHT.database
    case 'account':
      return FRASI_INSIGHT.account
    case 'non_configurato':
      return FRASI_INSIGHT.nonConfigurato
    case 'claude':
      return FRASI_INSIGHT.claude
    case 'richiesta':
      return FRASI_INSIGHT.richiesta
    default:
      return FRASI_INSIGHT.imprevisto
  }
}

/** The reason of an error of a block of the analysis (esegui.ts): only the fatal ones stop a run. */
export function motivoDelBlocco(codice: CodiceErroreBlocco): MotivoInsight {
  if (codice === 'autenticazione') return 'claude'
  if (codice === 'richiesta') return 'richiesta'
  return 'imprevisto'
}

/** The reason of any error, by its type: an ErroreInsight's own, a Meta error's type, otherwise unexpected. */
export function motivoDi(errore: unknown): MotivoInsight {
  if (errore instanceof ErroreInsight) return errore.motivo
  if (errore instanceof ErroreInstagram) return errore.tipo
  // the client of Claude without its key (lib/insight/claude.ts): by name, to keep the SDK out of here
  if (errore instanceof Error && errore.name === 'InsightNonConfigurato') return 'non_configurato'
  return 'imprevisto'
}

/** The sentence of a failure, chosen by the error's type, never built from its message (C18). */
export function motivoInItaliano(errore: unknown): string {
  return fraseDelMotivo(motivoDi(errore))
}
