import 'server-only'

import { McpServer, type AuthInfo, type CallToolResult } from '@modelcontextprotocol/server'

import { VERSIONE_CORRENTE } from '@/lib/changelog/versioni'

import { clientConToken } from './auth'
import { misura, type EsitoStrumento } from './contenuti'
import { isRuoloMcp, type ContestoMcp } from './contesto'
import { istruzioniMcp } from './istruzioni'
import { LIMITI_MCP, TROPPE_RICHIESTE, superaLimiteScritture } from './limiti'
import { registraErroreMcp, registraStrumento } from './registro'
import { schemaMcp } from './schema'
import { strumentiPer, type Strumento } from './strumenti'

/**
 * One MCP server per request (the SDK's createMcpHandler builds it from the
 * request's AuthInfo): the person's role decides the tools, their OAuth token
 * the database client. Nothing is shared between requests but the schemas.
 */

const GENERICO = 'Non riesco a farlo adesso: riprova tra poco.'
const TROPPO_GRANDE = 'Il risultato è troppo grande per Claude: restringi la richiesta.'

/**
 * Runs a tool and never throws: the SDK would turn a thrown error into a tool
 * result with its message verbatim, which could be a raw PostgREST message or
 * echo the arguments. Applies the write limit, caps the result, logs the call
 * (tool, outcome, milliseconds, characters: never who, never the content).
 */
export async function eseguiStrumento(s: Strumento, args: unknown, ctx: ContestoMcp): Promise<CallToolResult> {
  const avvio = performance.now()
  let esito: EsitoStrumento
  if (s.scrive && superaLimiteScritture(ctx.sessione)) {
    esito = { ok: false, messaggio: TROPPE_RICHIESTE, esito: 'limite' }
  } else {
    try {
      esito = await s.esegui(args, ctx)
    } catch (e) {
      registraErroreMcp(e)
      esito = { ok: false, messaggio: GENERICO, esito: 'eccezione' }
    }
  }

  let testo = esito.ok ? JSON.stringify(esito.dati) : esito.messaggio
  let errore = !esito.ok
  let etichetta = esito.esito ?? (esito.ok ? 'ok' : 'errore')
  if (misura(testo) > LIMITI_MCP.risultato) {
    testo = TROPPO_GRANDE
    errore = true
    etichetta = 'troppo_grande'
  }

  registraStrumento({ strumento: s.nome, esito: etichetta, ms: performance.now() - avvio, caratteri: misura(testo) })
  return { content: [{ type: 'text', text: testo }], ...(errore ? { isError: true } : {}) }
}

export function creaServerMcp(authInfo: AuthInfo | undefined): McpServer {
  const ruolo = authInfo?.extra?.ruolo
  const sessione = authInfo?.extra?.sessione
  // never reached without both: the route checks the token first
  if (!authInfo || !isRuoloMcp(ruolo) || typeof sessione !== 'string') throw new Error('senza autenticazione')

  const ctx: ContestoMcp = { db: clientConToken(authInfo.token), ruolo, sessione }
  const server = new McpServer(
    { name: 'alpha-management', title: 'Alpha Management', version: VERSIONE_CORRENTE?.versione ?? '1.0.0' },
    { instructions: istruzioniMcp(ruolo), maxToolInputElements: LIMITI_MCP.elementiInput },
  )
  for (const s of strumentiPer(ruolo)) {
    server.registerTool(
      s.nome,
      {
        title: s.titolo,
        description: s.descrizione,
        inputSchema: schemaMcp(s.input),
        annotations: s.annotazioni,
      },
      (args: unknown) => eseguiStrumento(s, args, ctx),
    )
  }
  return server
}
