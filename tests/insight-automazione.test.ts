import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Who taps: negaSeNon (lib/auth/azioni.ts) reads the profile
const sessione = vi.hoisted(() => ({ ruolo: 'admin', attivo: true }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => ({ id: 'p1', ...sessione })) }))

// A fake PostgREST client: the RPC calls recorded, every call takes the next answer in line
type Errore = { code?: string; message: string }
const db = vi.hoisted(() => {
  const stato = {
    risposte: [] as { data: unknown; error: Errore | null }[],
    chiamate: [] as [string, unknown][],
  }
  const client = {
    rpc: (nome: string, args: unknown) => {
      stato.chiamate.push([nome, args])
      return Promise.resolve(stato.risposte.shift() ?? { data: null, error: null })
    },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db.client) }))
// the service role writes the step address (salvaUrlPasso): recorded apart from the session's calls
const servizio = vi.hoisted(() => ({ chiamate: [] as [string, unknown][], errore: null as { code: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (nome: string, args: unknown) => {
      servizio.chiamate.push([nome, args])
      return Promise.resolve({ data: null, error: servizio.errore })
    },
  }),
}))

import { revalidatePath } from 'next/cache'

import { salvaAutomazione } from '@/app/(app)/insight/automazione-actions'
import {
  argomentiAutomazioneSchema,
  automazioneSchema,
  PASSO_MINUTI_AUTOMAZIONE,
  URL_PASSO_MANCANTE,
} from '@/lib/validation/insight'

const URL_LOCALE = 'http://host.docker.internal:3200/api/cron/insight'

beforeEach(() => {
  for (const nome of ['VERCEL_ENV', 'ANTHROPIC_API_KEY', 'INSIGHT_URL_PASSO', 'NEXT_PUBLIC_APP_URL']) vi.stubEnv(nome, '')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-prova')
  sessione.ruolo = 'admin'
  sessione.attivo = true
  db.stato.risposte = []
  db.stato.chiamate = []
  servizio.chiamate = []
  servizio.errore = null
  vi.mocked(revalidatePath).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lo schema dell’automazione', () => {
  it('«Pronto alle» a passi di 5 minuti, come lo step="300" dell’artefatto', () => {
    expect(PASSO_MINUTI_AUTOMAZIONE).toBe(5)
    expect(automazioneSchema.parse({ attiva: true, ora: '19:05' })).toEqual({ attiva: true, ora: '19:05' })
    // the browser's time input may send the seconds
    expect(automazioneSchema.parse({ attiva: false, ora: '07:00:00' })).toEqual({ attiva: false, ora: '07:00' })
    expect(automazioneSchema.safeParse({ attiva: true, ora: '19:07' }).success).toBe(false)
    expect(automazioneSchema.safeParse({ attiva: true, ora: '24:00' }).success).toBe(false)
    expect(automazioneSchema.safeParse({ attiva: true, ora: '' }).success).toBe(false)
    expect(automazioneSchema.safeParse({ attiva: 'sì', ora: '19:00' }).success).toBe(false)
  })

  it('l’indirizzo dei passi serve solo per accenderla', () => {
    expect(argomentiAutomazioneSchema.safeParse({ p_attivo: true, p_ora: '19:00', p_url: URL_LOCALE }).success).toBe(true)
    expect(argomentiAutomazioneSchema.safeParse({ p_attivo: false, p_ora: '19:00', p_url: null }).success).toBe(true)
    const senza = argomentiAutomazioneSchema.safeParse({ p_attivo: true, p_ora: '19:00', p_url: null })
    expect(senza.success).toBe(false)
    expect(senza.error?.issues[0]?.message).toBe(URL_PASSO_MANCANTE)
  })
})

describe('salvaAutomazione', () => {
  it('salva con l’indirizzo costruito sul server e aggiorna l’Insight e le impostazioni', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    const esito = await salvaAutomazione({ attiva: true, ora: '19:05' })
    expect(esito).toEqual({ ok: true, avviso: null })
    // the session sets the switch and the time, never the address: the server writes it with the service role
    expect(db.stato.chiamate).toEqual([['insight_imposta_automazione', { p_attivo: true, p_ora: '19:05' }]])
    expect(servizio.chiamate).toEqual([['insight_imposta_url', { p_url: URL_LOCALE }]])
    expect(vi.mocked(revalidatePath).mock.calls.map((c) => c[0])).toEqual(['/insight', '/settings/instagram'])
  })

  it('in produzione l’indirizzo è APP_URL in https, mai quello locale', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dashboard.percorsoalpha.com')
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({ ok: true, avviso: null })
    expect(db.stato.chiamate[0]?.[1]).toEqual({ p_attivo: true, p_ora: '19:00' })
    expect(servizio.chiamate).toEqual([['insight_imposta_url', { p_url: 'https://dashboard.percorsoalpha.com/api/cron/insight' }]])
  })

  it('se l’indirizzo non si salva non la accende e lo dice', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    servizio.errore = { code: 'XX000' }
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({ ok: false, errore: 'Indirizzo dell’app non salvato. Riprova.' })
    expect(db.stato.chiamate).toEqual([])
  })

  it('senza un indirizzo valido non la accende e non chiama niente', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://dashboard.percorsoalpha.com')
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({ ok: false, errore: URL_PASSO_MANCANTE })
    expect(db.stato.chiamate).toEqual([])
    expect(servizio.chiamate).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('spegnerla non chiede l’indirizzo', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://dashboard.percorsoalpha.com')
    expect(await salvaAutomazione({ attiva: false, ora: '19:00' })).toEqual({ ok: true, avviso: null })
    expect(db.stato.chiamate).toEqual([['insight_imposta_automazione', { p_attivo: false, p_ora: '19:00' }]])
    expect(servizio.chiamate).toEqual([])
  })

  it('in locale coi passi manuali non la accende, e dice perché', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', 'manuale')
    const esito = await salvaAutomazione({ attiva: true, ora: '19:00' })
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errore).toContain('INSIGHT_URL_PASSO=manuale')
    expect(db.stato.chiamate).toEqual([])
    // off, it saves
    expect((await salvaAutomazione({ attiva: false, ora: '19:00' })).ok).toBe(true)
  })

  it('senza ANTHROPIC_API_KEY salva lo stesso, e il toast lo dice', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({
      ok: true,
      avviso: 'Manca ANTHROPIC_API_KEY su Vercel: finché non c’è, il recap automatico non parte.',
    })
    // off, nothing to warn about
    expect(await salvaAutomazione({ attiva: false, ora: '19:00' })).toEqual({ ok: true, avviso: null })
    expect(db.stato.chiamate).toHaveLength(2)
  })

  it('solo l’admin: il setter e un account disattivato non arrivano al database', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    sessione.ruolo = 'setter'
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({
      ok: false,
      errore: 'Solo l’admin imposta l’automazione.',
    })
    sessione.ruolo = 'admin'
    sessione.attivo = false
    expect((await salvaAutomazione({ attiva: true, ora: '19:00' })).ok).toBe(false)
    expect(db.stato.chiamate).toEqual([])
  })

  it('un orario fuori dai passi non arriva al database', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    const esito = await salvaAutomazione({ attiva: true, ora: '19:03' })
    expect(esito).toEqual({ ok: false, errore: 'Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.' })
    expect(db.stato.chiamate).toEqual([])
  })

  it('le frasi del database passano come sono, gli altri errori diventano una frase', async () => {
    vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
    db.stato.risposte.push({ data: null, error: { code: '22023', message: 'Indirizzo dell’app non valido.' } })
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({ ok: false, errore: 'Indirizzo dell’app non valido.' })
    db.stato.risposte.push({ data: null, error: { code: 'XX000', message: 'boom' } })
    expect(await salvaAutomazione({ attiva: true, ora: '19:00' })).toEqual({
      ok: false,
      errore: 'Automazione non salvata. Riprova.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
