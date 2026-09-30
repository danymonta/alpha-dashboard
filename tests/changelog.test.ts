import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ETICHETTA_DESTINATARIO, VERSIONE_CORRENTE, VERSIONI, confrontaVersioni } from '@/lib/changelog/versioni'
import { oggiRoma } from '@/lib/date'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** A real calendar day in YYYY-MM-DD: 2026-02-30 is refused. */
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const d = new Date(`${data}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data
}

describe('confrontaVersioni', () => {
  it('confronta i numeri come numeri, non come testo', () => {
    expect(confrontaVersioni('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(confrontaVersioni('1.1.2', '1.1.10')).toBeLessThan(0)
    expect(confrontaVersioni('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(confrontaVersioni('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('changelog', () => {
  it('ha almeno una versione, e la corrente è la prima', () => {
    expect(VERSIONI.length).toBeGreaterThan(0)
    expect(VERSIONE_CORRENTE).toBe(VERSIONI[0])
  })

  it('ogni versione è semver valido', () => {
    for (const v of VERSIONI) expect(v.versione, v.versione).toMatch(SEMVER)
  })

  it('le versioni scendono strettamente, dalla più recente', () => {
    for (let i = 1; i < VERSIONI.length; i++) {
      const [prima, dopo] = [VERSIONI[i - 1].versione, VERSIONI[i].versione]
      expect(confrontaVersioni(prima, dopo), `${prima} deve venire prima di ${dopo}`).toBeGreaterThan(0)
    }
  })

  it('le date sono giorni veri, mai nel futuro, e non crescono scendendo nella lista', () => {
    const oggi = oggiRoma()
    for (const v of VERSIONI) {
      expect(dataValida(v.data), `${v.versione}: ${v.data}`).toBe(true)
      expect(v.data <= oggi, `${v.versione} è datata nel futuro: ${v.data}`).toBe(true)
    }
    for (let i = 1; i < VERSIONI.length; i++) {
      expect(VERSIONI[i - 1].data >= VERSIONI[i].data, `${VERSIONI[i - 1].versione} è più vecchia di ${VERSIONI[i].versione}`).toBe(true)
    }
  })

  it('la versione di package.json è quella in cima al changelog', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(pkg.version).toBe(VERSIONI[0].versione)
  })

  it('ogni versione dice qualcosa: almeno una novità o una correzione, con titolo e riassunto', () => {
    for (const v of VERSIONI) {
      expect(v.novita.length + (v.correzioni?.length ?? 0), v.versione).toBeGreaterThan(0)
      expect(v.titolo.trim(), v.versione).not.toBe('')
      expect(v.riassunto.trim(), v.versione).not.toBe('')
      for (const voce of [...v.novita, ...(v.correzioni ?? [])]) expect(voce.trim(), v.versione).not.toBe('')
    }
  })

  it('una PATCH corregge soltanto; una MINOR o MAJOR porta almeno una novità', () => {
    for (const v of VERSIONI) {
      const patch = Number(v.versione.split('.')[2])
      if (patch > 0) expect(v.novita, `${v.versione} è una patch`).toEqual([])
      else expect(v.novita.length, `${v.versione} non ha novità`).toBeGreaterThan(0)
    }
  })

  it('1.0.0 è il primo giorno in produzione, il 27/09/2026', () => {
    const lancio = VERSIONI.find((v) => v.versione === '1.0.0')
    expect(lancio?.data).toBe('2026-09-27')
  })

  it('"per chi" usa solo destinatari noti, senza doppioni', () => {
    for (const v of VERSIONI) {
      const chi = v.perChi ?? []
      expect(new Set(chi).size, v.versione).toBe(chi.length)
      for (const c of chi) expect(Object.keys(ETICHETTA_DESTINATARIO), v.versione).toContain(c)
      // "Tutto il team" already holds admin, setter and closer
      if (chi.includes('team')) expect(chi, `${v.versione}: «team» sta da solo`).toEqual(['team'])
    }
  })
})
