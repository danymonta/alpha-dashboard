import { fasciaDaCodice, type CodiceFascia } from '@/lib/marketing/punteggio/tabelle'

/**
 * «Cosa fare con questo reel» (1.39.1): one sentence that joins the two verdicts
 * a reel has. The band of the score (Dany's guide, section 24) says what to do
 * with the CONTENT; the verdict of the numbers (Spingere, Mantenere, Cambiare,
 * decided in SQL) says how it went with the AUDIENCE. Said apart they seemed to
 * contradict each other («Cambiare» next to «Scartare o ripartire»); said once
 * they tell the person what to do. Pure: the page, the panel, the lists and the
 * tests read the same words. No number is computed here: the criteria under 7
 * are counted by the caller from the score.
 */

export type VerdettoCosaFare = 'spingere' | 'mantenere' | 'cambiare'
export type StatoAnalisiCosaFare = 'in_coda' | 'in_corso' | 'pronta' | 'fallita'

export type ChiaveCosaFare = CodiceFascia | 'da_valutare' | 'in_lavoro' | 'non_riuscita' | 'eliminato'
export type AzioneCosaFare = 'aggiungi_rifacimento' | 'vedi_rifacimento' | 'analizza' | 'nessuna'
export type TonoCosaFare = 'ok' | 'attenzione' | 'critico' | 'neutro'

export type IngressoCosaFare = {
  /** the band of the score, null when the reel has none */
  fascia: string | null | undefined
  /** the verdict of the numbers, null when there is none */
  verdetto: string | null | undefined
  /** the reel is younger than 3 days: the numbers say nothing yet */
  giovane?: boolean
  /** the criteria whose vote is under 7 (for the band «Pubblicare dopo ritocchi») */
  criteriSotto7?: number | null
  /** the state of the latest analysis, when the reel has no score */
  statoAnalisi?: StatoAnalisiCosaFare | null
  /** the reel is no longer on Instagram */
  eliminato?: boolean
}

export type CosaFare = {
  chiave: ChiaveCosaFare
  /** the short form, for the lists: «Rifallo da capo» */
  breve: string
  /** the whole sentence, for the lists' tooltips and the tests */
  frase: string
  /** the sentence without the short form it starts with: the block of the panel shows the short form as its title */
  spiegazione: string
  azione: AzioneCosaFare
  tono: TonoCosaFare
}

/** The short form of every band: the action, in the words of the person who does it. */
export const BREVE_FASCIA: Record<CodiceFascia, string> = {
  pubblicare: 'Va bene così',
  pubblicare_dopo_ritocchi: 'Ritoccalo e ripubblicalo',
  rifare_le_parti_deboli: 'Rifai le parti deboli',
  riscrivere: 'Riscrivilo',
  scartare: 'Rifallo da capo',
}

const TONO_FASCIA: Record<CodiceFascia, TonoCosaFare> = {
  pubblicare: 'ok',
  pubblicare_dopo_ritocchi: 'ok',
  rifare_le_parti_deboli: 'attenzione',
  riscrivere: 'attenzione',
  scartare: 'critico',
}

/** Which bands ask to redo the reel: the panel offers «Aggiungi il rifacimento al calendario» only for these. */
export const FASCE_DA_RIFARE: readonly CodiceFascia[] = ['rifare_le_parti_deboli', 'riscrivere', 'scartare']

const NUMERI = ['nessun criterio', 'un criterio', 'due criteri', 'tre criteri', 'quattro criteri', 'cinque criteri', 'sei criteri', 'sette criteri', 'otto criteri', 'nove criteri', 'dieci criteri']

function paroleCriteri(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return 'i criteri sotto 7'
  return `${NUMERI[Math.min(Math.round(n), 10)]} sotto 7`
}

function apertura(fascia: CodiceFascia, criteriSotto7: number | null | undefined): string {
  switch (fascia) {
    case 'pubblicare':
      return 'Il contenuto è pronto, non serve rifarlo.'
    case 'pubblicare_dopo_ritocchi':
      return criteriSotto7 === 0
        ? 'Ritoccalo e ripubblicalo: manca poco, basta un ritocco.'
        : `Ritoccalo e ripubblicalo: ${paroleCriteri(criteriSotto7)}.`
    case 'rifare_le_parti_deboli':
      return 'Rifai le parti deboli: l’hook e i due criteri più bassi, l’idea resta.'
    case 'riscrivere':
      return 'Riscrivilo: il tema regge, struttura e hook no.'
    case 'scartare':
      return 'Rifallo da capo: l’idea non è allineata a fase, ICP o tono.'
  }
}

type Livello = 'alto' | 'medio' | 'basso'
const LIVELLO: Record<CodiceFascia, Livello> = {
  pubblicare: 'alto',
  pubblicare_dopo_ritocchi: 'alto',
  rifare_le_parti_deboli: 'medio',
  riscrivere: 'basso',
  scartare: 'basso',
}

function pubblico(livello: Livello, verdetto: VerdettoCosaFare | null, giovane: boolean): string {
  if (verdetto === 'spingere') {
    return livello === 'alto' ? 'Il pubblico l’ha premiato: spingilo.' : 'Il pubblico però l’ha premiato: spingilo anche mentre lo rifai.'
  }
  if (verdetto === 'mantenere') {
    return livello === 'alto' ? 'I numeri sono nella media: tienilo com’è.' : 'I numeri sono nella media: rifatto bene può fare di più.'
  }
  if (verdetto === 'cambiare') {
    return livello === 'alto' ? 'Ma i numeri sono sotto la mediana: il pubblico non l’ha premiato.' : 'I numeri confermano: sotto la mediana.'
  }
  return giovane ? 'Per i numeri è troppo presto: il verdetto arriva dopo 3 giorni.' : 'Per i numeri non c’è ancora un verdetto.'
}

function soloNumeri(verdetto: VerdettoCosaFare | null, giovane: boolean): string {
  if (verdetto === 'spingere') return 'I numeri dicono che il pubblico l’ha premiato.'
  if (verdetto === 'mantenere') return 'I numeri sono nella media.'
  if (verdetto === 'cambiare') return 'I numeri sono sotto la mediana.'
  return giovane ? 'È troppo presto per i numeri, ma puoi già chiedere la valutazione.' : 'Per i numeri non c’è ancora un verdetto.'
}

function comeVerdetto(v: string | null | undefined): VerdettoCosaFare | null {
  return v === 'spingere' || v === 'mantenere' || v === 'cambiare' ? v : null
}

/** «Rifallo da capo: l’idea…» under the title «Rifallo da capo» says the title twice: drop it, and start the rest with a capital. */
function senzaTitolo(frase: string, breve: string): string {
  const prefisso = `${breve}: `
  if (!frase.startsWith(prefisso)) return frase
  const resto = frase.slice(prefisso.length)
  return resto.charAt(0).toUpperCase() + resto.slice(1)
}

/**
 * What to do with a reel, from its score band and its verdict. Without a score
 * the sentence is about the numbers and the next step is «Analizza».
 */
export function cosaFare(i: IngressoCosaFare): CosaFare {
  const verdetto = comeVerdetto(i.verdetto)
  const giovane = i.giovane === true
  const fascia = fasciaDaCodice(i.fascia)

  if (fascia) {
    const codice = fascia.codice
    const frase = `${apertura(codice, i.criteriSotto7)} ${pubblico(LIVELLO[codice], verdetto, giovane)}`
    return {
      chiave: codice,
      breve: BREVE_FASCIA[codice],
      frase,
      spiegazione: senzaTitolo(frase, BREVE_FASCIA[codice]),
      azione: FASCE_DA_RIFARE.includes(codice) ? 'aggiungi_rifacimento' : codice === 'pubblicare_dopo_ritocchi' ? 'vedi_rifacimento' : 'nessuna',
      tono: TONO_FASCIA[codice],
    }
  }
  if (i.eliminato) {
    return { chiave: 'eliminato', breve: 'Non più su Instagram', frase: 'Il reel non è più su Instagram: qui non c’è niente da fare.', spiegazione: 'Il reel non è più su Instagram: qui non c’è niente da fare.', azione: 'nessuna', tono: 'neutro' }
  }
  if (i.statoAnalisi === 'in_coda' || i.statoAnalisi === 'in_corso') {
    return {
      chiave: 'in_lavoro',
      breve: 'Claude ci sta lavorando',
      frase: 'Claude sta preparando l’analisi e il punteggio: arrivano insieme, di solito in pochi minuti.',
      spiegazione: 'Claude sta preparando l’analisi e il punteggio: arrivano insieme, di solito in pochi minuti.',
      azione: 'nessuna',
      tono: 'neutro',
    }
  }
  if (i.statoAnalisi === 'fallita') {
    return { chiave: 'non_riuscita', breve: 'Analisi non riuscita', frase: 'L’ultima analisi non è riuscita: puoi riprovare.', spiegazione: 'L’ultima analisi non è riuscita: puoi riprovare.', azione: 'analizza', tono: 'critico' }
  }
  const daValutare = `Claude non ha ancora valutato questo reel. ${soloNumeri(verdetto, giovane)}`
  return {
    chiave: 'da_valutare',
    breve: 'Da valutare',
    frase: daValutare,
    spiegazione: daValutare,
    azione: 'analizza',
    tono: 'neutro',
  }
}

/** The band filter's labels: the action and the range of the score, «Rifallo da capo (0-49)». */
export function etichettaFiltroFascia(codice: CodiceFascia, da: number, a: number): string {
  return `${BREVE_FASCIA[codice]} (${da}-${a})`
}
