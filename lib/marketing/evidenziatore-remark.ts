/**
 * The colours of the highlighter on the page (01/11/2026, lib/marketing/evidenziatore.ts).
 * The page never renders raw HTML (no rehype-raw): an HTML tag in a section is
 * an `html` node of mdast, which react-markdown shows as text. This remark
 * plugin looks only for our pairs, an opening tag that is exactly one of ours
 * and its own closing tag among the same siblings, and turns the nodes between
 * them into a `span` or a `mark` with our class and data attribute (nothing
 * else: no style, no other attribute). An unknown colour, another attribute, a
 * tag without its closing one, any other HTML: left as it is, shown as text.
 */
import { classiEvidenziatura, leggiApertura, type Evidenziatura } from '@/lib/marketing/evidenziatore'

/** The few mdast fields the plugin reads and writes. */
type Nodo = {
  type: string
  value?: string
  children?: Nodo[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

function apertura(nodo: Nodo) {
  if (nodo.type !== 'html' || !nodo.value) return null
  const tag = leggiApertura(nodo.value)
  return tag && tag.lunghezza === nodo.value.length ? tag : null
}

/** The index of the sibling that closes the tag opened at `da`, or -1. Tags of the same name in between count. */
function chiusura(figli: Nodo[], da: number, tag: 'span' | 'mark'): number {
  const apre = new RegExp(`^<${tag}(?=[\\s>])`)
  let profondita = 1
  for (let i = da + 1; i < figli.length; i++) {
    const f = figli[i]
    if (f.type !== 'html' || !f.value) continue
    if (f.value === `</${tag}>`) {
      profondita -= 1
      if (profondita === 0) return i
    } else if (apre.test(f.value)) {
      profondita += 1
    }
  }
  return -1
}

function proprieta(e: Evidenziatura): Record<string, unknown> {
  return {
    className: classiEvidenziatura(e),
    ...(e.colore ? { dataColore: e.colore } : {}),
    ...(e.sfondo ? { dataSfondo: e.sfondo } : {}),
  }
}

function colora(figli: Nodo[]): Nodo[] {
  const fuori: Nodo[] = []
  for (let i = 0; i < figli.length; i++) {
    const f = figli[i]
    const tag = apertura(f)
    const fine = tag ? chiusura(figli, i, tag.tag) : -1
    if (tag && fine > 0) {
      fuori.push({
        type: 'evidenziatore',
        data: { hName: tag.tag, hProperties: proprieta(tag) },
        children: colora(figli.slice(i + 1, fine)),
      })
      i = fine
      continue
    }
    if (f.children) f.children = colora(f.children)
    fuori.push(f)
  }
  return fuori
}

/** The remark plugin (react-markdown's `remarkPlugins`). */
export function remarkEvidenziatore() {
  return (albero: Nodo) => {
    if (albero.children) albero.children = colora(albero.children)
  }
}
