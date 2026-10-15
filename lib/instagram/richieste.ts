import 'server-only'

/**
 * The request machinery of the Instagram Graph API, shared by the setter's
 * report from the DMs (lib/instagram/graph.ts, 08/10/2026) and the posts of
 * the content calendar (lib/instagram/contenuti.ts, 09/10/2026). Moved here
 * from graph.ts unchanged: the same retries and backoff, at most 3 requests on
 * the wire for a client, the same deadline (`entro`) checked again when a
 * request gets its turn, a 200 whose body does not read retried like the
 * network.
 *
 * The token never leaves this module's closures: it goes only into the URL of
 * the request, and every error message is built here and blanked of it.
 * Meta's `paging.next` is never followed nor kept by the callers: it carries
 * the token; only the cursor is. Nothing here logs, except baseGraph()'s
 * warning, which never says a value.
 *
 * Tests never reach Meta: baseGraph() takes E2E_GRAPH_FINTO only outside
 * production, with the dev login, on a loopback host; and a test token (with
 * SEGNO_TOKEN_FINTO in it) never leaves for a host that is not loopback,
 * whatever base a caller passes.
 *
 * The Insight (1.35.0) reads with the same machinery: the Instagram DMs with
 * their text, the leads' profiles and the statistics of the posts share one
 * limiter for the whole run (`inFila`: at most 3 requests on the wire for the
 * account, whoever asks), and the Messenger chats of the Page read through it
 * with their own limiter, their own base (baseGraph(MESSENGER_BASE)) and
 * their own name in the messages (`servizio`). The error class stays
 * ErroreInstagram for both.
 */

export const API_BASE = 'https://graph.instagram.com'
export const API_VERSIONE = 'v26.0'
/** Requests running at once: Meta's rate limits are per account. */
export const CONCORRENZA = 3
/** Retries after the first attempt, on the network and on Meta's transient errors. */
const RIPROVE = 2
/** One request waits at most this long: a hung call never outlives the function. */
const TIMEOUT_RICHIESTA_MS = 20_000
/**
 * Meta's rate limits (application, user, page, custom, and 80002, the
 * Business Use Case limit of the Instagram API): transient, retried.
 */
export const CODICI_LIMITE: ReadonlySet<number> = new Set([4, 17, 32, 613, 80002])
/** Meta's words, or subcode 33, for an object that is not there (deleted, gone, not readable). */
const NON_ESISTE = /deleted|does not exist|cannot be loaded/i
const SUBCODE_NON_ESISTE = 33

/**
 * The mark of the test tokens (e2e/impostazioni-instagram.spec.ts puts
 * `IGAAe2eFinto…` in the local Vault): a token with it never leaves for a host
 * that is not loopback (creaRichiedente).
 */
export const SEGNO_TOKEN_FINTO = 'e2eFinto'

const HOST_LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** 127.0.0.1, localhost or [::1]: the fake Graph API of the tests, never Meta. */
export function hostDiLoopback(hostname: string): boolean {
  return HOST_LOOPBACK.has(hostname.toLowerCase())
}

/**
 * Where the Graph API is: Meta (`predefinita`: graph.instagram.com, or
 * graph.facebook.com for Messenger), or the fake one of the end-to-end tests
 * (e2e/graph-finto.mjs, which answers both by version) when E2E_GRAPH_FINTO is
 * set, only outside production, only with the dev login on
 * (ENABLE_DEV_LOGIN=true, as the e2e dev server runs) and only on http on a
 * loopback host. Anything else is ignored, with a warning that never says the
 * value.
 */
export function baseGraph(predefinita: string = API_BASE): string {
  const finto = process.env.E2E_GRAPH_FINTO?.trim()
  if (!finto) return predefinita
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    console.warn('[instagram] E2E_GRAPH_FINTO ignorata: vale solo in locale, col login di sviluppo')
    return predefinita
  }
  try {
    const url = new URL(finto)
    if (url.protocol === 'http:' && hostDiLoopback(url.hostname)) return url.origin
  } catch {
    // not a URL: ignored below
  }
  console.warn('[instagram] E2E_GRAPH_FINTO ignorata: solo http su 127.0.0.1, localhost o [::1]')
  return predefinita
}

export type TipoErroreInstagram =
  /** code 190: the token is expired or no longer valid */
  | 'token'
  /** a rate limit still there after the retries */
  | 'limite'
  /** Instagram not reachable */
  | 'rete'
  /** the time given to the run is over */
  | 'tempo'
  /** any other refusal of Meta's */
  | 'meta'

/** An error of the Graph API. Its message is safe to save: never the token. */
export class ErroreInstagram extends Error {
  readonly tipo: TipoErroreInstagram
  readonly code: number | null
  readonly subcode: number | null
  readonly status: number | null

  constructor(
    tipo: TipoErroreInstagram,
    messaggio: string,
    dettagli: { code?: number | null; subcode?: number | null; status?: number | null } = {},
  ) {
    super(messaggio)
    this.name = 'ErroreInstagram'
    this.tipo = tipo
    this.code = dettagli.code ?? null
    this.subcode = dettagli.subcode ?? null
    this.status = dettagli.status ?? null
  }
}

/**
 * The token as pasted: accepts "IG_TOKEN=…", quotes, spaces, line breaks or
 * the whole test URL, and keeps the token only.
 */
export function pulisciToken(grezzo: unknown): string {
  const s = String(grezzo ?? '')
    .replace(/\s+/g, '')
    .replace(/^["']|["']$/g, '')
  const trovato = s.match(/IG[A-Za-z0-9_-]{20,}/)
  if (trovato) return trovato[0]
  return s
    .replace(/^IG_TOKEN=/, '')
    .replace(/^.*access_token=/, '')
    .replace(/[&"'].*$/, '')
}

/**
 * A text with every trace of a token blanked: the token itself, any
 * access_token=…, anything shaped like an Instagram token and any long run of
 * token-like characters (the same rule as public.instagram_errore).
 */
export function oscuraToken(testo: string, token?: string | null): string {
  let pulito = testo
  if (token) pulito = pulito.split(token).join('[token]')
  return pulito
    .replace(/access_token=[^&\s"']*/gi, 'access_token=[token]')
    .replace(/IG[A-Za-z0-9_-]{20,}/g, '[token]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[token]')
}

/** What semaforo() returns: runs fn when one of its places is free. */
export type Limitatore = <T>(fn: () => Promise<T>) => Promise<T>

/** At most `quanti` calls of fn running at once; the others wait their turn, in order. */
export function semaforo(quanti: number): Limitatore {
  let liberi = quanti
  const coda: (() => void)[] = []
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (liberi > 0) liberi--
    else await new Promise<void>((avanti) => coda.push(avanti))
    try {
      return await fn()
    } finally {
      const prossimo = coda.shift()
      if (prossimo) prossimo()
      else liberi++
    }
  }
}

/** Runs fn over the items, at most `quanti` at once; the results in the items' order. */
export async function pool<T, R>(items: readonly T[], quanti: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const risultati = new Array<R>(items.length)
  let prossimo = 0
  const lavoratori = Array.from({ length: Math.min(quanti, items.length) }, async () => {
    while (prossimo < items.length) {
      const indice = prossimo++
      risultati[indice] = await fn(items[indice], indice)
    }
  })
  await Promise.all(lavoratori)
  return risultati
}

export type Json = Record<string, unknown>

/** The service named in the messages built here (the error class is ErroreInstagram for both). */
export type ServizioGraph = 'Instagram' | 'Messenger'

export type OpzioniGraph = {
  token: string
  /** default https://graph.instagram.com (the tests point it at a fake) */
  base?: string
  versione?: string
  fetch?: typeof fetch
  /** the pause between retries (the tests make it instant) */
  attendi?: (ms: number) => Promise<void>
  /**
   * epoch ms: past it, no new request starts (ErroreInstagram 'tempo'), not
   * even one already waiting for its place among the 3 on the wire
   */
  entro?: number
  timeoutMs?: number
  /**
   * the limiter of the requests on the wire, shared by every client of one
   * run on the same account (the Insight: DMs, profiles and statistics, at
   * most 3 together); without it, each client has its own semaforo(CONCORRENZA)
   */
  inFila?: Limitatore
  /** the service named in the messages of the errors (default Instagram) */
  servizio?: ServizioGraph
}

const pausa = (ms: number) => new Promise<void>((risolvi) => setTimeout(risolvi, ms))

/** A finite number, or null. */
export function numero(valore: unknown): number | null {
  return typeof valore === 'number' && Number.isFinite(valore) ? valore : null
}

/** A JSON object, or null for anything else (an empty or cut body, an array, a number). */
function oggettoJson(testo: string): Json | null {
  try {
    const valore: unknown = JSON.parse(testo)
    return valore !== null && typeof valore === 'object' && !Array.isArray(valore) ? (valore as Json) : null
  } catch {
    return null
  }
}

/** The request machinery shared by every client and the token refresh. */
export function creaRichiedente(op: OpzioniGraph) {
  const token = op.token
  const fetchFn = op.fetch ?? fetch
  const attendi = op.attendi ?? pausa
  const timeoutMs = op.timeoutMs ?? TIMEOUT_RICHIESTA_MS
  const servizio: ServizioGraph = op.servizio ?? 'Instagram'
  // the requests on the wire at once, whoever asks (the waits between retries
  // hold no place): the run's limiter when given, otherwise the client's own
  const inFila = op.inFila ?? semaforo(CONCORRENZA)

  const controllaTempo = () => {
    if (op.entro !== undefined && Date.now() > op.entro) {
      throw new ErroreInstagram('tempo', 'Tempo finito prima di leggere tutte le chat')
    }
  }

  async function richiesta(url: URL, tentativo = 0): Promise<Json> {
    // a test token never reaches Meta, whatever base the caller passed (in
    // production too: a real token never carries the mark)
    if (token.includes(SEGNO_TOKEN_FINTO) && !hostDiLoopback(url.hostname)) {
      throw new ErroreInstagram('meta', `Token di prova: ${servizio} non si chiama (avvia il dev server con E2E_GRAPH_FINTO).`)
    }
    controllaTempo()
    let lettura: { risposta: Response; testo: string }
    try {
      // the body is read here too: a connection cut halfway through it, or the
      // timeout running out while it arrives, is the network's failure
      lettura = await inFila(async () => {
        // the time again once its turn has come: a request that waited behind
        // three slow ones never starts past `entro`
        controllaTempo()
        const r = await fetchFn(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
        return { risposta: r, testo: await r.text() }
      })
    } catch (e) {
      // the time over is not the network: never retried
      if (e instanceof ErroreInstagram) throw e
      // never the fetch error itself: undici may put the URL in it
      if (tentativo < RIPROVE) {
        await attendi(800 * (tentativo + 1))
        return richiesta(url, tentativo + 1)
      }
      throw new ErroreInstagram('rete', `${servizio} non raggiungibile (rete)`)
    }

    const { risposta, testo } = lettura
    const letto = oggettoJson(testo)
    if (risposta.ok && letto === null) {
      // a 200 without a whole answer is never "nothing": retried, then the network's failure
      if (tentativo < RIPROVE) {
        await attendi(800 * (tentativo + 1))
        return richiesta(url, tentativo + 1)
      }
      throw new ErroreInstagram('rete', `${servizio} ha dato una risposta incompleta (rete)`, { status: risposta.status })
    }
    // a refusal without a readable body still has its status
    const corpo = letto ?? {}

    const errore = (corpo.error ?? null) as Json | null
    if (!risposta.ok || errore) {
      const e = errore ?? {}
      const code = numero(e.code)
      const subcode = numero(e.error_subcode)
      const transitorio = risposta.status >= 500 || (code !== null && CODICI_LIMITE.has(code)) || e.is_transient === true
      if (transitorio && tentativo < RIPROVE) {
        await attendi(1500 * (tentativo + 1))
        return richiesta(url, tentativo + 1)
      }
      const testoMeta = typeof e.message === 'string' && e.message ? e.message : `HTTP ${risposta.status}`
      let messaggio = `Meta API: ${testoMeta} (code ${code ?? '-'}${subcode !== null ? `, subcode ${subcode}` : ''})`
      if (code === 190) {
        messaggio += '. Il token è scaduto o non valido: generane uno nuovo dal pannello Meta.'
      }
      const tipo: TipoErroreInstagram =
        code === 190 ? 'token' : code !== null && CODICI_LIMITE.has(code) ? 'limite' : 'meta'
      throw new ErroreInstagram(tipo, oscuraToken(messaggio, token).slice(0, 500), {
        code,
        subcode,
        status: risposta.status,
      })
    }
    return corpo
  }

  function url(percorso: string, parametri: Record<string, string | number | undefined | null>, versionato = true) {
    const base = (op.base ?? API_BASE).replace(/\/$/, '')
    const u = new URL(versionato ? `${base}/${op.versione ?? API_VERSIONE}${percorso}` : `${base}${percorso}`)
    for (const [chiave, valore] of Object.entries(parametri)) {
      if (valore !== undefined && valore !== null && valore !== '') u.searchParams.set(chiave, String(valore))
    }
    u.searchParams.set('access_token', token)
    return u
  }

  return { richiesta, url, controllaTempo }
}

/** The code of a Graph API error; null for anything else. */
export function codice(e: unknown): number | null {
  return e instanceof ErroreInstagram ? e.code : null
}

/** Meta says the object is not there (deleted, gone, not readable): about that object only. */
export function nonEsiste(e: unknown): boolean {
  return e instanceof ErroreInstagram && (e.subcode === SUBCODE_NON_ESISTE || NON_ESISTE.test(e.message))
}

/** Code 100 on fields we asked for: the way of reading is not supported, not this one object. */
export function campoNonSupportato(e: unknown): boolean {
  return codice(e) === 100 && !nonEsiste(e)
}
