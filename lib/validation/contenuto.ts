import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { linkDiCondivisione } from '@/lib/marketing/shortcode'
import { Constants } from '@/lib/supabase/database.types'

/**
 * A content of the calendar (marketing_contenuti, 1.32.0): the same schema
 * validates the forms, the server actions and the Notion import
 * (lib/marketing/da-notion.ts). The rules are the checks of the table: links
 * http(s) without spaces up to 500 characters, Name 1–300, Audio up to 200,
 * View Count a whole number ≥ 0, sections up to 30,000 characters.
 */

export const LINK_MAX = 500
export const NOME_MAX = 300
export const AUDIO_MAX = 200
export const SEZIONE_MAX = 30_000
/** View Count is an integer column: up to 2,000,000,000. */
export const VIEW_COUNT_MAX = 2_000_000_000

export const ERRORE_LINK = 'Link non valido: incolla l’indirizzo intero.'
export const ERRORE_LINK_CONDIVISIONE =
  'Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.'
export const ERRORE_VIEW_COUNT = 'View Count: scrivi un numero intero, senza decimali.'
export const ERRORE_SEZIONE_LUNGA = 'Il testo supera i 30.000 caratteri: accorcialo.'

/** Characters as Postgres counts them (char_length): code points, not UTF-16 units. */
export function lunghezza(testo: string): number {
  return [...testo].length
}

const RE_SCHEMA = /^[a-z][a-z0-9+.-]*:/i
/** The same rule as the table's check: http or https, then no spaces. */
const RE_LINK = /^https?:\/\/\S+$/

/** A link as pasted: trimmed, https:// when it has no scheme, the scheme in lower case. */
export function normalizzaLink(valore: string): string {
  const testo = valore.trim()
  if (testo === '') return ''
  const conSchema = RE_SCHEMA.test(testo) ? testo : `https://${testo}`
  return conSchema.replace(/^https?:/i, (s) => s.toLowerCase())
}

/** http or https, a host with a dot, no spaces, at most LINK_MAX characters. */
export function linkValido(valore: string): boolean {
  if (lunghezza(valore) > LINK_MAX || !RE_LINK.test(valore)) return false
  try {
    const url = new URL(valore)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** Inspiration, URL: empty is null; "www.instagram.com/…" gets https://; javascript: and the like never. */
export const linkFacoltativo = z
  .string({ invalid_type_error: ERRORE_LINK })
  .nullish()
  .transform((v) => normalizzaLink(v ?? ''))
  .refine((v) => v === '' || linkValido(v), ERRORE_LINK)
  .transform((v) => v || null)

/**
 * The published post: a link, and never instagram.com/share/… (a redirect
 * token with no shortcode: Insight and the reel statistics could not find
 * the content).
 */
export const urlPost = linkFacoltativo.refine((v) => v === null || !linkDiCondivisione(v), ERRORE_LINK_CONDIVISIONE)

/**
 * "12345", "12.345" or "12,345": a dot or a comma followed by exactly three
 * digits groups thousands, as Notion shows them (number_with_commas) and as
 * an Italian writes them. "1,5" is a decimal: refused.
 */
export function parseViewCount(testo: string): number | null {
  const t = testo.trim()
  if (/^\d+$/.test(t) || /^\d{1,3}(?:\.\d{3})+$/.test(t) || /^\d{1,3}(?:,\d{3})+$/.test(t)) {
    return Number(t.replace(/[.,]/g, ''))
  }
  return null
}

const viewCount = z
  .union([z.string(), z.number()], { invalid_type_error: ERRORE_VIEW_COUNT })
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null
    const n = typeof v === 'number' ? v : parseViewCount(v)
    if (n === null || !Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: ERRORE_VIEW_COUNT })
      return z.NEVER
    }
    if (n > VIEW_COUNT_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'View Count: al massimo 2.000.000.000.' })
      return z.NEVER
    }
    return n
  })

/** A select with "nessuno": '' and null are no value. */
function sceltaFacoltativa<T extends Readonly<[string, ...string[]]>>(valori: T) {
  return z
    .union([z.enum(valori, { errorMap: () => ({ message: 'Scegli un valore della lista.' }) }), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null))
}

export const contenutoSchema = z.object({
  tipo: z.enum(Constants.public.Enums.contenuto_tipo, { errorMap: () => ({ message: 'Scegli il modello.' }) }),
  nome: z
    .string({ required_error: 'Scrivi il nome.', invalid_type_error: 'Scrivi il nome.' })
    .trim()
    .min(1, 'Scrivi il nome.')
    .max(NOME_MAX, `Al massimo ${NOME_MAX} caratteri.`),
  reel_type: sceltaFacoltativa(Constants.public.Enums.contenuto_reel_type),
  formato: sceltaFacoltativa(Constants.public.Enums.contenuto_format),
  stato: z
    .enum(Constants.public.Enums.contenuto_status, { errorMap: () => ({ message: 'Scegli lo Status.' }) })
    .default('not_started'),
  // past and future days are both valid: the calendar plans ahead
  post_date: z
    .string({ invalid_type_error: 'Data non valida.' })
    .nullish()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || isDataISO(v), 'Data non valida.'),
  inspiration: linkFacoltativo,
  url: urlPost,
  audio: z
    .string({ invalid_type_error: 'Audio non valido.' })
    .nullish()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || lunghezza(v) <= AUDIO_MAX, `Audio: al massimo ${AUDIO_MAX} caratteri.`),
  view_count: viewCount,
})

export type ContenutoInput = z.input<typeof contenutoSchema>
export type ContenutoDati = z.output<typeof contenutoSchema>

/**
 * The version a properties sheet saves over: the row's updated_at as the page
 * last read it or as the person's own last save returned it, passed back
 * untouched (a Date would drop the microseconds).
 */
const versioneSchema = z
  .string()
  .min(1, 'Contenuto non valido.')
  .max(64, 'Contenuto non valido.')
  .refine((v) => Number.isFinite(Date.parse(v)), 'Contenuto non valido.')

const idContenuto = z.string().uuid('Contenuto non valido.')

export const modificaContenutoSchema = contenutoSchema.extend({ id: idContenuto, versione: versioneSchema })
export type ModificaContenutoInput = z.input<typeof modificaContenutoSchema>

/**
 * The text of a section as public.salva_sezione_contenuto stores it: the
 * leading blank lines and the trailing whitespace go, the first line keeps
 * its indentation (it is Markdown); only spaces is null.
 */
export function normalizzaSezione(testo: string | null | undefined): string | null {
  const t = (testo ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/[ \t\r\n]+$/, '')
  return t === '' ? null : t
}

export const sezioneContenutoSchema = z.object({
  id: idContenuto,
  campo: z.enum(['messaggio', 'bozza', 'commenti', 'finale'], {
    errorMap: () => ({ message: 'Sezione non valida.' }),
  }),
  testo: z
    .string({ invalid_type_error: 'Testo non valido.' })
    .refine((t) => lunghezza(normalizzaSezione(t) ?? '') <= SEZIONE_MAX, ERRORE_SEZIONE_LUNGA),
  /** md5 of the text the page showed ('' for an empty section) */
  impronta: z.string().regex(/^[0-9a-f]{32}$/, 'Ricarica la pagina e riprova.'),
})
export type SezioneContenutoInput = z.input<typeof sezioneContenutoSchema>

export const statusContenutoSchema = z.object({
  id: idContenuto,
  stato: z.enum(Constants.public.Enums.contenuto_status, { errorMap: () => ({ message: 'Scegli lo Status.' }) }),
})

export const eliminaContenutoSchema = z.object({ id: idContenuto })
