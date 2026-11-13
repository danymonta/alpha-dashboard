import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The answers of /entra and /login never tell who has an account (release B1a): the same
 * sentence after the same time for a client, a person of the team and a stranger, without
 * waiting for the email (a slow Resend); a code typed on /entra for an address that received
 * none never reaches Supabase.
 */

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const stato = vi.hoisted(() => ({
  dopo: [] as (() => Promise<void>)[],
  account: new Map<string, { user_id: string; stato: string; nome: string }>(),
  invii: new Set<string>(),
  conta: [] as [string, string][],
  verifyOtp: 0,
  signInWithOtp: 0,
  generateLink: 0,
  email: 0,
  ip: null as string | null,
  ipBloccato: false,
}))

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (lavoro: () => Promise<void>) => {
    stato.dopo.push(lavoro)
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost:3000', ...(stato.ip ? { 'x-forwarded-for': stato.ip } : {}) }),
}))
vi.mock('@/lib/auth/origine-server', () => ({ origineCorrente: async () => 'http://localhost:3000' }))
vi.mock('@/lib/email/invia', () => ({
  inviaEmail: async () => {
    stato.email++
    // Resend slow: 8 seconds
    await new Promise((r) => setTimeout(r, 8000))
    return { inviata: true }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (nome: string, args: Record<string, string>) => {
      if (nome === 'cliente_accesso_per_email') {
        const a = stato.account.get(args.p_email)
        return { data: a ? [a] : [], error: null }
      }
      if (nome === 'accesso_ip_conta') {
        stato.conta.push([`ip:${args.p_ip}`, args.p_tipo])
        return { data: !stato.ipBloccato, error: null }
      }
      if (nome === 'cliente_accesso_conta') {
        stato.conta.push([args.p_email, args.p_tipo])
        if (args.p_tipo === 'invio' || args.p_tipo === 'invio_team') {
          stato.invii.add(args.p_email)
          return { data: true, error: null }
        }
        if (args.p_tipo === 'verifica') return { data: stato.invii.has(args.p_email), error: null }
        return { data: true, error: null }
      }
      return { data: null, error: { code: 'x' } }
    },
    auth: {
      admin: {
        generateLink: async ({ email }: { email: string }) => {
          stato.generateLink++
          return { data: { user: { id: stato.account.get(email)?.user_id, email }, properties: { email_otp: '12345678' } }, error: null }
        },
      },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  COOKIE_SESSIONE: /^sb-.+-auth-token(\.\d+)?$/,
  createClient: async () => ({
    auth: {
      signInWithOtp: async () => {
        stato.signInWithOtp++
        return { error: null }
      },
      verifyOtp: async () => {
        stato.verifyOtp++
        return { error: { code: 'otp_expired', status: 403 } }
      },
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({ error: null }),
    },
  }),
}))

import { chiediCodiceCliente, verificaCodiceCliente } from '@/app/entra/actions'
import { richiediCodice, verificaCodice } from '@/app/login/actions'
import { ipDaIntestazioni } from '@/lib/percorso/accesso'

beforeEach(() => {
  stato.dopo = []
  stato.account = new Map([['cliente@example.test', { user_id: 'u-cliente', stato: 'attivo', nome: 'Mario' }]])
  stato.invii = new Set()
  stato.conta = []
  stato.verifyOtp = 0
  stato.signInWithOtp = 0
  stato.generateLink = 0
  stato.email = 0
  stato.ip = null
  stato.ipBloccato = false
})

async function tempo(f: () => Promise<unknown>): Promise<[number, unknown]> {
  const inizio = Date.now()
  const r = await f()
  return [Date.now() - inizio, r]
}

describe('/entra: la stessa risposta nello stesso tempo', () => {
  it('cliente, team e sconosciuto: 1,2 secondi, la stessa frase, l’email dopo la risposta', async () => {
    const tempi: number[] = []
    for (const email of ['cliente@example.test', 'admin@alpha.test', 'nessuno@example.test']) {
      const [ms, r] = await tempo(() => chiediCodiceCliente({ email }))
      expect(r).toEqual({ ok: true })
      tempi.push(ms)
    }
    for (const ms of tempi) {
      expect(ms).toBeGreaterThanOrEqual(1190)
      expect(ms).toBeLessThan(1600)
    }
    // the code only for the client, and only after the answer
    expect(stato.dopo).toHaveLength(1)
    expect(stato.generateLink).toBe(0)
    await stato.dopo[0]()
    expect(stato.generateLink).toBe(1)
    expect(stato.email).toBe(1)
  }, 20_000)

  it('un account chiuso: nessun invio', async () => {
    stato.account.set('chiuso@example.test', { user_id: 'u2', stato: 'chiuso', nome: 'Luca' })
    expect(await chiediCodiceCliente({ email: 'chiuso@example.test' })).toEqual({ ok: true })
    expect(stato.dopo).toHaveLength(0)
  })
})

describe('/entra: il codice', () => {
  it('per un’email senza un invio non chiama mai Supabase', async () => {
    const [ms, r] = await tempo(() => verificaCodiceCliente({ email: 'admin@alpha.test', codice: '12345678' }))
    expect(r).toEqual({ ok: false, errore: 'Il codice non è corretto o è scaduto.' })
    expect(stato.verifyOtp).toBe(0)
    // stopped before Supabase: nothing counted (an address with no code never blocks the others)
    expect(stato.conta).not.toContainEqual(['admin@alpha.test', 'errore'])
    expect(ms).toBeGreaterThanOrEqual(1190)
  })

  it('dopo un invio sì, e un codice sbagliato conta un errore', async () => {
    await chiediCodiceCliente({ email: 'cliente@example.test' })
    const r = await verificaCodiceCliente({ email: 'cliente@example.test', codice: '00000000' })
    expect(r).toEqual({ ok: false, errore: 'Il codice non è corretto o è scaduto.' })
    expect(stato.verifyOtp).toBe(1)
    expect(stato.conta.filter(([, t]) => t === 'errore')).toHaveLength(1)
  })
})

describe('/login: un cliente riceve la mail del cliente, sempre in 2 secondi', () => {
  it('cliente, team e sconosciuto: la stessa risposta nello stesso tempo; mai la mail del team al cliente', async () => {
    const tempi: number[] = []
    for (const email of ['cliente@example.test', 'admin@alpha.test', 'nessuno@example.test']) {
      const [ms, r] = await tempo(() => richiediCodice({ email, da: '/' }))
      expect(r).toEqual({ ok: true })
      tempi.push(ms)
    }
    for (const ms of tempi) {
      expect(ms).toBeGreaterThanOrEqual(1990)
      expect(ms).toBeLessThan(2400)
    }
    // the team's road for the two that are not clients, the client's email after the answer
    expect(stato.signInWithOtp).toBe(2)
    expect(stato.dopo).toHaveLength(1)
    expect(stato.email).toBe(0)
  }, 20_000)
})

describe('il limite per IP, prima di ogni strada', () => {
  it('legge l’IP di Vercel, mai quello di questa macchina', () => {
    expect(ipDaIntestazioni(new Headers({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(ipDaIntestazioni(new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe('198.51.100.9')
    expect(ipDaIntestazioni(new Headers({ 'x-forwarded-for': '::1' }))).toBeNull()
    expect(ipDaIntestazioni(new Headers({ 'x-forwarded-for': '127.0.0.1' }))).toBeNull()
    expect(ipDaIntestazioni(new Headers())).toBeNull()
  })

  it('/entra e /login: «troppi tentativi» uguale per tutti, senza leggere l’account', async () => {
    stato.ip = '203.0.113.7'
    stato.ipBloccato = true
    for (const email of ['cliente@example.test', 'nessuno@example.test']) {
      expect(await chiediCodiceCliente({ email })).toEqual({ ok: false, errore: 'Troppi tentativi. Aspetta qualche minuto e riprova.' })
      const login = await richiediCodice({ email, da: '/' })
      expect(login.ok).toBe(false)
    }
    expect(stato.conta.every(([chiave]) => chiave.startsWith('ip:'))).toBe(true)
    expect(stato.signInWithOtp).toBe(0)
    expect(await verificaCodiceCliente({ email: 'cliente@example.test', codice: '12345678' })).toMatchObject({ ok: false })
    expect(await verificaCodice({ email: 'admin@alpha.test', codice: '12345678', da: '/' })).toMatchObject({ ok: false })
    expect(stato.verifyOtp).toBe(0)
  }, 20_000)
})

describe('/login: il codice del team', () => {
  it('senza un codice partito da /login non chiama mai Supabase', async () => {
    expect(await verificaCodice({ email: 'admin@alpha.test', codice: '12345678', da: '/' })).toMatchObject({ ok: false })
    expect(stato.verifyOtp).toBe(0)
  })

  it('dopo la richiesta sì, e un codice sbagliato conta un errore', async () => {
    await richiediCodice({ email: 'admin@alpha.test', da: '/' })
    expect(stato.conta).toContainEqual(['admin@alpha.test', 'invio_team'])
    await verificaCodice({ email: 'admin@alpha.test', codice: '12345678', da: '/' })
    expect(stato.verifyOtp).toBe(1)
    expect(stato.conta).toContainEqual(['admin@alpha.test', 'errore'])
  }, 20_000)
})
