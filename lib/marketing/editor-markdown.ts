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
 */
import { HardBreak } from '@tiptap/extension-hard-break'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

const ACapo = HardBreak.extend({
  renderMarkdown: () => '\n',
})

/** The schema and the Markdown, without the editor-only extensions: what the tests round-trip. */
export const ESTENSIONI_MARKDOWN = [
  StarterKit.configure({
    hardBreak: false,
    link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
  }),
  ACapo,
  TableKit,
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
