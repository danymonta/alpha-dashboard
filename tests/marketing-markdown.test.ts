import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownContenuto } from '@/components/marketing/markdown-contenuto'
import { remarkACapo } from '@/lib/marketing/a-capo'

function html(testo: string) {
  return renderToStaticMarkup(createElement(MarkdownContenuto, { testo }))
}

describe('remarkACapo', () => {
  it('un a capo dentro un paragrafo diventa un break, i pezzi vuoti spariscono', () => {
    const albero = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Hook:\nLine:\r\n\nCTA:' }] }],
    }
    remarkACapo()(albero)
    expect(albero.children[0].children).toEqual([
      { type: 'text', value: 'Hook:' },
      { type: 'break' },
      { type: 'text', value: 'Line:' },
      { type: 'break' },
      { type: 'break' },
      { type: 'text', value: 'CTA:' },
    ])
  })

  it('il codice resta com’è: il suo testo non è un nodo di testo', () => {
    const codice = { type: 'code', value: 'riga uno\nriga due' }
    const albero = { type: 'root', children: [codice, { type: 'inlineCode', value: 'a\nb' }] }
    remarkACapo()(albero)
    expect(albero.children).toEqual([codice, { type: 'inlineCode', value: 'a\nb' }])
  })
})

describe('MarkdownContenuto', () => {
  it('Hook, Line e CTA vanno a capo con un <br>', () => {
    expect(html('Hook:\nLine:\nCTA:')).toMatch(/Hook:<br\/>\s*Line:<br\/>\s*CTA:/)
  })

  it('niente spazi conservati: gli a capo tra i blocchi di un elenco non diventano righe vuote', () => {
    const resa = html('- primo\n  - annidato\n- secondo\n\n1. alfa\n\n   continua\n2. beta')
    expect(resa).not.toMatch(/pre-line|pre-wrap/)
    expect(resa).toContain('<ul')
    expect(resa).toContain('<ol')
    // the item's own text has no <br>: only a newline written inside a paragraph is one
    expect(resa).not.toContain('<br/>')
  })

  it('un blocco di codice resta com’è, con i suoi a capo', () => {
    expect(html('```\nriga uno\nriga due\n```')).toContain('riga uno\nriga due')
  })
})
