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

describe('MarkdownContenuto: i colori dell’evidenziatore (01/11/2026)', () => {
  it('colore del testo e sfondo diventano uno span e un mark con la loro classe, nient’altro', () => {
    const resa = html('Un <span data-colore="rosso">testo rosso</span> e <mark data-sfondo="giallo">uno giallo</mark>.')
    expect(resa).toContain('<span class="ev-colore" data-colore="rosso">testo rosso</span>')
    expect(resa).toContain('<mark class="ev-sfondo" data-sfondo="giallo">uno giallo</mark>')
    expect(resa).not.toContain('&lt;')
  })

  it('annidati con grassetto, corsivo, elenchi e tabelle', () => {
    const resa = html(
      '<span data-colore="rosso"><mark data-sfondo="giallo">**tutti e due**</mark></span>\n\n- <span data-colore="verde">*verde*</span>\n  - <mark data-sfondo="blu">annidato</mark>\n\n| a |\n| --- |\n| <span data-colore="viola">cella</span> |',
    )
    expect(resa).toContain(
      '<span class="ev-colore" data-colore="rosso"><mark class="ev-sfondo" data-sfondo="giallo"><strong class="font-semibold">tutti e due</strong></mark></span>',
    )
    expect(resa).toContain('<span class="ev-colore" data-colore="verde"><em>verde</em></span>')
    expect(resa).toContain('<mark class="ev-sfondo" data-sfondo="blu">annidato</mark>')
    expect(resa).toMatch(/<td[^>]*><span class="ev-colore" data-colore="viola">cella<\/span><\/td>/)
  })

  it('lo span con tutti e due gli attributi ha le due classi', () => {
    expect(html('<span data-colore="rosso" data-sfondo="giallo">due</span>')).toContain(
      '<span class="ev-colore ev-sfondo" data-colore="rosso" data-sfondo="giallo">due</span>',
    )
  })

  it('un colore sconosciuto, un attributo in più, un tag senza chiusura restano testo', () => {
    for (const t of [
      '<span data-colore="fucsia">x</span>',
      '<span data-colore="rosso" class="altro">x</span>',
      '<span data-colore="rosso">senza chiusura',
      '<mark data-colore="rosso">x</mark>',
      '<span style="color:red">x</span>',
    ]) {
      const resa = html(t)
      expect(resa, t).toContain('&lt;')
      expect(resa, t).not.toMatch(/<span |<mark/)
    }
  })

  it('un <script> o un onclick restano testo', () => {
    expect(html('<script>alert(1)</script>')).toContain('&lt;script&gt;')
    const resa = html('<span data-colore="rosso" onclick="alert(1)">clic</span>')
    expect(resa).toContain('&lt;span data-colore=&quot;rosso&quot; onclick=')
    expect(resa).not.toMatch(/<span[^>]*onclick/)
  })

  it('un tag che si chiude in un altro paragrafo resta testo', () => {
    const resa = html('<span data-colore="rosso">primo\n\nsecondo</span>')
    expect(resa).not.toContain('class="ev-colore"')
    expect(resa).toContain('&lt;span')
  })
})

describe('MarkdownContenuto: i link (01/11/2026)', () => {
  it('anche un indirizzo nudo si apre in una nuova scheda', () => {
    const resa = html('Vedi https://www.instagram.com/reel/ABC_def/ e www.esempio.it e [il reel](https://esempio.it/r)')
    expect(resa).toContain('<a href="https://www.instagram.com/reel/ABC_def/" target="_blank" rel="noopener noreferrer"')
    expect(resa).toContain('<a href="http://www.esempio.it" target="_blank" rel="noopener noreferrer"')
    expect(resa).toContain('<a href="https://esempio.it/r" target="_blank" rel="noopener noreferrer"')
  })

  it('un link javascript: non ha mai il suo indirizzo', () => {
    expect(html('[clic](javascript:alert(1))')).not.toContain('javascript:')
  })
})
