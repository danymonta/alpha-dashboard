import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { COLORE_STATUS } from '@/lib/marketing/etichette'
import {
  CAMPI_OPZIONE,
  COLORI_ETICHETTA,
  NOME_COLORE,
  NOME_OPZIONE_MAX,
  OPZIONI_DI_PARTENZA,
  RE_VALORE_OPZIONE,
  isColore,
  nomeConfrontabile,
  nomeDaValore,
  nomiDa,
  opzioneDaNomeOValore,
  opzioneDaValore,
  opzioniDiPartenza,
} from '@/lib/marketing/opzioni'

/**
 * The labels of Reel Type and Format (21/10/2026): the colours, the starting
 * options (the same as the migration's rows), the small functions that find an
 * option, and the pills' colours in etichette.css (every colour has its three
 * tokens, readable in both themes).
 */

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20261024090000_etichette_contenuti.sql'),
  'utf8',
)
const CSS = readFileSync(path.join(process.cwd(), 'components/marketing/etichette.css'), 'utf8')

describe('i dieci colori di Notion', () => {
  it('sono quelli del controllo della tabella, nello stesso ordine', () => {
    const controllo = /colore in \(([^)]*)\)\)/.exec(MIGRATION)?.[1] ?? ''
    expect([...controllo.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual([...COLORI_ETICHETTA])
    expect(COLORI_ETICHETTA).toEqual(['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'])
  })

  it('ognuno ha il suo nome in italiano; isColore non accetta altro', () => {
    expect(Object.keys(NOME_COLORE)).toEqual([...COLORI_ETICHETTA])
    expect(Object.values(NOME_COLORE).every((n) => n.length > 0)).toBe(true)
    expect(new Set(Object.values(NOME_COLORE)).size).toBe(10)
    expect(isColore('blue')).toBe(true)
    expect(isColore('magenta')).toBe(false)
    expect(isColore(null)).toBe(false)
  })
})

describe('le opzioni di partenza', () => {
  it('sono le 15 righe che la migration inserisce: stessi codici, nomi, colori e ordine', () => {
    const righe = [...MIGRATION.matchAll(/\('(reel_type|formato)', '([a-z_]+)', '([^']+)', '([a-z]+)', (\d+)\)/g)].map((m) => ({
      campo: m[1],
      valore: m[2],
      nome: m[3],
      colore: m[4],
      ordine: Number(m[5]),
    }))
    const attese = CAMPI_OPZIONE.flatMap((campo) =>
      OPZIONI_DI_PARTENZA[campo].map((o, i) => ({ campo, valore: o.valore, nome: o.nome, colore: o.colore, ordine: (i + 1) * 10 })),
    )
    expect(righe).toHaveLength(15)
    expect(righe).toEqual(attese)
  })

  it('i codici rispettano il controllo della tabella e ogni colore è uno dei dieci', () => {
    for (const campo of CAMPI_OPZIONE) {
      for (const o of OPZIONI_DI_PARTENZA[campo]) {
        expect(o.valore, o.nome).toMatch(RE_VALORE_OPZIONE)
        expect(isColore(o.colore), o.nome).toBe(true)
        expect(o.nome.length).toBeLessThanOrEqual(NOME_OPZIONE_MAX)
      }
      const nomi = OPZIONI_DI_PARTENZA[campo].map((o) => nomeConfrontabile(o.nome))
      expect(new Set(nomi).size, campo).toBe(nomi.length)
    }
  })

  it('i colori degli screenshot di Notion', () => {
    const colore = (campo: 'reel_type' | 'formato', valore: string) =>
      OPZIONI_DI_PARTENZA[campo].find((o) => o.valore === valore)?.colore
    expect(colore('reel_type', 'workshop')).toBe('green')
    expect(colore('reel_type', 'attraction')).toBe('blue')
    expect(colore('reel_type', 'education')).toBe('yellow')
    expect(colore('reel_type', 'converting')).toBe('red')
    expect(colore('reel_type', 'radio')).toBe('purple')
    expect(colore('formato', 'raw_talking_head')).toBe('blue')
    expect(colore('formato', 'storytelling')).toBe('brown')
    expect(colore('formato', 'b_roll')).toBe('orange')
    expect(colore('formato', 'text_opinion')).toBe('gray')
    expect(colore('formato', 'transformation')).toBe('red')
  })

  it('opzioniDiPartenza e nomiDa: gli id, l’ordine e i nomi per codice', () => {
    const o = opzioniDiPartenza()
    expect(o.reel_type.map((x) => x.valore)).toEqual(['attraction', 'education', 'converting', 'radio', 'workshop'])
    expect(o.formato).toHaveLength(10)
    expect(new Set([...o.reel_type, ...o.formato].map((x) => x.id)).size).toBe(15)
    expect(nomiDa().reel_type.radio).toBe('RADIO')
    expect(nomiDa().formato.show_and_tell).toBe('Show&Tell')
    expect(nomiDa({ reel_type: [{ ...o.reel_type[0], nome: 'Attrazione' }], formato: [] }).reel_type).toEqual({ attraction: 'Attrazione' })
  })
})

describe('trovare un’etichetta', () => {
  const elenco = opzioniDiPartenza().formato

  it('per codice, per nome esatto, senza maiuscole o con spazi in più', () => {
    expect(opzioneDaNomeOValore(elenco, 'b_roll')?.nome).toBe('B roll')
    expect(opzioneDaNomeOValore(elenco, 'B roll')?.valore).toBe('b_roll')
    expect(opzioneDaNomeOValore(elenco, '  b   ROLL ')?.valore).toBe('b_roll')
    expect(opzioneDaNomeOValore(elenco, 'show&tell')?.valore).toBe('show_and_tell')
  })

  it('un nome che non c’è, o vuoto, è null: nessuna etichetta indovinata', () => {
    expect(opzioneDaNomeOValore(elenco, 'Meme')).toBeNull()
    expect(opzioneDaNomeOValore(elenco, 'Show & Tell')).toBeNull()
    expect(opzioneDaNomeOValore(elenco, '   ')).toBeNull()
  })

  it('opzioneDaValore e nomeDaValore: il nome di adesso, il codice se l’etichetta non c’è più', () => {
    expect(opzioneDaValore(elenco, 'split')?.nome).toBe('Split')
    expect(opzioneDaValore(elenco, 'sparita')).toBeNull()
    expect(opzioneDaValore(elenco, null)).toBeNull()
    expect(nomeDaValore(elenco, 'split')).toBe('Split')
    expect(nomeDaValore(elenco, 'sparita')).toBe('sparita')
    expect(nomeDaValore(elenco, null)).toBe('')
  })

  it('nomeConfrontabile confronta come il database: spazi singoli, senza maiuscole', () => {
    expect(nomeConfrontabile('  Raw   Talking HEAD ')).toBe('raw talking head')
  })
})

describe('i colori delle pillole (etichette.css)', () => {
  /** "#rrggbb" of a light-dark(light, dark) token: [light, dark] */
  function coppia(token: string): [string, string] {
    const m = new RegExp(`--${token}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(CSS)
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

  it.each(COLORI_ETICHETTA.map((c) => [c] as const))('%s: sfondo, testo e puntino, per il tema chiaro e per lo scuro', (colore) => {
    const [bgChiaro, bgScuro] = coppia(`etichetta-${colore}-bg`)
    const [fgChiaro, fgScuro] = coppia(`etichetta-${colore}-fg`)
    const [puntoChiaro, puntoScuro] = coppia(`etichetta-${colore}-punto`)
    // the name on the pill: WCAG AA for text, in both themes
    expect(rapporto(bgChiaro, fgChiaro)).toBeGreaterThanOrEqual(4.5)
    expect(rapporto(bgScuro, fgScuro)).toBeGreaterThanOrEqual(4.5)
    // the dot of the Status: a shape, 3:1
    expect(rapporto(bgChiaro, puntoChiaro)).toBeGreaterThanOrEqual(3)
    expect(rapporto(bgScuro, puntoScuro)).toBeGreaterThanOrEqual(3)
    // the dark theme is a dark pill with light text, the light one a pastel pill with dark text (like Notion)
    expect(luminanza(bgScuro)).toBeLessThan(luminanza(fgScuro))
    expect(luminanza(bgChiaro)).toBeGreaterThan(luminanza(fgChiaro))
    expect(CSS).toContain(`.pillola[data-colore='${colore}']`)
  })

  it('ogni Status usa uno dei dieci colori, e sono sei colori diversi', () => {
    const usati = Object.values(COLORE_STATUS)
    expect(usati.every((c) => isColore(c))).toBe(true)
    expect(new Set(usati).size).toBe(6)
  })

  it('nessun colore scritto a mano fuori dai token: la pillola usa solo le variabili', () => {
    const fuori = CSS.split('\n')
      .filter((riga) => /#[0-9a-f]{6}/i.test(riga) && !riga.includes('light-dark('))
      .join('\n')
    expect(fuori).toBe('')
  })
})
