import { z } from 'zod'

import { formatOra, isDataISO, oggiRoma } from '@/lib/date'

/** Longest single entry: the database caps a time entry at one day. */
export const MAX_MINUTI = 1440

/**
 * A duration as people type it, in minutes:
 * "1:30", "90", "1h30", "1h 30m", "2h", "45m", "45 min", "1,5h", "1.5 ore".
 * A bare number is minutes. Returns null when it cannot be read.
 */
export function parseDurata(valore: string | number | null | undefined): number | null {
  if (valore === null || valore === undefined) return null
  if (typeof valore === 'number') return Number.isInteger(valore) && valore >= 0 ? valore : null

  const testo = valore.trim().toLowerCase().replace(/\s+/g, '')
  if (testo === '') return null

  // "1:30", "0:45"
  let m = /^(\d{1,2}):([0-5]\d)$/.exec(testo)
  if (m) return Number(m[1]) * 60 + Number(m[2])

  // "90"
  if (/^\d{1,4}$/.test(testo)) return Number(testo)

  // "1h30", "1h30m", "1h30min", "2h", "2ore", "1ora15"
  m = /^(\d{1,2})(?:h|ore|ora)(?:(\d{1,2})(?:m|min|minuti)?)?$/.exec(testo)
  if (m) {
    const minuti = m[2] ? Number(m[2]) : 0
    return minuti < 60 ? Number(m[1]) * 60 + minuti : null
  }

  // "45m", "45min", "45minuti"
  m = /^(\d{1,4})(?:m|min|minuti)$/.exec(testo)
  if (m) return Number(m[1])

  // "1,5h", "1.5 ore": decimal hours, rounded to the minute
  m = /^(\d{1,2})[.,](\d{1,2})(?:h|ore|ora)$/.exec(testo)
  if (m) return Math.round(Number(`${m[1]}.${m[2]}`) * 60)

  return null
}

const testoFacoltativo = (max: number) =>
  z
    .string()
    .max(max, `Al massimo ${max} caratteri`)
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))

const idFacoltativo = z
  .union([z.string().uuid(), z.literal('')])
  .nullish()
  .transform((v) => v || null)

const giornoPassato = z
  .string({ required_error: 'Scegli il giorno' })
  .refine(isDataISO, 'Data non valida')
  .refine((d) => d <= oggiRoma(), 'Il tempo si registra per oggi o per un giorno passato')

/** Start a timer: the project, optionally a task and a note. */
export const avviaTimerSchema = z.object({
  progetto_id: z.string({ required_error: 'Scegli il progetto' }).uuid('Scegli il progetto'),
  task_id: idFacoltativo,
  nota: testoFacoltativo(2000),
})

/** Stop the running timer, optionally leaving a note. */
export const fermaTimerSchema = z.object({
  nota: testoFacoltativo(2000),
})

/**
 * "09:30" from what people type or a time field gives: "9", "9:30", "09.30",
 * "09:30:00". Null when it is not an hour of the day.
 */
export function parseOra(valore: string | null | undefined): string | null {
  if (typeof valore !== 'string') return null
  const testo = valore.trim()
  const m = /^(\d{1,2})(?:[:.](\d{2})(?::\d{2})?)?$/.exec(testo)
  if (!m) return null
  const ore = Number(m[1])
  const minuti = m[2] === undefined ? 0 : Number(m[2])
  if (ore > 23 || minuti > 59) return null
  return `${String(ore).padStart(2, '0')}:${String(minuti).padStart(2, '0')}`
}

const orologioRoma = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Minutes Europe/Rome is ahead of UTC at an instant (60 in winter, 120 in summer). */
function scartoRoma(ms: number): number {
  const p = Object.fromEntries(orologioRoma.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
  const comeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((comeUtc - Math.floor(ms / 60_000) * 60_000) / 60_000)
}

/**
 * The instant of a day and an "HH:mm" in Europe/Rome, as the database builds
 * it (public.pm_fascia_tempo): at the hour skipped in March a time counts
 * before the change, at the hour repeated in October after it.
 */
export function istanteRoma(data: string, ora: string): Date {
  const [anno, mese, giorno] = data.split('-').map(Number)
  const [ore, minuti] = ora.split(':').map(Number)
  const orologio = Date.UTC(anno, mese - 1, giorno, ore, minuti)
  // the offset before and after any change of that night
  const prima = scartoRoma(orologio - 12 * 3_600_000)
  const dopo = scartoRoma(orologio + 12 * 3_600_000)
  const conDopo = orologio - dopo * 60_000
  if (scartoRoma(conDopo) === dopo) return new Date(conDopo)
  return new Date(orologio - prima * 60_000)
}

/**
 * Minutes between "Dalle" and "Alle" of a day, DST included (the day summer
 * time ends has 25 hours). Null when the range is not complete or not valid.
 */
export function minutiFascia(
  data: string | null | undefined,
  dalle: string | null | undefined,
  alle: string | null | undefined,
): number | null {
  const inizio = parseOra(dalle)
  const fine = parseOra(alle)
  if (!isDataISO(data) || !inizio || !fine) return null
  return Math.round((istanteRoma(data, fine).getTime() - istanteRoma(data, inizio).getTime()) / 60_000)
}

const oraFacoltativa = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (!v?.trim()) return null
    const ora = parseOra(v)
    if (!ora) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Scrivi l’ora come 09:30' })
      return z.NEVER
    }
    return ora
  })

export const MESSAGGIO_FASCIA_A_META = 'Indica sia l’inizio sia la fine, o nessuno dei due'

/** The fields of an entry typed afterwards: a duration, or a range that gives it. */
const campiTempo = z.object({
  progetto_id: z.string({ required_error: 'Scegli il progetto' }).uuid('Scegli il progetto'),
  task_id: idFacoltativo,
  data: giornoPassato,
  durata: z.union([z.string(), z.number()]).nullish(),
  dalle: oraFacoltativa,
  alle: oraFacoltativa,
  nota: testoFacoltativo(2000),
})

type CampiTempo = z.output<typeof campiTempo>

/**
 * Minutes only, or "Dalle"–"Alle" on the entry's day: then the minutes come
 * from the range (the database computes them again when it saves). A range
 * ends after it starts, never in the future, 24 hours at most.
 */
function verificaTempo(v: CampiTempo, ctx: z.RefinementCtx) {
  // an hour already refused (not an hour of the day) says so on its own
  const letta = (ora: unknown) => ora === null || typeof ora === 'string'
  if (!letta(v.dalle) || !letta(v.alle)) return

  if ((v.dalle === null) !== (v.alle === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.dalle === null ? 'dalle' : 'alle'], message: MESSAGGIO_FASCIA_A_META })
    return
  }

  if (v.dalle !== null && v.alle !== null) {
    // a day already refused (future, impossible) says so on its own
    if (!isDataISO(v.data) || v.data > oggiRoma()) return
    const minuti = minutiFascia(v.data, v.dalle, v.alle)!
    if (v.alle <= v.dalle || minuti < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alle'], message: 'L’ora di fine deve essere dopo quella di inizio' })
    } else if (minuti > MAX_MINUTI) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alle'], message: 'Al massimo 24 ore in una voce' })
    } else if (istanteRoma(v.data, v.alle).getTime() > Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alle'], message: 'La fascia non può finire nel futuro' })
    }
    return
  }

  const minuti = parseDurata(v.durata)
  const messaggio =
    minuti === null
      ? 'Scrivi la durata, ad esempio 1:30, 90 o 1h30'
      : minuti < 1
        ? 'La durata deve essere di almeno un minuto'
        : minuti > MAX_MINUTI
          ? 'Al massimo 24 ore in una voce'
          : null
  if (messaggio) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['durata'], message: messaggio })
}

/** The duration in minutes: from the range when there is one. */
function conMinuti<T extends CampiTempo>(v: T): Omit<T, 'durata'> & { durata: number } {
  const minuti = v.dalle !== null && v.alle !== null ? minutiFascia(v.data, v.dalle, v.alle) : parseDurata(v.durata)
  return { ...v, durata: minuti as number }
}

/** Time entered afterwards: a day (today or past) and a duration or a range. */
export const tempoManualeSchema = campiTempo.superRefine(verificaTempo).transform(conMinuti)

/** Correcting one's entry: same rules, plus which row. */
export const modificaTempoSchema = campiTempo
  .extend({ id: z.string().uuid('Voce non valida') })
  .superRefine(verificaTempo)
  .transform(conMinuti)

export const eliminaTempoSchema = z.object({ id: z.string().uuid('Voce non valida') })

export type AvviaTimerInput = z.input<typeof avviaTimerSchema>
export type FermaTimerInput = z.input<typeof fermaTimerSchema>
export type TempoManualeInput = z.input<typeof tempoManualeSchema>
export type ModificaTempoInput = z.input<typeof modificaTempoSchema>

type VoceConOrari = { data: string; inizio: string | null; fine: string | null }

/** The minute an instant falls in (date_trunc('minute') in the database). */
function alMinuto(istante: string): number {
  return Math.floor(new Date(istante).getTime() / 60_000) * 60_000
}

/**
 * "Dalle" and "Alle" of an entry in Europe/Rome: the HH:mm of its start and
 * end, when rebuilt on its day they give back the minutes the two fall in and
 * the end is a later minute (public.pm_modifica_tempo checks the same). Null
 * without a range, and for a stopped timer with no range of one day: across
 * midnight, inside one minute, in the hour repeated in October.
 */
export function fasciaDellaVoce(voce: VoceConOrari): { dalle: string; alle: string } | null {
  if (!voce.inizio || !voce.fine) return null
  const dalle = formatOra(voce.inizio)
  const alle = formatOra(voce.fine)
  if (dalle >= alle) return null
  if (
    istanteRoma(voce.data, dalle).getTime() !== alMinuto(voce.inizio) ||
    istanteRoma(voce.data, alle).getTime() !== alMinuto(voce.fine)
  ) {
    return null
  }
  return { dalle, alle }
}

/**
 * A stopped timer with no range the forms can show, in words:
 * "23:30–00:30, a cavallo della mezzanotte". Its start and end stay while its
 * day and minutes do; changing either leaves only the minutes
 * (pm_modifica_tempo). Null for every other entry.
 */
export function timerSenzaFascia(voce: VoceConOrari): string | null {
  if (!voce.inizio || !voce.fine || fasciaDellaVoce(voce)) return null
  const dalle = formatOra(voce.inizio)
  const alle = formatOra(voce.fine)
  const motivo =
    oggiRoma(new Date(voce.inizio)) !== voce.data || oggiRoma(new Date(voce.fine)) !== voce.data
      ? 'a cavallo della mezzanotte'
      : istanteRoma(voce.data, dalle).getTime() === alMinuto(voce.inizio) &&
          istanteRoma(voce.data, alle).getTime() === alMinuto(voce.fine)
        ? 'meno di un minuto'
        : 'nella notte del cambio d’ora'
  return `${dalle}–${alle}, ${motivo}`
}
