import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// The session: who taps. negaSeNon (lib/auth/azioni.ts) and the route read it.
const sessione = vi.hoisted(() => ({ ruolo: 'marketing', attivo: true }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => ({ id: 'p1', ...sessione })) }))

// The run and the proposals: never the real ones (they would need the service role and Meta)
const giro = vi.hoisted(() => ({
  ricalcola: vi.fn(async () => ({ collegati: 0, proposti: 2 })),
  aggiorna: vi.fn(),
}))
vi.mock('@/lib/instagram/sincronizza-contenuti', () => ({
  ricalcolaAbbinamenti: giro.ricalcola,
  aggiornaContenutiInstagram: giro.aggiorna,
}))
// The service role: its rpc is not enumerable, so { ruolo: 'service_role' } still equals it in the assertions
const servizio = vi.hoisted(() => {
  type Rpc = (nome: string, args: unknown) => Promise<{ data: boolean | null; error: { message: string } | null }>
  const rpc = vi.fn<Rpc>(async () => ({ data: true, error: null }))
  const client = { ruolo: 'service_role' }
  Object.defineProperty(client, 'rpc', { value: rpc, enumerable: false })
  return { rpc, client }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => servizio.client) }))

type Errore = { code?: string; message: string }
type Risposta = { data: unknown; error: Errore | null }

/** A fake PostgREST client: every call recorded, every awaited query takes the next answer in line. */
const db = vi.hoisted(() => {
  const stato = { risposte: [] as Risposta[], chiamate: [] as [string, ...unknown[]][] }
  const prossima = () => Promise.resolve(stato.risposte.shift() ?? { data: null, error: null })
  function query(): Record<string, unknown> {
    const q: Record<string, unknown> = {}
    for (const metodo of ['insert', 'update', 'delete', 'select', 'eq', 'is', 'in', 'neq', 'not', 'order', 'limit']) {
      q[metodo] = (...args: unknown[]) => {
        stato.chiamate.push([metodo, ...args])
        return q
      }
    }
    q.single = prossima
    q.maybeSingle = prossima
    q.then = (ok: (r: Risposta) => unknown, ko: (e: unknown) => unknown) => prossima().then(ok, ko)
    return q
  }
  const client = {
    from: (tabella: string) => {
      stato.chiamate.push(['from', tabella])
      return query()
    },
    rpc: (nome: string, args: unknown) => {
      stato.chiamate.push(['rpc', nome, args])
      return prossima()
    },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db.client) }))

import {
  annullaCollega,
  annullaScollega,
  collegaPost,
  scollegaPost,
} from '@/app/(app)/marketing/pubblicati/actions'
import * as operazioni from '@/lib/marketing/operazioni'
import { POST as aggiornaRoute } from '@/app/api/marketing/instagram/aggiorna/route'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
const SHORTCODE = 'ProvaReel01'
const PERMALINK = `https://www.instagram.com/reel/${SHORTCODE}/`
const VERSIONE = '2026-10-09T08:16:00.000001+00:00'
const POST = {
  shortcode: SHORTCODE,
  permalink: PERMALINK,
  media_type: 'VIDEO',
  reel: true,
  // 20:30 in Rome
  pubblicato_il: '2026-10-03T18:30:00+00:00',
  didascalia: 'Niente sbarra? Nessun problema.\n#schiena',
  eliminato_il: null,
}

function risponde(...risposte: Risposta[]) {
  db.stato.risposte.push(...risposte)
}
const ok = (data: unknown): Risposta => ({ data, error: null })

function chiamate(metodo: string) {
  return db.stato.chiamate.filter(([m]) => m === metodo).map(([, ...args]) => args)
}

beforeEach(() => {
  db.stato.risposte.length = 0
  db.stato.chiamate.length = 0
  sessione.ruolo = 'marketing'
  sessione.attivo = true
  giro.ricalcola.mockClear()
  giro.aggiorna.mockReset()
  servizio.rpc.mockClear()
})

describe('chi collega i post', () => {
  it('admin, video editor e marketing; gli altri ruoli e un account disattivato no, prima del database', async () => {
    for (const ruolo of ['admin', 'editor', 'marketing']) {
      sessione.ruolo = ruolo
      risponde(ok(POST), ok({ id: ID, stato: 'posted', post_date: '2026-10-03', url: null }), ok({ url: PERMALINK, stato: 'posted', post_date: '2026-10-03', updated_at: VERSIONE }))
      expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toMatchObject({ ok: true })
    }
    db.stato.chiamate.length = 0
    for (const ruolo of ['setter', 'closer', 'coach', 'nutrizione', 'dev']) {
      sessione.ruolo = ruolo
      for (const azione of [
        () => collegaPost({ shortcode: SHORTCODE, contenuto_id: ID }),
        () => scollegaPost({ shortcode: SHORTCODE, contenuto_id: ID }),
        () => annullaCollega({ shortcode: SHORTCODE, contenuto_id: ID }),
        () => annullaScollega({ shortcode: SHORTCODE, contenuto_id: ID }),
      ]) {
        expect(await azione()).toEqual({ ok: false, errore: 'Il calendario dei contenuti è dell’area Marketing.' })
      }
    }
    sessione.ruolo = 'marketing'
    sessione.attivo = false
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Sessione scaduta. Rientra e riprova.',
    })
    expect(chiamate('from')).toEqual([])
  })

  it('dati non validi: si fermano prima del database', async () => {
    expect(await collegaPost({ shortcode: 'a b', contenuto_id: ID })).toEqual({ ok: false, errore: 'Post non valido.' })
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: 'x' })).toEqual({ ok: false, errore: 'Contenuto non valido.' })
    expect(chiamate('from')).toEqual([])
  })
})

describe('collegaPost', () => {
  it('il permalink viene dal database, mai dall’input; sul contenuto Posted scrive solo l’URL', async () => {
    risponde(
      ok(POST),
      ok({ id: ID, stato: 'posted', post_date: '2026-10-02', url: null }),
      ok({ url: PERMALINK, stato: 'posted', post_date: '2026-10-02', updated_at: VERSIONE }),
    )
    const esito = await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID, permalink: 'https://evil.example/x' })
    expect(esito).toEqual({
      ok: true,
      versione: VERSIONE,
      url: PERMALINK,
      stato: 'posted',
      post_date: '2026-10-02',
      prima: { stato: 'posted', postDateScritta: false },
    })
    // the Post Date already there is never touched
    expect(chiamate('update')).toEqual([[{ url: PERMALINK }]])
    // only while the content still has no URL
    expect(chiamate('is')).toContainEqual(['url', null])
    expect(JSON.stringify(db.stato.chiamate)).not.toContain('evil.example')
  })

  it('«Collega e segna Posted» e la Post Date scritta solo se vuota', async () => {
    risponde(
      ok(POST),
      ok({ id: ID, stato: 'to_be_edited', post_date: null, url: null }),
      ok({ url: PERMALINK, stato: 'posted', post_date: '2026-10-03', updated_at: VERSIONE }),
    )
    const esito = await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })
    expect(esito).toMatchObject({ ok: true, stato: 'posted', post_date: '2026-10-03', prima: { stato: 'to_be_edited', postDateScritta: true } })
    expect(chiamate('update')).toEqual([[{ url: PERMALINK, stato: 'posted', post_date: '2026-10-03' }]])
    expect(chiamate('is')).toEqual([
      ['url', null],
      ['post_date', null],
    ])
  })

  it('una Post Date scritta intanto da un altro vince: si collega senza toccarla', async () => {
    risponde(
      ok(POST),
      ok({ id: ID, stato: 'posted', post_date: null, url: null }),
      // the first write finds the date set meanwhile
      ok(null),
      ok({ url: PERMALINK, stato: 'posted', post_date: '2026-10-05', updated_at: VERSIONE }),
    )
    const esito = await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })
    expect(esito).toMatchObject({ ok: true, post_date: '2026-10-05', prima: { postDateScritta: false } })
    expect(chiamate('update').at(-1)).toEqual([{ url: PERMALINK }])
  })

  it('le parole dei rifiuti: post già su un altro contenuto, contenuto con un post, post sparito o eliminato', async () => {
    risponde(ok(POST), ok({ id: ID, stato: 'posted', post_date: '2026-10-03', url: null }), {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo post è già collegato a un altro contenuto.',
    })

    risponde(ok(POST), ok({ id: ID, stato: 'posted', post_date: '2026-10-03', url: 'https://www.instagram.com/reel/Altro12345/' }))
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo contenuto ha già un post: aprilo e cambia l’URL se è un altro.',
    })

    risponde(ok(POST), ok(null))
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({ ok: false, errore: 'Questo contenuto non c’è più.' })

    risponde(ok({ ...POST, eliminato_il: '2026-10-08T03:00:00Z' }))
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo post non è più su Instagram.',
    })

    risponde(ok(null))
    expect(await collegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo post non c’è più: aggiorna da Instagram.',
    })
  })
})

describe('annullaCollega e scollegaPost', () => {
  it('annullaCollega: URL via, Status e Post Date com’erano, e il rifiuto appena scritto si toglie', async () => {
    risponde(ok({ id: ID }), ok(null), ok(null))
    const esito = await annullaCollega({ shortcode: SHORTCODE, contenuto_id: ID, prima: 'to_be_edited', post_date: '2026-10-03' })
    expect(esito).toEqual({ ok: true })
    expect(chiamate('update')).toEqual([[{ url: null, stato: 'to_be_edited' }], [{ post_date: null }]])
    // only while the content still has that post, and only the date this tap wrote
    expect(chiamate('eq')).toEqual(
      expect.arrayContaining([
        ['instagram_shortcode', SHORTCODE],
        ['post_date', '2026-10-03'],
      ]),
    )
    expect(chiamate('from')).toContainEqual(['marketing_abbinamenti_rifiutati'])
    expect(chiamate('delete')).toHaveLength(1)
    // the proposals of the run are not shown any more: a tap does not redo them
    expect(giro.ricalcola).not.toHaveBeenCalled()
  })

  it('scollegaPost: URL via solo se il contenuto ha ancora quel post, senza collegamenti automatici né proposte rifatte', async () => {
    risponde(ok({ updated_at: VERSIONE }))
    expect(await scollegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({ ok: true, versione: VERSIONE })
    expect(chiamate('update')).toEqual([[{ url: null }]])
    expect(chiamate('eq')).toContainEqual(['instagram_shortcode', SHORTCODE])
    // the sign «Collegato da solo» stays in the database: never read for the browser
    expect(chiamate('from')).not.toContainEqual(['marketing_abbinamenti'])
    expect(giro.ricalcola).not.toHaveBeenCalled()
  })

  it('scollegaPost: un altro post intanto, o già scollegato', async () => {
    risponde(ok(null), ok({ instagram_shortcode: 'Altro12345', updated_at: VERSIONE }))
    expect(await scollegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo contenuto ha già un altro post.',
    })
    risponde(ok(null), ok({ instagram_shortcode: null, updated_at: VERSIONE }))
    expect(await scollegaPost({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({ ok: true, versione: VERSIONE })
  })

  it('«Annulla» di «Scollega»: rimette il post con la sessione, e basta; il segno lo rimette il database', async () => {
    risponde(ok(POST), ok({ id: ID }))
    expect(await annullaScollega({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({ ok: true })
    expect(chiamate('update')).toEqual([[{ url: PERMALINK }]])
    // only while the content has no URL: a link made meanwhile wins
    expect(chiamate('is')).toContainEqual(['url', null])
    expect(chiamate('rpc')).toEqual([])
    expect(servizio.rpc).not.toHaveBeenCalled()
  })

  it('«Annulla» con un segno «Collegato da solo» mandato dal browser: ignorato, il service role non scrive niente', async () => {
    // a sign the server never issued (a link made by hand, a forged request): never written anywhere
    const segno = { punteggio: 100, somiglianza: 1, giorni: 0, motivi: ['stessa_data', 'didascalia_simile', 'unico_del_giorno'] }
    risponde(ok(POST), ok({ id: ID }))
    expect(await annullaScollega({ shortcode: SHORTCODE, contenuto_id: ID, automatico: segno })).toEqual({ ok: true })
    expect(chiamate('update')).toEqual([[{ url: PERMALINK }]])
    expect(chiamate('from')).not.toContainEqual(['marketing_abbinamenti'])
    expect(chiamate('rpc')).toEqual([])
    expect(servizio.rpc).not.toHaveBeenCalled()
    expect(giro.ricalcola).not.toHaveBeenCalled()
  })

  it('«Annulla» quando il contenuto ha già un altro URL: non scrive e lo dice', async () => {
    risponde(ok(POST), ok(null))
    expect(await annullaScollega({ shortcode: SHORTCODE, contenuto_id: ID })).toEqual({
      ok: false,
      errore: 'Questo contenuto ha già un post: aprilo e cambia l’URL se è un altro.',
    })
    expect(servizio.rpc).not.toHaveBeenCalled()
  })
})

// No screen uses them since 25/10/2026 (the lists «Da collegare», «Crea il contenuto», «Non va nel calendario» and
// «Rimetti» are gone): the core keeps the functions, and these tests keep them honest
describe('il nucleo: creaContenutoDaPost, escludiPost, rimettiPost', () => {
  const riproponi = vi.fn(async () => {})
  beforeEach(() => riproponi.mockClear())

  it('crea un contenuto Posted dal post, senza la bozza del reel, e rifà le proposte', async () => {
    risponde(ok(POST), ok({ id: ID, updated_at: VERSIONE }))
    expect(await operazioni.creaContenutoDaPost(db.client as never, { shortcode: SHORTCODE }, { riproponi })).toEqual({ ok: true, id: ID, versione: VERSIONE })
    expect(chiamate('insert')[0][0]).toEqual({
      tipo: 'reel',
      nome: 'Niente sbarra? Nessun problema.',
      stato: 'posted',
      post_date: '2026-10-03',
      url: PERMALINK,
      reel_type: null,
      formato: null,
      inspiration: null,
      audio: null,
      view_count: null,
      bozza: null,
    })
    expect(riproponi).toHaveBeenCalledTimes(1)
  })

  it('il post già su un altro contenuto (23505)', async () => {
    risponde(ok(POST), { data: null, error: { code: '23505', message: 'duplicate key' } })
    expect(await operazioni.creaContenutoDaPost(db.client as never, { shortcode: SHORTCODE })).toEqual({
      ok: false,
      errore: 'Questo post è già collegato a un altro contenuto.',
    })
  })

  it('escludi: mai un post collegato; due tocchi sono uno', async () => {
    risponde(ok({ id: ID }))
    expect(await operazioni.escludiPost(db.client as never, { shortcode: SHORTCODE })).toEqual({ ok: false, errore: 'Questo post è collegato: scollegalo prima.' })
    expect(chiamate('insert')).toEqual([])

    risponde(ok(null), ok(null))
    expect(await operazioni.escludiPost(db.client as never, { shortcode: SHORTCODE })).toEqual({ ok: true })
    expect(chiamate('insert')).toEqual([[{ shortcode: SHORTCODE }]])

    risponde(ok(null), { data: null, error: { code: '23505', message: 'duplicate key' } })
    expect(await operazioni.escludiPost(db.client as never, { shortcode: SHORTCODE })).toEqual({ ok: true })
  })

  it('rimetti: toglie l’esclusione e rifà le proposte', async () => {
    risponde(ok(null))
    expect(await operazioni.rimettiPost(db.client as never, { shortcode: SHORTCODE }, { riproponi })).toEqual({ ok: true })
    expect(chiamate('from')).toEqual([['marketing_post_esclusi']])
    expect(chiamate('delete')).toHaveLength(1)
    expect(riproponi).toHaveBeenCalledTimes(1)
  })
})

describe('la route di «Aggiorna da Instagram»', () => {
  function richiesta(origine: string | null = 'http://localhost:3000') {
    const headers: Record<string, string> = { 'x-forwarded-host': 'localhost:3000' }
    if (origine) headers.origin = origine
    return new NextRequest('http://localhost:3000/api/marketing/instagram/aggiorna', { method: 'POST', headers })
  }

  it('l’admin e il marketing; mai il video editor, il setter, un account disattivato o un altro sito', async () => {
    giro.aggiorna.mockResolvedValue({
      esito: 'ok',
      letti: 52,
      nuovi: 2,
      eliminati: 0,
      scartati: 0,
      collegati: 3,
      proposti: 5,
      campi: 'completi',
      errore: null,
      causa: null,
    })
    for (const ruolo of ['admin', 'marketing']) {
      sessione.ruolo = ruolo
      const r = await aggiornaRoute(richiesta())
      expect(r.status).toBe(200)
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(await r.json()).toEqual({ esito: 'ok', letti: 52, collegati: 3, proposti: 5, campi: 'completi', errore: null })
    }
    expect(giro.aggiorna).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'manuale', db: { ruolo: 'service_role' } }))

    for (const ruolo of ['editor', 'setter', 'closer']) {
      sessione.ruolo = ruolo
      const r = await aggiornaRoute(richiesta())
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ errore: 'Aggiorna da Instagram lo usano l’admin e il marketing.' })
    }
    sessione.ruolo = 'admin'
    sessione.attivo = false
    expect((await aggiornaRoute(richiesta())).status).toBe(403)
    sessione.attivo = true
    expect((await aggiornaRoute(richiesta('https://evil.example'))).status).toBe(403)
    expect((await aggiornaRoute(richiesta(null))).status).toBe(403)
    expect(giro.aggiorna).toHaveBeenCalledTimes(2)
  })

  it('appena fatto o in corso: la frase e il rifiuto, mai un token o una didascalia', async () => {
    sessione.ruolo = 'marketing'
    giro.aggiorna.mockResolvedValue({
      esito: 'fallito',
      letti: 0,
      nuovi: 0,
      eliminati: 0,
      scartati: 0,
      collegati: 0,
      proposti: 0,
      campi: null,
      errore: 'Aggiornato alle 06:12: riprova tra 3 minuti.',
      causa: null,
      rifiutato: 'appena_fatto',
      dal: '2026-10-09T04:12:00Z',
    })
    const r = await aggiornaRoute(richiesta())
    const corpo = await r.json()
    expect(corpo).toEqual({
      esito: 'fallito',
      letti: 0,
      collegati: 0,
      proposti: 0,
      campi: null,
      errore: 'Aggiornato alle 06:12: riprova tra 3 minuti.',
      rifiutato: 'appena_fatto',
      dal: '2026-10-09T04:12:00Z',
    })
    expect(JSON.stringify(corpo)).not.toMatch(/IGAA|access_token|didascalia|permalink/)
  })
})
