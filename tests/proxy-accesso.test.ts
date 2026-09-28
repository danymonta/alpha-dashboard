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
