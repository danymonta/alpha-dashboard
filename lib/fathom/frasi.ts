/**
 * The sentences about Fathom (1.37.0), the same on the page, in the toasts and in
 * fathom_collegamento.ultimo_errore. Italian, never a code nor Fathom's own words.
 */
export const FRASI_FATHOM = {
  chiave: 'La chiave di Fathom non funziona più: l’admin la cambia in Impostazioni › Fathom.',
  non_trovata: 'Fathom non dà questa registrazione: è stata eliminata, o è privata di un altro account.',
  limite: 'Fathom chiede di rallentare: riprova tra poco.',
  rete: 'Fathom non risponde: riprova più tardi.',
  tempo: 'Fathom non risponde: riprova più tardi.',
  formato: 'Fathom ha risposto in un modo che l’app non conosce: riprova più tardi.',
  non_collegato: 'Fathom non è collegato: l’admin incolla la chiave in Impostazioni › Fathom.',
} as const

export type TipoErroreFathom = 'chiave' | 'non_trovata' | 'limite' | 'rete' | 'tempo' | 'formato'

/** An error of Fathom's API. Its message is a fixed sentence: never the key, a body or a link. */
export class ErroreFathom extends Error {
  readonly tipo: TipoErroreFathom
  readonly attesaMs: number
  constructor(tipo: TipoErroreFathom, attesaMs = 0) {
    super(FRASI_FATHOM[tipo])
    this.name = 'ErroreFathom'
    this.tipo = tipo
    this.attesaMs = attesaMs
  }
}
