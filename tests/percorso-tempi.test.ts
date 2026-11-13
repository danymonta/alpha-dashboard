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
}))

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (lavoro: () => Promise<void>) => {
    stato.dopo.push(lavoro)
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost:3000' }),
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
      if (nome === 'cliente_accesso_conta') {
        stato.conta.push([args.p_email, args.p_tipo])
        if (args.p_tipo === 'invio') {
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
import { richiediCodice } from '@/app/login/actions'

beforeEach(() => {
  stato.dopo = []
  stato.account = new Map([['cliente@example.test', { user_id: 'u-cliente', stato: 'attivo', nome: 'Mario' }]])
  stato.invii = new Set()
  stato.conta = []
  stato.verifyOtp = 0
  stato.signInWithOtp = 0
  stato.generateLink = 0
  stato.email = 0
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
    expect(stato.conta).toContainEqual(['admin@alpha.test', 'errore'])
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
