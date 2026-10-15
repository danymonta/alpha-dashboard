import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages'

import { dimezza } from '@/lib/insight/blocchi'
import { effortInsight, modelloInsight, type EffortInsight } from '@/lib/insight/config'
import type {
  CodiceErroreBlocco,
  EseguiBlocco,
  EsitoBlocco,
  PayloadBlocco,
  SchedaSalvata,
  TipoBlocco,
  UsageBlocco,
} from '@/lib/insight/contratti'
import { improntaSegnaposto } from '@/lib/insight/impronta'
import { bloccoDati, contestoGiorno, systemInsight } from '@/lib/insight/prompt'
import { datiDelPayload, type DatiBlocco, type VoceBlocco } from '@/lib/insight/prompt/dati'
import {
  FORMATO_AGENDA,
  FORMATO_CORREZIONI,
  FORMATO_SCHEDE,
  FORMATO_SINTESI,
  SchemaAgenda,
  SchemaCorrezioni,
  SchemaSchede,
  SchemaSintesi,
  type FormatoInsight,
} from '@/lib/insight/schema'
import {
  verificaAgenda,
  verificaCorrezioni,
  verificaSchede,
  verificaSintesi,
  type Correzione,
  type DatiAgenda,
  type DatiSchedaLead,
  type DatiSchedaMancante,
  type DatiSchedaMinore,
  type DatiSchedaNonLead,
  type DatiShowUp,
  type SintesiVerificata,
  type VoceVerificata,
} from '@/lib/insight/verifica'

/**
 * One block of the Insight's analysis (1.35.0, CLAUDE.md section 29) sent to
 * Claude Sonnet 5.5, and the pool that runs the blocks of a step.
 *
 * The request (D14): streaming (thinking counts toward max_tokens, and the SDK
 * refuses long non-streaming requests), the model and effort of config.ts,
 * adaptive thinking (the parameter omitted: `disabled` is a 400 on this
 * model), no sampling parameter, structured output through
 * output_config.format, the server-side fallback (`fallbacks: 'default'` with
 * its beta: Claude Sonnet 5 retries the `cyber` and `frontier_llm` declines,
 * same prices), no tools.
 *
 * Time (C3), on Vercel Hobby: each attempt gets min(150 s, the step's deadline
 * - 15 s); the step's signal aborts it at the deadline. No request starts
 * with less than 60 s left. The client never retries (maxRetries 0): one more
 * attempt here on a rate limit (retry-after up to 10 s), a server error, the
 * network or a timeout, only while 60 s remain; otherwise the block goes back
 * to da_fare.
 *
 * Reading (lettura-ai §4.1): stop_reason first (a refusal, max_tokens), then
 * the text after the last fallback block, JSON.parse, the schema, the strict
 * layer (verifica.ts). A refusal splits the block until the refused chat is
 * alone (its card: a placeholder, never a retry with altered text);
 * max_tokens splits it in halves, twice at most; a broken answer is retried
 * once as is, then split, then placeholders; the refs an answer forgot run
 * again once.
 *
 * Stored or returned: error codes only (C18): never the message of an
 * exception, of JSON.parse or of Zod, which quote the model's text.
 */

export const BETA_FALLBACK = 'server-side-fallback-2026-07-01'
export const MAX_TOKENS = 32_000
/** The longest single attempt. */
export const TIMEOUT_TENTATIVO_MS = 150_000
/** Kept free before the step's deadline: each attempt ends this much earlier. */
export const MARGINE_MS = 15_000
/** No request (and no block of the pool) starts with less time than this. */
export const MINIMO_PER_INIZIARE_MS = 60_000
/** A rate limit is waited out here only when Anthropic asks this much at most. */
export const ATTESA_LIMITE_MAX_MS = 10_000
/** max_tokens splits a block twice at most. */
const DIVISIONI_MAX = 2

// ---------------------------------------------------------------------------
// The results of each step (EsitoBlocco<T>.risultato)
// ---------------------------------------------------------------------------

/** A chat or call that got no card from this block: its code key and why (an error code). */
export type Mancante = { chiave: string; motivo: CodiceErroreBlocco }

export type RisultatoBloccoSchede = {
  schede: VoceVerificata<DatiSchedaLead | DatiSchedaNonLead>[]
  mancanti: Mancante[]
}

export type RisultatoBloccoAgenda = {
  call: VoceVerificata<DatiAgenda>[]
  show_up: VoceVerificata<DatiShowUp>[]
  mancanti: Mancante[]
}

export type RisultatoBloccoSintesi = SintesiVerificata

export type RisultatoBloccoCorrezione = { correzioni: Correzione[]; mancanti: Mancante[] }

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

const FORMATI: Record<TipoBlocco, FormatoInsight> = {
  schede: FORMATO_SCHEDE,
  riattivazione: FORMATO_SCHEDE,
  agenda: FORMATO_AGENDA,
  sintesi: FORMATO_SINTESI,
  correzione: FORMATO_CORREZIONI,
}

/** The body of a request: what the fake server of the tests checks too. */
export function corpoRichiesta(op: {
  passo: TipoBlocco
  dati: Pick<DatiBlocco, 'contesto' | 'voci' | 'altro'>
  modello: string
  effort: EffortInsight
}) {
  return {
    model: op.modello,
    max_tokens: MAX_TOKENS,
    system: systemInsight(),
    messages: [
      {
        role: 'user' as const,
        content: [contestoGiorno(op.dati.contesto), bloccoDati(op.passo, op.dati)],
      },
    ],
    output_config: { effort: op.effort, format: FORMATI[op.passo] },
    betas: [BETA_FALLBACK],
    fallbacks: 'default' as const,
  }
}

const ZERO: UsageBlocco = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }

/** The tokens of a message: every attempt of usage.iterations (a declined one included), else the top level. */
export function usageDelMessaggio(usage: BetaUsage | null | undefined): UsageBlocco {
  if (!usage) return { ...ZERO }
  const voce = (u: Partial<Record<keyof UsageBlocco, number | null>>): UsageBlocco => ({
    input_tokens: u.input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  })
  const iterazioni = Array.isArray(usage.iterations) ? usage.iterations : []
  if (iterazioni.length === 0) return voce(usage)
  return iterazioni.map((i) => voce(i as Partial<Record<keyof UsageBlocco, number | null>>)).reduce(somma, { ...ZERO })
}

export function somma(a: UsageBlocco, b: UsageBlocco): UsageBlocco {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
  }
}

/** Whether a fallback model (Claude Sonnet 5) served the message. */
export function servitoDaFallback(msg: Pick<BetaMessage, 'usage'>): boolean {
  return (msg.usage?.iterations ?? []).some((i) => i.type === 'fallback_message')
}

/** The answer's text: the text blocks after the last fallback block (a partial before it is discarded). */
export function testoRisposta(msg: Pick<BetaMessage, 'content'>): string {
  const ultimoFallback = msg.content.map((b) => b.type).lastIndexOf('fallback')
  return msg.content
    .slice(ultimoFallback + 1)
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
}

// ---------------------------------------------------------------------------
// One attempt
// ---------------------------------------------------------------------------

type Chiamata =
  | { tipo: 'ok'; json: unknown }
  | { tipo: 'rifiuto'; categoria: string }
  | { tipo: 'max_tokens' }
  | { tipo: 'json' }
  | { tipo: 'errore'; codice: CodiceErroreBlocco; esito: 'da_rifare' | 'fatale' }

type ErroreRichiesta = { codice: CodiceErroreBlocco; esito: 'da_rifare' | 'fatale'; ritentabile: boolean; attesaMs: number }

/** An SDK error as a code, by its class and status, never by its message. */
export function classificaErrore(e: unknown): ErroreRichiesta {
  if (e instanceof Anthropic.APIUserAbortError) return { codice: 'timeout', esito: 'da_rifare', ritentabile: false, attesaMs: 0 }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { codice: 'autenticazione', esito: 'fatale', ritentabile: false, attesaMs: 0 }
  }
  if (e instanceof Anthropic.BadRequestError) return { codice: 'richiesta', esito: 'fatale', ritentabile: false, attesaMs: 0 }
  if (e instanceof Anthropic.RateLimitError) {
    const secondi = Number(e.headers?.get('retry-after'))
    const attesaMs = Number.isFinite(secondi) && secondi >= 0 ? secondi * 1000 : Number.POSITIVE_INFINITY
    return { codice: 'rate_limit', esito: 'da_rifare', ritentabile: attesaMs <= ATTESA_LIMITE_MAX_MS, attesaMs }
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { codice: 'timeout', esito: 'da_rifare', ritentabile: true, attesaMs: 0 }
  if (e instanceof Anthropic.APIConnectionError) return { codice: 'rete', esito: 'da_rifare', ritentabile: true, attesaMs: 0 }
  if (e instanceof Anthropic.APIError) {
    const stato = e.status ?? 0
    if (stato >= 500) return { codice: 'server', esito: 'da_rifare', ritentabile: true, attesaMs: 0 }
    // 402: billing; any other 4xx: a request this code built wrong
    if (stato === 402) return { codice: 'autenticazione', esito: 'fatale', ritentabile: false, attesaMs: 0 }
    if (stato >= 400) return { codice: 'richiesta', esito: 'fatale', ritentabile: false, attesaMs: 0 }
    return { codice: 'rete', esito: 'da_rifare', ritentabile: true, attesaMs: 0 }
  }
  // a stream that ended without chunks, a broken event: the network
  return { codice: 'rete', esito: 'da_rifare', ritentabile: true, attesaMs: 0 }
}

function attendi(ms: number, segnale: AbortSignal): Promise<void> {
  return new Promise((risolvi) => {
    if (ms <= 0 || segnale.aborted) return risolvi()
    const timer = setTimeout(fine, ms)
    function fine() {
      clearTimeout(timer)
      segnale.removeEventListener('abort', fine)
      risolvi()
    }
    segnale.addEventListener('abort', fine, { once: true })
  })
}

type OpEsegui = Parameters<EseguiBlocco>[0] & { modello?: string; effort?: EffortInsight }

/** What one block has spent and learnt across its requests. */
class Lavoro {
  usage: UsageBlocco = { ...ZERO }
  fallback = false
  modello: string
  requestId: string | null = null
  private primo: (() => void) | undefined

  constructor(
    readonly op: OpEsegui,
    readonly passo: TipoBlocco,
    readonly dati: DatiBlocco,
    readonly effort: EffortInsight,
  ) {
    this.modello = op.modello ?? modelloInsight()
    this.primo = op.alPrimoEvento
  }

  restaMs(): number {
    return this.op.scadenza - Date.now()
  }

  liberaPrimo(): void {
    const primo = this.primo
    this.primo = undefined
    primo?.()
  }

  /** One request, with one more attempt on a transient error while time remains. */
  async chiama(voci: VoceBlocco[]): Promise<Chiamata> {
    for (let tentativo = 0; ; tentativo++) {
      if (this.op.segnale.aborted) return { tipo: 'errore', codice: 'timeout', esito: 'da_rifare' }
      if (this.restaMs() < MINIMO_PER_INIZIARE_MS) return { tipo: 'errore', codice: 'timeout', esito: 'da_rifare' }
      try {
        return await this.una(voci)
      } catch (e) {
        const errore = classificaErrore(e)
        const restaDopo = this.restaMs() - (Number.isFinite(errore.attesaMs) ? errore.attesaMs : 0)
        if (tentativo === 0 && errore.ritentabile && !this.op.segnale.aborted && restaDopo >= MINIMO_PER_INIZIARE_MS) {
          await attendi(errore.attesaMs, this.op.segnale)
          continue
        }
        return { tipo: 'errore', codice: errore.codice, esito: errore.esito }
      }
    }
  }

  private async una(voci: VoceBlocco[]): Promise<Chiamata> {
    const timeout = Math.min(TIMEOUT_TENTATIVO_MS, this.restaMs() - MARGINE_MS)
    const corpo = corpoRichiesta({
      passo: this.passo,
      dati: { contesto: this.dati.contesto, voci, altro: this.dati.altro },
      modello: this.modello,
      effort: this.effort,
    })
    const stream = this.op.client.beta.messages.stream(corpo, { timeout, signal: this.op.segnale, maxRetries: 0 })
    if (this.primo) stream.on('streamEvent', () => this.liberaPrimo())
    let msg: BetaMessage
    try {
      msg = await stream.finalMessage()
    } finally {
      // a block that fails before its first event must not hold the pool
      this.liberaPrimo()
    }
    this.usage = somma(this.usage, usageDelMessaggio(msg.usage))
    this.fallback ||= servitoDaFallback(msg)
    this.modello = msg.model || this.modello
    this.requestId = stream.request_id ?? this.requestId
    if (msg.stop_reason === 'refusal') return { tipo: 'rifiuto', categoria: msg.stop_details?.category ?? 'altro' }
    if (msg.stop_reason === 'max_tokens') return { tipo: 'max_tokens' }
    try {
      return { tipo: 'ok', json: JSON.parse(testoRisposta(msg)) }
    } catch {
      return { tipo: 'json' }
    }
  }

  ok<T>(risultato: T): EsitoBlocco<T> {
    return { ok: true, risultato, usage: this.usage, servito_da_fallback: this.fallback, modello: this.modello, request_id: this.requestId }
  }

  ko<T>(errore: CodiceErroreBlocco, esito: 'da_rifare' | 'fallito' | 'fatale'): EsitoBlocco<T> {
    return { ok: false, errore, esito, usage: this.usage }
  }
}

type Interruzione = { codice: CodiceErroreBlocco; esito: 'da_rifare' | 'fatale' }
const eInterruzione = (x: unknown): x is Interruzione =>
  typeof x === 'object' && x !== null && 'esito' in x && (x as Interruzione).esito !== undefined && 'codice' in x

// ---------------------------------------------------------------------------
// Steps with a list (schede, riattivazione)
// ---------------------------------------------------------------------------

async function analizzaChat(
  lavoro: Lavoro,
  voci: VoceBlocco[],
  stato: { divisioni: number; ritentato: boolean; ripresa: boolean },
): Promise<RisultatoBloccoSchede | Interruzione> {
  if (voci.length === 0) return { schede: [], mancanti: [] }
  const tutte = (motivo: CodiceErroreBlocco): RisultatoBloccoSchede => ({
    schede: [],
    mancanti: voci.map((v) => ({ chiave: v.chiave, motivo })),
  })
  const dividi = async (sotto: typeof stato): Promise<RisultatoBloccoSchede | Interruzione> => {
    const [a, b] = dimezza(voci)
    const primo = await analizzaChat(lavoro, a, sotto)
    if (eInterruzione(primo)) return primo
    const secondo = await analizzaChat(lavoro, b, sotto)
    if (eInterruzione(secondo)) return secondo
    return { schede: [...primo.schede, ...secondo.schede], mancanti: [...primo.mancanti, ...secondo.mancanti] }
  }

  const r = await lavoro.chiama(voci)
  if (r.tipo === 'errore') return { codice: r.codice, esito: r.esito }
  if (r.tipo === 'rifiuto') {
    // until the refused chat is alone; never a retry with altered text
    if (voci.length === 1) return tutte(`refusal:${r.categoria}`)
    return dividi(stato)
  }
  if (r.tipo === 'max_tokens') {
    if (voci.length > 1 && stato.divisioni < DIVISIONI_MAX) return dividi({ ...stato, divisioni: stato.divisioni + 1 })
    return tutte('max_tokens')
  }
  const letto = r.tipo === 'ok' ? SchemaSchede.safeParse(r.json) : null
  if (!letto || !letto.success) {
    const codice: CodiceErroreBlocco = r.tipo === 'json' ? 'json' : 'schema'
    if (!stato.ritentato) return analizzaChat(lavoro, voci, { ...stato, ritentato: true })
    if (voci.length > 1 && stato.divisioni < DIVISIONI_MAX) return dividi({ ...stato, divisioni: stato.divisioni + 1 })
    return tutte(codice)
  }
  const verificato = verificaSchede(letto.data, { voci, post: lavoro.dati.post })
  const risultato: RisultatoBloccoSchede = { schede: verificato.voci, mancanti: [] }
  if (verificato.mancanti.length > 0) {
    const dimenticate = voci.filter((v) => verificato.mancanti.includes(v.ref))
    if (stato.ripresa) {
      risultato.mancanti.push(...dimenticate.map((v) => ({ chiave: v.chiave, motivo: 'schema' as const })))
    } else {
      const ripresa = await analizzaChat(lavoro, dimenticate, { ...stato, ripresa: true })
      if (eInterruzione(ripresa)) return ripresa
      risultato.schede.push(...ripresa.schede)
      risultato.mancanti.push(...ripresa.mancanti)
    }
  }
  return risultato
}

// ---------------------------------------------------------------------------
// Steps of one request (agenda, sintesi, correzione)
// ---------------------------------------------------------------------------

/** One request read through its schema, with one retry on a broken answer. */
async function unaVolta<S extends { safeParse: (x: unknown) => { success: true; data: unknown } | { success: false } }>(
  lavoro: Lavoro,
  voci: VoceBlocco[],
  schema: S,
): Promise<{ data: unknown } | { codice: CodiceErroreBlocco; esito: 'da_rifare' | 'fallito' | 'fatale' }> {
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const r = await lavoro.chiama(voci)
    if (r.tipo === 'errore') return { codice: r.codice, esito: r.esito }
    if (r.tipo === 'rifiuto') return { codice: `refusal:${r.categoria}`, esito: 'fallito' }
    if (r.tipo === 'max_tokens') return { codice: 'max_tokens', esito: 'fallito' }
    if (r.tipo === 'ok') {
      const letto = schema.safeParse(r.json)
      if (letto.success) return { data: letto.data }
      if (tentativo === 1) return { codice: 'schema', esito: 'fallito' }
    } else if (tentativo === 1) {
      return { codice: 'json', esito: 'fallito' }
    }
  }
  return { codice: 'json', esito: 'fallito' }
}

async function eseguiAgenda(lavoro: Lavoro): Promise<EsitoBlocco<RisultatoBloccoAgenda>> {
  const voci = lavoro.dati.voci
  if (voci.length === 0) return lavoro.ok({ call: [], show_up: [], mancanti: [] })
  const risultato: RisultatoBloccoAgenda = { call: [], show_up: [], mancanti: [] }
  let daFare = voci
  for (let giro = 0; giro < 2 && daFare.length > 0; giro++) {
    const r = await unaVolta(lavoro, daFare, SchemaAgenda)
    if (!('data' in r)) {
      if (r.esito !== 'fallito') return lavoro.ko(r.codice, r.esito)
      if (giro === 0) return lavoro.ko(r.codice, 'fallito')
      risultato.mancanti.push(...daFare.map((v) => ({ chiave: v.chiave, motivo: r.codice })))
      break
    }
    const v = verificaAgenda(r.data as Parameters<typeof verificaAgenda>[0], { voci: daFare })
    risultato.call.push(...v.call.voci)
    risultato.show_up.push(...v.show_up.voci)
    const dimenticate = new Set([...v.call.mancanti, ...v.show_up.mancanti])
    daFare = daFare.filter((x) => dimenticate.has(x.ref))
    if (giro === 1) risultato.mancanti.push(...daFare.map((x) => ({ chiave: x.chiave, motivo: 'schema' as const })))
  }
  return lavoro.ok(risultato)
}

async function eseguiSintesi(lavoro: Lavoro): Promise<EsitoBlocco<RisultatoBloccoSintesi>> {
  let ultima: SintesiVerificata | null = null
  for (let giro = 0; giro < 2; giro++) {
    const r = await unaVolta(lavoro, [], SchemaSintesi)
    if (!('data' in r)) {
      // the retry for more ideas failed: the first answer stands
      if (ultima) break
      return lavoro.ko(r.codice, r.esito)
    }
    const { sintesi, pocheIdee } = verificaSintesi(r.data as Parameters<typeof verificaSintesi>[0], lavoro.dati)
    ultima = sintesi
    // fewer than 5 ideas: one more try, then accepted as it is
    if (!pocheIdee || lavoro.restaMs() < MINIMO_PER_INIZIARE_MS) break
  }
  return ultima ? lavoro.ok(ultima) : lavoro.ko('schema', 'fallito')
}

async function eseguiCorrezione(lavoro: Lavoro): Promise<EsitoBlocco<RisultatoBloccoCorrezione>> {
  const voci = lavoro.dati.voci
  if (voci.length === 0) return lavoro.ok({ correzioni: [], mancanti: [] })
  const r = await unaVolta(lavoro, voci, SchemaCorrezioni)
  if (!('data' in r)) return lavoro.ko(r.codice, r.esito)
  const v = verificaCorrezioni(r.data as Parameters<typeof verificaCorrezioni>[0], { voci })
  return lavoro.ok({
    correzioni: v.voci.map((x) => x.dati),
    mancanti: voci.filter((x) => v.mancanti.includes(x.ref)).map((x) => ({ chiave: x.chiave, motivo: 'schema' as const })),
  })
}

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

/**
 * Runs one block: the result of its step (RisultatoBloccoSchede,
 * RisultatoBloccoAgenda, RisultatoBloccoSintesi or RisultatoBloccoCorrezione),
 * or why not: da_rifare (time, rate limit, network: back to da_fare), fallito
 * (its chats get placeholder cards), fatale (the run stops: authentication,
 * permission, credit, a bad request). Never throws.
 */
export const eseguiBlocco = (async <T = unknown>(op: OpEsegui): Promise<EsitoBlocco<T>> => {
  const dati = datiDelPayload(op.payload as PayloadBlocco)
  const effort = op.effort ?? effortInsight()
  const passo = op.payload.passo
  if (!dati) return { ok: false, errore: 'richiesta', esito: 'fatale', usage: null }
  const lavoro = new Lavoro(op, passo, dati, effort)
  try {
    if (op.segnale.aborted || lavoro.restaMs() < MINIMO_PER_INIZIARE_MS) {
      lavoro.liberaPrimo()
      return lavoro.ko<T>('timeout', 'da_rifare')
    }
    if (passo === 'schede' || passo === 'riattivazione') {
      const r = await analizzaChat(lavoro, dati.voci, { divisioni: 0, ritentato: false, ripresa: false })
      return eInterruzione(r) ? lavoro.ko<T>(r.codice, r.esito) : (lavoro.ok(r) as EsitoBlocco<T>)
    }
    if (passo === 'agenda') return (await eseguiAgenda(lavoro)) as EsitoBlocco<T>
    if (passo === 'sintesi') return (await eseguiSintesi(lavoro)) as EsitoBlocco<T>
    return (await eseguiCorrezione(lavoro)) as EsitoBlocco<T>
  } catch {
    // never thrown by the steps above; a bug must not stop the run without a code
    return lavoro.ko<T>('rete', 'da_rifare')
  } finally {
    lavoro.liberaPrimo()
  }
}) satisfies EseguiBlocco

// ---------------------------------------------------------------------------
// The cards to store (insight_schede)
// ---------------------------------------------------------------------------

/** A placeholder card for a chat whose analysis failed: identity and chat from code, nothing invented. */
export function schedaMancante(tipo: 'lead' | 'riattivazione', chiave: string, motivo: string): SchedaSalvata {
  const dati: DatiSchedaMancante = { tipo: 'lead', analisi_mancante: true, motivo }
  return { tipo, chiave, impronta: improntaSegnaposto(tipo, chiave, motivo), dati }
}

/** The card of an under-14 chat that Claude no longer receives (D25 step 4), with its last warm closure. */
export function schedaMinore(chiave: string, ultimaChiusura: string): SchedaSalvata {
  const dati: DatiSchedaMinore = { tipo: 'lead', minore_14: true, ultima_chiusura: ultimaChiusura.trim() }
  return { tipo: 'lead', chiave, impronta: improntaSegnaposto('lead', chiave, 'minore_14'), dati }
}

/**
 * The last warm closure an under-14 chat got (D25 step 4), from its latest
 * stored card: the model's suggested message, or the closure a code card
 * carried on. '' when there is none.
 */
export function chiusuraDellaScheda(dati: unknown): string {
  if (!dati || typeof dati !== 'object') return ''
  const d = dati as Record<string, unknown>
  if (typeof d.ultima_chiusura === 'string') return d.ultima_chiusura
  return d.tipo === 'lead' && typeof d.suggested_message === 'string' ? d.suggested_message : ''
}

/**
 * The rows of insight_schede of a schede or riattivazione block: one card per
 * chat (lead or non_lead; riattivazione keeps its own type), a placeholder
 * for each chat without one. `impronte` is the impronta of each chat
 * (lib/insight/impronta.ts, computed before the block was planned).
 */
export function schedeDelBlocco(
  passo: 'schede' | 'riattivazione',
  risultato: RisultatoBloccoSchede,
  impronte: ReadonlyMap<string, string>,
): SchedaSalvata[] {
  const righe: SchedaSalvata[] = []
  for (const v of risultato.schede) {
    const impronta = impronte.get(v.chiave)
    if (!impronta) continue
    righe.push({ tipo: passo === 'schede' ? v.dati.tipo : 'riattivazione', chiave: v.chiave, impronta, dati: v.dati })
  }
  for (const m of risultato.mancanti) righe.push(schedaMancante(passo === 'schede' ? 'lead' : 'riattivazione', m.chiave, m.motivo))
  return righe
}

/** The rows of insight_schede of the agenda block (calls without a card keep their skeleton in unione.ts). */
export function schedeDellAgenda(risultato: RisultatoBloccoAgenda, impronte: ReadonlyMap<string, string>): SchedaSalvata[] {
  return [
    ...risultato.call.map((v) => ({ tipo: 'agenda' as const, chiave: v.chiave, impronta: impronte.get(v.chiave) ?? improntaSegnaposto('agenda', v.chiave, 'senza_impronta'), dati: v.dati })),
    ...risultato.show_up.map((v) => ({ tipo: 'show_up' as const, chiave: v.chiave, impronta: impronte.get(v.chiave) ?? improntaSegnaposto('show_up', v.chiave, 'senza_impronta'), dati: v.dati })),
  ]
}

// ---------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------

export type EsitoPool<B> = {
  /** the concurrency left (halved after each rate limit): the rest of the run keeps it */
  concorrenza: number
  esiti: { blocco: B; esito: EsitoBlocco<unknown> }[]
  /** blocks not started: out of time, or after a fatal error */
  nonIniziati: B[]
  /** the first fatal outcome: the run stops */
  fatale: EsitoBlocco<unknown> | null
}

/**
 * Runs the blocks of a step through a pool:
 * - the first block alone until its first stream event (C, gating): the
 *   prompt cache entry it writes is readable only once its response starts,
 *   so the others then read it instead of each writing it;
 * - `concorrenza` at once, halved (never below 1) for the rest of the run
 *   after a rate limit; a rate-limited block goes back to the end of the
 *   queue once;
 * - no block starts with less than 60 s before `entro`;
 * - after a fatal outcome nothing new starts.
 * `alTermine` stores each result as soon as it is there (a validated card is
 * saved at once). Never throws.
 */
export async function eseguiInPool<B>(op: {
  blocchi: readonly B[]
  concorrenza: number
  /** epoch ms: the step's deadline */
  entro: number
  esegui: (blocco: B, alPrimoEvento: () => void) => Promise<EsitoBlocco<unknown>>
  alTermine?: (blocco: B, esito: EsitoBlocco<unknown>) => void | Promise<void>
  /** false: no gating (the cache is already warm in this invocation) */
  primoDaSolo?: boolean
  adesso?: () => number
}): Promise<EsitoPool<B>> {
  const adesso = op.adesso ?? Date.now
  const coda = [...op.blocchi]
  const rimessi = new Set<B>()
  const esiti: EsitoPool<B>['esiti'] = []
  let limite = Math.max(1, Math.floor(op.concorrenza))
  let fatale: EsitoBlocco<unknown> | null = null
  const inCorso = new Set<Promise<void>>()

  let apri: () => void = () => {}
  const cancello = new Promise<void>((r) => {
    apri = r
  })
  let cancelloAperto = op.primoDaSolo === false
  const apriCancello = () => {
    cancelloAperto = true
    apri()
  }

  const avvia = (blocco: B) => {
    const lavoro = (async () => {
      let esito: EsitoBlocco<unknown>
      try {
        esito = await op.esegui(blocco, apriCancello)
      } catch {
        esito = { ok: false, errore: 'rete', esito: 'da_rifare', usage: null }
      }
      apriCancello()
      if (!esito.ok && esito.errore === 'rate_limit') {
        limite = Math.max(1, Math.floor(limite / 2))
        if (!rimessi.has(blocco)) {
          rimessi.add(blocco)
          coda.push(blocco)
          return
        }
      }
      if (!esito.ok && esito.esito === 'fatale' && !fatale) fatale = esito
      esiti.push({ blocco, esito })
      try {
        await op.alTermine?.(blocco, esito)
      } catch {
        // storing is the caller's: its failure never stops the other blocks
      }
    })()
    inCorso.add(lavoro)
    void lavoro.finally(() => inCorso.delete(lavoro))
  }

  let avviati = 0
  for (;;) {
    if (fatale) break
    if (coda.length === 0) {
      if (inCorso.size === 0) break
      await Promise.race(inCorso)
      continue
    }
    if (inCorso.size >= limite) {
      await Promise.race(inCorso)
      continue
    }
    if (avviati > 0 && !cancelloAperto) {
      await Promise.race([cancello, ...inCorso])
      continue
    }
    if (op.entro - adesso() < MINIMO_PER_INIZIARE_MS) break
    avvia(coda.shift() as B)
    avviati++
  }
  await Promise.all(inCorso)
  return { concorrenza: limite, esiti, nonIniziati: coda, fatale }
}
