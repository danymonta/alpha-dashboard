import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'

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

const durata = z
  .union([z.string(), z.number()])
  .transform((v) => parseDurata(v))
  .refine((v) => v !== null, 'Scrivi la durata, ad esempio 1:30, 90 o 1h30')
  .refine((v) => v === null || v >= 1, 'La durata deve essere di almeno un minuto')
  .refine((v) => v === null || v <= MAX_MINUTI, 'Al massimo 24 ore in una voce')
  .transform((v) => v as number)

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

/** Time entered afterwards: a day (today or past) and a duration. */
export const tempoManualeSchema = z.object({
  progetto_id: z.string({ required_error: 'Scegli il progetto' }).uuid('Scegli il progetto'),
  task_id: idFacoltativo,
  data: giornoPassato,
  durata,
  nota: testoFacoltativo(2000),
})

/** Correcting one's entry: same rules, plus which row. */
export const modificaTempoSchema = tempoManualeSchema.extend({
  id: z.string().uuid('Voce non valida'),
})

export const eliminaTempoSchema = z.object({ id: z.string().uuid('Voce non valida') })

export type AvviaTimerInput = z.input<typeof avviaTimerSchema>
export type FermaTimerInput = z.input<typeof fermaTimerSchema>
export type TempoManualeInput = z.input<typeof tempoManualeSchema>
export type ModificaTempoInput = z.input<typeof modificaTempoSchema>
