import { publicEnv } from '@/lib/env'

/**
 * The addresses of the MCP server (Claude connected to the content calendar,
 * 09/10/2026). All from the environment, never from the Host header (the same
 * rule as lib/auth/origine.ts): a forged Host never changes the resource Claude
 * signs in for, nor where it is sent to sign in.
 *
 * - risorsa: the URL Dany pastes in Claude; the protected resource metadata
 *   must say exactly this.
 * - metadati: the RFC 9728 document the 401 points to.
 * - emittente: Supabase Auth, the authorization server (the `iss` of its tokens).
 * - origineApp: the app's own origin (links in the results, the Origin allowed).
 */
export type IndirizziMcp = {
  risorsa: string
  metadati: string
  emittente: string
  origineApp: string
}

function senzaBarraFinale(valore: string): string {
  return valore.replace(/\/+$/, '')
}

export function indirizziMcp(): IndirizziMcp {
  const app = senzaBarraFinale(publicEnv.appUrl)
  const supabase = senzaBarraFinale(publicEnv.supabaseUrl)
  let origineApp = app
  try {
    origineApp = new URL(app).origin
  } catch {
    // APP_URL malformed: the comparison in lib/mcp/origine.ts then simply never matches it
  }
  return {
    risorsa: `${app}/mcp`,
    metadati: `${app}/.well-known/oauth-protected-resource/mcp`,
    emittente: `${supabase}/auth/v1`,
    origineApp,
  }
}
