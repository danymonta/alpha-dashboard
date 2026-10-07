import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:1', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

import { updateSession } from '@/lib/supabase/middleware'

// yesterday's session, dead, next to the verifier of the sign-in just started
const COOKIE = [
  'sb-127-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJ4IiwicmVmcmVzaF90b2tlbiI6InkiLCJleHBpcmVzX2F0IjoxfQ',
  'sb-127-auth-token-code-verifier=base64-InZlcmlmaWNhdG9yZSI',
].join('; ')

function richiesta(percorso: string, metodo = 'GET') {
  return new NextRequest(`http://localhost:3000${percorso}`, { method: metodo, headers: { cookie: COOKIE } })
}

describe('il proxy non tocca la sessione mentre si entra con Google', () => {
  it.each([
    ['il rientro da Google', '/auth/callback?code=abc', 'GET'],
    ['il pulsante «Accedi con Google»', '/login', 'POST'],
    ['il cron', '/api/cron/giornaliero', 'GET'],
  ])('%s passa senza refresh e senza cancellare il verificatore', async (_, percorso, metodo) => {
    const risposta = await updateSession(richiesta(percorso, metodo))
    expect(risposta.headers.get('location')).toBeNull()
    expect(risposta.cookies.getAll()).toEqual([])
  })
})

describe('il codice di Google finito sulla home o su /login arriva comunque al rientro', () => {
  it.each([
    ['/?code=e0f770a2-1b2e-4c9c-9806-188e785ae668', '/auth/callback?code=e0f770a2-1b2e-4c9c-9806-188e785ae668'],
    ['/login?code=e0f770a2-1b2e-4c9c-9806-188e785ae668&da=%2F', '/auth/callback?code=e0f770a2-1b2e-4c9c-9806-188e785ae668&da=%2F'],
    ['/?error=server_error&error_description=Database+error+saving+new+user', '/auth/callback?error=server_error&error_description=Database+error+saving+new+user'],
  ])('%s', async (da, verso) => {
    const risposta = await updateSession(richiesta(da))
    expect(risposta.headers.get('location')).toBe(`http://localhost:3000${verso}`)
  })
})

describe('senza un login in corso, un vecchio ?code non viene girato al rientro', () => {
  it('chi apre /?code=… dalla cronologia fa la strada normale', async () => {
    const risposta = await updateSession(new NextRequest('http://localhost:3000/?code=vecchio'))
    expect(risposta.headers.get('location')).not.toContain('/auth/callback')
  })
})

describe('il pulsante «Accedi con Google» premuto da una pagina /login?code=…', () => {
  it('arriva alla sua azione, non viene girato al rientro (che risponde solo a GET)', async () => {
    const risposta = await updateSession(richiesta('/login?code=vecchio&da=%2F', 'POST'))
    expect(risposta.headers.get('location')).toBeNull()
  })
})

describe('l’informativa privacy si legge senza account', () => {
  it('senza cookie /privacy si apre, senza passare dal login', async () => {
    const risposta = await updateSession(new NextRequest('http://localhost:3000/privacy'))
    expect(risposta.headers.get('location')).toBeNull()
    expect(risposta.cookies.getAll()).toEqual([])
  })

  it('con una sessione scaduta nel browser non la tocca', async () => {
    const risposta = await updateSession(richiesta('/privacy'))
    expect(risposta.headers.get('location')).toBeNull()
    expect(risposta.cookies.getAll()).toEqual([])
  })

  it('un percorso che inizia solo per «privacy» resta dietro il login', async () => {
    const risposta = await updateSession(new NextRequest('http://localhost:3000/privacy-team'))
    expect(new URL(risposta.headers.get('location') ?? '').pathname).toBe('/login')
  })
})

describe('senza sessione, il login ricorda l’indirizzo intero', () => {
  it('«Registra rinnovo» da un’email torna sul rinnovo di quel cliente, query compresa', async () => {
    const risposta = await updateSession(new NextRequest('http://localhost:3000/sales/new?cliente=c1&tipo=rinnovo'))
    const verso = new URL(risposta.headers.get('location') ?? '')
    expect(verso.pathname).toBe('/login')
    // only "da": the page's own parameters never land on /login
    expect([...verso.searchParams.keys()]).toEqual(['da'])
    expect(verso.searchParams.get('da')).toBe('/sales/new?cliente=c1&tipo=rinnovo')
  })

  it('una pagina col suo ?da= lo tiene dentro il "da" del login', async () => {
    const risposta = await updateSession(new NextRequest('http://localhost:3000/setting?da=2026-07-01&a=2026-07-31'))
    const verso = new URL(risposta.headers.get('location') ?? '')
    expect(verso.searchParams.get('da')).toBe('/setting?da=2026-07-01&a=2026-07-31')
  })
})
