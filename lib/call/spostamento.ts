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
  /**
   * The setter moves a call still to be held: the same words as public.sposta_call
   * and calls_esito_solo_closer. A cancelled call, or one marked riprogrammata,
   * the closer (or the admin) moves.
   */
  setterRiprogrammata: 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l’admin)',
  setterConEsito: 'Questa call ha già un esito del closer: la sposta lui (o l’admin)',
  /**
   * A held call and a no-show never move, for anyone (public.sposta_call,
   * Dany 02/10/2026): the held one happened (a closed one may have its sale),
   * the no-show stays in the show rate. A wrong outcome is undone first
   * («Annulla l’esito»); the new call is booked by the setter or the admin. A
   * wrong date the closer and the admin correct with the pencil (03/10/2026).
   */
  svolta:
    'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call, che fissa il setter (o l’admin)',
  noShow:
    'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato annullalo prima; per rivederlo serve una nuova call, che fissa il setter (o l’admin)',
  /** The same for the setter: he never undoes an outcome, and he books the new call himself. */
  setterSvolta:
    'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivedere il lead fissa una nuova call',
  setterNoShow:
    'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivederlo fissa una nuova call',
  /**
   * The outcome sheet of a held call or a no-show (closer and admin), above
   * «Annulla l’esito»: why "Riprogrammata" is not there, and how to correct a
   * wrong date (the pencil, without a trace: Dany, 03/10/2026, also on a
   * no-show) and a wrong outcome (undone first). Its own words: there the
   * outcome also changes directly.
   */
  foglioEsito: {
    svolta:
      'Una call svolta non si sposta. Se la data è sbagliata correggila con la matita («Modifica»); se è sbagliato l’esito annullalo qui sotto, poi sposta la call. Per rivedere il lead serve una nuova call, che fissa il setter (o l’admin).',
    noShow:
      'Un no show non si sposta: resta un no show e conta nello show rate. Se la data è sbagliata correggila con la matita («Modifica»); se è sbagliato l’esito annullalo qui sotto, poi sposta la call. Per rivedere il lead serve una nuova call, che fissa il setter (o l’admin).',
  },
  /**
   * Alfire to the closer and the admin, after the refused "sposta" of a held
   * call or a no-show: a wrong date only is the pencil's ("modifica"), without
   * a trace (Dany, 03/10/2026). Only Alfire's: the database keeps sposta_call's words.
   */
  soloLaData: 'Se sono sbagliati solo il giorno o l’ora, usa modifica: li corregge senza traccia e l’esito resta',
  /** Alfire's card when the pencil corrects the day of a held call or a no-show: a correction, not a move. */
  correzione: {
    svolta: 'Resta svolta, col suo esito: è una correzione, senza «Spostata dal…»',
    noShow: 'Resta un no show: è una correzione, senza «Spostata dal…»',
  },
  stessoMomento: 'La call è già a quel giorno e a quell’ora: scegline un altro',
  /** The calls marked "Riprogrammata" before the move existed: still without their new day. */
  daSpostare: {
    titolo: 'Da spostare',
    descrizione: 'Segnate come riprogrammate senza la nuova data: con «Sposta» la call passa al suo nuovo giorno.',
  },
} as const

/**
 * The states a call never moves from, for anyone (public.sposta_call): a held
 * call and a no-show. "Sposta" never shows on them and the outcome sheet does
 * not offer "Riprogrammata": it says why (avvisoEsitoFermo).
 */
export const STATI_FERMI = ['svolta', 'no_show'] as const

export function restaNelSuoGiorno(stato: string): boolean {
  return (STATI_FERMI as readonly string[]).includes(stato)
}

/**
 * Who moves a call in this state (public.sposta_call, calls_esito_solo_closer):
 * nobody a held one or a no-show; the setter only one still to be held. Null
 * when the move is allowed, otherwise the words that say why not.
 */
export function motivoNonSpostabile(stato: string, ruolo: string): string | null {
  const setter = ruolo === 'setter'
  if (stato === 'svolta') return setter ? SPOSTA.setterSvolta : SPOSTA.svolta
  if (stato === 'no_show') return setter ? SPOSTA.setterNoShow : SPOSTA.noShow
  if (setter && stato !== 'programmata') {
    return stato === 'riprogrammata' ? SPOSTA.setterRiprogrammata : SPOSTA.setterConEsito
  }
  return null
}

/**
 * Alfire's refused "sposta" (public.sposta_call's words): the closer and the
 * admin also read that a wrong day or time of a held call or a no-show is the
 * pencil's ("modifica"), so a correction is never answered with "it cannot be
 * done". The setter's words stay his: his pencil never changes them.
 */
export function rifiutoSpostaAlfire(stato: string, ruolo: string): string | null {
  const motivo = motivoNonSpostabile(stato, ruolo)
  if (!motivo || ruolo === 'setter' || !restaNelSuoGiorno(stato)) return motivo
  return `${motivo}. ${SPOSTA.soloLaData}`
}

/** The line on Alfire's card when the pencil corrects the day of a held call or a no-show; null otherwise. */
export function correzioneSenzaTraccia(stato: string): string | null {
  if (stato === 'svolta') return SPOSTA.correzione.svolta
  if (stato === 'no_show') return SPOSTA.correzione.noShow
  return null
}

/** The outcome sheet's words on a call that never moves (SPOSTA.foglioEsito); null when it moves. */
export function avvisoEsitoFermo(stato: string): string | null {
  if (stato === 'svolta') return SPOSTA.foglioEsito.svolta
  if (stato === 'no_show') return SPOSTA.foglioEsito.noShow
  return null
}

/**
 * Why the pencil (modifica_call) keeps date and time read only, null when they
 * change (calls_esito_solo_closer): the setter's on every call not to be held
 * any more, as for "Sposta", in his words. The closer's and the admin's pencil
 * corrects the date and time of every call, a held call and a no-show
 * included (Dany, 03/10/2026: "metti il modifica anche per i no show non si sa
 * mai"): a typo is not a move, the call keeps its outcome and gets no trace.
 */
export function motivoQuandoBloccato(stato: string, ruolo: string): string | null {
  return ruolo === 'setter' ? motivoNonSpostabile(stato, ruolo) : null
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
