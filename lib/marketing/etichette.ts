/**
 * The content calendar (Dany, 08/10/2026), a replica of Notion's
 * "📸 Instagram Posts DANYMONTA": the exact Notion labels, in English as in
 * Notion, live here and only here. The database keeps snake_case values
 * (public.contenuto_*); a label is renamed in one place.
 *
 * Checked against Notion on 09/10/2026: options, Status groups and their
 * order, the columns of the table view, the two page templates.
 */
import type { Database } from '@/lib/supabase/database.types'

export type TipoContenuto = Database['public']['Enums']['contenuto_tipo']
export type ReelType = Database['public']['Enums']['contenuto_reel_type']
export type FormatContenuto = Database['public']['Enums']['contenuto_format']
export type StatusContenuto = Database['public']['Enums']['contenuto_status']
export type SezioneContenuto = 'messaggio' | 'bozza' | 'commenti' | 'finale'
export type GruppoStatus = 'to_do' | 'in_progress' | 'complete'

/** The template a page was built from (column tipo): Notion's template names. */
export const ETICHETTA_MODELLO: Record<TipoContenuto, string> = {
  reel: 'Reel Topic',
  carousel: 'Carousel Topic',
}

/** tipo is not a Notion property: in the app it is the "Modello" of the page. */
export const CAMPO_MODELLO = 'Modello'

export const ETICHETTA_REEL_TYPE: Record<ReelType, string> = {
  attraction: 'Attraction',
  education: 'Education',
  converting: 'Converting',
  radio: 'RADIO',
  workshop: 'Workshop',
}

export const ETICHETTA_FORMAT: Record<FormatContenuto, string> = {
  text_opinion: 'Text opinion',
  check_caption: 'Check Caption',
  split: 'Split',
  reaction: 'Reaction',
  b_roll: 'B roll',
  green_screen: 'Green Screen',
  raw_talking_head: 'Raw Talking Head',
  storytelling: 'Storytelling',
  transformation: 'Transformation',
  show_and_tell: 'Show&Tell',
}

export const ETICHETTA_STATUS: Record<StatusContenuto, string> = {
  not_started: 'Not started',
  to_be_recorded: 'To be recorded',
  to_be_edited: 'To be edited',
  to_be_posted: 'To be posted',
  posted: 'Posted',
  canceled: 'Canceled',
}

/** Notion's Status groups, each with its options in Notion's order (the menu shows them so). */
export const GRUPPI_STATUS: Record<GruppoStatus, readonly StatusContenuto[]> = {
  to_do: ['canceled', 'not_started'],
  in_progress: ['to_be_posted', 'to_be_edited', 'to_be_recorded'],
  complete: ['posted'],
}

export const ORDINE_GRUPPI: readonly GruppoStatus[] = ['to_do', 'in_progress', 'complete']

export const ETICHETTA_GRUPPO: Record<GruppoStatus, string> = {
  to_do: 'To-do',
  in_progress: 'In progress',
  complete: 'Complete',
}

export function gruppoDiStatus(s: StatusContenuto): GruppoStatus {
  return ORDINE_GRUPPI.find((g) => GRUPPI_STATUS[g].includes(s)) ?? 'to_do'
}

/** The Notion property of each column, with its Notion name. */
export const CAMPI = {
  nome: 'Name',
  reel_type: 'Reel Type',
  formato: 'Format',
  inspiration: 'Inspiration',
  stato: 'Status',
  post_date: 'Post Date',
  audio: 'Audio',
  url: 'URL',
  view_count: 'View Count',
} as const

export type CampoContenuto = keyof typeof CAMPI

/** The columns of Notion's table view, in its order (verified 09/10/2026). */
export const ORDINE_COLONNE = [
  'nome',
  'reel_type',
  'formato',
  'inspiration',
  'stato',
  'post_date',
  'audio',
  'url',
  'view_count',
] as const satisfies readonly CampoContenuto[]

/** The sections of a page, in the order of the templates. */
export const ORDINE_SEZIONI: readonly SezioneContenuto[] = ['messaggio', 'bozza', 'commenti', 'finale']

/**
 * The titles of the sections, as the two Notion templates write them. A
 * Carousel Topic has no "Comments": the column is shared, and shown only
 * when a carousel has text there (sezioniVisibili).
 */
export const SEZIONI: Record<TipoContenuto, Record<SezioneContenuto, string>> = {
  reel: {
    messaggio: 'Topic / Main Message',
    bozza: 'Script (Rough Draft)',
    commenti: 'Comments',
    finale: 'Script (Final)',
  },
  carousel: {
    messaggio: 'Idea/Message',
    bozza: 'Carousel',
    commenti: 'Comments',
    finale: 'Caption',
  },
}

function haTesto(valore: string | null | undefined): boolean {
  return typeof valore === 'string' && valore.trim() !== ''
}

/** The sections a page shows: all four for a reel; a carousel's "Comments" only when it has text. */
export function sezioniVisibili(
  tipo: TipoContenuto,
  valori: Record<SezioneContenuto, string | null>,
): SezioneContenuto[] {
  return ORDINE_SEZIONI.filter((s) => tipo === 'reel' || s !== 'commenti' || haTesto(valori.commenti))
}

/** The rough draft a new Reel Topic starts with, as in Notion's template: one line each. */
export const BOZZA_REEL = 'Hook:\nLine:\nLine:\n…\nCTA:'

/**
 * The value of a Notion label: trimmed, the exact label first, then ignoring
 * case. Null for an unknown label (the import refuses it: no guessing).
 */
export function valoreDaEtichetta<T extends string>(mappa: Record<T, string>, etichetta: string): T | null {
  const testo = etichetta.trim()
  if (testo === '') return null
  const voci = Object.entries(mappa) as [T, string][]
  const esatta = voci.find(([, e]) => e === testo)
  if (esatta) return esatta[0]
  const minuscola = testo.toLowerCase()
  return voci.find(([, e]) => e.toLowerCase() === minuscola)?.[0] ?? null
}
