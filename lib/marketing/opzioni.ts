/**
 * The labels of Reel Type and Format (Dany, 21/10/2026: «uno può volendo
 * creare anche nuove etichette proprio come notion e soprattutto devono
 * essere colorate»): rows of marketing_opzioni that people create, rename and
 * recolour, like the options of a Notion select. This file is the shared part
 * (browser and server): the ten colours of Notion, the shape of an option,
 * the options the calendar was born with, and the small functions that find an
 * option by slug or by name. Reading them from the database is
 * lib/marketing/letture.ts; the colours of the pills are
 * components/marketing/etichette.css.
 */

/** The two properties that are a select of options. */
export const CAMPI_OPZIONE = ['reel_type', 'formato'] as const
export type CampoOpzione = (typeof CAMPI_OPZIONE)[number]

/** Notion's ten colours, in the order of its menu (the same list as the table's check). */
export const COLORI_ETICHETTA = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const
export type ColoreEtichetta = (typeof COLORI_ETICHETTA)[number]

/** The name of each colour in the menu of an option. */
export const NOME_COLORE: Record<ColoreEtichetta, string> = {
  default: 'Predefinito',
  gray: 'Grigio',
  brown: 'Marrone',
  orange: 'Arancione',
  yellow: 'Giallo',
  green: 'Verde',
  blue: 'Blu',
  purple: 'Viola',
  pink: 'Rosa',
  red: 'Rosso',
}

export function isColore(valore: unknown): valore is ColoreEtichetta {
  return typeof valore === 'string' && (COLORI_ETICHETTA as readonly string[]).includes(valore)
}

/** One option, as the page reads it. `valore` is the stable slug the contents point at. */
export type Opzione = {
  id: string
  campo: CampoOpzione
  valore: string
  nome: string
  colore: ColoreEtichetta
  ordine: number
}

export type Opzioni = Record<CampoOpzione, Opzione[]>

/** How many contents use each option, by `valore` (only the ones used). */
export type ConteggiOpzioni = Record<CampoOpzione, Record<string, number>>

export const OPZIONI_VUOTE: Opzioni = { reel_type: [], formato: [] }
export const CONTEGGI_VUOTI: ConteggiOpzioni = { reel_type: {}, formato: {} }

/** The shape of a slug: lower case, digits and underscore (the table's check). */
export const RE_VALORE_OPZIONE = /^[a-z0-9_]{1,60}$/

export const NOME_OPZIONE_MAX = 60

/**
 * The options the calendar was born with (the two enums of 1.32.0), with
 * Notion's names and the colour each one has in the database. Used by the
 * import from Notion (an unknown Notion label still stops the page) and as the
 * words of the analysis of the reels and of the weekly brief, which pick among
 * them. The database is the truth for what people see: here only the starting
 * point. Order as Notion's.
 */
export const OPZIONI_DI_PARTENZA: Record<CampoOpzione, readonly { valore: string; nome: string; colore: ColoreEtichetta }[]> = {
  reel_type: [
    { valore: 'attraction', nome: 'Attraction', colore: 'blue' },
    { valore: 'education', nome: 'Education', colore: 'yellow' },
    { valore: 'converting', nome: 'Converting', colore: 'red' },
    { valore: 'radio', nome: 'RADIO', colore: 'purple' },
    { valore: 'workshop', nome: 'Workshop', colore: 'green' },
  ],
  formato: [
    { valore: 'text_opinion', nome: 'Text opinion', colore: 'gray' },
    { valore: 'check_caption', nome: 'Check Caption', colore: 'pink' },
    { valore: 'split', nome: 'Split', colore: 'purple' },
    { valore: 'reaction', nome: 'Reaction', colore: 'yellow' },
    { valore: 'b_roll', nome: 'B roll', colore: 'orange' },
    { valore: 'green_screen', nome: 'Green Screen', colore: 'green' },
    { valore: 'raw_talking_head', nome: 'Raw Talking Head', colore: 'blue' },
    { valore: 'storytelling', nome: 'Storytelling', colore: 'brown' },
    { valore: 'transformation', nome: 'Transformation', colore: 'red' },
    { valore: 'show_and_tell', nome: 'Show&Tell', colore: 'default' },
  ],
}

/** The option with this slug, if any. */
export function opzioneDaValore(elenco: readonly Opzione[], valore: string | null | undefined): Opzione | null {
  if (!valore) return null
  return elenco.find((o) => o.valore === valore) ?? null
}

/** A name compared the way the database does: single spaces, no case. */
export function nomeConfrontabile(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * The option a person means by this word: the slug, the exact name, or the name
 * without case. Null when no option answers (the callers never create one by
 * guessing). Used by Claude's tools and by the menu's «Crea».
 */
export function opzioneDaNomeOValore(elenco: readonly Opzione[], testo: string): Opzione | null {
  const t = testo.trim()
  if (t === '') return null
  const confronto = nomeConfrontabile(t)
  return (
    elenco.find((o) => o.valore === t) ??
    elenco.find((o) => o.nome === t) ??
    elenco.find((o) => nomeConfrontabile(o.nome) === confronto) ??
    elenco.find((o) => o.valore === confronto) ??
    null
  )
}

/** The starting options as `Opzioni` (ids made of the slug): for tests and for a page that cannot read the database. */
export function opzioniDiPartenza(): Opzioni {
  const come = (campo: CampoOpzione): Opzione[] =>
    OPZIONI_DI_PARTENZA[campo].map((o, i) => ({ id: `${campo}:${o.valore}`, campo, ...o, ordine: (i + 1) * 10 }))
  return { reel_type: come('reel_type'), formato: come('formato') }
}

/** The names by slug of each field: what the words sent to Claude are made of. */
export type NomiOpzioni = Record<CampoOpzione, Record<string, string>>

/** The names of the live options (`nomiDa(await leggiOpzioni(db))`) or, without a database, of the starting ones. */
export function nomiDa(opzioni: Opzioni = opzioniDiPartenza()): NomiOpzioni {
  const per = (campo: CampoOpzione) => Object.fromEntries(opzioni[campo].map((o) => [o.valore, o.nome]))
  return { reel_type: per('reel_type'), formato: per('formato') }
}

/** The name to show for a slug: the option's, or (an option that is gone) the slug as a last resort. */
export function nomeDaValore(elenco: readonly Opzione[], valore: string | null | undefined): string {
  if (!valore) return ''
  return opzioneDaValore(elenco, valore)?.nome ?? valore
}
