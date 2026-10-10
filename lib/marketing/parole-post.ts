/**
 * The words of the posts of Instagram on the Marketing pages and in the
 * content's panel (1.33.0). Pure: client and server components read them,
 * and the tests.
 */
import type { Motivo, TipoPost } from '@/lib/marketing/abbinamento'
import { formatOra, oggiRoma } from '@/lib/date'
import { formatData, parseDataISO } from '@/lib/format'

export const ETICHETTA_TIPO_POST: Record<TipoPost, string> = {
  reel: 'Reel',
  carousel: 'Carosello',
  foto: 'Foto',
}

export const ETICHETTA_MOTIVO: Record<Motivo, string> = {
  stessa_data: 'stessa data',
  giorno_vicino: 'giorno vicino',
  didascalia_simile: 'didascalia simile',
  unico_del_giorno: 'unico del giorno',
}

/** "stessa data, didascalia simile"; with `ultima`: "stessa data e didascalia simile". Unknown reasons are left out. */
export function motiviInParole(motivi: readonly string[], ultima?: 'e'): string {
  const parole = motivi.filter((m): m is Motivo => m in ETICHETTA_MOTIVO).map((m) => ETICHETTA_MOTIVO[m])
  if (ultima && parole.length > 1) return `${parole.slice(0, -1).join(', ')} e ${parole.at(-1)}`
  return parole.join(', ')
}

const giornoBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

/** "ven 03/10/2026", from a 'YYYY-MM-DD'. */
export function giornoPost(giorno: string): string {
  return `${giornoBreve.format(parseDataISO(giorno))} ${formatData(giorno)}`
}

/** "ven 03/10/2026 alle 18:30", in Rome, from an instant. */
export function quandoPubblicato(istante: string): string {
  const ms = Date.parse(istante)
  if (!Number.isFinite(ms)) return ''
  return `${giornoPost(oggiRoma(new Date(ms)))} alle ${formatOra(new Date(ms))}`
}

/** "ven 03/10/2026 · Reel" */
export function rigaPost(giorno: string, tipo: TipoPost): string {
  return `${giornoPost(giorno)} · ${ETICHETTA_TIPO_POST[tipo]}`
}

/** «Collega» on a Posted content; «Collega e segna Posted» on one not yet (a post online is posted). */
export function etichettaCollega(stato: string | null | undefined): string {
  return !stato || stato === 'posted' ? 'Collega' : 'Collega e segna Posted'
}

/** "Post di Instagram, 5 da collegare": the tab's accessible name with its badge. */
export function nomeSchedaPost(daCollegare: number): string {
  return daCollegare > 0 ? `Post di Instagram, ${daCollegare} da collegare` : 'Post di Instagram'
}

/**
 * The toast after "Aggiorna da Instagram": «Aggiornato: 52 post letti, 3
 * collegati da soli, 5 proposte da controllare.»
 */
export function fraseAggiornato(esito: { letti: number; collegati: number; proposti: number }): string {
  const letti = esito.letti === 1 ? '1 post letto' : `${esito.letti} post letti`
  const collegati = esito.collegati === 1 ? '1 collegato da solo' : `${esito.collegati} collegati da soli`
  const proposte = esito.proposti === 1 ? '1 proposta da controllare' : `${esito.proposti} proposte da controllare`
  return `Aggiornato: ${letti}, ${collegati}, ${proposte}.`
}
