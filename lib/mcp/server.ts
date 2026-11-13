import 'server-only'

import { McpServer, type AuthInfo, type CallToolResult } from '@modelcontextprotocol/server'

import { VERSIONE_CORRENTE } from '@/lib/changelog/versioni'

import { clientConToken } from './auth'
import { misura, type EsitoStrumento } from './contenuti'
import { isLivelloPm, isRuoloMcp, type ContestoMcp } from './contesto'
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
  const livello = authInfo?.extra?.livello
  const persona = authInfo?.extra?.persona
  const sessione = authInfo?.extra?.sessione
  // never reached without them: the route checks the token first
  if (!authInfo || !isRuoloMcp(ruolo) || !isLivelloPm(livello) || typeof persona !== 'string' || typeof sessione !== 'string') {
    throw new Error('senza autenticazione')
  }

  const ctx: ContestoMcp = { db: clientConToken(authInfo.token), ruolo, livello, persona, sessione }
  const server = new McpServer(
    { name: 'alpha-management', title: 'Alpha Management', version: VERSIONE_CORRENTE?.versione ?? '1.0.0' },
    {
      instructions: istruzioniMcp(ruolo, livello),
      maxToolInputElements: LIMITI_MCP.elementiInput,
      // the tools of a connection never change while it lives (they follow the
      // role, read at every request): nothing to listen for (13/11/2026, the
      // subscriptions/listen streams held open until Vercel cut them at 60 s)
      capabilities: { tools: { listChanged: false } },
    },
  )
  for (const s of strumentiPer(ruolo, livello)) {
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
