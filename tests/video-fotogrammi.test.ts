import { describe, expect, it } from 'vitest'

import { DURATA_FOTOGRAMMI_MAX, etichettaTempo, FOTOGRAMMI_MAX, scegliFotogrammi } from '@/lib/marketing/video/fotogrammi'

// Which frames of a reel Claude looks at (1.36.0): the hook almost frame by
// frame, the body every few seconds, the closing; at most 32.

/** The frames ffmpeg makes at 2 a second: 0, 0.5, 1 ... up to the length. */
const ogniMezzoSecondo = (durata: number) => Array.from({ length: Math.floor(durata * 2) + 1 }, (_, i) => i / 2)
const tempi = (durata: number, disponibili = ogniMezzoSecondo(durata)) => scegliFotogrammi(durata, disponibili).map((f) => f.t)

describe('scegliFotogrammi', () => {
  it('la tabella: 6 del gancio, il corpo, la chiusura, al massimo 32', () => {
    expect(tempi(15)).toHaveLength(13)
    expect(tempi(30)).toHaveLength(21)
    // 24 points of body: the last one is the closing's first (the length minus 1.5 s), so 31 different frames
    expect(tempi(60)).toHaveLength(31)
    expect(tempi(90)).toHaveLength(31)
    expect(tempi(60).length).toBeLessThanOrEqual(FOTOGRAMMI_MAX)
  })

  it('il gancio è 0; 0,5; 1; 1,5; 2; 3 secondi, sempre i primi', () => {
    expect(tempi(60).slice(0, 6)).toEqual([0, 0.5, 1, 1.5, 2, 3])
    expect(scegliFotogrammi(60, ogniMezzoSecondo(60)).slice(0, 6).every((f) => f.parte === 'gancio')).toBe(true)
  })

  it('il corpo parte da 4 secondi con passo almeno 2, la chiusura è alla fine', () => {
    const t = tempi(30)
    expect(t.slice(6, 8)).toEqual([4, 6])
    expect(t.at(-2)).toBe(28.5)
    expect(t.at(-1)).toBe(30)
    const fine = scegliFotogrammi(30, ogniMezzoSecondo(30)).slice(-2)
    expect(fine.map((f) => f.parte)).toEqual(['fine', 'fine'])
  })

  it('un reel di 60 secondi: il corpo arriva a 24 punti dal secondo 4 al 58,5', () => {
    const corpo = scegliFotogrammi(60, ogniMezzoSecondo(60)).filter((f) => f.parte === 'corpo').map((f) => f.t)
    expect(corpo).toHaveLength(24)
    expect(corpo[0]).toBe(4)
    expect(corpo.at(-1)).toBeGreaterThanOrEqual(58)
  })

  it('le durate limite: 0,4; 3; 3,6 secondi', () => {
    expect(tempi(0.4)).toEqual([0])
    expect(tempi(3)).toEqual([0, 0.5, 1, 1.5, 2, 3])
    expect(tempi(3.6)).toEqual([0, 0.5, 1, 1.5, 2, 3, 3.5])
  })

  it('i doppioni si tolgono e il tetto è 32, anche a 90,5 e 600 secondi (fotogrammi chiave)', () => {
    // key frames only: every 4.8 seconds, irregular
    const chiave = (durata: number) => Array.from({ length: Math.floor(durata / 4.8) + 1 }, (_, i) => Math.round(i * 4.8 * 10) / 10)
    for (const durata of [90.5, 600]) {
      const t = tempi(durata, [0, 0.5, 1, 1.5, 2, 3, ...chiave(durata)])
      expect(new Set(t).size).toBe(t.length)
      expect(t.length).toBeLessThanOrEqual(FOTOGRAMMI_MAX)
      expect(t.slice(0, 6)).toEqual([0, 0.5, 1, 1.5, 2, 3])
    }
  })

  it('oltre i 15 minuti, o senza fotogrammi, o con durata sbagliata: nessuno', () => {
    expect(DURATA_FOTOGRAMMI_MAX).toBe(900)
    expect(scegliFotogrammi(901, ogniMezzoSecondo(60))).toEqual([])
    expect(scegliFotogrammi(30, [])).toEqual([])
    expect(scegliFotogrammi(0, [0])).toEqual([])
    expect(scegliFotogrammi(-5, [0])).toEqual([])
  })

  it('ogni momento voluto va al fotogramma disponibile più vicino', () => {
    const scelti = tempi(30, [0, 1, 3, 4.1, 7, 12, 20, 28, 29.5])
    expect(scelti.every((t) => [0, 1, 3, 4.1, 7, 12, 20, 28, 29.5].includes(t))).toBe(true)
    expect(scelti[0]).toBe(0)
    expect(scelti.at(-1)).toBe(29.5)
  })
})

describe('etichettaTempo', () => {
  it('«0:12,0», «1:05,5», «0:00,0»', () => {
    expect(etichettaTempo(12)).toBe('0:12,0')
    expect(etichettaTempo(65.5)).toBe('1:05,5')
    expect(etichettaTempo(0)).toBe('0:00,0')
    expect(etichettaTempo(0.54)).toBe('0:00,5')
  })
})
