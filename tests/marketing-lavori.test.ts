import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const leggiReel = vi.fn()
const analizzaReel = vi.fn()
vi.mock('@/lib/marketing/video/leggi', () => ({ leggiReel: (...a: unknown[]) => leggiReel(...a) }))
vi.mock('@/lib/marketing/analisi/analizza', () => ({ analizzaReel: (...a: unknown[]) => analizzaReel(...a) }))

import { NextRequest } from 'next/server'

import { autorizzato } from '@/lib/cron/chiave-passo'
import { contatoriDa, eseguiPassoMarketing } from '@/lib/marketing/lavori/esegui'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'

const USO = { input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 400 }

function dbConRpc(risposta: { error: { code?: string } | null } = { error: null }) {
  const rpc = vi.fn(async () => risposta)
  return { db: { rpc } as unknown as AdminClient, rpc }
}

beforeEach(() => {
  leggiReel.mockReset()
  analizzaReel.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('eseguiPassoMarketing', () => {
  it('una lettura chiude il passo con i token e i secondi d’audio arrotondati', async () => {
    leggiReel.mockResolvedValue({ esito: 'ok', uso: USO, secondiAudio: 41.6 })
    const { db, rpc } = dbConRpc()
    const r = await eseguiPassoMarketing({ db, passo: 'p1', cosa: 'lettura', rif: 'm1', entro: Date.now() + 1000 })
    expect(r.esito).toBe('ok')
    expect(rpc).toHaveBeenCalledWith('marketing_passo_finito', {
      p_passo: 'p1',
      p_esito: 'ok',
      p_contatori: { input: 1000, cache_scritti: 200, cache_letti: 300, output: 400, secondi_audio: 42 },
    })
    expect(analizzaReel).not.toHaveBeenCalled()
  })

  it('un’analisi non porta audio', async () => {
    analizzaReel.mockResolvedValue({ esito: 'parziale', uso: USO })
    const { db, rpc } = dbConRpc()
    const r = await eseguiPassoMarketing({ db, passo: 'p2', cosa: 'analisi', rif: 'a1', entro: Date.now() + 1000 })
    expect(r.esito).toBe('parziale')
    expect(rpc).toHaveBeenCalledWith('marketing_passo_finito', expect.objectContaining({ p_esito: 'parziale', p_contatori: expect.objectContaining({ secondi_audio: 0 }) }))
  })

  it('un limite del fornitore arriva al database così com’è (non rimanda subito il prossimo)', async () => {
    leggiReel.mockResolvedValue({ esito: 'limite_fornitore', uso: USO, secondiAudio: 0 })
    const { db, rpc } = dbConRpc()
    await eseguiPassoMarketing({ db, passo: 'p3', cosa: 'lettura', rif: 'm1', entro: Date.now() + 1000 })
    expect(rpc).toHaveBeenCalledWith('marketing_passo_finito', expect.objectContaining({ p_esito: 'limite_fornitore' }))
  })

  it('un’eccezione dentro il passo è un esito fallito e il passo si chiude lo stesso, senza il testo dell’errore nei log', async () => {
    leggiReel.mockRejectedValue(new Error('url firmato https://scontent.cdninstagram.com/segreto'))
    const { db, rpc } = dbConRpc()
    const r = await eseguiPassoMarketing({ db, passo: 'p4', cosa: 'lettura', rif: 'm1', entro: Date.now() + 1000 })
    expect(r.esito).toBe('fallito')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('segreto')
  })

  it('un database che non risponde non fa lanciare il passo', async () => {
    leggiReel.mockResolvedValue({ esito: 'ok', uso: USO, secondiAudio: 0 })
    const rpc = vi.fn(async () => {
      throw new Error('rete')
    })
    await expect(eseguiPassoMarketing({ db: { rpc } as unknown as AdminClient, passo: 'p5', cosa: 'lettura', rif: 'm1', entro: Date.now() + 1000 })).resolves.toMatchObject({ esito: 'ok' })
  })

  it('contatoriDa: audio mai negativo', () => {
    expect(contatoriDa(USO, -3).secondi_audio).toBe(0)
  })
})

describe('autorizzato', () => {
  const richiesta = (bearer?: string) => new NextRequest('http://localhost/api/cron/marketing', { method: 'POST', headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
  const dbChiave = (valore: unknown) => ({ rpc: vi.fn(async () => ({ data: valore, error: null })) }) as never

  it('senza Bearer no, e senza leggere il Vault', async () => {
    const db = dbChiave('chiave-del-vault')
    expect(await autorizzato(richiesta(), db)).toBe(false)
    expect((db as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })

  it('CRON_SECRET vale; una chiave sbagliata no', async () => {
    vi.stubEnv('CRON_SECRET', 'segreto-di-prova')
    expect(await autorizzato(richiesta('segreto-di-prova'), dbChiave(null))).toBe(true)
    expect(await autorizzato(richiesta('altro'), dbChiave(null))).toBe(false)
    vi.unstubAllEnvs()
  })

  it('la chiave del Vault vale, anche ruotata: si rilegge prima di rifiutare', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(await autorizzato(richiesta('chiave-uno'), dbChiave('chiave-uno'))).toBe(true)
    // the cache holds chiave-uno: the rotated one is read again at once
    expect(await autorizzato(richiesta('chiave-due'), dbChiave('chiave-due'))).toBe(true)
    expect(await autorizzato(richiesta('chiave-tre'), dbChiave('chiave-due'))).toBe(false)
    vi.unstubAllEnvs()
  })

  it('un Vault vuoto o che dà errore non autorizza nessuno', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(await autorizzato(richiesta('x'), dbChiave('   '))).toBe(false)
    const rotto = { rpc: vi.fn(async () => ({ data: null, error: { code: '42501' } })) } as never
    expect(await autorizzato(richiesta('x'), rotto)).toBe(false)
    vi.unstubAllEnvs()
  })
})
