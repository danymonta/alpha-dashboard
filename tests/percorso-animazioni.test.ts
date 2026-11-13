import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PIANO_FERMO,
  TEMPI,
  accelera,
  frazioneNodo,
  leggiVisto,
  pianoAnimazioni,
  ritardoNodo,
  scriviVisto,
  tempiLinea,
  traiettoriaRazzo,
  transizioniNodi,
} from '@/lib/percorso/animazioni'
import type { NodoPercorso, PassoPercorso } from '@/lib/percorso/letture'

const RADICE = join(__dirname, '..')

function nodo(chiave: string, stato: NodoPercorso['stato']): NodoPercorso {
  return { chiave, ordine: 0, stato, completatoIl: null }
}

function passo(chiave: string, nodo: string, stato: PassoPercorso['stato'], voci?: boolean[]): PassoPercorso {
  return {
    chiave,
    titolo: chiave,
    nodo,
    attore: 'cliente',
    stato,
    completatoIl: null,
    blocchi: voci ? voci.map((spuntata, i) => ({ id: `v${i}`, ordine: i, corpo: '', tipo: 'voce' as const, titolo: `v${i}`, spuntata })) : null,
  } as PassoPercorso
}

const NODI: NodoPercorso[] = [
  nodo('benvenuto', 'completato'),
  nodo('questionario', 'completato'),
  nodo('call_prenotata', 'attuale'),
  nodo('community', 'futuro'),
  nodo('call_onboarding', 'futuro'),
  nodo('settimana_test', 'futuro'),
  nodo('inizio_percorso', 'futuro'),
]

describe('la linea della timeline', () => {
  it('è piena dopo una tappa completata e vuota dopo una futura', () => {
    expect(frazioneNodo(nodo('a', 'completato'), [])).toBe(1)
    expect(frazioneNodo(nodo('a', 'futuro'), [passo('x', 'a', 'fatto')])).toBe(0)
  })

  it('dopo la tappa attuale si riempie con le azioni fatte, mai tutta', () => {
    const passi = [passo('p1', 'community', 'fatto'), passo('p2', 'community', 'disponibile')]
    expect(frazioneNodo(nodo('community', 'attuale'), passi)).toBe(0.5)
    expect(frazioneNodo(nodo('community', 'attuale'), [passo('p1', 'community', 'fatto')])).toBeLessThan(1)
    expect(frazioneNodo(nodo('community', 'attuale'), [])).toBe(0)
  })

  it('nella settimana test conta le voci spuntate', () => {
    const passi = [passo('test', 'settimana_test', 'in_corso', [true, true, false, false])]
    expect(frazioneNodo(nodo('settimana_test', 'attuale'), passi)).toBe(0.5)
  })

  it('si disegna dalla sinistra fino alla tappa attuale in 700-900 ms, un segmento dopo l’altro', () => {
    const tempi = tempiLinea(NODI)
    const disegnati = tempi.filter((t) => t.durata > 0)
    expect(disegnati).toHaveLength(3)
    const fine = Math.max(...disegnati.map((t) => t.ritardo + t.durata))
    expect(fine).toBeGreaterThanOrEqual(700)
    expect(fine).toBeLessThanOrEqual(900)
    expect(disegnati.map((t) => t.ritardo)).toEqual([...disegnati.map((t) => t.ritardo)].sort((a, b) => a - b))
    expect(disegnati.at(-1)?.curva).toBe('ease-out')
    expect(tempi.at(-1)?.durata).toBe(0)
    expect(tempi[3]?.durata).toBe(0)
  })

  it('le tappe compaiono in sequenza, 60 ms l’una dall’altra', () => {
    expect([0, 1, 2, 6].map(ritardoNodo)).toEqual([0, 60, 120, 360])
  })
})

describe('il piano delle animazioni', () => {
  const prima = { nodi: Object.fromEntries(NODI.map((n) => [n.chiave, n.stato])), giorni: 9, lancio: false }
  const dopo: NodoPercorso[] = NODI.map((n) =>
    n.chiave === 'call_prenotata' ? { ...n, stato: 'completato' } : n.chiave === 'community' ? { ...n, stato: 'attuale' } : n,
  )

  it('una tappa completata fa il pop e la successiva apre il lucchetto', () => {
    expect(transizioniNodi(prima.nodi, dopo)).toEqual({ completati: ['call_prenotata'], sbloccati: ['community'] })
    const piano = pianoAnimazioni({ ridotto: false, prima, nodi: dopo, giorni: 8, lanciato: false })
    expect(piano.pop).toEqual(['call_prenotata'])
    expect(piano.sblocca).toEqual(['community'])
    expect(piano.contatore).toEqual({ da: 9, a: 8 })
    expect(piano.respiro).toBe(true)
    expect(piano.fluttua).toBe(true)
    expect(piano.lancio).toBe(false)
  })

  it('la prima volta non c’è niente da raccontare: solo il respiro', () => {
    const piano = pianoAnimazioni({ ridotto: false, prima: null, nodi: dopo, giorni: 8, lanciato: false })
    expect(piano).toEqual({ ...PIANO_FERMO, respiro: true, fluttua: true })
  })

  it('il razzo parte una volta sola, e mai alla prima visita dopo il lancio', () => {
    const tutti = NODI.map((n) => ({ ...n, stato: 'completato' as const }))
    expect(pianoAnimazioni({ ridotto: false, prima, nodi: tutti, giorni: null, lanciato: true }).lancio).toBe(true)
    expect(pianoAnimazioni({ ridotto: false, prima: { ...prima, lancio: true }, nodi: tutti, giorni: null, lanciato: true }).lancio).toBe(false)
    expect(pianoAnimazioni({ ridotto: false, prima: null, nodi: tutti, giorni: null, lanciato: true }).lancio).toBe(false)
    expect(pianoAnimazioni({ ridotto: false, prima, nodi: tutti, giorni: null, lanciato: true }).fluttua).toBe(false)
  })

  it('con «Riduci movimento» tutto resta fermo', () => {
    const tutti = NODI.map((n) => ({ ...n, stato: 'completato' as const }))
    expect(pianoAnimazioni({ ridotto: true, prima, nodi: dopo, giorni: 8, lanciato: false })).toEqual(PIANO_FERMO)
    expect(pianoAnimazioni({ ridotto: true, prima, nodi: tutti, giorni: null, lanciato: true })).toEqual(PIANO_FERMO)
    expect(PIANO_FERMO).toEqual({ respiro: false, fluttua: false, pop: [], sblocca: [], contatore: null, lancio: false })
  })
})

describe('la memoria della visita', () => {
  it('legge solo quello che sa leggere', () => {
    expect(leggiVisto(null)).toBeNull()
    expect(leggiVisto('non json')).toBeNull()
    expect(leggiVisto('[1,2]')).toBeNull()
    expect(leggiVisto('{"nodi":{"a":"completato","b":"strano"},"giorni":-3,"lancio":"sì"}')).toEqual({
      nodi: { a: 'completato' },
      giorni: null,
      lancio: false,
    })
  })

  it('scrive e rilegge lo stesso stato', () => {
    expect(leggiVisto(scriviVisto(NODI, 9, false))).toEqual({
      nodi: Object.fromEntries(NODI.map((n) => [n.chiave, n.stato])),
      giorni: 9,
      lancio: false,
    })
  })
})

describe('il razzo', () => {
  it('sale sempre e accelera', () => {
    const origine = { x: 200, y: 300 }
    const punti = [0, 0.25, 0.5, 0.75, 1].map((t) => traiettoriaRazzo(t, origine, 800))
    expect(punti[0]).toEqual({ x: 200, y: 300, scala: 1 })
    for (let i = 1; i < punti.length; i++) expect(punti[i]!.y).toBeLessThan(punti[i - 1]!.y)
    // out of the top of the window at the end
    expect(punti.at(-1)!.y).toBeLessThan(0)
    expect(accelera(0.5)).toBeLessThan(0.5)
    expect(accelera(2)).toBe(1)
  })

  it('dura poco più di due secondi', () => {
    expect(TEMPI.lancio).toBeGreaterThanOrEqual(1800)
    expect(TEMPI.lancio).toBeLessThanOrEqual(3000)
  })
})

function file(cartella: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(cartella)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const p = join(cartella, nome)
    if (statSync(p).isDirectory()) out.push(...file(p))
    else if (/\.(tsx?|mjs)$/.test(nome)) out.push(p)
  }
  return out
}

describe('dove sta motion', () => {
  it('lo importa solo l’area del cliente, mai la shell del team', () => {
    const chi = ['app', 'components', 'lib']
      .flatMap((c) => file(join(RADICE, c)))
      .filter((p) => /from ['"](motion|framer-motion)(\/[^'"]*)?['"]/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(RADICE, p))
    expect(chi).toEqual(['components/percorso/animazioni/animazioni-percorso.tsx'])
  })

  it('arriva dopo il primo disegno, in un pezzo a parte', () => {
    const carica = readFileSync(join(RADICE, 'components/percorso/animazioni/carica.tsx'), 'utf8')
    expect(carica).toMatch(/dynamic\(\(\) => import\('\.\/animazioni-percorso'\)/)
    expect(carica).toMatch(/ssr: false/)
    const lancio = readFileSync(join(RADICE, 'components/percorso/animazioni/animazioni-percorso.tsx'), 'utf8')
    expect(lancio).toMatch(/import\('\.\/razzo-lancio'\)/)
    expect(lancio).toMatch(/useReducedMotion/)
  })

  it('l’apertura in CSS gira solo senza «Riduci movimento», e la regola globale ferma il resto', () => {
    const css = readFileSync(join(RADICE, 'app/globals.css'), 'utf8')
    const blocco = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'))
    expect(blocco.slice(0, 400)).toMatch(/\.percorso-linea-entra/)
    expect(blocco.slice(0, 400)).toMatch(/\.percorso-nodo-entra/)
    // the opening never keeps its last frame: motion can move the same element afterwards
    expect(blocco.slice(0, 400)).not.toMatch(/forwards|both/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/)
  })
})
