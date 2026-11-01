/**
 * The highlighter of the content sections (Dany, 01/11/2026: «imposta la
 * possibilità di evidenziare i testi dalla mia dashboard come fa notion con i
 * colori del testo e dello sfondo evidenziatore»). The sections are Markdown,
 * and Markdown has no colours, so a colour is a small inline tag that only this
 * app writes and reads, and only in these exact forms:
 *
 *   <span data-colore="rosso">testo</span>             the colour of the text
 *   <mark data-sfondo="giallo">testo</mark>            the background
 *   <span data-colore="rosso" data-sfondo="giallo">…   both (read; the editor writes the two nested)
 *
 * Lower case, double quotes, one space before each attribute, nothing else in
 * the tag, a value from COLORI_EVIDENZIATORE. Anything else (another
 * attribute, an unknown colour, any other HTML) is not a colour and stays text,
 * as every HTML of a section always has: the page never renders raw HTML.
 * Pure: the editor's tokenizer, the page's remark plugin and the cleaners of
 * the analyses share it.
 */
import type { ColoreEtichetta } from '@/lib/marketing/opzioni'

/** Notion's colours but «default», which is no colour at all: «Predefinito» takes the colour away. */
export const COLORI_EVIDENZIATORE = ['grigio', 'marrone', 'arancione', 'giallo', 'verde', 'blu', 'viola', 'rosa', 'rosso'] as const

export type ColoreEvidenziatore = (typeof COLORI_EVIDENZIATORE)[number]

/** The label colour whose tokens (--etichetta-<colore>-*) paint each one. */
export const TOKEN_EVIDENZIATORE: Record<ColoreEvidenziatore, Exclude<ColoreEtichetta, 'default'>> = {
  grigio: 'gray',
  marrone: 'brown',
  arancione: 'orange',
  giallo: 'yellow',
  verde: 'green',
  blu: 'blue',
  viola: 'purple',
  rosa: 'pink',
  rosso: 'red',
}

export function eColoreEvidenziatore(valore: unknown): valore is ColoreEvidenziatore {
  return typeof valore === 'string' && (COLORI_EVIDENZIATORE as readonly string[]).includes(valore)
}

export type Evidenziatura = { colore: ColoreEvidenziatore | null; sfondo: ColoreEvidenziatore | null }

export type TagEvidenziatore = Evidenziatura & { tag: 'span' | 'mark'; lunghezza: number }

// the opening tag, exactly: one or two data attributes, each with a lower-case word
const RE_APERTURA = /<(span|mark)((?: data-(?:colore|sfondo)="[a-z]+"){1,2})>/y
const RE_ATTRIBUTO = / data-(colore|sfondo)="([a-z]+)"/g

/**
 * The opening tag at `da`, when it is one of ours: a span with the colour (and
 * maybe the background), a mark with the background. Null otherwise.
 */
export function leggiApertura(testo: string, da = 0): TagEvidenziatore | null {
  RE_APERTURA.lastIndex = da
  const m = RE_APERTURA.exec(testo)
  if (!m) return null
  const tag = m[1] as 'span' | 'mark'
  const valori: Record<string, string> = {}
  for (const [, nome, valore] of m[2].matchAll(RE_ATTRIBUTO)) {
    if (nome in valori) return null
    valori[nome] = valore
  }
  const colore = valori.colore ?? null
  const sfondo = valori.sfondo ?? null
  if (colore !== null && !eColoreEvidenziatore(colore)) return null
  if (sfondo !== null && !eColoreEvidenziatore(sfondo)) return null
  // a span carries the colour, a mark only the background
  if (tag === 'span' && colore === null) return null
  if (tag === 'mark' && (sfondo === null || colore !== null)) return null
  return { tag, colore, sfondo, lunghezza: m[0].length }
}

export type Evidenziato = Evidenziatura & { tag: 'span' | 'mark'; raw: string; interno: string }

/**
 * A whole coloured piece at `da`: our opening tag, the text, its own closing
 * tag (`</span>` or `</mark>`, exactly), counting the tags of the same name in
 * between so a span inside a span closes where it should. Null when it is not
 * one, or when its closing tag is missing.
 */
export function leggiEvidenziato(testo: string, da = 0): Evidenziato | null {
  const apertura = leggiApertura(testo, da)
  if (!apertura) return null
  const { tag } = apertura
  const inizio = da + apertura.lunghezza
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])`, 'g')
  re.lastIndex = inizio
  let profondita = 1
  for (let m = re.exec(testo); m; m = re.exec(testo)) {
    if (m[1] === '') {
      profondita += 1
      continue
    }
    profondita -= 1
    if (profondita > 0) continue
    const chiusura = `</${tag}>`
    if (!testo.startsWith(chiusura, m.index)) return null
    return {
      tag,
      colore: apertura.colore,
      sfondo: apertura.sfondo,
      interno: testo.slice(inizio, m.index),
      raw: testo.slice(da, m.index + chiusura.length),
    }
  }
  return null
}

/** Where a coloured piece could start (for marked's `start`): the first «<span data-» or «<mark data-», or -1. */
export function inizioEvidenziato(testo: string): number {
  const span = testo.indexOf('<span data-')
  const mark = testo.indexOf('<mark data-')
  if (span < 0) return mark
  if (mark < 0) return span
  return Math.min(span, mark)
}

/** The tags the editor writes: the colour on a span, the background on a mark. */
export function tagColore(colore: ColoreEvidenziatore, testo: string): string {
  return `<span data-colore="${colore}">${testo}</span>`
}

export function tagSfondo(sfondo: ColoreEvidenziatore, testo: string): string {
  return `<mark data-sfondo="${sfondo}">${testo}</mark>`
}

/**
 * The text without the colours: what goes to Claude in the analyses and what
 * the matching of the posts reads (a tag is not a word of the script). Only
 * our tags go, the text inside stays; every other «<» stays as it is.
 */
export function togliEvidenziatore(testo: string): string {
  if (!testo.includes(' data-')) return testo
  let fuori = ''
  let i = 0
  while (i < testo.length) {
    const j = testo.indexOf('<', i)
    if (j < 0) {
      fuori += testo.slice(i)
      break
    }
    fuori += testo.slice(i, j)
    const pezzo = leggiEvidenziato(testo, j)
    if (pezzo) {
      fuori += togliEvidenziatore(pezzo.interno)
      i = j + pezzo.raw.length
    } else {
      fuori += '<'
      i = j + 1
    }
  }
  return fuori
}

/** The CSS classes of a coloured piece (components/marketing/evidenziatore.css). */
export function classiEvidenziatura({ colore, sfondo }: Evidenziatura): string[] {
  return [...(colore ? ['ev-colore'] : []), ...(sfondo ? ['ev-sfondo'] : [])]
}
