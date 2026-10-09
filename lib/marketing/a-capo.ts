/**
 * A single line break inside a paragraph is a line break on screen, as in
 * Notion: "Hook:\nLine:\nCTA:" reads one per line. In Markdown a single
 * newline is only a space, so this remark plugin turns it into a `break` node
 * (a <br>), like remark-breaks. Never CSS white-space: mdast-util-to-hast puts
 * "\n" text between the blocks of a list item (around a nested list, before
 * the paragraphs of a loose list), and preserved whitespace would show those
 * as empty lines.
 */

/** The few mdast fields the plugin reads: any node, a text node, a break. */
type Nodo = { type: string; value?: string; children?: Nodo[] }

const A_CAPO = /\r\n|\r|\n/

function spezza(nodo: Nodo): void {
  if (!nodo.children) return
  nodo.children = nodo.children.flatMap((figlio): Nodo[] => {
    if (figlio.type === 'text' && figlio.value && A_CAPO.test(figlio.value)) {
      return figlio.value.split(A_CAPO).flatMap((pezzo, i): Nodo[] => {
        const testo: Nodo[] = pezzo ? [{ type: 'text', value: pezzo }] : []
        return i === 0 ? testo : [{ type: 'break' }, ...testo]
      })
    }
    spezza(figlio)
    return [figlio]
  })
}

/** The remark plugin (react-markdown's `remarkPlugins`). Code blocks are untouched: their text is a value, not a text child. */
export function remarkACapo() {
  return (albero: Nodo) => {
    spezza(albero)
  }
}
