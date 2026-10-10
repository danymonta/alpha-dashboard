import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// the block «Post su Instagram» has its own tests (G3): here only that it travels with the detail
const post = vi.hoisted(() => ({ letto: [] as unknown[] }))
vi.mock('@/lib/marketing/post-del-contenuto', () => ({
  leggiPostDelContenuto: vi.fn(async (_db: unknown, c: unknown) => {
    post.letto.push(c)
    return { stato: 'nessuno' }
  }),
}))

const sessione = vi.hoisted(() => ({ profilo: { id: 'p1', ruolo: 'marketing', attivo: true } as Record<string, unknown> | null }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => sessione.profilo) }))

/** The content as RLS lets the session read it; null when gone or hidden. */
const db = vi.hoisted(() => ({ riga: null as Record<string, unknown> | null, errore: null as { message: string } | null, letture: 0 }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          db.letture++
          return { data: db.riga, error: db.errore }
        },
      }
      return q
    },
  })),
}))

import { GET } from '@/app/api/marketing/contenuti/[id]/route'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
const md5 = (t: string) => createHash('md5').update(t, 'utf8').digest('hex')

function chiedi(id = ID) {
  return GET(new Request(`http://localhost/api/marketing/contenuti/${id}`), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  sessione.profilo = { id: 'p1', ruolo: 'marketing', attivo: true }
  db.riga = {
    id: ID,
    tipo: 'reel',
    nome: 'Trazioni',
    reel_type: null,
    formato: null,
    inspiration: null,
    stato: 'not_started',
    post_date: null,
    audio: null,
    url: null,
    view_count: null,
    created_at: '2026-10-09T08:00:00+00:00',
    updated_at: '2026-10-09T08:15:42.123456+00:00',
    messaggio: 'Allenati a casa',
    bozza: 'Hook:\nLine:',
    commenti: null,
    finale: 'Script finale ✨',
    notion_page_id: null,
  }
  db.errore = null
  db.letture = 0
  post.letto.length = 0
})

describe('GET /api/marketing/contenuti/[id] (il pannello, 1.33.0)', () => {
  it('admin, video editor e marketing: il dettaglio con le sezioni e le loro impronte, mai in cache', async () => {
    for (const ruolo of ['admin', 'editor', 'marketing']) {
      sessione.profilo = { id: 'p1', ruolo, attivo: true }
      const r = await chiedi()
      expect(r.status).toBe(200)
      expect(r.headers.get('cache-control')).toBe('private, no-store')
      const corpo = await r.json()
      expect(corpo.contenuto).toMatchObject({ id: ID, nome: 'Trazioni', notion_page_id: null })
      expect(corpo.contenuto).not.toHaveProperty('finale')
      expect(corpo.testi).toEqual({ messaggio: 'Allenati a casa', bozza: 'Hook:\nLine:', commenti: null, finale: 'Script finale ✨' })
      // the same md5 as public.salva_sezione_contenuto: md5(coalesce(testo, ''))
      expect(corpo.impronte).toEqual({
        messaggio: md5('Allenati a casa'),
        bozza: md5('Hook:\nLine:'),
        commenti: md5(''),
        finale: md5('Script finale ✨'),
      })
      expect(corpo.instagram).toEqual({ stato: 'nessuno' })
    }
    expect(post.letto).toContainEqual({ id: ID, url: null })
  })

  it('403 a setter, closer, coach, a un account disattivato e senza sessione, senza leggere niente', async () => {
    for (const profilo of [
      { id: 'p2', ruolo: 'setter', attivo: true },
      { id: 'p3', ruolo: 'closer', attivo: true },
      { id: 'p4', ruolo: 'coach', attivo: true },
      { id: 'p1', ruolo: 'marketing', attivo: false },
      null,
    ]) {
      sessione.profilo = profilo
      const r = await chiedi()
      expect(r.status).toBe(403)
      expect(r.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(db.letture).toBe(0)
  })

  it('404 a un id che non è un uuid e a un contenuto che non c’è (o che RLS nasconde)', async () => {
    const r = await chiedi('non-un-id')
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ sparito: true })
    expect(db.letture).toBe(0)
    db.riga = null
    const sparito = await chiedi()
    expect(sparito.status).toBe(404)
    expect(await sparito.json()).toEqual({ sparito: true })
  })

  it('un errore di lettura è un 500 con parole, mai un dettaglio vuoto', async () => {
    db.errore = { message: 'connection failure' }
    const r = await chiedi()
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ errore: 'Il contenuto non si è caricato.' })
  })
})
