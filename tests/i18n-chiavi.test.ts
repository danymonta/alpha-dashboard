import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { LINGUE } from '@/lib/i18n/lingua'
import { SHELL } from '@/lib/i18n/testi/shell'
import { vociNav } from '@/lib/nav'

/**
 * The two languages of the interface (1.53.0) hold the same words: every key of the
 * Italian dictionary has its English one, the same kind (a text, a function with the
 * same parameters, a list as long), and no text is empty. The compiler already checks
 * the shape (Testi<T>, lib/i18n/lingua.ts); this catches what a cast or a loose Record
 * would let through. Every dictionary of lib/i18n/testi is read, so a new one is covered
 * without touching this test.
 */

type Albero = unknown

function differenze(it: Albero, en: Albero, percorso: string, fuori: string[]): void {
  if (typeof it === 'string') {
    if (typeof en !== 'string') fuori.push(`${percorso}: in inglese non è un testo`)
    else if (it.trim() === '' || en.trim() === '') fuori.push(`${percorso}: testo vuoto`)
    return
  }
  if (typeof it === 'function') {
    if (typeof en !== 'function') fuori.push(`${percorso}: in inglese non è una funzione`)
    else if (it.length !== en.length) fuori.push(`${percorso}: parametri diversi`)
    return
  }
  if (Array.isArray(it)) {
    if (!Array.isArray(en)) fuori.push(`${percorso}: in inglese non è una lista`)
    else if (it.length !== en.length) fuori.push(`${percorso}: liste lunghe diverse`)
    else it.forEach((v, i) => differenze(v, en[i], `${percorso}[${i}]`, fuori))
    return
  }
  if (it && typeof it === 'object') {
    if (!en || typeof en !== 'object') {
      fuori.push(`${percorso}: in inglese non è un oggetto`)
      return
    }
    const chiaviIt = Object.keys(it).sort()
    const chiaviEn = Object.keys(en).sort()
    for (const k of chiaviIt) if (!chiaviEn.includes(k)) fuori.push(`${percorso}.${k}: manca in inglese`)
    for (const k of chiaviEn) if (!chiaviIt.includes(k)) fuori.push(`${percorso}.${k}: manca in italiano`)
    for (const k of chiaviIt) {
      if (chiaviEn.includes(k)) {
        differenze((it as Record<string, Albero>)[k], (en as Record<string, Albero>)[k], `${percorso}.${k}`, fuori)
      }
    }
  }
}

const cartella = fileURLToPath(new URL('../lib/i18n/testi/', import.meta.url))
const file = readdirSync(cartella).filter((f) => f.endsWith('.ts'))

describe('i dizionari delle due lingue', () => {
  it('ci sono', () => {
    expect(file.length).toBeGreaterThan(0)
  })

  for (const nome of file) {
    it(`${nome}: le stesse chiavi in italiano e in inglese`, async () => {
      const modulo = (await import(`../lib/i18n/testi/${nome.replace(/\.ts$/, '')}.ts`)) as Record<string, unknown>
      const dizionari = Object.entries(modulo).filter(
        ([, v]) => v && typeof v === 'object' && 'it' in (v as object) && 'en' in (v as object),
      )
      expect(dizionari.length, `${nome} non esporta nessun dizionario bilingue`).toBeGreaterThan(0)
      const fuori: string[] = []
      for (const [chiave, d] of dizionari) {
        const { it: italiano, en: inglese } = d as { it: Albero; en: Albero }
        differenze(italiano, inglese, `${nome}:${chiave}`, fuori)
      }
      expect(fuori).toEqual([])
    })
  }
})

describe('il menu in inglese', () => {
  it('ogni voce e ogni gruppo di ogni ruolo ha la sua etichetta in tutte e due le lingue', () => {
    const mancano: string[] = []
    for (const ruolo of TUTTI_I_RUOLI) {
      for (const gruppo of vociNav(ruolo).gruppi) {
        for (const voce of gruppo.voci) {
          for (const lingua of LINGUE) {
            if (!SHELL[lingua].voci[voce.etichetta]) mancano.push(`${ruolo} ${lingua}: ${voce.etichetta}`)
          }
        }
      }
    }
    expect(mancano).toEqual([])
  })

  it('in italiano le etichette sono quelle di sempre', () => {
    for (const [chiave, valore] of Object.entries(SHELL.it.voci)) expect(valore).toBe(chiave)
  })
})
