/**
 * The content calendar (Dany, 08/10/2026), a replica of Notion's
 * "📸 Instagram Posts DANYMONTA": the exact Notion labels, in English as in
 * Notion, live here and only here. The database keeps snake_case values
 * (public.contenuto_status, contenuto_tipo); a label is renamed in one place.
 *
 * Reel Type and Format are no longer fixed (Dany, 21/10/2026): they are the
 * options of marketing_opzioni, which people create and colour (opzioni.ts).
 * What stays here for them is the starting point: Notion's names of the
 * options the calendar was born with, which the import from Notion and the
 * words of Claude's analysis and weekly brief use.
 *
 * Checked against Notion on 09/10/2026: options, Status groups and their
 * order, the columns of the table view, the two page templates.
 */
import { OPZIONI_DI_PARTENZA, type ColoreEtichetta } from '@/lib/marketing/opzioni'
import type { Database } from '@/lib/supabase/database.types'

export type TipoContenuto = Database['public']['Enums']['contenuto_tipo']
/** The slug of a Reel Type option (marketing_opzioni.valore). */
export type ReelType = string
/** The slug of a Format option (marketing_opzioni.valore). */
export type FormatContenuto = string
export type StatusContenuto = Database['public']['Enums']['contenuto_status']
export type SezioneContenuto = 'messaggio' | 'bozza' | 'commenti' | 'finale'
export type GruppoStatus = 'to_do' | 'in_progress' | 'complete'

/** The template a page was built from (column tipo): Notion's template names. */
export const ETICHETTA_MODELLO: Record<TipoContenuto, string> = {
  reel: 'Reel Topic',
  carousel: 'Carousel Topic',
  // the videos of YouTube (Dany, 24/10/2026): not a Notion template, their own tab in the Piano editoriale
  youtube: 'YouTube Video',
}

/** tipo is not a Notion property: in the app it is the "Modello" of the page. */
export const CAMPO_MODELLO = 'Modello'

/** Notion's names of the Reel Type options the calendar started with, by slug (the starting point, not the live list). */
export const ETICHETTA_REEL_TYPE: Record<string, string> = Object.fromEntries(
  OPZIONI_DI_PARTENZA.reel_type.map((o) => [o.valore, o.nome]),
)

/** Notion's names of the Format options the calendar started with, by slug. */
export const ETICHETTA_FORMAT: Record<string, string> = Object.fromEntries(
  OPZIONI_DI_PARTENZA.formato.map((o) => [o.valore, o.nome]),
)

export const ETICHETTA_STATUS: Record<StatusContenuto, string> = {
  not_started: 'Not started',
  to_be_recorded: 'To be recorded',
  to_be_edited: 'To be edited',
  to_be_posted: 'To be posted',
  posted: 'Posted',
  canceled: 'Canceled',
}

/**
 * The colour of each Status (the screenshots of Notion, 21/10/2026): the pill
 * has a dot of this colour and always the name next to it. Not Notion's own
 * grey for the first of the group: Not started is grey, Canceled red.
 */
export const COLORE_STATUS: Record<StatusContenuto, ColoreEtichetta> = {
  not_started: 'gray',
  to_be_recorded: 'blue',
  to_be_edited: 'purple',
  to_be_posted: 'orange',
  posted: 'green',
  canceled: 'red',
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

/**
 * The columns of the Piano editoriale (Dany, 21/10/2026: «una grafica minimal
 * stile tabella Notion»): Audio leaves the table and stays in the content's
 * panel. Inspiration is back in the table (Dany, 24/10/2026: «il link della
 * reference deve apparire già in tabella cliccabile»): a button that opens it.
 * Notion's names, except the last: Views.
 */
export const COLONNE_PIANO = [
  'nome',
  'reel_type',
  'formato',
  'inspiration',
  'stato',
  'post_date',
  'url',
  'view_count',
] as const satisfies readonly CampoContenuto[]

/**
 * The tabs of the Piano editoriale (Dany, 24/10/2026: «una sezione separata per i video di youtube senza
 * mischiarli con i reel»): «Reels» holds the Reel and Carousel Topics, «YouTube» the YouTube videos.
 */
export const CANALI_PIANO = ['reels', 'youtube'] as const
export type CanalePiano = (typeof CANALI_PIANO)[number]

export function canaleDiTipo(tipo: TipoContenuto): CanalePiano {
  return tipo === 'youtube' ? 'youtube' : 'reels'
}

/** A YouTube video has no Format (Split, Reaction, B roll are the formats of a reel): the rest is the same. */
export const COLONNE_YOUTUBE = COLONNE_PIANO.filter((c) => c !== 'formato')

export function colonneDelCanale(canale: CanalePiano): readonly (typeof COLONNE_PIANO)[number][] {
  return canale === 'youtube' ? COLONNE_YOUTUBE : COLONNE_PIANO
}

export const INTESTAZIONE_PIANO: Record<(typeof COLONNE_PIANO)[number], string> = {
  nome: CAMPI.nome,
  reel_type: CAMPI.reel_type,
  formato: CAMPI.formato,
  inspiration: CAMPI.inspiration,
  stato: CAMPI.stato,
  post_date: CAMPI.post_date,
  url: CAMPI.url,
  view_count: 'Views',
}

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
  youtube: {
    messaggio: 'Idea / Message',
    bozza: 'Script',
    commenti: 'Comments',
    finale: 'Title & Description',
  },
}

function haTesto(valore: string | null | undefined): boolean {
  return typeof valore === 'string' && valore.trim() !== ''
}

/** The sections a page shows: all four for a reel and a YouTube video; a carousel's "Comments" only when it has text. */
export function sezioniVisibili(
  tipo: TipoContenuto,
  valori: Record<SezioneContenuto, string | null>,
): SezioneContenuto[] {
  return ORDINE_SEZIONI.filter((s) => tipo !== 'carousel' || s !== 'commenti' || haTesto(valori.commenti))
}

/** The rough draft a new Reel Topic starts with, as in Notion's template: one line each. */
export const BOZZA_REEL = 'Hook:\nLine:\nLine:\n…\nCTA:'

/** The script a new YouTube video starts with: the hook, the promise of the intro, the parts, the CTA. */
export const BOZZA_YOUTUBE = 'Hook:\nIntro:\nParte 1:\nParte 2:\n…\nCTA:'

/** The rough draft a new content starts with, by template: a Carousel Topic starts empty. */
export function bozzaIniziale(tipo: TipoContenuto): string | null {
  return tipo === 'reel' ? BOZZA_REEL : tipo === 'youtube' ? BOZZA_YOUTUBE : null
}

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
