import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server'

import { autenticaMcp } from '@/lib/mcp/auth'
import { LIMITI_MCP, superaLimiteRichieste } from '@/lib/mcp/limiti'
import { origineRifiutata } from '@/lib/mcp/origine'
import { registraErroreMcp } from '@/lib/mcp/registro'
import { creaServerMcp } from '@/lib/mcp/server'

/**
 * The MCP server of Alpha Management (Dany, 09/10/2026: «creare un mcp nella
 * mia dashboard che collego con claude normale e gli dico come riempire tutta
 * la parte di content»): https://dashboard.percorsoalpha.com/mcp, stateless
 * Streamable HTTP. Claude connects it as a custom connector (web, Desktop,
 * mobile) and from Claude Code, signing in through Supabase Auth's OAuth 2.1
 * server; it reaches only the content calendar, as the person who connected it.
 *
 * Every method checks the Origin and the bearer token first (a GET without a
 * token gets 401, not 405), then the per-session request limit, then the SDK
 * serves the request: 2025-era clients (Claude today) through its stateless
 * legacy leg, which answers as a one-event SSE stream and wants
 * `Accept: application/json, text/event-stream`; 2026-07-28 clients as JSON.
 * Next answers OPTIONS by itself, without CORS headers.
 */

export const dynamic = 'force-dynamic'
/** Claude's own timeout is 240 s; every tool finishes in a few seconds. */
export const maxDuration = 60

let gestore: McpHttpHandler | null = null

function gestoreMcp(): McpHttpHandler {
  gestore ??= createMcpHandler((ctx) => creaServerMcp(ctx.authInfo), {
    // 2025-era clients: one fresh server per request, GET and DELETE answer 405
    legacy: 'stateless',
    // 2026-07-28 traffic only: one JSON answer (the tools send no progress)
    responseMode: 'json',
    // applies because the body is never passed in pre-parsed
    maxRequestBodySize: LIMITI_MCP.corpo,
    // the class or the code only, never a message: it can echo the arguments
    onerror: registraErroreMcp,
  })
  return gestore
}

async function servi(richiesta: Request): Promise<Response> {
  const rifiuto = origineRifiutata(richiesta.headers.get('origin'))
  if (rifiuto) return rifiuto
  const accesso = await autenticaMcp(richiesta.headers.get('authorization'))
  if (!accesso.ok) return accesso.risposta
  const troppe = superaLimiteRichieste(accesso.sessione)
  if (troppe) return troppe
  const ascolto = await rifiutaAscolto(richiesta)
  if (ascolto) return ascolto
  return gestoreMcp().fetch(richiesta, { authInfo: accesso.authInfo })
}

/**
 * subscriptions/listen (protocol 2026-07-28) opens a stream that waits for
 * change notifications. This server has none (its tools follow the role and
 * never change while a connection lives, listChanged false), and on Vercel the
 * stream stayed open until the function was cut at 60 seconds, then the client
 * opened another one (13/11/2026: one every minute, all day). It is answered
 * at once with «method not found», which the SDK's client takes as no
 * subscription. Only a small JSON body is read, from a copy: the SDK reads
 * the request itself.
 */
async function rifiutaAscolto(richiesta: Request): Promise<Response | null> {
  if (richiesta.method !== 'POST') return null
  if (!(richiesta.headers.get('content-type') ?? '').includes('application/json')) return null
  const lunghezza = Number(richiesta.headers.get('content-length') ?? '0')
  if (lunghezza > 4096) return null
  let messaggio: unknown
  try {
    messaggio = JSON.parse(await richiesta.clone().text())
  } catch {
    return null
  }
  if (
    messaggio === null ||
    typeof messaggio !== 'object' ||
    Array.isArray(messaggio) ||
    (messaggio as { method?: unknown }).method !== 'subscriptions/listen'
  ) {
    return null
  }
  const id = (messaggio as { id?: unknown }).id
  return Response.json(
    { jsonrpc: '2.0', id: typeof id === 'string' || typeof id === 'number' ? id : null, error: { code: -32601, message: 'Method not found' } },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function GET(richiesta: Request) {
  return servi(richiesta)
}

export async function POST(richiesta: Request) {
  return servi(richiesta)
}

export async function DELETE(richiesta: Request) {
  return servi(richiesta)
}
