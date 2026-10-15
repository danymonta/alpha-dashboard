import { createHash, randomBytes } from 'node:crypto'

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { Page, Route } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import type { Database } from '../lib/supabase/database.types'

config({ path: '.env.local', quiet: true })

/*
 * Claude connected to Alpha Management (MCP, 09/10/2026), the way Claude does
 * it, against the local stack only: Supabase Auth's OAuth 2.1 server (authorize,
 * consent page, token), then /mcp with the SDK's own client. No real Claude,
 * no network outside this machine: the loopback callback of «Claude Code» is
 * caught by Playwright, never served.
 */

function supabaseLocale() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) {
    throw new Error('I test e2e girano solo contro il Supabase locale')
  }
  return { url, chiave }
}

/** The loopback callback of «Claude Code» (lib/mcp/consenso.ts, CALLBACK_CLAUDE_CODE). */
export const CALLBACK_E2E = 'http://127.0.0.1:48721/callback'

/** A PKCE pair, S256, as Claude makes it. */
export function coppiaPkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export type Autorizzazione = {
  clientId: string
  state: string
  verifier: string
  challenge: string
  /** The MCP resource Claude names (GoTrue only stores it). */
  risorsa: string
}

/** A new authorization request of the client: its PKCE pair and state. */
export function nuovaAutorizzazione(clientId: string, baseURL: string, state: string): Autorizzazione {
  return { clientId, state, ...coppiaPkce(), risorsa: `${baseURL}/mcp` }
}

/**
 * Starts the authorization at Supabase (GET /auth/v1/oauth/authorize, as the
 * browser would) and opens the consent page it points to in `page`. Supabase
 * builds that address from its Site URL; the test server may run on another
 * port, so the page opens the same path and query on the test's own origin.
 * Returns the authorization_id. `attesa` is page.goto's waitUntil: 'commit'
 * returns before the page's scripts, to tap a page not hydrated yet.
 */
export async function apriConsenso(
  page: Page,
  a: Autorizzazione,
  attesa: 'commit' | 'domcontentloaded' | 'load' = 'load',
): Promise<string> {
  const { url } = supabaseLocale()
  const indirizzo = new URL(`${url}/auth/v1/oauth/authorize`)
  indirizzo.search = new URLSearchParams({
    response_type: 'code',
    client_id: a.clientId,
    redirect_uri: CALLBACK_E2E,
    code_challenge: a.challenge,
    code_challenge_method: 'S256',
    state: a.state,
    resource: a.risorsa,
  }).toString()
  const risposta = await fetch(indirizzo, { redirect: 'manual' })
  const verso = risposta.headers.get('location')
  if (risposta.status < 300 || risposta.status >= 400 || !verso) {
    throw new Error(`authorize: HTTP ${risposta.status} ${await risposta.text()}`)
  }
  const consenso = new URL(verso)
  if (consenso.pathname !== '/oauth/consent') throw new Error(`authorize: verso ${consenso.pathname}`)
  const id = consenso.searchParams.get('authorization_id')
  if (!id) throw new Error('authorize: senza authorization_id')
  await page.goto(`${consenso.pathname}${consenso.search}`, { waitUntil: attesa })
  return id
}

/**
 * Catches the browser's trip back to the loopback callback, never served:
 * `chiamate` lists every URL that reached it, `prossima()` waits for the next one.
 */
export async function catturaCallback(page: Page) {
  const chiamate: string[] = []
  let attesa: ((url: string) => void) | null = null
  await page.route(`${CALLBACK_E2E}**`, async (route: Route) => {
    const url = route.request().url()
    chiamate.push(url)
    attesa?.(url)
    attesa = null
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Claude Code</title>ok' })
  })
  return {
    chiamate,
    /** The next trip back, once the browser has landed there (a page.goto before that would be interrupted). */
    async prossima(): Promise<URL> {
      const url = await new Promise<string>((risolvi) => {
        attesa = risolvi
      })
      await page.waitForURL((u) => u.href.startsWith(CALLBACK_E2E))
      return new URL(url)
    },
  }
}

export type Token = { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }

/** The code for the tokens, form-encoded as Claude sends it (no apikey, no secret: a public client). */
export async function scambiaCodice(a: Autorizzazione, codice: string): Promise<Token> {
  const { url } = supabaseLocale()
  const risposta = await fetch(`${url}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: codice,
      redirect_uri: CALLBACK_E2E,
      client_id: a.clientId,
      code_verifier: a.verifier,
      resource: a.risorsa,
    }),
  })
  const corpo = await risposta.json()
  if (!risposta.ok) throw new Error(`token: HTTP ${risposta.status} ${JSON.stringify(corpo)}`)
  return corpo as Token
}

/** A refresh with a refresh token, as Claude does before expiry or after a 401. */
export async function rinnova(clientId: string, refreshToken: string) {
  const { url } = supabaseLocale()
  const risposta = await fetch(`${url}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
  })
  return { status: risposta.status, corpo: (await risposta.json().catch(() => null)) as Record<string, unknown> | null }
}

/** The claims of a JWT, decoded and not verified: only to read what Supabase put in them. */
export function claimsDi(jwt: string): Record<string, unknown> {
  const parte = jwt.split('.')[1] ?? ''
  return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')) as Record<string, unknown>
}

/** The SDK's own client on /mcp with the person's token, as Claude talks to it. */
export async function clientMcp(baseURL: string, token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client({ name: 'e2e-alpha', version: '1.0.0' })
  await client.connect(transport)
  return client
}

/** The text of a tool result (one text block), and the JSON in it when it is one. */
export function testoRisultato(risultato: unknown): string {
  const contenuto = (risultato as { content?: { type: string; text?: string }[] }).content ?? []
  return contenuto.map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('')
}

export function datiRisultato<T = Record<string, unknown>>(risultato: unknown): T {
  return JSON.parse(testoRisultato(risultato)) as T
}

/** A plain MCP POST without the SDK: for the status codes of the route (401, 403). */
export async function chiamataGrezza(baseURL: string, token: string) {
  return fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e-alpha', version: '1.0.0' } },
    }),
  })
}

/** Supabase's Data API with the person's OAuth token, as a leaked token would be used. */
export function dataApiConToken(token: string) {
  const { url, chiave } = supabaseLocale()
  return createClient<Database>(url, chiave, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
