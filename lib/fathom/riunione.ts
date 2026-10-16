import { z } from 'zod/v4'

/**
 * The few fields of a meeting of Fathom's list that the app reads (1.37.0): the
 * id of the recording, the links, the times and the title (only to show «Trovata:
 * …» in the sheet, never saved). Nothing else, not even in memory: no invitee,
 * no email, no summary. A key not in the schema is dropped by Zod.
 */
const dataOnull = z.union([z.string(), z.null()]).optional()

export const RiunioneSchema = z.object({
  recording_id: z.number().int().positive(),
  url: z.string().max(500),
  share_url: z.union([z.string().max(500), z.null()]).optional(),
  title: dataOnull,
  created_at: dataOnull,
  recording_start_time: dataOnull,
  recording_end_time: dataOnull,
})

export const ElencoSchema = z.object({
  items: z.array(z.unknown()),
  next_cursor: z.union([z.string(), z.null()]).optional(),
})

export type Riunione = {
  recording_id: number
  url: string
  share_url: string | null
  titolo: string | null
  inizio: string | null
  durata_secondi: number | null
}

const MAX_DURATA_S = 21_600

export function leggiRiunione(grezza: unknown): Riunione | null {
  const letta = RiunioneSchema.safeParse(grezza)
  if (!letta.success) return null
  const r = letta.data
  const inizio = r.recording_start_time ? Date.parse(r.recording_start_time) : NaN
  const fine = r.recording_end_time ? Date.parse(r.recording_end_time) : NaN
  const durata = Number.isFinite(inizio) && Number.isFinite(fine) && fine > inizio ? Math.round((fine - inizio) / 1000) : null
  return {
    recording_id: r.recording_id,
    url: r.url,
    share_url: r.share_url ?? null,
    titolo: r.title ? r.title.slice(0, 300) : null,
    inizio: Number.isFinite(inizio) ? new Date(inizio).toISOString() : null,
    durata_secondi: durata === null ? null : Math.min(durata, MAX_DURATA_S),
  }
}
