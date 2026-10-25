import type { CodiceErroreClaude } from '@/lib/marketing/analisi/tipi'

/**
 * The fixed sentences of the reel analysis (1.36.0, CLAUDE.md section 30): what
 * is stored in `errore` and shown on the page. Never the message of a provider,
 * of Zod or of an exception: they quote the text and the URLs.
 */

export const FRASI_ANALISI = {
  senzaChiave: 'Analisi spente: manca la chiave di Claude su Vercel.',
  fornitore: 'Claude ha rifiutato la richiesta (chiave, credito o limite di spesa): controlla la console Anthropic e la chiave su Vercel.',
  nonRisponde: 'Claude non risponde adesso: riprova tra qualche minuto.',
  rifiuto: 'Claude non ha analizzato questo reel.',
  incompleta: 'La risposta di Claude è arrivata incompleta: riprova.',
  erroreApp: 'L’analisi non è partita per un errore dell’app: avvisa Dany.',
  illeggibile: 'La risposta di Claude non si legge: riprova.',
  troppoLungo: 'Il reel è troppo lungo da leggere in un passo: riprova.',
  interrotta: 'Interrotta: il server non ha finito il lavoro. Riprova.',
  reelSparito: 'Questo reel non c’è più su Instagram.',
  senzaToken: 'Instagram non è collegato: l’admin incolla il token in Impostazioni › Chiavi e collegamenti.',
  tokenScaduto: 'Il token di Instagram è scaduto: l’admin ne incolla uno nuovo in Impostazioni › Chiavi e collegamenti.',
  lettura: 'La lettura del reel non è riuscita: riprova.',
  vuota: 'Non c’è abbastanza da analizzare in questo reel.',
} as const

/** What a failed request to Claude means: the sentence, and what the job does next. */
export function esitoDelCodice(codice: CodiceErroreClaude): {
  frase: string
  /** 'fallita' final; 'riprova' back to the queue with a new attempt; 'tempo' back without an attempt */
  azione: 'fallita' | 'riprova' | 'tempo'
  /** the provider refused the key, the credit or the spending limit: the step ends with limite_fornitore */
  fornitore: boolean
} {
  switch (codice) {
    case 'tempo':
      return { frase: FRASI_ANALISI.nonRisponde, azione: 'tempo', fornitore: false }
    case 'autenticazione':
      return { frase: FRASI_ANALISI.fornitore, azione: 'fallita', fornitore: true }
    case 'rifiuto':
      return { frase: FRASI_ANALISI.rifiuto, azione: 'fallita', fornitore: false }
    case 'max_tokens':
      return { frase: FRASI_ANALISI.incompleta, azione: 'fallita', fornitore: false }
    case 'richiesta':
      return { frase: FRASI_ANALISI.erroreApp, azione: 'fallita', fornitore: false }
    case 'json':
    case 'schema':
      return { frase: FRASI_ANALISI.illeggibile, azione: 'fallita', fornitore: false }
    case 'rete':
    case 'limite':
      return { frase: FRASI_ANALISI.nonRisponde, azione: 'riprova', fornitore: false }
  }
}

/** Minutes a job waits after a limit or a network error. */
export const ATTESA_RIPROVA_MS = 10 * 60_000
/** ... after a missing or refused token of Instagram. */
export const ATTESA_TOKEN_MS = 6 * 3_600_000

export type FontiLettura = {
  fotogrammi: number | null
  video: 'letto' | 'senza_media_url' | 'troppo_grande' | 'non_scaricabile' | 'senza_estrattore' | null
  trascrizione_esito: 'pronta' | 'senza_parlato' | 'senza_audio' | 'senza_video' | 'spenta' | 'fallita' | null
  fonte_visione: 'video' | 'copertina' | null
}

/** «Claude ha visto 31 fotogrammi e ascoltato il parlato.» and its variants, for the foot of the analysis. */
export function fraseFonti(l: FontiLettura | null): string {
  if (!l) return 'Trascrizione non disponibile.'
  if (l.fonte_visione === 'copertina' || l.video === 'senza_media_url') {
    return 'Instagram non dà il video di questo reel (di solito per la musica protetta): Claude ha visto la copertina, la didascalia e lo script.'
  }
  if (l.video === 'troppo_grande' || l.video === 'non_scaricabile') {
    return 'Il video non si è scaricato: Claude ha visto la copertina, la didascalia e lo script.'
  }
  if (l.video === 'senza_estrattore') {
    return 'I fotogrammi non si sono estratti questa volta: Claude ha visto la copertina, la didascalia e lo script.'
  }
  const n = l.fotogrammi ?? 0
  const visti = n === 1 ? '1 fotogramma' : `${n} fotogrammi`
  if (l.trascrizione_esito === 'pronta') return `Claude ha visto ${visti} e ascoltato il parlato.`
  if (l.trascrizione_esito === 'senza_parlato' || l.trascrizione_esito === 'senza_audio') {
    return 'Nessun parlato: Claude ha letto il testo a schermo.'
  }
  return `Claude ha visto ${visti}. Trascrizione non disponibile.`
}

/** The same foot of the analysis in English (1.53.0). */
export function fraseFontiEn(l: FontiLettura | null): string {
  if (!l) return 'Transcript not available.'
  if (l.fonte_visione === 'copertina' || l.video === 'senza_media_url') {
    return 'Instagram does not give the video of this reel (usually because of protected music): Claude saw the cover, the caption and the script.'
  }
  if (l.video === 'troppo_grande' || l.video === 'non_scaricabile') {
    return 'The video did not download: Claude saw the cover, the caption and the script.'
  }
  if (l.video === 'senza_estrattore') {
    return 'The frames were not extracted this time: Claude saw the cover, the caption and the script.'
  }
  const n = l.fotogrammi ?? 0
  const visti = n === 1 ? '1 frame' : `${n} frames`
  if (l.trascrizione_esito === 'pronta') return `Claude saw ${visti} and listened to the speech.`
  if (l.trascrizione_esito === 'senza_parlato' || l.trascrizione_esito === 'senza_audio') {
    return 'No speech: Claude read the text on screen.'
  }
  return `Claude saw ${visti}. Transcript not available.`
}
