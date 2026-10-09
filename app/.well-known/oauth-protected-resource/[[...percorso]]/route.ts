import { indirizziMcp } from '@/lib/mcp/indirizzi'

/**
 * The protected resource metadata of the MCP server (RFC 9728, 09/10/2026):
 * the 401 of /mcp points here, and from here Claude finds Supabase Auth, the
 * authorization server. /.well-known/oauth-protected-resource/mcp is the
 * document of https://…/mcp; the root document says the same resource, on
 * purpose: strict RFC 9728 would derive the bare origin there, but Claude
 * falls back to the root only when the 401 has no resource_metadata (ours
 * always has it), and its rule is "resource equals the URL the user entered".
 *
 * No scopes_supported: Supabase's scopes are about identity only, and the
 * MCP spec says not to list offline_access. Built from the environment, never
 * from the Host header. Public, cacheable for 5 minutes (Claude caches it for
 * about as long), readable from any origin (MCP Inspector).
 */

type Contesto = { params: Promise<{ percorso?: string[] }> }

const INTESTAZIONI_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'mcp-protocol-version',
}

/** Only the root and /mcp: any other path under it is not a resource of ours. */
async function nostro(contesto: Contesto): Promise<boolean> {
  const { percorso = [] } = await contesto.params
  return percorso.length === 0 || (percorso.length === 1 && percorso[0] === 'mcp')
}

function nonTrovato(): Response {
  return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_richiesta: Request, contesto: Contesto) {
  if (!(await nostro(contesto))) return nonTrovato()
  const { risorsa, emittente } = indirizziMcp()
  return Response.json(
    {
      resource: risorsa,
      authorization_servers: [emittente],
      bearer_methods_supported: ['header'],
      resource_name: 'Alpha Management',
    },
    { headers: { 'Cache-Control': 'public, max-age=300', ...INTESTAZIONI_CORS } },
  )
}

export async function OPTIONS(_richiesta: Request, contesto: Contesto) {
  if (!(await nostro(contesto))) return nonTrovato()
  return new Response(null, { status: 204, headers: { 'Access-Control-Max-Age': '300', ...INTESTAZIONI_CORS } })
}
