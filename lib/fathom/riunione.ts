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

/**
 * A meeting as the matching of 1.65.0 reads it (lib/fathom/abbina.ts): the same
 * fields plus the scheduled start and the names of the calendar invitees, with
 * the part before the @ of their email. Only in memory, only to recognise the
 * lead: never saved, never in a log.
 */
const InvitatoSchema = z.object({
  name: z.union([z.string(), z.null()]).optional(),
  email: z.union([z.string(), z.null()]).optional(),
})
const PerAbbinamentoSchema = RiunioneSchema.extend({
  meeting_title: dataOnull,
  scheduled_start_time: dataOnull,
  calendar_invitees: z.union([z.array(z.unknown()), z.null()]).optional(),
})

export type RiunionePerAbbinamento = Riunione & {
  /** title and invitees' names (and email local parts), for the lead's name */
  nomi: string
  /** the scheduled start, else the recording's start, else Fathom's created_at (ISO) */
  quando: string | null
}

export function leggiRiunionePerAbbinamento(grezza: unknown): RiunionePerAbbinamento | null {
  const base = leggiRiunione(grezza)
  if (!base) return null
  const letta = PerAbbinamentoSchema.safeParse(grezza)
  if (!letta.success) return null
  const r = letta.data
  const invitati = (r.calendar_invitees ?? []).flatMap((i) => {
    const x = InvitatoSchema.safeParse(i)
    if (!x.success) return []
    return [x.data.name ?? '', (x.data.email ?? '').split('@')[0] ?? '']
  })
  const nomi = [r.title ?? '', r.meeting_title ?? '', ...invitati].join(' ').slice(0, 2000)
  const istante = [r.scheduled_start_time, r.recording_start_time, r.created_at]
    .map((d) => (d ? Date.parse(d) : NaN))
    .find((t) => Number.isFinite(t))
  return { ...base, nomi, quando: istante === undefined ? null : new Date(istante).toISOString() }
}
