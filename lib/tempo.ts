/**
 * Presentation of time in the Projects area. The minutes and every total come
 * from the database (pm_tempo, pm_riepilogo_tempo, pm_tempo_progetto): here we
 * only format them and pick which days a page looks at.
 */
import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { VUOTO, formatData, formato, parseDataISO } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO } from '@/lib/i18n/testi/tempo'

/** A period of the time pages can span at most (about a quarter). */
export const MAX_GIORNI_PERIODO = 92

/** "45 min", "2 h", "1 h 30 min". */
export function formatDurata(minuti: number | null | undefined): string {
  if (minuti === null || minuti === undefined || !Number.isFinite(minuti)) return VUOTO
  const totale = Math.max(0, Math.round(minuti))
  const ore = Math.floor(totale / 60)
  const resto = totale % 60
  if (ore === 0) return `${resto} min`
  return resto === 0 ? `${ore} h` : `${ore} h ${resto} min`
}

/** "1:30": how a duration is shown inside an editable field (parseDurata reads it back). */
export function formatDurataInput(minuti: number | null | undefined): string {
  if (minuti === null || minuti === undefined || !Number.isFinite(minuti)) return ''
  const totale = Math.max(0, Math.round(minuti))
  return `${Math.floor(totale / 60)}:${String(totale % 60).padStart(2, '0')}`
}

/** Running clock "01:02:03". Past 24 hours the hours keep counting. */
export function formatCronometro(secondi: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(secondi) ? secondi : 0))
  const ore = Math.floor(s / 3600)
  const minuti = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [ore, minuti, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

const giornoSettimana = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })

/**
 * Day heading of a grouped list: "Oggi · 28/09/2026", "Ieri · 27/09/2026",
 * "Domani · 29/09/2026", otherwise "lunedì 22/09/2026".
 */
export function intestazioneGiorno(iso: string, oggi: string = oggiRoma()): string {
  if (iso === oggi) return `Oggi · ${formatData(iso)}`
  if (iso === aggiungiGiorni(oggi, -1)) return `Ieri · ${formatData(iso)}`
  if (iso === aggiungiGiorni(oggi, 1)) return `Domani · ${formatData(iso)}`
  return `${giornoSettimana.format(parseDataISO(iso))} ${formatData(iso)}`
}

/** Monday of the ISO week that contains the date. */
export function lunediDi(iso: string): string {
  const giorno = parseDataISO(iso).getDay() // 0 = Sunday
  return aggiungiGiorni(iso, giorno === 0 ? -6 : 1 - giorno)
}

/** The last whole Monday-to-Sunday week before the one that contains the date (the Monday email). */
export function settimanaPrecedente(iso: string): { da: string; a: string } {
  const lunedi = lunediDi(iso)
  return { da: aggiungiGiorni(lunedi, -7), a: aggiungiGiorni(lunedi, -1) }
}

function giorniTra(da: string, a: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.round((utc(a) - utc(da)) / 86_400_000)
}

export type PeriodoTempo = {
  da: string
  a: string
  /** A Monday-to-Sunday week (navigable), or a free range. */
  tipo: 'settimana' | 'libero'
  /** "Questa settimana", "Settimana scorsa", "Settimana del 15/09/2026", "Periodo". */
  titolo: string
  /** "22/09/2026 – 28/09/2026" */
  etichetta: string
  /** Monday of the previous / next week; null when the next one is still to come. */
  precedente: string | null
  successivo: string | null
  corrente: boolean
}

/**
 * The period of a time page from its query: ?da=&a= (free range, at most
 * MAX_GIORNI_PERIODO days, the start pulled forward when longer), else
 * ?settimana=<any day of the week>, else the current week. Future weeks do
 * not exist: time is logged for today or the past. The words and the dates
 * in the page's language (1.53.0), Italian by default.
 */
export function periodoTempo(
  parametri: { settimana?: string | string[]; da?: string | string[]; a?: string | string[] },
  oggi: string = oggiRoma(),
  lingua: Lingua = 'it',
): PeriodoTempo {
  const { settimana, da, a } = parametri
  const parole = MIO_TEMPO[lingua].periodo
  const data = formato(lingua).formatData
  const lunediOggi = lunediDi(oggi)

  if (isDataISO(da) && isDataISO(a) && da <= a) {
    const inizio = giorniTra(da, a) >= MAX_GIORNI_PERIODO ? aggiungiGiorni(a, -(MAX_GIORNI_PERIODO - 1)) : da
    return {
      da: inizio,
      a,
      tipo: 'libero',
      titolo: parole.libero,
      etichetta: `${data(inizio)} – ${data(a)}`,
      precedente: null,
      successivo: null,
      corrente: false,
    }
  }

  const richiesto = isDataISO(settimana) ? lunediDi(settimana) : lunediOggi
  const lunedi = richiesto > lunediOggi ? lunediOggi : richiesto
  const domenica = aggiungiGiorni(lunedi, 6)
  const corrente = lunedi === lunediOggi
  const titolo = corrente
    ? parole.questaSettimana
    : lunedi === aggiungiGiorni(lunediOggi, -7)
      ? parole.settimanaScorsa
      : parole.settimanaDel(data(lunedi))

  return {
    da: lunedi,
    a: domenica,
    tipo: 'settimana',
    titolo,
    etichetta: `${data(lunedi)} – ${data(domenica)}`,
    precedente: aggiungiGiorni(lunedi, -7),
    successivo: corrente ? null : aggiungiGiorni(lunedi, 7),
    corrente,
  }
}

/** Groups rows by their `data`, most recent day first, keeping each day's order. */
export function perGiorno<T extends { data: string }>(righe: readonly T[]): { data: string; righe: T[] }[] {
  const gruppi = new Map<string, T[]>()
  for (const riga of righe) {
    const gruppo = gruppi.get(riga.data)
    if (gruppo) gruppo.push(riga)
    else gruppi.set(riga.data, [riga])
  }
  return [...gruppi.entries()]
    .sort(([x], [y]) => (x < y ? 1 : x > y ? -1 : 0))
    .map(([data, voci]) => ({ data, righe: voci }))
}

/**
 * Seconds a running timer has run at `adesso` (ms), without its pauses (1.66.0):
 * the ended pauses (`pausaSecondi`) and the one still open (`pausaDal`), whose
 * clock stands still. Display only: the saved minutes come from the database.
 */
export function secondiDelTimer(
  timer: { inizio: string; pausaDal?: string | null; pausaSecondi?: number | null },
  adesso: number,
): number {
  const fine = timer.pausaDal ? Math.min(adesso, new Date(timer.pausaDal).getTime()) : adesso
  return Math.max(0, (fine - new Date(timer.inizio).getTime()) / 1000 - (timer.pausaSecondi ?? 0))
}
