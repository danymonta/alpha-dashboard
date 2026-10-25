/**
 * The words of the posts of Instagram on the Marketing pages and in the
 * content's panel (1.33.0). Pure: client and server components read them,
 * and the tests.
 */
import type { Motivo, TipoPost } from '@/lib/marketing/abbinamento'
import { formatOra, oggiRoma } from '@/lib/date'
import { formatData, formato, GIORNI_BREVI_EN, parseDataISO } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'

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
  parlato_simile: 'parlato simile',
}

export const ETICHETTA_MOTIVO_EN: Record<Motivo, string> = {
  stessa_data: 'same date',
  giorno_vicino: 'nearby day',
  didascalia_simile: 'similar caption',
  unico_del_giorno: 'only one of the day',
  parlato_simile: 'similar speech',
}

/** "stessa data, didascalia simile"; with `ultima`: "stessa data e didascalia simile". Unknown reasons are left out. */
export function motiviInParole(motivi: readonly string[], ultima?: 'e', lingua: Lingua = 'it'): string {
  const etichette = lingua === 'en' ? ETICHETTA_MOTIVO_EN : ETICHETTA_MOTIVO
  const parole = motivi.filter((m): m is Motivo => m in ETICHETTA_MOTIVO).map((m) => etichette[m])
  if (ultima && parole.length > 1) return `${parole.slice(0, -1).join(', ')} ${lingua === 'en' ? 'and' : 'e'} ${parole.at(-1)}`
  return parole.join(', ')
}

const giornoBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

/** "ven 03/10/2026", from a 'YYYY-MM-DD'. */
export function giornoPost(giorno: string, lingua: Lingua = 'it'): string {
  if (lingua === 'en') return `${GIORNI_BREVI_EN[parseDataISO(giorno).getDay()]} ${formato('en').formatData(giorno)}`
  return `${giornoBreve.format(parseDataISO(giorno))} ${formatData(giorno)}`
}

/** "ven 03/10/2026 alle 18:30", in Rome, from an instant. */
export function quandoPubblicato(istante: string, lingua: Lingua = 'it'): string {
  const ms = Date.parse(istante)
  if (!Number.isFinite(ms)) return ''
  return `${giornoPost(oggiRoma(new Date(ms)), lingua)} ${lingua === 'en' ? 'at' : 'alle'} ${formatOra(new Date(ms))}`
}

/** "ven 03/10/2026 · Reel" */
export function rigaPost(giorno: string, tipo: TipoPost): string {
  return `${giornoPost(giorno)} · ${ETICHETTA_TIPO_POST[tipo]}`
}

/** «Collega» on a Posted content; «Collega e segna Posted» on one not yet (a post online is posted). */
export function etichettaCollega(stato: string | null | undefined, lingua: Lingua = 'it'): string {
  if (lingua === 'en') return !stato || stato === 'posted' ? 'Link' : 'Link and mark Posted'
  return !stato || stato === 'posted' ? 'Collega' : 'Collega e segna Posted'
}

/**
 * The toast after "Aggiorna da Instagram": «Aggiornato: 52 post letti, 3
 * collegati da soli, numeri di 41 post.» It always begins with «Aggiornato: N
 * post letti»; when Meta says the permission for the statistics is missing, it
 * ends «; statistiche non attive.» The proposals of the run are not said any
 * more (25/10/2026): nobody has to link a post.
 */
export function fraseAggiornato(
  esito: { letti: number; collegati: number; proposti?: number; metriche?: number | null; permesso?: boolean | null },
  lingua: Lingua = 'it',
): string {
  if (lingua === 'en') return fraseAggiornatoEn(esito)
  const letti = esito.letti === 1 ? '1 post letto' : `${esito.letti} post letti`
  const collegati = esito.collegati === 1 ? '1 collegato da solo' : `${esito.collegati} collegati da soli`
  const base = `Aggiornato: ${letti}, ${collegati}`
  if (esito.permesso === false) return `${base}; statistiche non attive.`
  if (typeof esito.metriche === 'number' && esito.metriche > 0) {
    return `${base}, numeri di ${esito.metriche === 1 ? '1 post' : `${esito.metriche} post`}.`
  }
  return `${base}.`
}

/** The same toast in English: «Updated: 52 posts read, 3 linked by themselves, numbers of 41 posts.» */
function fraseAggiornatoEn(esito: { letti: number; collegati: number; metriche?: number | null; permesso?: boolean | null }): string {
  const letti = esito.letti === 1 ? '1 post read' : `${esito.letti} posts read`
  const collegati = esito.collegati === 1 ? '1 linked by itself' : `${esito.collegati} linked by themselves`
  const base = `Updated: ${letti}, ${collegati}`
  if (esito.permesso === false) return `${base}; statistics not active.`
  if (typeof esito.metriche === 'number' && esito.metriche > 0) {
    return `${base}, numbers of ${esito.metriche === 1 ? '1 post' : `${esito.metriche} posts`}.`
  }
  return `${base}.`
}
