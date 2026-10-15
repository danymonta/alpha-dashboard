import { indirizziMcp } from './indirizzi'
import { registraOrigineRifiutata } from './registro'

/**
 * Which browser origins may call /mcp (the MCP spec asks servers to validate
 * Origin against DNS rebinding; the SDK leaves it to the host). Claude calls
 * server to server, without an Origin; claude.ai and claude.com are allowed in
 * case a surface sends one, the app itself too. Outside production also
 * localhost and 127.0.0.1 on any port (MCP Inspector). Next answers OPTIONS
 * without CORS headers, so a page on another site cannot even send the
 * Authorization header.
 */
const ORIGINI_CLAUDE = ['https://claude.ai', 'https://claude.com']

export function origineAmmessaMcp(
  origin: string | null | undefined,
  produzione: boolean = process.env.NODE_ENV === 'production',
): boolean {
  if (origin === null || origin === undefined || origin === '') return true
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  // an Origin header is scheme, host and port only
  if (url.origin !== origin) return false
  if (ORIGINI_CLAUDE.includes(url.origin) || url.origin === indirizziMcp().origineApp) return true
  return !produzione && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

/** 403 for a foreign Origin (logged with its host only), null when the request may go on. */
export function origineRifiutata(origin: string | null | undefined): Response | null {
  if (origineAmmessaMcp(origin)) return null
  let host = 'non_valida'
  try {
    host = new URL(origin ?? '').hostname || host
  } catch {
    // not a URL: the log says so, never the raw header
  }
  registraOrigineRifiutata(host)
  return Response.json(
    { error: 'origine_non_ammessa', messaggio: 'Questa pagina non può chiamare Alpha Management.' },
    { status: 403 },
  )
}
