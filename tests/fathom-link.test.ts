import { describe, expect, it } from 'vitest'

import { LINK_INCOMPLETO, normalizzaLink, stessoLink } from '@/lib/fathom/link'

describe('normalizzaLink', () => {
  it('toglie spazi, virgolette, punteggiatura finale, query e frammento', () => {
    const n = normalizzaLink('  "https://fathom.video/share/AbC123_x?timestamp=645#top".  ')
    expect(n).toMatchObject({ ok: true, tipo: 'share', canonico: 'https://fathom.video/share/AbC123_x', chiave: 'share:AbC123_x', fathom: true })
  })
  it('porta http a https, toglie www e la barra finale, host in minuscolo', () => {
    expect(normalizzaLink('http://WWW.Fathom.Video/calls/7700001/')).toMatchObject({
      ok: true, tipo: 'calls', canonico: 'https://fathom.video/calls/7700001', chiave: 'calls:7700001',
    })
  })
  it('le forme /share/{h,i,p,u}/ e il dominio fathom.ai hanno la stessa chiave', () => {
    expect(stessoLink('https://fathom.video/share/Tok123', 'https://fathom.ai/share/u/Tok123')).toBe(true)
    expect(stessoLink('https://fathom.video/share/h/Tok123', 'https://www.fathom.video/share/Tok123?x=1')).toBe(true)
    expect(stessoLink('https://fathom.video/share/Tok123', 'https://fathom.video/share/Tok124')).toBe(false)
  })
  it('un link /calls/<n> non è mai lo stesso di una condivisione, né di un id', () => {
    expect(stessoLink('https://fathom.video/calls/9700001', 'https://fathom.video/share/9700001')).toBe(false)
  })
  it('un link di un altro sito si accetta ma non è di Fathom', () => {
    expect(normalizzaLink('https://zoom.example.test/rec/abc?pwd=1')).toMatchObject({ ok: true, tipo: 'altro', fathom: false, canonico: 'https://zoom.example.test/rec/abc' })
  })
  it.each(['', 'fathom.video/share/abc', 'javascript:alert(1)', 'https://fathom.video/share/a b', 'ftp://fathom.video/x', 'non è un link'])(
    'rifiuta %j',
    (t) => expect(normalizzaLink(t)).toEqual({ ok: false, errore: LINK_INCOMPLETO }),
  )
})
