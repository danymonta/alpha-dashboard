import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { fontiDelContenuto } from '@/lib/marketing/abbinamento'
import { oscura } from '@/lib/marketing/analisi/oscura'
import {
  COLORI_EVIDENZIATORE,
  TOKEN_EVIDENZIATORE,
  classiEvidenziatura,
  eColoreEvidenziatore,
  inizioEvidenziato,
  leggiApertura,
  leggiEvidenziato,
  togliEvidenziatore,
} from '@/lib/marketing/evidenziatore'
import { COLORI_ETICHETTA } from '@/lib/marketing/opzioni'

/**
 * The highlighter of the content sections (01/11/2026): the strict syntax,
 * what the analyses and the matching of the posts read (the text without the
 * tags), and the colours of evidenziatore.css, which come from the label
 * tokens and keep WCAG AA (4.5:1) in both themes.
 */

describe('la sintassi dell’evidenziatore', () => {
  it('i nove colori sono quelli di Notion tranne «default», ognuno coi token della sua etichetta', () => {
    expect(COLORI_EVIDENZIATORE).toHaveLength(9)
    expect(new Set(Object.values(TOKEN_EVIDENZIATORE))).toEqual(new Set(COLORI_ETICHETTA.filter((c) => c !== 'default')))
    expect(eColoreEvidenziatore('rosso')).toBe(true)
    expect(eColoreEvidenziatore('red')).toBe(false)
    expect(eColoreEvidenziatore('predefinito')).toBe(false)
  })

  it('legge solo le aperture esatte', () => {
    expect(leggiApertura('<span data-colore="rosso">')).toMatchObject({ tag: 'span', colore: 'rosso', sfondo: null })
    expect(leggiApertura('<mark data-sfondo="giallo">')).toMatchObject({ tag: 'mark', colore: null, sfondo: 'giallo' })
    expect(leggiApertura('<span data-colore="rosso" data-sfondo="giallo">')).toMatchObject({ colore: 'rosso', sfondo: 'giallo' })
    expect(leggiApertura('xx<span data-colore="blu">', 2)).toMatchObject({ colore: 'blu' })
    for (const no of [
      '<span data-colore="fucsia">',
      '<span data-colore="rosso" data-colore="blu">',
      '<span data-sfondo="giallo">',
      '<mark data-colore="rosso">',
      '<mark data-sfondo="giallo" data-colore="rosso">',
      '<span  data-colore="rosso">',
      '<span data-colore="rosso" onclick="x">',
      '<SPAN data-colore="rosso">',
      '<span data-colore=rosso>',
    ])
      expect(leggiApertura(no), no).toBeNull()
  })

  it('trova la sua chiusura, contando gli span annidati', () => {
    const t = 'a <span data-colore="rosso">x <span data-colore="blu">y</span> z</span> b'
    const pezzo = leggiEvidenziato(t, 2)
    expect(pezzo?.interno).toBe('x <span data-colore="blu">y</span> z')
    expect(pezzo?.raw).toBe('<span data-colore="rosso">x <span data-colore="blu">y</span> z</span>')
    expect(leggiEvidenziato('<span data-colore="rosso">senza chiusura')).toBeNull()
    expect(leggiEvidenziato('<span data-colore="rosso">x</span >')).toBeNull()
    expect(inizioEvidenziato('testo <mark data-sfondo="rosa">')).toBe(6)
    expect(inizioEvidenziato('niente')).toBe(-1)
    expect(classiEvidenziatura({ colore: 'rosso', sfondo: 'giallo' })).toEqual(['ev-colore', 'ev-sfondo'])
  })

  it('togliEvidenziatore lascia il testo e toglie solo i nostri tag', () => {
    expect(
      togliEvidenziatore('Hook: <span data-colore="rosso">ho preso <mark data-sfondo="giallo">20 kg</mark></span>, da casa.'),
    ).toBe('Hook: ho preso 20 kg, da casa.')
    expect(togliEvidenziatore('<span data-colore="rosso" data-sfondo="giallo">due</span>')).toBe('due')
    // anything else stays as it is
    for (const resta of ['a < b', '<span data-colore="fucsia">x</span>', '<script>alert(1)</script>', '<span data-colore="rosso">aperto'])
      expect(togliEvidenziatore(resta)).toBe(resta)
  })

  it('le analisi non mandano i tag a Claude, e l’abbinamento dei post non li legge come parole', () => {
    expect(oscura('<span data-colore="rosso">Ho preso 20 kg</mark> da casa', new Set())).toBe(
      '<span data-colore="rosso">Ho preso 20 kg</mark> da casa',
    )
    expect(oscura('<span data-colore="rosso">Ho preso 20 kg</span> <mark data-sfondo="giallo">da casa</mark>', new Set())).toBe(
      'Ho preso 20 kg da casa',
    )
    const fonti = fontiDelContenuto({
      nome: 'Reel #3 - TOF - Trazioni',
      bozza: null,
      finale: 'Hook: <span data-colore="rosso">ho fatto la prima trazione a 35 anni</span>\nCTA: seguimi',
      messaggio: null,
    })
    expect(fonti.join(' ')).not.toMatch(/span|colore|rosso/)
    expect(fonti.join(' ')).toContain('ho fatto la prima trazione a 35 anni')
  })
})

describe('i colori dell’evidenziatore (evidenziatore.css)', () => {
  const CSS = readFileSync(path.join(process.cwd(), 'components/marketing/evidenziatore.css'), 'utf8')
  const ETICHETTE = readFileSync(path.join(process.cwd(), 'components/marketing/etichette.css'), 'utf8')
  const GLOBALI = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')

  /** "#rrggbb" of a light-dark(light, dark) token: [light, dark] */
  function coppia(token: string): [string, string] {
    const m = new RegExp(`--${token}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(ETICHETTE)
    if (!m) throw new Error(`token mancante: ${token}`)
    return [m[1], m[2]]
  }
  const luminanza = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const rapporto = (a: string, b: string) => {
    const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  /** The app's surfaces of a theme: the background, the card, the second surface. */
  function superfici(tema: 'scuro' | 'chiaro'): string[] {
    const blocco = tema === 'scuro' ? GLOBALI : GLOBALI.slice(GLOBALI.indexOf('.light {'))
    return ['alpha-bg', 'alpha-surface', 'alpha-surface-2'].map((nome) => {
      const m = new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, 'i').exec(blocco)
      if (!m) throw new Error(`superficie mancante: ${nome}`)
      return m[1]
    })
  }
  /** The token a rule of evidenziatore.css gives to a variable, as written. */
  function regola(selettore: string, variabile: string): string {
    const escape = selettore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(?:^|\\n)${escape} \\{[^}]*--${variabile}: var\\(--([a-z-]+)\\)`).exec(CSS)
    if (!m) throw new Error(`regola mancante: ${selettore} ${variabile}`)
    return m[1]
  }

  it.each(COLORI_EVIDENZIATORE.map((c) => [c] as const))('%s: i token della sua etichetta, nient’altro', (colore) => {
    const e = TOKEN_EVIDENZIATORE[colore]
    expect(regola(`.ev-colore[data-colore='${colore}']`, 'ev-testo')).toBe(`etichetta-${e}-punto`)
    expect(regola(`.ev-colore[data-colore='${colore}']`, 'ev-testo-su-sfondo')).toBe(`etichetta-${e}-fg`)
    expect(regola(`.light .ev-colore[data-colore='${colore}']`, 'ev-testo')).toBe(`etichetta-${e}-fg`)
    expect(regola(`.ev-sfondo[data-sfondo='${colore}']`, 'ev-sfondo')).toBe(`etichetta-${e}-bg`)
    expect(regola(`.ev-sfondo[data-sfondo='${colore}']`, 'ev-sfondo-testo')).toBe(`etichetta-${e}-fg`)
  })

  it('nessun colore scritto a mano nel CSS dell’evidenziatore', () => {
    expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it.each(COLORI_EVIDENZIATORE.map((c) => [c] as const))('%s: testo colorato e sfondo con contrasto AA nei due temi', (colore) => {
    const e = TOKEN_EVIDENZIATORE[colore]
    const [, puntoScuro] = coppia(`etichetta-${e}-punto`)
    const [fgChiaro, fgScuro] = coppia(`etichetta-${e}-fg`)
    const [bgChiaro, bgScuro] = coppia(`etichetta-${e}-bg`)
    // the coloured text on the page: -punto on dark, -fg on light
    for (const s of superfici('scuro')) expect(rapporto(puntoScuro, s), `${colore} su ${s}`).toBeGreaterThanOrEqual(4.5)
    for (const s of superfici('chiaro')) expect(rapporto(fgChiaro, s), `${colore} su ${s}`).toBeGreaterThanOrEqual(4.5)
    // the background with its own text, like a pill
    expect(rapporto(fgChiaro, bgChiaro)).toBeGreaterThanOrEqual(4.5)
    expect(rapporto(fgScuro, bgScuro)).toBeGreaterThanOrEqual(4.5)
  })

  it('un testo colorato su uno sfondo: AA in ogni coppia (sul giallo del tema scuro vince il testo dello sfondo)', () => {
    for (const x of COLORI_EVIDENZIATORE)
      for (const y of COLORI_EVIDENZIATORE) {
        const [fgChiaro, fgScuro] = coppia(`etichetta-${TOKEN_EVIDENZIATORE[x]}-fg`)
        const [bgChiaro, bgScuro] = coppia(`etichetta-${TOKEN_EVIDENZIATORE[y]}-bg`)
        const [, fgSfondoScuro] = coppia(`etichetta-${TOKEN_EVIDENZIATORE[y]}-fg`)
        expect(rapporto(fgChiaro, bgChiaro), `${x} su ${y}, chiaro`).toBeGreaterThanOrEqual(4.5)
        const testoScuro = y === 'giallo' ? fgSfondoScuro : fgScuro
        expect(rapporto(testoScuro, bgScuro), `${x} su ${y}, scuro`).toBeGreaterThanOrEqual(4.5)
      }
    // the exception is written in the CSS, for the three ways a colour meets a background
    for (const selettore of [
      ":root:not(.light) .ev-colore.ev-sfondo[data-sfondo='giallo']",
      ":root:not(.light) .ev-colore .ev-sfondo[data-sfondo='giallo']",
      ":root:not(.light) .ev-sfondo[data-sfondo='giallo'] .ev-colore",
    ])
      expect(CSS).toContain(selettore)
  })
})
