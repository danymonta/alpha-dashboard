import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The local dev login brings the person back where they were going, as the
 * Google login does (09/10/2026: the consent page of Claude's connection must
 * come back with its authorization_id after the login). Only paths of this app.
 */

class Redirezione extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Redirezione(url)
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/auth/origine-server', () => ({ origineCorrente: vi.fn() }))
vi.mock('@/lib/auth/dev-login', () => ({ isDevLoginEnabled: () => true }))

const accesso = vi.hoisted(() => ({ errore: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: async () => ({ error: accesso.errore }) },
  })),
}))

import { accediConPassword } from '@/app/login/actions'

function modulo(): FormData {
  const f = new FormData()
  f.set('email', 'marketing@alpha.test')
  f.set('password', 'prova')
  return f
}

async function dove(da: unknown): Promise<string | { errore?: string }> {
  try {
    return await accediConPassword(da as string, {}, modulo())
  } catch (e) {
    if (e instanceof Redirezione) return e.url
    throw e
  }
}

beforeEach(() => {
  accesso.errore = null
})

describe('il login di sviluppo torna dove stavi andando', () => {
  it('la pagina di consenso, con la sua query', async () => {
    expect(await dove('/oauth/consent?authorization_id=aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE')).toBe(
      '/oauth/consent?authorization_id=aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE',
    )
  })

  it.each([
    ['nessuna destinazione', '/'],
    ['un altro sito', '//evil.example.com'],
    ['un indirizzo assoluto', 'https://evil.example.com/'],
    ['il login stesso', '/login?da=/x'],
    ['un valore che non è un testo', 42],
  ])('%s: la home', async (_, da) => {
    expect(await dove(da)).toBe('/')
  })

  it('credenziali sbagliate: nessun redirect', async () => {
    accesso.errore = { message: 'Invalid login credentials' }
    expect(await dove('/oauth/consent?authorization_id=x')).toEqual({ errore: 'Credenziali non valide.' })
  })
})
