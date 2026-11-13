import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'https://progetto.supabase.co', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

/** The session of the request: null, a person of the team, a client of the path. */
const sessione = vi.hoisted(() => ({ utente: null as null | { id: string; app_metadata: Record<string, unknown> } }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessione.utente } }) } }),
}))

import { decidi, politicaCsp } from '@/lib/auth/proxy-regole'
import { updateSession } from '@/lib/supabase/middleware'

/*
 * The proxy of release B1a (docs/onboarding/rilascio-b.md, «Autenticazione»): it never reads
 * the database, it decides from app_metadata.tipo; a client stays in its area; the client's
 * pages carry a Content-Security-Policy with a fresh nonce. The team's sign-in is tested in
 * tests/proxy-accesso.test.ts, unchanged.
 */

const TEAM = { id: 't1', app_metadata: { provider: 'google' } }
const CLIENTE = { id: 'c1', app_metadata: { tipo: 'cliente' } }

async function richiesta(percorso: string, metodo = 'GET') {
  return updateSession(new NextRequest(`http://localhost:3000${percorso}`, { method: metodo }))
}

function verso(r: Response) {
  const l = r.headers.get('location')
  if (!l) return null
  const u = new URL(l)
  return `${u.pathname}${u.search}`
}

beforeEach(() => {
  sessione.utente = null
})

describe('un cliente resta nella sua area', () => {
  beforeEach(() => {
    sessione.utente = CLIENTE
  })

  it.each(['/', '/onboarding', '/settings/team', '/clients/abc', '/oauth/consent?authorization_id=x', '/notifiche'])(
    '%s porta a /percorso',
    async (p) => {
      expect(verso(await richiesta(p))).toBe('/percorso')
    },
  )

  it.each(['/api/alfire', '/api/onboarding/allegati/x', '/api/fathom/cerca'])('%s risponde 403 JSON', async (p) => {
    const r = await richiesta(p, 'POST')
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ errore: 'Questa parte non è del tuo percorso.' })
  })

  it('le sue pagine e le sue route passano', async () => {
    for (const p of ['/percorso', '/percorso/consensi', '/privacy', '/auth/uscita']) {
      expect(verso(await richiesta(p)), p).toBeNull()
    }
    expect((await richiesta('/api/percorso/video', 'POST')).status).toBe(200)
  })

  it('/login e /entra con la sessione di un cliente: /percorso', async () => {
    expect(verso(await richiesta('/login'))).toBe('/percorso')
    expect(verso(await richiesta('/entra'))).toBe('/percorso')
    expect(verso(await richiesta('/login?da=%2Fonboarding'))).toBe('/percorso')
  })
})

describe('una persona del team', () => {
  beforeEach(() => {
    sessione.utente = TEAM
  })

  it('/login e /entra la mandano al da sicuro, come oggi', async () => {
    expect(verso(await richiesta('/login?da=%2Fsetting'))).toBe('/setting')
    expect(verso(await richiesta('/entra'))).toBe('/')
    expect(verso(await richiesta('/login?da=%2F%2Faltro.it'))).toBe('/')
  })

  it('le sue pagine e le sue route passano; /percorso lo decide la pagina', async () => {
    for (const p of ['/', '/onboarding', '/percorso']) expect(verso(await richiesta(p)), p).toBeNull()
    expect((await richiesta('/api/alfire', 'POST')).status).toBe(200)
  })
})

describe('senza sessione', () => {
  it('/percorso porta a /entra con il da, /api/percorso risponde 401 JSON', async () => {
    expect(verso(await richiesta('/percorso/consensi?x=1'))).toBe('/entra?da=%2Fpercorso%2Fconsensi%3Fx%3D1')
    const r = await richiesta('/api/percorso/video', 'POST')
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ errore: 'Accesso non valido: entra di nuovo.' })
  })

  it('il resto va al login come oggi', async () => {
    expect(verso(await richiesta('/onboarding'))).toBe('/login?da=%2Fonboarding')
  })

  it('i pubblici nuovi passano senza toccare la sessione', async () => {
    for (const p of ['/join/mario-rossi-' + 'a'.repeat(64), '/join/registrati', '/entra', '/accesso-negato']) {
      const r = await richiesta(p)
      expect(verso(r), p).toBeNull()
      expect(r.cookies.getAll(), p).toEqual([])
    }
  })

  it('HEAD su un link personale: 405', async () => {
    expect((await richiesta('/join/mario-rossi-' + 'a'.repeat(64), 'HEAD')).status).toBe(405)
  })
})

describe('la Content-Security-Policy a nonce', () => {
  it('su /percorso, /join ed /entra, con un nonce nuovo a ogni richiesta, anche nella richiesta', async () => {
    sessione.utente = CLIENTE
    const nonces = new Set<string>()
    for (const p of ['/percorso', '/join/mario-rossi-' + 'a'.repeat(64), '/entra?x=1']) {
      sessione.utente = p.startsWith('/entra') ? null : CLIENTE
      const r = await richiesta(p)
      const csp = r.headers.get('content-security-policy') ?? ''
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
      expect(nonce, p).toBeTruthy()
      nonces.add(nonce!)
      expect(csp).toContain("frame-src https://www.youtube-nocookie.com")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      // Next reads the nonce from the request's own headers
      expect(r.headers.get('x-middleware-request-x-nonce'), p).toBe(nonce)
    }
    expect(nonces.size).toBe(3)
  })

  it('mai sulle pagine del team', async () => {
    sessione.utente = TEAM
    expect((await richiesta('/onboarding')).headers.get('content-security-policy')).toBeNull()
    expect((await richiesta('/login')).headers.get('content-security-policy')).toBeNull()
  })

  it('la politica: solo gli script dell’app col nonce, YouTube solo come iframe, Supabase per immagini e connessioni', () => {
    const p = politicaCsp('abc', 'https://progetto.supabase.co', false)
    expect(p).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https://progetto.supabase.co https://*.googleusercontent.com; " +
        "connect-src 'self' https://progetto.supabase.co; frame-src https://www.youtube-nocookie.com; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    )
    expect(politicaCsp('abc', 'x', true)).toContain("'strict-dynamic' 'unsafe-eval'")
  })
})

describe('decidi, puro', () => {
  it('un cliente su un pubblico che non legge la sessione passa', () => {
    expect(decidi({ pathname: '/privacy', ricerca: '', metodo: 'GET', da: null, utente: { cliente: true } })).toEqual({ tipo: 'avanti' })
  })
})
