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
  return gestoreMcp().fetch(richiesta, { authInfo: accesso.authInfo })
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
