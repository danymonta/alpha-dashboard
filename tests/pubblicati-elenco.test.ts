import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { FILTRI_PREDEFINITI } from '@/lib/marketing/pubblicati/filtri'
import { leggiPubblicati, leggiPubblicatiConRipiego } from '@/lib/marketing/pubblicati/elenco'

type Chiamata = { vista: string; metodo: string; args: unknown[] }

/** A query builder that records its calls and answers (data, error) per view when awaited. */
function dbFinto(risposte: Record<string, { data: unknown; error: { code: string } | null }>) {
  const chiamate: Chiamata[] = []
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

const OGGI = new Date('2026-10-25T10:00:00Z')

const NUMERI = [
  { media_id: '9001', shortcode: 'A', giorno: '2026-10-10', views: 5000, in_target_14g: 2, dm_14g: 5, eliminato: false, reel: true, media_type: 'VIDEO' },
  { media_id: '9002', shortcode: 'B', giorno: '2026-10-08', views: 900, in_target_14g: null, dm_14g: null, eliminato: false, reel: false, media_type: 'IMAGE' },
]
const POST = [
  { shortcode: 'A', didascalia: 'Una didascalia 😀' },
  { shortcode: 'B', didascalia: 'Le quinte del workshop' },
]
const CONTENUTI = [
  { id: 'c1', nome: 'Reel sera', stato: 'posted', reel_type: 'education', formato: null, view_count: 5000, view_count_da_instagram: true, instagram_shortcode: 'A' },
]

const di = (c: Chiamata[], vista: string, metodo: string) => c.filter((x) => x.vista === vista && x.metodo === metodo).map((x) => x.args)

describe('leggiPubblicati', () => {
  it('i post non eliminati degli ultimi 30 giorni, dal più recente, al massimo 200', async () => {
    const { db, chiamate } = dbFinto({ v_pubblicati: { data: [{ media_id: '9001' }], error: null } })
    const righe = await leggiPubblicati(db, FILTRI_PREDEFINITI, OGGI)
    expect(righe).toHaveLength(1)
    expect(di(chiamate, 'v_pubblicati', 'eq')).toEqual([['eliminato', false]])
    expect(di(chiamate, 'v_pubblicati', 'gte')).toEqual([['giorno', '2026-09-25']])
    expect(di(chiamate, 'v_pubblicati', 'order')).toEqual([['pubblicato_il', { ascending: false }]])
    expect(di(chiamate, 'v_pubblicati', 'limit')).toEqual([[200]])
  })

  it('il periodo, il tipo, «nel piano» e la ricerca diventano filtri della query', async () => {
    const { db, chiamate } = dbFinto({ v_pubblicati: { data: [], error: null } })
    await leggiPubblicati(db, { periodo: 90, tipo: 'carosello', piano: 'fuori', cambiare: false, q: 'a*b' }, OGGI)
    expect(di(chiamate, 'v_pubblicati', 'gte')).toEqual([['giorno', '2026-07-27']])
    expect(di(chiamate, 'v_pubblicati', 'eq')).toEqual([['eliminato', false], ['media_type', 'CAROUSEL_ALBUM'], ['reel', false]])
    expect(di(chiamate, 'v_pubblicati', 'is')).toEqual([['contenuto_id', null]])
    // every character of the search is taken literally: `***=` and never ilike
    expect(di(chiamate, 'v_pubblicati', 'regexIMatch')).toEqual([['didascalia', '***=a*b']])
  })

  it('i reel: il campo reel o il tipo video; «nel piano»: contenuto presente; «da cambiare»: il verdetto', async () => {
    const { db, chiamate } = dbFinto({ v_pubblicati: { data: [], error: null } })
    await leggiPubblicati(db, { ...FILTRI_PREDEFINITI, tipo: 'reel', piano: 'nel_piano', cambiare: true }, OGGI)
    expect(di(chiamate, 'v_pubblicati', 'or')).toEqual([['reel.eq.true,media_type.eq.VIDEO']])
    expect(di(chiamate, 'v_pubblicati', 'not')).toEqual([['contenuto_id', 'is', null]])
    expect(di(chiamate, 'v_pubblicati', 'eq')).toContainEqual(['verdetto_oggi', 'cambiare'])
  })

  it('un errore di lettura: lancia, col codice e mai il messaggio', async () => {
    const { db } = dbFinto({ v_pubblicati: { data: null, error: { code: '57014' } } })
    await expect(leggiPubblicati(db, FILTRI_PREDEFINITI, OGGI)).rejects.toThrow('post non letti (57014)')
  })
})

describe('leggiPubblicatiConRipiego', () => {
  it('di solito la lista intera, senza ripiego', async () => {
    const { db } = dbFinto({ v_pubblicati: { data: [{ media_id: '9001', verdetto_oggi: 'spingere' }], error: null } })
    const r = await leggiPubblicatiConRipiego(db, FILTRI_PREDEFINITI, OGGI)
    expect(r.senzaVerdetti).toBe(false)
    expect(r.righe).toHaveLength(1)
  })

  it('se la view dei verdetti non risponde, i post con i loro numeri e il loro contenuto, senza verdetti', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db, chiamate } = dbFinto({
      v_pubblicati: { data: null, error: { code: '57014' } },
      v_instagram_numeri: { data: NUMERI, error: null },
      instagram_contenuti: { data: POST, error: null },
      marketing_contenuti: { data: CONTENUTI, error: null },
    })
    const r = await leggiPubblicatiConRipiego(db, FILTRI_PREDEFINITI, OGGI)
    expect(r.senzaVerdetti).toBe(true)
    expect(r.righe.map((x) => x.media_id)).toEqual(['9001', '9002'])
    expect(r.righe[0]).toMatchObject({
      views: 5000,
      nome: 'Reel sera',
      contenuto_id: 'c1',
      reel_type: 'education',
      view_count: 5000,
      view_count_da_instagram: true,
      verdetto_oggi: null,
      analisi_stato: null,
    })
    expect(r.righe[0].didascalia_inizio).toBe('Una didascalia 😀')
    // the second post is not in the plan: null, not an invented link
    expect(r.righe[1]).toMatchObject({ contenuto_id: null, nome: null })
    expect(di(chiamate, 'marketing_contenuti', 'in')).toEqual([['instagram_shortcode', ['A', 'B']]])
  })

  it('«da cambiare» non ha verdetti da cui filtrare: nel ripiego la lista è vuota, non finta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = dbFinto({ v_pubblicati: { data: null, error: { code: '57014' } }, v_instagram_numeri: { data: NUMERI, error: null } })
    const r = await leggiPubblicatiConRipiego(db, { ...FILTRI_PREDEFINITI, cambiare: true }, OGGI)
    expect(r).toEqual({ righe: [], senzaVerdetti: true })
  })

  it('se anche il ripiego non risponde, l’errore della lista vera', async () => {
    const { db } = dbFinto({ v_pubblicati: { data: null, error: { code: '57014' } }, v_instagram_numeri: { data: null, error: { code: '42501' } } })
    await expect(leggiPubblicatiConRipiego(db, FILTRI_PREDEFINITI, OGGI)).rejects.toThrow('post non letti (57014)')
  })

  it('«Non nel piano» e la ricerca nel ripiego tengono solo i post che li soddisfano', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = dbFinto({
      v_pubblicati: { data: null, error: { code: '57014' } },
      v_instagram_numeri: { data: NUMERI, error: null },
      instagram_contenuti: { data: POST, error: null },
      marketing_contenuti: { data: CONTENUTI, error: null },
    })
    const fuori = await leggiPubblicatiConRipiego(db, { ...FILTRI_PREDEFINITI, piano: 'fuori' }, OGGI)
    expect(fuori.righe.map((x) => x.media_id)).toEqual(['9002'])
    const cerca = await leggiPubblicatiConRipiego(db, { ...FILTRI_PREDEFINITI, q: 'DIDASCALIA' }, OGGI)
    expect(cerca.righe.map((x) => x.media_id)).toEqual(['9001'])
  })
})
