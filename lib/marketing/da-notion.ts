/**
 * The one-time import of the content calendar from Notion (1.32.0, Dany
 * 08/10/2026: the pages with a Post Date in September and October 2026).
 * Claude reads the database through the Notion MCP (the table view and
 * notion-fetch of each page) and writes the pages as fetched into a JSON file
 * in import/; scripts/import-contenuti-notion.ts turns it, with these pure
 * functions, into an idempotent SQL file Dany runs in the SQL Editor.
 *
 * - Properties carry the same labels as the app (lib/marketing/etichette.ts):
 *   an unknown label refuses the page, never a guess. The post's URL is the
 *   property "userDefined:URL"; the key "url" is the link of the Notion page
 *   and only gives notion_page_id.
 * - The body is Notion-flavoured Markdown (tabs for nesting, <callout>,
 *   toggles as `### Title {toggle="true"}` or <details>, <empty-block/>,
 *   mentions, media). It becomes plain Markdown in the four sections of the
 *   templates (messaggio, bozza, commenti, finale); images stay in Notion,
 *   replaced by a line that says so (never a signed URL).
 * - Two checks refuse a page whose conversion would lose something: every
 *   word of the source is in the sections, and no section renders as code
 *   (indentation left behind) unless the source had a fenced block.
 *
 * Never prints or logs the text of a page: the script reports counts only.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { formatOra, isDataISO, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import {
  CAMPI,
  ETICHETTA_FORMAT,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  ETICHETTA_STATUS,
  ORDINE_SEZIONI,
  SEZIONI,
  valoreDaEtichetta,
  type FormatContenuto,
  type ReelType,
  type SezioneContenuto,
  type StatusContenuto,
  type TipoContenuto,
} from '@/lib/marketing/etichette'
import { shortcodeInstagram } from '@/lib/marketing/shortcode'
import {
  SEZIONE_MAX,
  contenutoSchema,
  lunghezza,
  normalizzaSezione,
  parseViewCount,
} from '@/lib/validation/contenuto'

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One Notion page as Claude writes it from notion-fetch. */
export type PaginaNotion = {
  /** the page's uuid, from the 32 hex of its link (with or without dashes) */
  id: string
  createdTime?: string | null
  /** the page icon, e.g. "movie_purple" (Reel Topic), "drafts_blue" (Carousel Topic) */
  icona?: string | null
  /** the properties as fetched: "Name", "Status", "date:Post Date:start", "userDefined:URL"… */
  proprieta: Record<string, unknown>
  /** the body of <content>, Notion-flavoured Markdown */
  markdown: string
}

/** Exactly the columns of marketing_contenuti the import fills (created_by is the admin running it). */
export type RigaImport = {
  notion_page_id: string
  tipo: TipoContenuto
  nome: string
  reel_type: ReelType | null
  formato: FormatContenuto | null
  inspiration: string | null
  stato: StatusContenuto
  post_date: string | null
  audio: string | null
  url: string | null
  view_count: number | null
  messaggio: string | null
  bozza: string | null
  commenti: string | null
  finale: string | null
  created_at: string | null
}

export type EsitoPagina =
  | {
      ok: true
      riga: RigaImport
      /** images and other media left in Notion, replaced by a line */
      immagini: number
      allegati: number
      /** Inspiration had no scheme and got https:// */
      inspirationCompletata: boolean
      /** the Name is a template's name ("Reel Topic", "Carousel Topic"): a page never renamed */
      nomeDiModello: boolean
    }
  | { ok: false; id: string; motivi: string[] }

// ---------------------------------------------------------------------------
// Notion-flavoured Markdown → blocks
// ---------------------------------------------------------------------------

type Blocco =
  /** a line: paragraph, heading, list item, quote, divider; its children are indented under it */
  | { tipo: 'riga'; testo: string; figli: Blocco[] }
  /** a toggle: `### Title {toggle="true"}` or <details><summary> */
  | { tipo: 'toggle'; titolo: string; figli: Blocco[] }
  /** <callout>, <columns>, <column> and any other wrapper: only its children count */
  | { tipo: 'contenitore'; figli: Blocco[] }
  | { tipo: 'vuoto' }
  /** a fenced code block, as written */
  | { tipo: 'codice'; righe: string[] }
  | { tipo: 'tabella'; righe: string[][] }

type Riga = { prof: number; testo: string }

const RE_TOGGLE_TITOLO = /^#{1,6}\s+(.*?)\s*\{([^{}]*)\}\s*$/
const RE_APERTURA = /^<([a-zA-Z][\w-]*)\b([^>]*)>(.*)$/
const RE_RECINTO = /^(`{3,}|~{3,})/
/** Tags that start a line of text (inline, or a block of one line): never a wrapper. */
const TAG_IN_RIGA = new Set(['span', 'image', 'video', 'audio', 'file', 'pdf', 'page', 'database', 'br'])

function righeDi(md: string): Riga[] {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((r) => {
      const prof = /^\t*/.exec(r)![0].length
      return { prof, testo: r.slice(prof) }
    })
}

const vuota = (r: Riga) => r.testo.trim() === ''

/** The line closing `<nome>` at the same depth, or -1 (malformed: the children end by indentation). */
function chiusura(righe: Riga[], da: number, a: number, prof: number, nome: string): number {
  for (let j = da; j < a; j++) {
    const r = righe[j]
    if (vuota(r)) continue
    if (r.prof < prof) return -1
    if (r.prof === prof && r.testo.trim() === `</${nome}>`) return j
  }
  return -1
}

/** Where the children of a line end: the lines deeper than it, blank lines between them included. */
function fineFigli(righe: Riga[], da: number, a: number, prof: number): number {
  let fine = da
  for (let j = da; j < a; j++) {
    if (vuota(righe[j])) continue
    if (righe[j].prof <= prof) break
    fine = j + 1
  }
  return fine
}

function analizza(righe: Riga[], da: number, a: number): Blocco[] {
  const blocchi: Blocco[] = []
  let i = da
  while (i < a) {
    const r = righe[i]
    const t = r.testo.trim()
    if (t === '') {
      blocchi.push({ tipo: 'vuoto' })
      i++
      continue
    }

    const recinto = RE_RECINTO.exec(t)
    if (recinto) {
      let j = i + 1
      while (j < a && !righe[j].testo.trim().startsWith(recinto[1])) j++
      const corpo = righe.slice(i, Math.min(j + 1, a)).map((x) => '\t'.repeat(Math.max(0, x.prof - r.prof)) + x.testo)
      if (j >= a) corpo.push(recinto[1])
      blocchi.push({ tipo: 'codice', righe: corpo })
      i = j + 1
      continue
    }

    const toggle = RE_TOGGLE_TITOLO.exec(t)
    if (toggle && /toggle="true"/.test(toggle[2])) {
      const fine = fineFigli(righe, i + 1, a, r.prof)
      blocchi.push({ tipo: 'toggle', titolo: toggle[1], figli: analizza(righe, i + 1, fine) })
      i = fine
      continue
    }

    const tag = RE_APERTURA.exec(t)
    const nome = tag?.[1].toLowerCase()
    if (tag && nome === 'empty-block') {
      blocchi.push({ tipo: 'vuoto' })
      i++
      continue
    }
    if (tag && nome && !TAG_IN_RIGA.has(nome) && !nome.startsWith('mention-') && !tag[2].trimEnd().endsWith('/')) {
      const resto = tag[3]
      // one line: <callout icon="💡">Text</callout>
      if (resto.trim().endsWith(`</${tag[1]}>`) && nome !== 'details' && nome !== 'table') {
        const dentro = resto.trim().slice(0, -`</${tag[1]}>`.length)
        blocchi.push({ tipo: 'contenitore', figli: dentro.trim() ? [{ tipo: 'riga', testo: dentro, figli: [] }] : [] })
        i++
        continue
      }
      const chiude = chiusura(righe, i + 1, a, r.prof, tag[1])
      const fine = chiude >= 0 ? chiude : fineFigli(righe, i + 1, a, r.prof)
      const dopo = chiude >= 0 ? chiude + 1 : fine

      if (nome === 'table') {
        blocchi.push({ tipo: 'tabella', righe: righeTabella([resto, ...righe.slice(i + 1, fine).map((x) => x.testo)].join('\n')) })
        i = dopo
        continue
      }
      if (nome === 'details') {
        let titolo = /<summary>([\s\S]*?)<\/summary>/.exec(resto)?.[1]
        let inizio = i + 1
        if (titolo === undefined) {
          let k = i + 1
          while (k < fine && vuota(righe[k])) k++
          const sommario = k < fine ? /^<summary>([\s\S]*?)<\/summary>$/.exec(righe[k].testo.trim()) : null
          if (sommario) {
            titolo = sommario[1]
            inizio = k + 1
          }
        }
        blocchi.push({ tipo: 'toggle', titolo: titolo ?? '', figli: analizza(righe, inizio, fine) })
        i = dopo
        continue
      }
      // a wrapper (callout, columns, column, synced block…): its children only
      const figli = resto.trim() ? [{ tipo: 'riga' as const, testo: resto, figli: [] }] : []
      blocchi.push({ tipo: 'contenitore', figli: [...figli, ...analizza(righe, i + 1, fine)] })
      i = dopo
      continue
    }

    const fine = fineFigli(righe, i + 1, a, r.prof)
    blocchi.push({ tipo: 'riga', testo: r.testo, figli: analizza(righe, i + 1, fine) })
    i = fine
  }
  return blocchi
}

function righeTabella(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((td) => td[1]),
  )
}

// ---------------------------------------------------------------------------
// Inline text
// ---------------------------------------------------------------------------

type Conteggi = { immagini: number; allegati: number }

const MEDIA: Record<string, string> = {
  image: 'Immagine',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
  pdf: 'PDF',
}

const RE_TAG = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g
const RE_ATTRIBUTI_BLOCCO = /\s*\{(?:\s*[a-zA-Z_-]+="[^"]*")+\s*\}\s*$/
/**
 * Characters Notion escapes that mean nothing in GitHub Markdown: kept as
 * plain characters. An escaped backslash stays as it is (its pair is consumed
 * first, so "\\:" is not read as "\:").
 */
const RE_ESCAPE_INUTILE = /\\(\\|[:$^@%&;'",/?{}])/g
const senzaEscapeInutili = (testo: string) =>
  testo.replace(RE_ESCAPE_INUTILE, (escape, carattere: string) => (carattere === '\\' ? escape : carattere))

function segnaposto(tag: string, didascalia: string | undefined, c: Conteggi): string {
  if (tag === 'image') c.immagini++
  else c.allegati++
  const testo = (didascalia ?? '').replace(RE_TAG, '').replace(/\s+/g, ' ').trim()
  return `_[${MEDIA[tag]}${testo ? ` «${testo}»` : ''}: è nella pagina su Notion]_`
}

function giornoMenzione(valore: string): string {
  if (isDataISO(valore)) return formatData(valore)
  const istante = new Date(valore)
  if (Number.isNaN(istante.getTime())) return valore
  return /T\d/.test(valore) ? `${formatData(oggiRoma(istante))} ${formatOra(istante)}` : formatData(oggiRoma(istante))
}

function dataMenzione(attributi: string): string {
  const inizio = /\bstart="([^"]*)"/.exec(attributi)?.[1]
  const fine = /\bend="([^"]*)"/.exec(attributi)?.[1]
  if (!inizio) return ''
  return fine ? `${giornoMenzione(inizio)} → ${giornoMenzione(fine)}` : giornoMenzione(inizio)
}

/** One line of rich text (no <br>: the caller splits on it) as plain Markdown. */
function inline(testo: string, c: Conteggi): string {
  const pulito = testo
    .replace(RE_ATTRIBUTI_BLOCCO, '')
    .replace(/\{\{(\S+?)\}\}/g, '$1')
    .replace(/<(image|video|audio|file|pdf)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g, (_, tag: string, cap?: string) =>
      segnaposto(tag, cap, c),
    )
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => segnaposto('image', alt, c))
    .replace(/<mention-date\b([^>]*?)\/?>(?:<\/mention-date>)?/g, (_, attributi: string) => dataMenzione(attributi))
    .replace(/<(mention-[a-z-]+)\b[^>]*>([\s\S]*?)<\/\1>/g, '$2')
    .replace(RE_TAG, '')
  return senzaEscapeInutili(pulito).replace(/[ \t]+$/, '')
}

const RE_BR = /<br\s*\/?>/gi

// ---------------------------------------------------------------------------
// Blocks → Markdown
// ---------------------------------------------------------------------------

type TipoPezzo = 'paragrafo' | 'lista' | 'titolo' | 'divisore' | 'citazione' | 'codice' | 'tabella' | 'vuoto'
type Pezzo = { tipo: TipoPezzo; righe: string[] }

/** Blocks that need a blank line around them, or the next line would join them (a list, a quote) or turn them into something else (--- under text is a heading). */
const ISOLATI = new Set<TipoPezzo>(['lista', 'citazione', 'codice', 'tabella', 'divisore'])

function unisci(pezzi: Pezzo[]): string[] {
  const out: string[] = []
  let prec: TipoPezzo | null = null
  for (const p of pezzi) {
    if (p.tipo === 'vuoto') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      prec = 'vuoto'
      continue
    }
    // and a blank line before a heading, for whoever edits the text
    const separa =
      prec !== null &&
      prec !== 'vuoto' &&
      ((prec !== p.tipo && (ISOLATI.has(prec) || ISOLATI.has(p.tipo))) ||
        (prec === p.tipo && p.tipo === 'tabella') ||
        p.tipo === 'titolo')
    if (separa && out[out.length - 1] !== '') out.push('')
    out.push(...p.righe)
    prec = p.tipo
  }
  while (out.length > 0 && out[0] === '') out.shift()
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

function rientra(righe: string[], rientro: string): string[] {
  return righe.map((r) => (r === '' ? '' : rientro + r))
}

function tabellaGfm(righe: string[][], c: Conteggi): string[] {
  const piene = righe.filter((r) => r.length > 0)
  if (piene.length === 0) return []
  const colonne = Math.max(...piene.map((r) => r.length))
  const cella = (s: string) =>
    inline(s.replace(RE_BR, ' ').replace(/\s+/g, ' '), c)
      .replace(/\\?\|/g, (m) => (m.length === 2 ? m : '\\|'))
      .trim()
  const riga = (r: string[]) => `| ${Array.from({ length: colonne }, (_, i) => cella(r[i] ?? '')).join(' | ')} |`
  return [riga(piene[0]), `| ${Array(colonne).fill('---').join(' | ')} |`, ...piene.slice(1).map(riga)]
}

function rendiRiga(b: Extract<Blocco, { tipo: 'riga' }>, c: Conteggi): Pezzo[] {
  const segmenti = b.testo.split(RE_BR).map((s) => inline(s, c))
  const primo = segmenti[0]
  const figli = () => rendi(b.figli, c)

  // inline() trims the line, so "### " arrives as "###"
  if (/^#{1,6}(?:\s|$)/.test(primo)) {
    const titolo = segmenti.join(' ').replace(/\s+/g, ' ').trim()
    // a heading with no text (the "###" Notion leaves in the template's callout) would be an empty <h3>
    if (titolo.replace(/^#{1,6}/, '').replace(/[*_~\s]/g, '') === '') return figli()
    return [{ tipo: 'titolo', righe: [titolo] }, ...figli()]
  }
  if (segmenti.length === 1 && /^(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(primo.trim())) {
    return [{ tipo: 'divisore', righe: ['---'] }, ...figli()]
  }
  if (/^>/.test(primo)) {
    const testo = [primo.replace(/^>\s?/, ''), ...segmenti.slice(1)]
    const dentro = [...testo.map((s) => s.trim()), ...(b.figli.length ? ['', ...unisci(figli())] : [])]
    return [{ tipo: 'citazione', righe: dentro.map((s) => (s === '' ? '>' : `> ${s}`)) }]
  }
  const marcatore = /^([-*+]|\d{1,9}[.)])( +)/.exec(primo)
  if (marcatore) {
    const rientro = ' '.repeat(marcatore[0].length)
    const continua = segmenti.slice(1).map((s) => s.trim())
    const sotto = b.figli.length ? unisci(figli()) : []
    return [{ tipo: 'lista', righe: [primo, ...rientra(continua, rientro), ...rientra(sotto, rientro)] }]
  }
  // a paragraph: leading spaces would make an indented code block in Markdown
  const righe = segmenti.map((s) => s.replace(/^\s+/, ''))
  const pezzi: Pezzo[] = righe.some((s) => s !== '') ? [{ tipo: 'paragrafo', righe }] : []
  return [...pezzi, ...figli()]
}

/**
 * Markdown has no end of a toggle: text after a "### Name" reads as part of
 * it. So the toggles that are not sections go after the other blocks of the
 * same level, each under its name, and nothing written outside them ends up
 * under a heading that is not its own.
 */
function rendi(blocchi: Blocco[], c: Conteggi): Pezzo[] {
  const pezzi: Pezzo[] = []
  const ordinati = [...blocchi.filter((b) => b.tipo !== 'toggle'), ...blocchi.filter((b) => b.tipo === 'toggle')]
  for (const b of ordinati) {
    switch (b.tipo) {
      case 'vuoto':
        pezzi.push({ tipo: 'vuoto', righe: [''] })
        break
      case 'codice':
        pezzi.push({ tipo: 'codice', righe: b.righe })
        break
      case 'tabella': {
        const righe = tabellaGfm(b.righe, c)
        if (righe.length) pezzi.push({ tipo: 'tabella', righe })
        break
      }
      case 'contenitore':
        pezzi.push(...rendi(b.figli, c))
        break
      case 'toggle': {
        // a toggle that is not a section of the template: its name as a subheading, nothing lost
        const titolo = inline(b.titolo.replace(RE_BR, ' '), c).trim()
        if (titolo) pezzi.push({ tipo: 'titolo', righe: [`### ${titolo}`] })
        pezzi.push(...rendi(b.figli, c))
        break
      }
      case 'riga':
        pezzi.push(...rendiRiga(b, c))
        break
    }
  }
  return pezzi
}

/** A fragment of Notion-flavoured Markdown as plain Markdown, normalised like a saved section ('' when empty). */
export function markdownPulito(md: string): string {
  const righe = righeDi(md)
  return normalizzaSezione(unisci(rendi(analizza(righe, 0, righe.length), { immagini: 0, allegati: 0 })).join('\n')) ?? ''
}

// ---------------------------------------------------------------------------
// The sections of the templates
// ---------------------------------------------------------------------------

const RE_INIZIO_NON_LETTERA = new RegExp('^[^\\p{L}\\p{N}]+', 'u')

/** A toggle's or a heading's name, compared without case, markup, emoji or a final colon. */
function normalizzaTitolo(titolo: string): string {
  return inline(titolo.replace(RE_BR, ' '), { immagini: 0, allegati: 0 })
    .replace(/[*_~`]/g, '')
    .replace(RE_INIZIO_NON_LETTERA, '')
    .replace(/\s*[:：]\s*$/, '')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The toggles of the two templates (and the names real pages use) and their column. */
const SEZIONE_DI_TOGGLE: Record<string, SezioneContenuto> = {
  'script (rough draft)': 'bozza',
  'rough draft': 'bozza',
  carousel: 'bozza',
  comments: 'commenti',
  'script (final)': 'finale',
  'final draft': 'finale',
  caption: 'finale',
}

/** The H1 of the templates: a label, not content (compared without spaces). */
const TITOLI_MESSAGGIO = new Set(['topic/mainmessage', 'idea/message'])

function titoloDelMessaggio(titolo: string): boolean {
  return TITOLI_MESSAGGIO.has(normalizzaTitolo(titolo).replace(/\s+/g, ''))
}

/** The column of a toggle: the templates' names, and "Topic / Main Message" made a toggle too. */
function sezioneDiToggle(titolo: string): SezioneContenuto | undefined {
  return titoloDelMessaggio(titolo) ? 'messaggio' : SEZIONE_DI_TOGGLE[normalizzaTitolo(titolo)]
}

type Estratto = { sezione: SezioneContenuto; titolo: string; figli: Blocco[] }

/** Takes the section toggles out of the tree, wherever they sit (a toggle inside the callout too); the rest is the message. */
function estrai(blocchi: Blocco[], estratti: Estratto[]): Blocco[] {
  const resto: Blocco[] = []
  for (const b of blocchi) {
    if (b.tipo === 'toggle') {
      const sezione = sezioneDiToggle(b.titolo)
      if (sezione) {
        estratti.push({ sezione, titolo: b.titolo, figli: b.figli })
        continue
      }
    }
    if (b.tipo === 'toggle' || b.tipo === 'contenitore' || b.tipo === 'riga') {
      resto.push({ ...b, figli: estrai(b.figli, estratti) })
    } else {
      resto.push(b)
    }
  }
  return resto
}

function testoDiRiga(b: Blocco | undefined): string | null {
  return b?.tipo === 'riga' ? b.testo.trim() : null
}

/** Drops the template's H1 ("Topic / Main Message", "Idea/Message") and the --- right under the H1. */
function senzaIntestazione(blocchi: Blocco[]): { blocchi: Blocco[]; tolto: string | null } {
  const lista = [...blocchi]
  let tolto: string | null = null
  const primo = lista.findIndex((b) => b.tipo !== 'vuoto')
  const h1 = testoDiRiga(lista[primo])
  let dopo = primo
  if (h1 !== null && /^#\s/.test(h1)) {
    const testo = inline(h1.replace(/^#\s+/, ''), { immagini: 0, allegati: 0 })
    if (titoloDelMessaggio(testo)) {
      tolto = testo
      const b = lista[primo] as Extract<Blocco, { tipo: 'riga' }>
      lista.splice(primo, 1, ...b.figli)
      dopo = primo + b.figli.length
    } else {
      dopo = primo + 1
    }
    const divisore = lista.findIndex((b, i) => i >= dopo && b.tipo !== 'vuoto')
    const riga = lista[divisore]
    if (riga?.tipo === 'riga' && riga.figli.length === 0 && /^-{3,}$/.test(riga.testo.trim())) lista.splice(divisore, 1)
  }
  return { blocchi: lista, tolto }
}

type Analisi = {
  sezioni: Record<SezioneContenuto, string | null>
  immagini: number
  allegati: number
  /** names of the section toggles found, normalised */
  toggle: string[]
  /** text dropped on purpose (the template's H1, the section toggles' names): out of the word check */
  tolti: string[]
}

function analizzaPagina(md: string): Analisi {
  const righe = righeDi(md)
  const estratti: Estratto[] = []
  const { blocchi, tolto } = senzaIntestazione(estrai(analizza(righe, 0, righe.length), estratti))
  const c: Conteggi = { immagini: 0, allegati: 0 }
  const testo = (b: Blocco[]) => unisci(rendi(b, c)).join('\n')

  const parti: Record<SezioneContenuto, string[]> = { messaggio: [], bozza: [], commenti: [], finale: [] }
  for (const e of estratti) {
    const corpo = testo(e.figli)
    // a second toggle for the same section follows under its own name: nothing lost
    parti[e.sezione].push(
      parti[e.sezione].length === 0 ? corpo : `### ${inline(e.titolo.replace(RE_BR, ' '), c).trim()}\n\n${corpo}`,
    )
  }
  // the message toggle (if any) first, then the callout and the free text
  parti.messaggio.push(testo(blocchi))
  const sezioni = Object.fromEntries(
    ORDINE_SEZIONI.map((s) => [s, normalizzaSezione(parti[s].filter((p) => p.trim() !== '').join('\n\n'))]),
  ) as Record<SezioneContenuto, string | null>
  return {
    sezioni,
    immagini: c.immagini,
    allegati: c.allegati,
    toggle: estratti.map((e) => normalizzaTitolo(e.titolo)),
    tolti: [...(tolto ? [tolto] : []), ...estratti.map((e) => e.titolo)],
  }
}

/** The four sections of a page, with the images and other media replaced. */
export function sezioniDaMarkdown(md: string): {
  sezioni: Record<SezioneContenuto, string | null>
  immagini: number
  allegati: number
} {
  const { sezioni, immagini, allegati } = analizzaPagina(md)
  return { sezioni, immagini, allegati }
}

/**
 * The template of a page: the icon says it when it is a template's
 * (movie_* Reel Topic, drafts_* Carousel Topic); otherwise a "Carousel" or
 * "Caption" toggle makes it a carousel.
 */
export function tipoDaPagina(p: Pick<PaginaNotion, 'icona' | 'markdown'>): TipoContenuto {
  return tipoDa(p.icona, analizzaPagina(p.markdown).toggle)
}

function tipoDa(icona: string | null | undefined, toggle: string[]): TipoContenuto {
  if (icona && /(?:^|\/)drafts_/.test(icona)) return 'carousel'
  if (icona && /(?:^|\/)movie_/.test(icona)) return 'reel'
  return toggle.some((t) => t === 'carousel' || t === 'caption') ? 'carousel' : 'reel'
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const RE_PAROLA = new RegExp('[\\p{L}\\p{N}]+', 'gu')

function parole(testo: string): Map<string, number> {
  const conta = new Map<string, number>()
  for (const p of testo.toLowerCase().match(RE_PAROLA) ?? []) conta.set(p, (conta.get(p) ?? 0) + 1)
  return conta
}

/** The words of Notion-flavoured Markdown: tags, attributes and media addresses out, captions and mention texts in. */
function testoPiano(md: string): string {
  return md
    .replace(/\{\{(\S+?)\}\}/g, '$1')
    .replace(/\{(?:\s*[a-zA-Z_-]+="[^"]*")+\s*\}/g, ' ')
    .replace(/<(image|video|audio|file|pdf)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g, (_, _tag, cap?: string) => ` ${cap ?? ''} `)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/<mention-date\b[^>]*?\/?>(?:<\/mention-date>)?/g, ' ')
    .replace(RE_TAG, ' ')
}

/** How many words of the source are missing from the sections (the dropped template labels apart). */
export function paroleMancanti(md: string, sezioni: Record<SezioneContenuto, string | null>, tolti: string[] = []): number {
  const sorgente = parole(testoPiano(md))
  for (const [p, n] of parole(testoPiano(tolti.join('\n')))) sorgente.set(p, (sorgente.get(p) ?? 0) - n)
  const uscita = parole(ORDINE_SEZIONI.map((s) => sezioni[s] ?? '').join('\n'))
  let mancanti = 0
  for (const [p, n] of sorgente) mancanti += Math.max(0, n - (uscita.get(p) ?? 0))
  return mancanti
}

/** Rendered as the page renders it (react-markdown and GFM): true when some text would show as code. */
export function diventaCodice(md: string): boolean {
  return renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, md)).includes('<pre')
}

// ---------------------------------------------------------------------------
// A page → a row
// ---------------------------------------------------------------------------

const RE_ID_NOTION = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi

/**
 * A Notion id (32 hex, with or without dashes) as a uuid. From a page link,
 * the last id of its path: the query (?v=… of a view) never counts.
 */
export function uuidNotion(valore: unknown): string | null {
  if (typeof valore !== 'string') return null
  const percorso = valore.trim().split(/[?#]/)[0]
  const trovato = [...percorso.matchAll(RE_ID_NOTION)].pop()?.[0]
  if (!trovato) return null
  const h = trovato.replace(/-/g, '').toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const CHIAVE = {
  nome: 'Name',
  stato: 'Status',
  reel_type: 'Reel Type',
  formato: 'Format',
  inspiration: 'Inspiration',
  audio: 'Audio',
  view_count: 'View Count',
  // date:Post Date:is_datetime is not read: a value with a time says so itself
  inizio: 'date:Post Date:start',
  fine: 'date:Post Date:end',
  // the post's URL property; "url" is the link of the Notion page
  url: 'userDefined:URL',
  pagina: 'url',
} as const

/** A property as text: a string, a number, or a list of one; empty is null; anything else is undefined (refused). */
function testoProprieta(valore: unknown): string | null | undefined {
  if (valore === null || valore === undefined) return null
  if (typeof valore === 'string') return valore.trim() === '' ? null : valore.trim()
  if (typeof valore === 'number' && Number.isFinite(valore)) return String(valore)
  if (Array.isArray(valore)) {
    if (valore.length === 0) return null
    return valore.length === 1 ? testoProprieta(valore[0]) : undefined
  }
  return undefined
}

/**
 * A rich-text property (Name, Audio) as the plain text the app stores:
 * notion-fetch writes a bold title as **…**, a line break as <br> and a link
 * as [text](address). The text stays; the markup goes (an address written as
 * its own link text stays once).
 */
export function testoSemplice(testo: string): string {
  return testo
    .replace(RE_BR, ' ')
    .replace(RE_TAG, '')
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, parole: string, indirizzo: string) =>
      parole.trim() === '' || parole.trim() === indirizzo ? indirizzo : `${parole.trim()} ${indirizzo}`,
    )
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function etichetta<T extends string>(
  mappa: Record<T, string>,
  valore: unknown,
  campo: string,
  motivi: string[],
): T | null {
  const testo = testoProprieta(valore)
  if (testo === undefined) {
    motivi.push(`${campo}: valore non leggibile`)
    return null
  }
  if (testo === null) return null
  const v = valoreDaEtichetta(mappa, testo)
  if (!v) motivi.push(`${campo}: etichetta sconosciuta «${testo}»`)
  return v
}

function postDate(p: Record<string, unknown>, motivi: string[]): string | null {
  const fine = testoProprieta(p[CHIAVE.fine])
  if (fine) {
    motivi.push('Post Date è un intervallo: un post ha un giorno solo')
    return null
  }
  const inizio = testoProprieta(p[CHIAVE.inizio])
  if (inizio === null) return null
  if (inizio === undefined) {
    motivi.push('Post Date: valore non leggibile')
    return null
  }
  // a day is a day, whatever is_datetime says
  if (isDataISO(inizio)) return inizio
  const istante = new Date(inizio)
  if (!/T\d/.test(inizio) || Number.isNaN(istante.getTime())) {
    motivi.push(`Post Date: data non valida «${inizio}»`)
    return null
  }
  // a date with a time (is_datetime = 1): its day in Rome
  return oggiRoma(istante)
}

function viewCountProprieta(valore: unknown, motivi: string[]): number | null {
  if (valore === null || valore === undefined || valore === '') return null
  const n = typeof valore === 'number' ? valore : typeof valore === 'string' ? parseViewCount(valore) : null
  if (n === null || !Number.isInteger(n) || n < 0) {
    motivi.push('View Count: non è un numero intero ≥ 0')
    return null
  }
  return n
}

function createdAt(valore: unknown, motivi: string[]): string | null {
  if (valore === null || valore === undefined || valore === '') return null
  const istante = typeof valore === 'string' ? new Date(valore) : null
  if (!istante || Number.isNaN(istante.getTime())) {
    motivi.push('createdTime non valido')
    return null
  }
  return istante.toISOString()
}

const NOMI_MODELLO = new Set(Object.values(ETICHETTA_MODELLO).map((n) => n.toLowerCase()))
const RE_SCHEMA = /^[a-z][a-z0-9+.-]*:/i

/** A page as a row, or the reasons it is refused (never its text). */
export function paginaInRiga(p: PaginaNotion): EsitoPagina {
  const motivi: string[] = []
  const proprieta = p.proprieta ?? {}
  const id = uuidNotion(p.id)
  const daLink = uuidNotion(proprieta[CHIAVE.pagina])
  if (!id) motivi.push('id della pagina non valido')
  else if (daLink && daLink !== id) motivi.push('id e link della pagina non coincidono')
  const riferimento = id ?? String(p.id)

  const stato = etichetta(ETICHETTA_STATUS, proprieta[CHIAVE.stato], CAMPI.stato, motivi) ?? 'not_started'
  const reel_type = etichetta(ETICHETTA_REEL_TYPE, proprieta[CHIAVE.reel_type], CAMPI.reel_type, motivi)
  const formato = etichetta(ETICHETTA_FORMAT, proprieta[CHIAVE.formato], CAMPI.formato, motivi)
  const post_date = postDate(proprieta, motivi)
  const view_count = viewCountProprieta(proprieta[CHIAVE.view_count], motivi)
  const created_at = createdAt(p.createdTime, motivi)

  const testi: Record<'nome' | 'inspiration' | 'audio' | 'url', string | null> = {
    nome: null,
    inspiration: null,
    audio: null,
    url: null,
  }
  for (const campo of ['nome', 'inspiration', 'audio', 'url'] as const) {
    const v = testoProprieta(proprieta[CHIAVE[campo]])
    if (v === undefined) motivi.push(`${CAMPI[campo]}: valore non leggibile`)
    // Name and Audio are rich text in Notion; Inspiration and URL are link properties, plain already
    else testi[campo] = v !== null && (campo === 'nome' || campo === 'audio') ? testoSemplice(v) || null : v
  }

  if (typeof p.markdown !== 'string') motivi.push('manca il testo della pagina')
  const markdown = typeof p.markdown === 'string' ? p.markdown : ''
  const analisi = analizzaPagina(markdown)
  const tipo = tipoDa(p.icona, analisi.toggle)

  const valori = contenutoSchema.safeParse({
    tipo,
    nome: testi.nome ?? '',
    reel_type,
    formato,
    stato,
    post_date,
    inspiration: testi.inspiration,
    url: testi.url,
    audio: testi.audio,
    view_count,
  })
  if (!valori.success) {
    for (const issue of valori.error.issues) {
      const campo = String(issue.path[0] ?? '')
      const nome = campo in CAMPI ? CAMPI[campo as keyof typeof CAMPI] : campo
      motivi.push(issue.message.startsWith(nome) ? issue.message : `${nome}: ${issue.message}`)
    }
  }

  for (const s of ORDINE_SEZIONI) {
    const testo = analisi.sezioni[s]
    if (testo && lunghezza(testo) > SEZIONE_MAX) motivi.push(`${SEZIONI[tipo][s]}: oltre 30.000 caratteri`)
  }
  const mancanti = paroleMancanti(markdown, analisi.sezioni, analisi.tolti)
  if (mancanti > 0) motivi.push(`conversione: ${mancanti} parole perse`)
  const recinto = /^\t*(?:```|~~~)/m.test(markdown)
  if (!recinto) {
    const codice = ORDINE_SEZIONI.filter((s) => analisi.sezioni[s] && diventaCodice(analisi.sezioni[s]!))
    if (codice.length) motivi.push(`conversione: ${codice.map((s) => SEZIONI[tipo][s]).join(', ')} si vedrebbe come codice`)
  }

  if (motivi.length > 0 || !valori.success || !id) return { ok: false, id: riferimento, motivi }

  const inspirazione = testi.inspiration
  return {
    ok: true,
    riga: {
      notion_page_id: id,
      ...valori.data,
      ...analisi.sezioni,
      created_at,
    },
    immagini: analisi.immagini,
    allegati: analisi.allegati,
    inspirationCompletata: inspirazione !== null && !RE_SCHEMA.test(inspirazione),
    nomeDiModello: NOMI_MODELLO.has(valori.data.nome.toLowerCase()),
  }
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const TAG_CORPO = '$body$'
const TAG_DATI = '$contenuti$'

/** Problems across the whole import: the same page twice, the same post (shortcode) on two pages. */
export function problemiImport(righe: readonly RigaImport[]): string[] {
  const problemi: string[] = []
  const pagine = new Map<string, number>()
  const post = new Map<string, string[]>()
  for (const r of righe) {
    pagine.set(r.notion_page_id, (pagine.get(r.notion_page_id) ?? 0) + 1)
    const codice = shortcodeInstagram(r.url)
    if (codice) post.set(codice, [...(post.get(codice) ?? []), r.notion_page_id])
  }
  for (const [id, n] of pagine) if (n > 1) problemi.push(`la pagina ${id} c’è ${n} volte`)
  for (const [codice, ids] of post) {
    if (ids.length > 1) problemi.push(`lo stesso post (${codice}) è su ${ids.length} pagine: ${ids.join(', ')}`)
  }
  return problemi
}

/** The rows in files of at most perFile rows (null: one file). */
export function dividiPerFile<T>(righe: readonly T[], perFile: number | null): T[][] {
  if (!perFile || righe.length <= perFile) return [righe.slice()]
  const parti: T[][] = []
  for (let i = 0; i < righe.length; i += perFile) parti.push(righe.slice(i, i + perFile))
  return parti
}

/** "import/x.sql" as "import/x-1.sql", "import/x-2.sql"… when there is more than one part. */
export function nomiFile(percorso: string, parti: number): string[] {
  if (parti <= 1) return [percorso]
  const punto = percorso.toLowerCase().endsWith('.sql') ? percorso.length - 4 : percorso.length
  return Array.from({ length: parti }, (_, i) => `${percorso.slice(0, punto)}-${i + 1}${percorso.slice(punto)}`)
}

const RE_EMAIL = /^[^\s@']+@[^\s@']+\.[^\s@']+$/

/**
 * The SQL file: one DO block that runs as the admin (the first active one, or
 * the one with the email given), under RLS like the app, and inserts the
 * rows; a page already imported (notion_page_id) is skipped, so it can run
 * again; a page whose post is already on another content is skipped and
 * named. Refuses (throws) text that would close the dollar quotes and two
 * rows with the same post: one duplicate would abort the whole block.
 */
export function sqlImportContenuti(
  righe: readonly RigaImport[],
  intestazione: string,
  { admin }: { admin?: string | null } = {},
): string {
  const problemi = problemiImport(righe)
  if (problemi.length > 0) throw new Error(`Import non scritto: ${problemi.join('; ')}`)
  const dati = `[\n${righe.map((r) => JSON.stringify(r)).join(',\n')}\n]`
  if (dati.includes(TAG_CORPO) || dati.includes(TAG_DATI)) {
    throw new Error(`Import non scritto: un testo contiene ${TAG_CORPO} o ${TAG_DATI}`)
  }
  if (dati.includes('\\u0000')) throw new Error('Import non scritto: un testo contiene un carattere nullo')
  if (admin && !RE_EMAIL.test(admin)) throw new Error('Import non scritto: email dell’admin non valida')

  const commento = intestazione
    .split('\n')
    .map((r) => `-- ${r}`.trimEnd())
    .join('\n')
  const sceltaAdmin = admin
    ? `where p.ruolo = 'admin' and p.attivo and lower(p.email) = lower('${admin}')`
    : `where p.ruolo = 'admin' and p.attivo\n  order by p.created_at`

  return `${commento}
-- Generated by \`npm run import:contenuti\` (lib/marketing/da-notion.ts): ${righe.length} pagine.
-- Run in the Supabase SQL Editor after the migrations of 1.32.0. It runs as
-- the admin (Dany), under RLS, like the app; a page already imported
-- (notion_page_id) is skipped, so the file can run again. A page whose post
-- is already on another content (the same URL) is skipped and named.
-- Real data: this file lives in import/, which never goes to GitHub.

do ${TAG_CORPO}
declare
  v_admin uuid;
  v_lette integer := 0;
  v_create integer := 0;
  v_gia integer := 0;
  v_post_doppi text[] := '{}';
  v_n integer;
  r record;
begin
  select p.id into v_admin from public.profiles p
  ${sceltaAdmin}
  limit 1;
  if v_admin is null then raise exception 'Nessun admin attivo'; end if;

  -- from here on everything runs as the admin, with RLS, like the app
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  for r in
    select * from jsonb_to_recordset(${TAG_DATI}
${dati}
${TAG_DATI}::jsonb) as x (
      notion_page_id uuid, tipo public.contenuto_tipo, nome text, reel_type public.contenuto_reel_type,
      formato public.contenuto_format, inspiration text, stato public.contenuto_status, post_date date,
      audio text, url text, view_count integer, messaggio text, bozza text, commenti text, finale text,
      created_at timestamptz
    )
  loop
    v_lette := v_lette + 1;
    begin
      insert into public.marketing_contenuti (
        notion_page_id, tipo, nome, reel_type, formato, inspiration, stato, post_date,
        audio, url, view_count, messaggio, bozza, commenti, finale, created_by, created_at
      ) values (
        r.notion_page_id, r.tipo, r.nome, r.reel_type, r.formato, r.inspiration, r.stato, r.post_date,
        r.audio, r.url, r.view_count, r.messaggio, r.bozza, r.commenti, r.finale, v_admin, coalesce(r.created_at, now())
      )
      on conflict (notion_page_id) do nothing;
      get diagnostics v_n = row_count;
      if v_n = 1 then v_create := v_create + 1; else v_gia := v_gia + 1; end if;
    exception when unique_violation then
      -- the same post (instagram_shortcode) is already on another content
      v_post_doppi := v_post_doppi || r.notion_page_id::text;
    end;
  end loop;

  raise notice 'Pagine lette: %, create: %, già importate: %', v_lette, v_create, v_gia;
  -- the report, read by the select below (session-level: it outlives the block)
  perform set_config('alpha.esito_import', concat_ws(E'\\n',
    format('Pagine lette: %s, create: %s, già importate: %s', v_lette, v_create, v_gia),
    case when cardinality(v_post_doppi) > 0 then
      format('Saltate perché il post è già su un altro contenuto: %s', array_to_string(v_post_doppi, ', '))
    end
  ), false);
end;
${TAG_CORPO};

select unnest(string_to_array(current_setting('alpha.esito_import'), E'\\n')) as esito;
`
}
