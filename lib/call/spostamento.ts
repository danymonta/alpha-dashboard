import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'

/**
 * Moving a call (Dany, 02/10/2026): the same call goes to a new day and time,
 * still to be held, and its card keeps the trace of the last move. The words
 * of the "Sposta" button, its sheet, the outcome "Riprogrammata" and Alfire
 * live here: a word changes here.
 */
export const SPOSTA = {
  bottone: 'Sposta',
  /** Accessible name of the button: the visible word, then whose call it is. */
  nomeBottone: (lead: string) => `Sposta la call con ${lead}`,
  titolo: (lead: string) => `Sposta la call con ${lead}`,
  descrizione: 'La call passa al nuovo giorno e torna da fare. Sulla scheda resta «Spostata dal…».',
  quando: 'Nuovo giorno e ora',
  salva: 'Sposta la call',
  fatto: (lead: string) => `${lead}: call spostata`,
  /** The outcome "Riprogrammata": the same move, from the outcome sheet. */
  riprogrammata: {
    domanda: 'A quando è stata riprogrammata?',
    spiegazione: 'La call passa al nuovo giorno e torna da fare: l’esito lo registri lì.',
    salva: 'Salva la nuova data',
  },
  /** The setter moves a call still to be held: the same words as public.sposta_call. */
  setterRiprogrammata: 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l’admin)',
  setterConEsito: 'Questa call ha già un esito del closer: la sposta lui (o l’admin)',
  /** A held call never moves, for anyone (public.sposta_call): it happened, a closed one may have its sale. */
  svolta: 'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call',
  stessoMomento: 'La call è già a quel giorno e a quell’ora: scegline un altro',
  /** The calls marked "Riprogrammata" before the move existed: still without their new day. */
  daSpostare: {
    titolo: 'Da spostare',
    descrizione: 'Segnate come riprogrammate senza la nuova data: con «Sposta» la call passa al suo nuovo giorno.',
  },
} as const

/**
 * Who moves a call in this state (public.sposta_call, calls_esito_solo_closer):
 * nobody a held one; the setter only one still to be held. Null when the move
 * is allowed, otherwise the words that say why not.
 */
export function motivoNonSpostabile(stato: string, ruolo: string): string | null {
  if (ruolo === 'setter' && stato !== 'programmata') {
    return stato === 'riprogrammata' ? SPOSTA.setterRiprogrammata : SPOSTA.setterConEsito
  }
  return stato === 'svolta' ? SPOSTA.svolta : null
}

/** "03/10 alle 18:00" from a day and a time; "30/12/2025 alle 18:00" outside the current year. */
export function quandoBreveDa(giorno: string, ora: string, oggi: string = oggiRoma()): string {
  const [anno, mese, gg] = giorno.split('-')
  const data = anno === oggi.slice(0, 4) ? `${gg}/${mese}` : `${gg}/${mese}/${anno}`
  return `${data} alle ${ora}`
}

/** "30/09 alle 19:00" in Europe/Rome, from a timestamptz. */
export function quandoBreve(istante: string, oggi: string = oggiRoma()): string {
  return quandoBreveDa(oggiRoma(new Date(istante)), formatOra(istante), oggi)
}

/**
 * The trace on the card: "Spostata dal 30/09 alle 19:00", or "Spostata 3
 * volte, l’ultima dal 30/09 alle 19:00". Null for a call never moved.
 */
export function tracciaSpostamento(
  call: { spostata_dal: string | null; volte_spostata: number | null },
  oggi: string = oggiRoma(),
): string | null {
  const volte = call.volte_spostata ?? 0
  if (!call.spostata_dal || volte < 1) return null
  const dal = quandoBreve(call.spostata_dal, oggi)
  return volte === 1 ? `Spostata dal ${dal}` : `Spostata ${volte} volte, l’ultima dal ${dal}`
}

/**
 * Where the sheet starts: the day after the call, at the same time, and never
 * before tomorrow (a call of last week moves to tomorrow, not to a past day).
 */
export function spostamentoPredefinito(giornoCall: string, oraCall: string, oggi: string): { data: string; ora: string } {
  const base = giornoCall > oggi ? giornoCall : oggi
  return { data: aggiungiGiorni(base, 1), ora: oraCall }
}

/** The quick picks of the sheet: today, tomorrow, the day after; the admin also yesterday. */
export function scorciatoieSpostamento(oggi: string, admin: boolean): { etichetta: string; valore: string }[] {
  return [
    ...(admin ? [{ etichetta: 'Ieri', valore: aggiungiGiorni(oggi, -1) }] : []),
    { etichetta: 'Oggi', valore: oggi },
    { etichetta: 'Domani', valore: aggiungiGiorni(oggi, 1) },
    { etichetta: 'Dopodomani', valore: aggiungiGiorni(oggi, 2) },
  ]
}
