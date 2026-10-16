import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { FILTRI_PREDEFINITI } from '@/lib/marketing/analisi/filtri'
import { leggiReelConRipiego } from '@/lib/marketing/analisi/elenco'

/** A query builder that records its calls and answers (data, error) per view when awaited. */
function dbFinto(risposte: Record<string, { data: unknown; error: { code: string } | null }>) {
  const chiamate: { vista: string; metodo: string; args: unknown[] }[] = []
  const db = {
    from(vista: string) {
      const catena: Record<string, unknown> = {}
      const proxy: unknown = new Proxy(catena, {
        get(_t, metodo: string) {
          if (metodo === 'then') {
            const r = risposte[vista] ?? { data: [], error: null }
            return (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok)
          }
          return (...args: unknown[]) => {
            chiamate.push({ vista, metodo, args })
            return proxy
          }
        },
      })
      return proxy
    },
  }
  return { db: db as never, chiamate }
}

const NUMERI = [
  { media_id: '9001', shortcode: 'A', giorno: '2026-10-10', views: 5000, in_target_14g: 2, dm_14g: 5, eliminato: false },
  { media_id: '9002', shortcode: 'B', giorno: '2026-10-08', views: 900, in_target_14g: null, dm_14g: null, eliminato: false },
]
const POST = [
  { media_id: '9001', didascalia: 'Una didascalia 😀', stato_collegamento: 'collegato', contenuto_id: 'c1', contenuto_nome: 'Reel sera', contenuto_stato: 'posted' },
]

describe('leggiReelConRipiego', () => {
  it('di solito la lista intera, senza ripiego', async () => {
    const { db } = dbFinto({ v_analisi_reel: { data: [{ media_id: '9001', verdetto_oggi: 'spingere' }], error: null } })
    const r = await leggiReelConRipiego(db, FILTRI_PREDEFINITI)
    expect(r.senzaVerdetti).toBe(false)
    expect(r.righe).toHaveLength(1)
  })
  it('se la view dei verdetti non risponde, i reel con i loro numeri e nessun verdetto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db, chiamate } = dbFinto({
      v_analisi_reel: { data: null, error: { code: '57014' } },
      v_instagram_numeri: { data: NUMERI, error: null },
      v_instagram_post: { data: POST, error: null },
    })
    const r = await leggiReelConRipiego(db, FILTRI_PREDEFINITI)
    expect(r.senzaVerdetti).toBe(true)
    expect(r.righe.map((x) => x.media_id)).toEqual(['9001', '9002'])
    expect(r.righe[0]).toMatchObject({ views: 5000, nome: 'Reel sera', stato_collegamento: 'collegato', verdetto_oggi: null, analisi_stato: null })
    expect(r.righe[0].didascalia_inizio).toBe('Una didascalia 😀')
    // the second reel has no place in the calendar read: null, not an invented state
    expect(r.righe[1]).toMatchObject({ contenuto_id: null, stato_collegamento: null })
    expect(chiamate.some((c) => c.vista === 'v_instagram_post' && c.metodo === 'in')).toBe(true)
  })
  it('con un filtro per verdetto il ripiego non c’è: l’errore resta', async () => {
    const { db } = dbFinto({ v_analisi_reel: { data: null, error: { code: '57014' } } })
    await expect(leggiReelConRipiego(db, { ...FILTRI_PREDEFINITI, verdetto: 'cambiare' })).rejects.toThrow('reel non letti (57014)')
  })
  it('se anche il ripiego non risponde, l’errore della lista vera', async () => {
    const { db } = dbFinto({ v_analisi_reel: { data: null, error: { code: '57014' } }, v_instagram_numeri: { data: null, error: { code: '42501' } } })
    await expect(leggiReelConRipiego(db, FILTRI_PREDEFINITI)).rejects.toThrow('reel non letti (57014)')
  })
  it('«senza contenuto» nel ripiego tiene solo i reel non collegati', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = dbFinto({
      v_analisi_reel: { data: null, error: { code: '57014' } },
      v_instagram_numeri: { data: NUMERI, error: null },
      v_instagram_post: { data: POST, error: null },
    })
    const r = await leggiReelConRipiego(db, { ...FILTRI_PREDEFINITI, senzaContenuto: true })
    expect(r.righe.map((x) => x.media_id)).toEqual(['9002'])
  })
})
