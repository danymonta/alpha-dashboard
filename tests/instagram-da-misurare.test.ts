import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ErroreInstagram } from '@/lib/instagram/richieste'
import {
  BLOCCO_METRICHE,
  daLeggere,
  erroriPermesso,
  ordinaDaLeggere,
  rigaMetriche,
  salvaMetriche,
  type PostPerNumeri,
} from '@/lib/instagram/metriche'

const ADESSO = new Date('2026-10-16T05:30:00.000Z')
const ore = (n: number) => new Date(ADESSO.getTime() - n * 3_600_000).toISOString()
const giorni = (n: number) => ore(n * 24)

function post(extra: Partial<PostPerNumeri> = {}): PostPerNumeri {
  return { media_id: 'm', media_type: 'VIDEO', reel: true, pubblicato_il: giorni(5), metriche_il: null, metriche_stato: 'da_leggere', eliminato_il: null, ...extra }
}

describe('daLeggere', () => {
  it('un post mai letto si legge sempre, di notte e a mano; uno rifiutato o senza dati si riprova', () => {
    for (const modo of ['notte', 'manuale'] as const) {
      expect(daLeggere([post()], ADESSO, modo)).toHaveLength(1)
      expect(daLeggere([post({ metriche_stato: 'senza_dati', metriche_il: ore(1) })], ADESSO, modo)).toHaveLength(1)
    }
  })

  it('mai un post eliminato, di prima della conversione o più vecchio di 180 giorni', () => {
    expect(daLeggere([post({ eliminato_il: ore(2) })], ADESSO, 'notte')).toEqual([])
    expect(daLeggere([post({ metriche_stato: 'prima_della_conversione' })], ADESSO, 'notte')).toEqual([])
    expect(daLeggere([post({ pubblicato_il: giorni(181) })], ADESSO, 'notte')).toEqual([])
    expect(daLeggere([post({ pubblicato_il: 'non una data' })], ADESSO, 'notte')).toEqual([])
  })

  it('fino a 30 giorni: di notte dopo 20 ore, a mano dopo un’ora', () => {
    const letto = (h: number) => post({ metriche_stato: 'lette', metriche_il: ore(h) })
    expect(daLeggere([letto(19)], ADESSO, 'notte')).toEqual([])
    expect(daLeggere([letto(21)], ADESSO, 'notte')).toHaveLength(1)
    expect(daLeggere([letto(0.5)], ADESSO, 'manuale')).toEqual([])
    expect(daLeggere([letto(2)], ADESSO, 'manuale')).toHaveLength(1)
  })

  it('oltre 30 giorni: di notte a rotazione ogni 6,5 giorni, a mano mai', () => {
    const vecchio = (g: number) => post({ pubblicato_il: giorni(60), metriche_stato: 'lette', metriche_il: giorni(g) })
    expect(daLeggere([vecchio(3)], ADESSO, 'notte')).toEqual([])
    expect(daLeggere([vecchio(7)], ADESSO, 'notte')).toHaveLength(1)
    expect(daLeggere([vecchio(30)], ADESSO, 'manuale')).toEqual([])
  })
})

describe('ordinaDaLeggere', () => {
  it('mai letti per primi (i più nuovi avanti), poi fino a 3 giorni, poi 30, poi gli altri dal letto da più tempo', () => {
    const mai = post({ media_id: 'mai', pubblicato_il: giorni(10) })
    const mai2 = post({ media_id: 'mai2', pubblicato_il: giorni(2) })
    const fresco = post({ media_id: 'fresco', pubblicato_il: giorni(2), metriche_stato: 'lette', metriche_il: ore(30) })
    const mese = post({ media_id: 'mese', pubblicato_il: giorni(20), metriche_stato: 'lette', metriche_il: ore(40) })
    const mese2 = post({ media_id: 'mese2', pubblicato_il: giorni(25), metriche_stato: 'lette', metriche_il: ore(90) })
    const vecchio = post({ media_id: 'vecchio', pubblicato_il: giorni(90), metriche_stato: 'lette', metriche_il: giorni(8) })
    const ordine = ordinaDaLeggere([vecchio, mese, fresco, mai, mese2, mai2], ADESSO).map((p) => p.media_id)
    expect(ordine).toEqual(['mai2', 'mai', 'fresco', 'mese2', 'mese', 'vecchio'])
  })
})

describe('erroriPermesso', () => {
  const meta = (code: number | null, message: string) => new ErroreInstagram('meta', message, { code })
  it('il permesso mancante sì; pochi spettatori, la rete e un errore comune no', () => {
    expect(erroriPermesso(meta(10, 'Application does not have permission for this action'))).toBe(true)
    expect(erroriPermesso(meta(200, 'Permissions error'))).toBe(true)
    expect(erroriPermesso(meta(10, 'Not enough viewers for the media to show insights'))).toBe(false)
    expect(erroriPermesso(meta(100, 'Invalid parameter'))).toBe(false)
    expect(erroriPermesso(new Error('rete'))).toBe(false)
  })
})

describe('salvaMetriche', () => {
  it('a blocchi da 25, sommando le righe che hanno preso i numeri', async () => {
    const righe = Array.from({ length: 60 }, (_, i) => rigaMetriche(`m${i}`, { stato: 'lette', valori: { views: i } } as never))
    const rpc = vi.fn(async (_n: string, a: { p_righe: unknown[] }) => ({ data: a.p_righe.length - 1, error: null }))
    const scritte = await salvaMetriche({ rpc } as never, righe)
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc.mock.calls.map((c) => c[1].p_righe.length)).toEqual([BLOCCO_METRICHE, BLOCCO_METRICHE, 10])
    expect(scritte).toBe(24 + 24 + 9)
  })

  it('un errore del database lancia con il solo codice', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '42501', message: 'testo che non deve uscire' } }))
    await expect(salvaMetriche({ rpc } as never, [rigaMetriche('m', { stato: 'lette', valori: {} } as never)])).rejects.toThrow('42501')
    await expect(salvaMetriche({ rpc } as never, [rigaMetriche('m', { stato: 'lette', valori: {} } as never)])).rejects.not.toThrow(/testo che non deve/)
  })
})
