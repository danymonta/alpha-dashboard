import type { CodiceErroreClaude } from '@/lib/marketing/analisi/tipi'

/**
 * The words of the call analysis (1.37.0): the fixed sentences stored in `errore` and shown
 * on the call's card, and the labels of the card. Never the message of a provider, of Zod or
 * of an exception: they quote the text. One place; the pages and the tests read it.
 */
export const FRASI_CALL = {
  senzaChiave: 'Analisi spente: manca la chiave di Claude su Vercel.',
  fornitore: 'Claude ha rifiutato la richiesta (chiave, credito o limite di spesa): controlla la console Anthropic e la chiave su Vercel.',
  nonRisponde: 'Claude non risponde adesso: riprova tra qualche minuto.',
  rifiuto: 'Claude non ha analizzato questa call.',
  incompleta: 'La risposta di Claude è arrivata incompleta: tocca Analizza di nuovo.',
  illeggibile: 'La risposta di Claude non si legge: tocca Analizza di nuovo.',
  erroreApp: 'L’analisi non è partita per un errore dell’app: avvisa Dany.',
  minorenne: 'Il lead è minorenne: niente analisi.',
  senzaRegistrazione: 'Non trovo la registrazione su Fathom: controlla il link e tocca Analizza di nuovo.',
  trascrizioneAssente: 'La trascrizione non è arrivata da Fathom: tocca Analizza di nuovo.',
  fathomNonCollegato: 'Fathom non è collegato: l’admin incolla la chiave in Impostazioni › Fathom.',
  fathomChiave: 'La chiave di Fathom non funziona più: l’admin la cambia in Impostazioni › Fathom.',
  linkNonFathom: 'Il link non è di Fathom: trascrizione e analisi non arrivano.',
  interrotta: 'Interrotta: il server non ha finito il lavoro. Tocca Analizza di nuovo.',
} as const

/** What a failed request to Claude means: the sentence, and what the job does next. */
export function esitoCall(codice: CodiceErroreClaude): {
  frase: string
  /** 'fallita' final; 'rifiutata' declined; 'riprova' back to the queue with a new attempt; 'tempo' back without one */
  azione: 'fallita' | 'rifiutata' | 'riprova' | 'tempo'
  /** the provider refused the key, the credit or the spending limit: the step ends with limite_fornitore */
  fornitore: boolean
} {
  switch (codice) {
    case 'tempo':
      return { frase: FRASI_CALL.nonRisponde, azione: 'tempo', fornitore: false }
    case 'autenticazione':
      return { frase: FRASI_CALL.fornitore, azione: 'fallita', fornitore: true }
    case 'rifiuto':
      return { frase: FRASI_CALL.rifiuto, azione: 'rifiutata', fornitore: false }
    case 'richiesta':
      return { frase: FRASI_CALL.erroreApp, azione: 'fallita', fornitore: false }
    case 'max_tokens':
      return { frase: FRASI_CALL.incompleta, azione: 'riprova', fornitore: false }
    case 'json':
    case 'schema':
      return { frase: FRASI_CALL.illeggibile, azione: 'riprova', fornitore: false }
    case 'rete':
    case 'limite':
      return { frase: FRASI_CALL.nonRisponde, azione: 'riprova', fornitore: false }
  }
}

/** Minutes a job waits after a limit, a network error or a transcript that is not there yet. */
export const ATTESA_RIPROVA_CALL_MS = 10 * 60_000

export const ANALISI = {
  titolo: 'Analisi di Claude',
  inCoda: 'In coda: l’analisi arriva tra qualche minuto.',
  inCorso: 'Claude sta analizzando la call…',
  nessuna: 'Nessuna analisi per questa call.',
  analizza: 'Analizza',
  analizzaDiNuovo: 'Analizza di nuovo',
  analizzata: (quando: string) => `Analizzata da Claude ${quando}`,
  motivoProposto: 'Motivo di non chiusura proposto',
  usaMotivo: 'Usa come motivo di non chiusura',
  motivoAggiornato: 'Motivo di non chiusura aggiornato',
  motivoCambiato: 'Il motivo di non chiusura è cambiato da un’altra parte: ricarica la pagina e controlla.',
  esitoDiverso: (letto: string) => `Dalla registrazione sembra una call ${letto}: controlla l’esito.`,
  letta: 'Dalla registrazione della call, letta da Claude.',
  il: 'Il lead',
  inTarget: 'In target',
  nonInTarget: 'Non in target',
  daVerificare: 'Da verificare',
  obiezioni: 'Obiezioni',
  domande: 'Cosa ha chiesto',
  convintoDa: 'Cosa l’ha convinto',
  dalSetting: 'Dal setting',
  sapeva: 'Sapeva arrivando',
  sorprese: 'L’ha sorpreso',
  prossimiPassi: 'Prossimi passi',
  daRiascoltare: 'Da riascoltare',
  gestita: { si: 'gestita', in_parte: 'gestita in parte', no: 'non gestita' },
  // the closer's valuation
  performance: {
    titolo: 'Performance proposta',
    conferma: (livello: string) => `Conferma «${livello}»`,
    cambia: 'Cambia',
    scritta: (scritta: string, proposta: string) => `Hai scritto ${scritta}, Claude propone ${proposta}.`,
    quota: (percento: number) => `Hai parlato il ${percento} % del tempo.`,
    funzionato: 'Cosa ha funzionato',
    daProvare: 'Da provare',
    fatto: (livello: string) => `Performance: ${livello}`,
  },
  // the setter's side
  dallaCall: {
    titolo: 'Dalla call',
    inTarget: 'Il lead era in target',
    nonInTarget: 'Il lead non era in target',
    daVerificare: 'Non è chiaro se il lead era in target',
    sapeva: 'Sapeva arrivando',
    sorprese: 'L’ha sorpreso',
    sifermato: 'Si è fermato su',
    spunti: 'Spunti per i tuoi DM',
    soloTuoi: 'Li vedi solo tu.',
  },
} as const
