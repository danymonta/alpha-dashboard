import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import type { BetaImageBlockParam, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { z } from 'zod/v4'

import { clienteInsight } from '@/lib/insight/claude'
import {
  ATTESA_LIMITE_MAX_MS,
  BETA_FALLBACK,
  classificaErrore,
  descriviErrore4xx,
  servitoDaFallback,
  somma,
  testoRisposta,
  usageDelMessaggio,
} from '@/lib/insight/esegui'
import { MARGINE_CLAUDE_MS, modelloAnalisi, TIMEOUT_CLAUDE_MAX_MS, type EffortAnalisi } from '@/lib/marketing/analisi/config'
import { USO_ZERO, type CodiceErroreClaude, type RispostaClaude, type UsoToken } from '@/lib/marketing/analisi/tipi'

/**
 * One request to Claude for the reel analysis (1.36.0, CLAUDE.md section 30),
 * with the Insight's own client and the Insight's own manners (D21, D22):
 * streaming, `thinking` left out (adaptive: `disabled` is a 400 on this
 * model), no sampling parameter, structured output, the server-side fallback
 * (Claude Sonnet 5 retries the `cyber` and `frontier_llm` declines at the
 * same prices), no tools, maxRetries 0.
 *
 * Time (R6): it does not start with less than `minimo` ms left before the
 * step's deadline (`tempo`: the visual pass resumes, the analysis goes back
 * to the queue without an attempt); a single request lasts at most
 * min(200 s, what is left - 10 s). One more attempt only on a rate limit
 * (retry-after up to 10 s), a server error, the network or a timeout, and only
 * if `minimo` ms still remain.
 *
 * Stored or logged: error codes, token counts and the request id: never the
 * message of an exception, of JSON.parse or of Zod, which quote the text.
 */

/**
 * A text with no lone surrogate. A cut that falls inside an emoji (a slice by UTF-16 unit) or a
 * text that came from outside with one makes a body the API reads as invalid JSON (400): every
 * text that goes to Claude passes from here, whatever the step.
 */
export function benFormato<B extends BetaTextBlockParam | BetaImageBlockParam>(blocchi: B[]): B[] {
  return blocchi.map((b) => (b.type === 'text' && !b.text.isWellFormed() ? { ...b, text: b.text.toWellFormed() } : b))
}

export type ContenutoUtente = (BetaTextBlockParam | BetaImageBlockParam)[]

const attendi = (ms: number, segnale?: AbortSignal) =>
  new Promise<void>((risolvi) => {
    if (ms <= 0 || segnale?.aborted) return risolvi()
    const timer = setTimeout(fine, ms)
    function fine() {
      clearTimeout(timer)
      segnale?.removeEventListener('abort', fine)
      risolvi()
    }
    segnale?.addEventListener('abort', fine, { once: true })
  })

function codiceDi(e: unknown): { codice: CodiceErroreClaude; ritentabile: boolean; attesaMs: number } {
  const c = classificaErrore(e)
  switch (c.codice) {
    case 'timeout':
      // `tempo` is only «the step's time is over» (the caller's signal): the job goes back without an attempt.
      // A request that was sent and timed out was asked, and perhaps billed: it counts as a failed attempt
      // (`rete`), or the same slow request would repeat for ever, one step after the other.
      return e instanceof Anthropic.APIUserAbortError
        ? { codice: 'tempo', ritentabile: c.ritentabile, attesaMs: c.attesaMs }
        : { codice: 'rete', ritentabile: c.ritentabile, attesaMs: c.attesaMs }
    case 'autenticazione':
      return { codice: 'autenticazione', ritentabile: false, attesaMs: 0 }
    case 'richiesta':
      return { codice: 'richiesta', ritentabile: false, attesaMs: 0 }
    case 'rate_limit':
      return { codice: 'limite', ritentabile: c.ritentabile, attesaMs: c.attesaMs }
    default:
      return { codice: 'rete', ritentabile: c.ritentabile, attesaMs: c.attesaMs }
  }
}

export type OpzioniChiedi<T> = {
  passo: 'visione' | 'analisi' | 'call' | 'spunti'
  sistema: BetaTextBlockParam[]
  contenuto: ContenutoUtente
  formato: { type: 'json_schema'; schema: Record<string, unknown> }
  schema: z.ZodType<T>
  effort: EffortAnalisi
  /** the least time that must remain before `entro` for the request to start */
  minimo: number
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  /** the output ceiling of the request: 16,000 unless the caller needs more (the weekly brief) */
  maxTokens?: number
  /** the SDK client of the Insight; the tests pass theirs */
  cliente?: Anthropic
  modello?: string
}

/** Log line of a request: counts only, never a text, an URL or a dollar. */
function registra(passo: string, uso: UsoToken, immagini: number, fallback: boolean, requestId: string | null, secondi: number) {
  console.info('[analisi] token', {
    passo,
    input: uso.input_tokens,
    cache_scritti: uso.cache_creation_input_tokens,
    cache_letti: uso.cache_read_input_tokens,
    output: uso.output_tokens,
    immagini,
    fallback,
    request_id: requestId,
    secondi,
  })
}

export async function chiediAClaude<T>(op: OpzioniChiedi<T>): Promise<RispostaClaude<T>> {
  const modello = op.modello ?? modelloAnalisi()
  const immagini = op.contenuto.filter((b) => b.type === 'image').length
  const cliente = op.cliente ?? clienteInsight()
  let uso: UsoToken = { ...USO_ZERO }
  const avvio = Date.now()

  for (let tentativo = 0; ; tentativo++) {
    const resta = op.entro - Date.now()
    if (op.segnale?.aborted || resta < op.minimo) return { ok: false, codice: 'tempo', uso }
    const timeout = Math.min(TIMEOUT_CLAUDE_MAX_MS, resta - MARGINE_CLAUDE_MS)
    try {
      const stream = cliente.beta.messages.stream(
        {
          model: modello,
          max_tokens: op.maxTokens ?? 16_000,
          system: benFormato(op.sistema),
          messages: [{ role: 'user', content: benFormato(op.contenuto) }],
          output_config: { effort: op.effort, format: op.formato },
          betas: [BETA_FALLBACK],
          fallbacks: 'default',
        },
        { timeout, signal: op.segnale, maxRetries: 0 },
      )
      let msg
      try {
        msg = await stream.finalMessage()
      } catch (e) {
        // an aborted or broken stream was billed for what it had produced
        uso = somma(uso, usageDelMessaggio(stream.currentMessage?.usage))
        throw e
      }
      uso = somma(uso, usageDelMessaggio(msg.usage))
      const fallback = servitoDaFallback(msg)
      registra(op.passo, uso, immagini, fallback, stream.request_id ?? null, Math.round((Date.now() - avvio) / 100) / 10)
      if (msg.stop_reason === 'refusal') {
        console.info('[analisi] rifiuto', { passo: op.passo, categoria: msg.stop_details?.category ?? 'altro' })
        return { ok: false, codice: 'rifiuto', uso }
      }
      if (msg.stop_reason === 'max_tokens') return { ok: false, codice: 'max_tokens', uso }
      let json: unknown
      try {
        json = JSON.parse(testoRisposta(msg))
      } catch {
        return { ok: false, codice: 'json', uso }
      }
      const letto = op.schema.safeParse(json)
      if (!letto.success) return { ok: false, codice: 'schema', uso }
      return {
        ok: true,
        dati: letto.data,
        uso,
        fallback,
        request_id: stream.request_id ?? null,
        modello: msg.model || modello,
      }
    } catch (e) {
      // a request the API refused says why (status, type, message of its error: never the request)
      const rifiutata = descriviErrore4xx(e)
      if (rifiutata) console.error(`[claude] ${op.passo}: ${rifiutata}`)
      const errore = codiceDi(e)
      const restaDopo = op.entro - Date.now() - (Number.isFinite(errore.attesaMs) ? errore.attesaMs : 0)
      if (tentativo === 0 && errore.ritentabile && !op.segnale?.aborted && restaDopo >= op.minimo && errore.attesaMs <= ATTESA_LIMITE_MAX_MS) {
        await attendi(errore.attesaMs, op.segnale)
        continue
      }
      console.info('[analisi] errore', { passo: op.passo, codice: errore.codice })
      return { ok: false, codice: errore.codice, uso }
    }
  }
}
