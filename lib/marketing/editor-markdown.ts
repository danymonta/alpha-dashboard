/**
 * The extensions of the section editor (Dany, 24/10/2026: «mettilo già
 * modificabile senza dover cliccare modifica… con ctrl + b mette in automatico
 * in grassetto»): Tiptap, written like Notion, saved as Markdown, the same
 * Markdown the page renders, Claude reads and the Notion import wrote. One list
 * of extensions for the editor and for the round-trip tests.
 *
 * - StarterKit: paragraphs, headings, bold (Ctrl/⌘+B), italic (Ctrl/⌘+I),
 *   strike, code, lists (also by typing «- » or «1. »), quotes, the rule,
 *   undo; links never open on a click while writing (a click places the cursor).
 * - A line break is a plain «\n», never Markdown's «two spaces and \n»: the
 *   page reads a single newline as a line break (remarkACapo, and `breaks` here),
 *   so "Hook:\nLine:\nCTA:" goes back to the database as it came.
 * - GFM tables, so a table written in Notion or by Claude is never lost.
 * - Links (01/11/2026, «stile Google Drive»): `[testo](url)` and the bare
 *   addresses GFM recognizes; a bare address goes back bare (Collegamento and
 *   lib/marketing/link.ts). Never opened by a click while writing: the popup of
 *   menu-link.tsx opens them, and Ctrl/⌘+click.
 * - The highlighter (01/11/2026): the colour of the text and the background,
 *   as in Notion, saved as the small tags of lib/marketing/evidenziatore.ts
 *   (`<span data-colore>`, `<mark data-sfondo>`), read by our own tokenizer and
 *   never by the HTML parser: a text without colours goes back as it came.
 */
import { Mark, type JSONContent, type MarkdownToken } from '@tiptap/core'
import { HardBreak } from '@tiptap/extension-hard-break'
import { Link } from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import {
  eColoreEvidenziatore,
  inizioEvidenziato,
  leggiEvidenziato,
  tagColore,
  tagSfondo,
  type ColoreEvidenziatore,
} from '@/lib/marketing/evidenziatore'
import { FINE_NUDO, INIZIO_NUDO, formaDelToken, restaIndirizzo, ripristinaIndirizzi } from '@/lib/marketing/link'

const ACapo = HardBreak.extend({
  renderMarkdown: () => '\n',
})

/** The marks of a coloured piece added to its text; a mark of the same kind already there (an inner tag) wins. */
function conMarchi(nodi: JSONContent[], marchi: { type: string; attrs: Record<string, string> }[]): JSONContent[] {
  return nodi.map((nodo) => {
    if (nodo.type === 'text') {
      const presenti = nodo.marks ?? []
      const nuovi = marchi.filter((m) => !presenti.some((p) => p.type === m.type))
      return { ...nodo, marks: [...presenti, ...nuovi] }
    }
    return nodo.content ? { ...nodo, content: conMarchi(nodo.content, marchi) } : nodo
  })
}

type TokenEvidenziato = MarkdownToken & { colore: ColoreEvidenziatore | null; sfondo: ColoreEvidenziatore | null }

/**
 * The colour of the text. Outermost of the marks (priority over link and bold):
 * `<span …>**forte**</span>` reads back the same in every place of a word,
 * where `**<span …>…</span>**` after a letter would not be bold any more.
 * This mark also reads both tags: one tokenizer for the span and the mark.
 */
export const ColoreTesto = Mark.create({
  name: 'coloreTesto',
  priority: 1100,

  addAttributes() {
    return { colore: { default: null, rendered: false } }
  },

  parseHTML() {
    // a paste from the editor itself; the span may carry the background too (consuming: false lets SfondoTesto read it)
    return [
      {
        tag: 'span[data-colore]',
        consuming: false,
        getAttrs: (el) => {
          const colore = (el as HTMLElement).getAttribute('data-colore')
          return eColoreEvidenziatore(colore) ? { colore } : false
        },
      },
    ]
  },

  renderHTML({ mark }) {
    return ['span', { class: 'ev-colore', 'data-colore': mark.attrs.colore }, 0]
  },

  markdownTokenName: 'evidenziatore',

  markdownTokenizer: {
    name: 'evidenziatore',
    level: 'inline',
    start: (src: string) => inizioEvidenziato(src),
    tokenize: (src, _tokens, lexer) => {
      const pezzo = leggiEvidenziato(src)
      if (!pezzo) return undefined
      return {
        type: 'evidenziatore',
        raw: pezzo.raw,
        colore: pezzo.colore,
        sfondo: pezzo.sfondo,
        tokens: lexer.inlineTokens(pezzo.interno),
      } as TokenEvidenziato
    },
  },

  parseMarkdown: (token, helpers) => {
    const t = token as TokenEvidenziato
    const marchi: { type: string; attrs: Record<string, string> }[] = [
      ...(t.colore ? [{ type: 'coloreTesto', attrs: { colore: t.colore } }] : []),
      ...(t.sfondo ? [{ type: 'sfondoTesto', attrs: { sfondo: t.sfondo } }] : []),
    ]
    return conMarchi(helpers.parseInline(t.tokens ?? []), marchi)
  },

  renderMarkdown: (node, h) => {
    const testo = h.renderChildren(node)
    const colore = node.attrs?.colore
    return eColoreEvidenziatore(colore) ? tagColore(colore, testo) : testo
  },
})

/** The background, like Notion's: a mark, inside the colour of the text. */
export const SfondoTesto = Mark.create({
  name: 'sfondoTesto',
  priority: 1050,

  addAttributes() {
    return { sfondo: { default: null, rendered: false } }
  },

  parseHTML() {
    const leggi = (el: HTMLElement | string) => {
      const sfondo = (el as HTMLElement).getAttribute('data-sfondo')
      return eColoreEvidenziatore(sfondo) ? { sfondo } : false
    }
    return [
      { tag: 'mark[data-sfondo]', getAttrs: leggi },
      { tag: 'span[data-sfondo]', getAttrs: leggi },
    ]
  },

  renderHTML({ mark }) {
    return ['mark', { class: 'ev-sfondo', 'data-sfondo': mark.attrs.sfondo }, 0]
  },

  renderMarkdown: (node, h) => {
    const testo = h.renderChildren(node)
    const sfondo = node.attrs?.sfondo
    return eColoreEvidenziatore(sfondo) ? tagSfondo(sfondo, testo) : testo
  },
})

/**
 * The link of the sections: Tiptap's Link (autolink while typing, a link pasted
 * over a selection), never opened by a plain click while writing, plus where
 * it came from in the Markdown (`forma`: `nudo` for an address written bare,
 * `angolare` for `<https://…>`, null for `[testo](url)`), so each goes back the
 * way it was written. A link made in the editor (typed, pasted, «Modifica») is
 * `nudo` by default: it goes back bare only while its text still is its
 * address, otherwise as `[testo](url)`.
 */
export const Collegamento = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      forma: { default: 'nudo', rendered: false, parseHTML: () => 'nudo' },
    }
  },

  parseMarkdown: (token, helpers) =>
    helpers.applyMark('link', helpers.parseInline(token.tokens || []), {
      href: token.href,
      title: token.title || null,
      forma: formaDelToken(token),
    }),

  renderMarkdown: (node, h, ctx) => {
    const href: string = node.attrs?.href ?? ''
    const title: string = node.attrs?.title ?? ''
    const forma = node.attrs?.forma
    const testo = h.renderChildren(node)
    const visibile = ctx?.meta?.markText
    if (forma && !title && typeof visibile === 'string' && restaIndirizzo(visibile, href)) {
      const nudo = `${INIZIO_NUDO}${testo}${FINE_NUDO}`
      return forma === 'angolare' ? `<${nudo}>` : nudo
    }
    return title ? `[${testo}](${href} "${title}")` : `[${testo}](${href})`
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
})

/** The Markdown of the editor, the way it is saved: every bare address back as it was written. */
export function markdownDellEditor(editor: { getMarkdown: () => string }): string {
  return ripristinaIndirizzi(editor.getMarkdown())
}

/** The schema and the Markdown, without the editor-only extensions: what the tests round-trip. */
export const ESTENSIONI_MARKDOWN = [
  StarterKit.configure({ hardBreak: false, link: false }),
  Collegamento,
  ACapo,
  TableKit,
  ColoreTesto,
  SfondoTesto,
]

/** Marked as the page reads it: GitHub's Markdown, a single newline is a line break. */
export const OPZIONI_MARKED = { gfm: true, breaks: true }

export function estensioniEditor(segnaposto: string) {
  return [
    ...ESTENSIONI_MARKDOWN,
    Markdown.configure({ markedOptions: OPZIONI_MARKED }),
    Placeholder.configure({ placeholder: segnaposto }),
  ]
}
