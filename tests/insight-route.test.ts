import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// The route of the Insight's steps (1.35.0): the key, the body, the
// configuration, the lease; the step itself is never run here.

const rpc = vi.fn()
const after = vi.fn()
const eseguiPasso = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/insight/esecuzione', () => ({ TEMPO_PASSO_MS: 240_000, eseguiPasso: (...a: unknown[]) => eseguiPasso(...a) }))
vi.mock('next/server', async (originale) => ({ ...(await originale<typeof import('next/server')>()), after: (fn: () => unknown) => after(fn) }))

const ID = '4f6c2d8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f'
let chiave = 'chiave-dei-passi-di-prova'
let lease: unknown[] = [{ passo: 'lettura', giorno: '2026-10-14', motivo: 'manuale', progresso: {} }]

async function chiama(opzioni: { auth?: string | null; corpo?: unknown; testo?: string } = {}) {
  const { POST } = await import('@/app/api/cron/insight/route')
  const { NextRequest } = await import('next/server')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (opzioni.auth !== null) headers.set('authorization', opzioni.auth ?? `Bearer ${chiave}`)
  const body = opzioni.testo ?? JSON.stringify(opzioni.corpo ?? { esecuzione: ID })
  return POST(new NextRequest('http://localhost:3200/api/cron/insight', { method: 'POST', headers, body }))
}

const chiamateRpc = (nome: string) => rpc.mock.calls.filter(([n]) => n === nome)

beforeEach(() => {
  vi.resetModules()
  rpc.mockReset()
  after.mockReset()
  eseguiPasso.mockReset()
  chiave = 'chiave-dei-passi-di-prova'
  lease = [{ passo: 'lettura', giorno: '2026-10-14', motivo: 'manuale', progresso: {} }]
  vi.stubEnv('ANTHROPIC_API_KEY', 'finta')
  vi.stubEnv('CRON_SECRET', 'segreto-del-cron')
  rpc.mockImplementation(async (nome: string) => {
    if (nome === 'insight_chiave') return { data: chiave, error: null }
    if (nome === 'insight_prendi_passo') return { data: lease, error: null }
    if (nome === 'insight_fallita') return { data: true, error: null }
    return { data: null, error: { code: 'XX000' } }
  })
  eseguiPasso.mockResolvedValue({ ok: true, prossimo: 'analisi', progresso: {}, avvisi: [], contatori: {} })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/cron/insight', () => {
  it('una chiave sbagliata, o nessuna, dà 401 e non prende il passo', async () => {
    expect((await chiama({ auth: 'Bearer sbagliata' })).status).toBe(401)
    expect((await chiama({ auth: null })).status).toBe(401)
    expect((await chiama({ auth: chiave })).status).toBe(401)
    expect(chiamateRpc('insight_prendi_passo')).toHaveLength(0)
    expect(after).not.toHaveBeenCalled()
  })

  it('con la chiave dei passi: 202, il passo preso con un lease di 330 secondi, il lavoro in after()', async () => {
    const r = await chiama()
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ ok: true, passo: 'lettura' })
    expect(chiamateRpc('insight_prendi_passo')).toEqual([['insight_prendi_passo', { p_esecuzione: ID, p_secondi: 330 }]])
    expect(after).toHaveBeenCalledTimes(1)
    expect(eseguiPasso).not.toHaveBeenCalled()
    const prima = Date.now()
    await after.mock.calls[0][0]()
    const op = eseguiPasso.mock.calls[0][0]
    expect(op).toMatchObject({ esecuzione: ID, passo: 'lettura', giorno: '2026-10-14', motivo: 'manuale', progresso: {} })
    // the step's budget: 240 seconds from the request
    expect(op.entro).toBeGreaterThan(prima + 239_000)
    expect(op.entro).toBeLessThanOrEqual(Date.now() + 240_000)
  })

  it('accetta CRON_SECRET (una chiamata a mano, gli e2e)', async () => {
    rpc.mockImplementation(async (nome: string) => {
      if (nome === 'insight_prendi_passo') return { data: lease, error: null }
      return { data: null, error: { code: 'XX000' } }
    })
    expect((await chiama({ auth: 'Bearer segreto-del-cron' })).status).toBe(202)
  })

  it('una chiave ruotata vale subito: rilegge il Vault una volta prima di rifiutare', async () => {
    const { POST } = await import('@/app/api/cron/insight/route')
    const { NextRequest } = await import('next/server')
    const richiesta = (k: string) =>
      new NextRequest('http://localhost:3200/api/cron/insight', {
        method: 'POST',
        headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
        body: JSON.stringify({ esecuzione: ID }),
      })
    expect((await POST(richiesta('chiave-dei-passi-di-prova'))).status).toBe(202)
    expect(chiamateRpc('insight_chiave')).toHaveLength(1)
    // in cache: no new reading
    expect((await POST(richiesta('chiave-dei-passi-di-prova'))).status).toBe(202)
    expect(chiamateRpc('insight_chiave')).toHaveLength(1)
    // rotated: the cached one does not match, Vault is read once more
    chiave = 'chiave-nuova-dopo-la-rotazione'
    expect((await POST(richiesta('chiave-nuova-dopo-la-rotazione'))).status).toBe(202)
    expect(chiamateRpc('insight_chiave')).toHaveLength(2)
    // the old one is refused after one more reading
    expect((await POST(richiesta('chiave-dei-passi-di-prova'))).status).toBe(401)
    expect(chiamateRpc('insight_chiave')).toHaveLength(3)
  })

  it('un corpo sbagliato dà 400', async () => {
    expect((await chiama({ corpo: { esecuzione: 'non-un-uuid' } })).status).toBe(400)
    expect((await chiama({ corpo: {} })).status).toBe(400)
    expect((await chiama({ testo: '{rotto' })).status).toBe(400)
    expect(chiamateRpc('insight_prendi_passo')).toHaveLength(0)
  })

  it('senza ANTHROPIC_API_KEY: 503 e l’esecuzione fallisce con la sua frase', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '  ')
    const r = await chiama()
    expect(r.status).toBe(503)
    expect(chiamateRpc('insight_fallita')).toEqual([
      ['insight_fallita', { p_esecuzione: ID, p_errore: 'Insight non configurato: manca ANTHROPIC_API_KEY su Vercel.' }],
    ])
    expect(chiamateRpc('insight_prendi_passo')).toHaveLength(0)
  })

  it('un passo già preso, o un’esecuzione finita, dà 409', async () => {
    lease = []
    expect((await chiama()).status).toBe(409)
    expect(after).not.toHaveBeenCalled()
  })

  it('un errore del database nel prendere il passo dà 500, senza dire perché', async () => {
    rpc.mockImplementation(async (nome: string) => {
      if (nome === 'insight_chiave') return { data: chiave, error: null }
      return { data: null, error: { code: 'XX000', message: 'dettagli interni' } }
    })
    const r = await chiama()
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('dettagli')
  })
})
