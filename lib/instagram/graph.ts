import 'server-only'

/**
 * The Instagram Graph API, read only and server side, for the setter's
 * precompiled report (Dany, 08/10/2026). Ported from the Alpha DM Reader
 * (server/index.js), not rewritten: the same retries and backoff, the same
 * fallbacks on the fields Meta refuses (participants; messages rich -> basic
 * -> ids and one message at a time), the same concurrency of 3, the same
 * paging on the `after` cursor only when Meta says there is a next page.
 * Two things the Reader did not need for one chat at a time: at most 3
 * requests at once for the whole client (the chats are read 3 at a time,
 * and a chat read one message at a time would otherwise make 9), and a
 * fallback on the nested messages made for the whole run only once a lower
 * way has worked on the same chat (a chat that is gone never moves the run to
 * one message at a time). A 200 whose body does not read (a connection cut
 * halfway) is retried like the network, never taken for an empty answer.
 *
 * The token never leaves this module: it lives in the client's closure (the
 * object returned has no field holding it), it goes only into the URL of the
 * request, and every error message is built here and blanked of it. Meta's
 * `paging.next` is never followed nor kept: it carries the token; only the
 * cursor is. Nothing here logs.
 */

export const API_BASE = 'https://graph.instagram.com'
export const API_VERSIONE = 'v26.0'
/** Meta returns at most the last 20 messages of a chat. */
export const MESSAGGI_MAX = 20
/** Conversations per page (Meta's maximum for the inbox). */
const PAGINA_CONVERSAZIONI = 50
/** Requests running at once: Meta's rate limits are per account. */
export const CONCORRENZA = 3
/** Retries after the first attempt, on the network and on Meta's transient errors. */
const RIPROVE = 2
/** One request waits at most this long: a hung call never outlives the function. */
const TIMEOUT_RICHIESTA_MS = 20_000
/** Meta's rate limits (application, user, page, custom): transient, retried. */
const CODICI_LIMITE = new Set([4, 17, 32, 613])
/** Meta's words, or subcode 33, for an object that is not there (deleted, gone, not readable). */
const NON_ESISTE = /deleted|does not exist|cannot be loaded/i
const SUBCODE_NON_ESISTE = 33

const CAMPI_RICCHI = 'id,created_time,from,to,message,shares'
const CAMPI_BASE = 'id,created_time,from,to,message'

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

/** At most `quanti` calls of fn running at once; the others wait their turn, in order. */
export function semaforo(quanti: number) {
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

type Json = Record<string, unknown>

export type Utente = { username?: string; id?: string }

export type ConversazioneGraph = {
  id: string
  updated_time?: string
  participants?: { data?: Utente[] }
}

export type MessaggioGraph = {
  id?: string
  created_time?: string
  from?: Utente
  to?: { data?: Utente[] }
  message?: string
  shares?: { data?: { link?: string }[] }
}

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
}

const pausa = (ms: number) => new Promise<void>((risolvi) => setTimeout(risolvi, ms))

function numero(valore: unknown): number | null {
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

/** The request machinery shared by the client and the token refresh. */
function richiedente(op: OpzioniGraph) {
  const token = op.token
  const fetchFn = op.fetch ?? fetch
  const attendi = op.attendi ?? pausa
  const timeoutMs = op.timeoutMs ?? TIMEOUT_RICHIESTA_MS
  // the requests on the wire at once, whoever asks (the waits between retries hold no place)
  const inFila = semaforo(CONCORRENZA)

  const controllaTempo = () => {
    if (op.entro !== undefined && Date.now() > op.entro) {
      throw new ErroreInstagram('tempo', 'Tempo finito prima di leggere tutte le chat')
    }
  }

  async function richiesta(url: URL, tentativo = 0): Promise<Json> {
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
      throw new ErroreInstagram('rete', 'Instagram non raggiungibile (rete)')
    }

    const { risposta, testo } = lettura
    const letto = oggettoJson(testo)
    if (risposta.ok && letto === null) {
      // a 200 without a whole answer is never "nothing": retried, then the network's failure
      if (tentativo < RIPROVE) {
        await attendi(800 * (tentativo + 1))
        return richiesta(url, tentativo + 1)
      }
      throw new ErroreInstagram('rete', 'Instagram ha dato una risposta incompleta (rete)', { status: risposta.status })
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

function codice(e: unknown): number | null {
  return e instanceof ErroreInstagram ? e.code : null
}

/** Meta says the object is not there (deleted, gone, not readable): about that object only. */
function nonEsiste(e: unknown): boolean {
  return e instanceof ErroreInstagram && (e.subcode === SUBCODE_NON_ESISTE || NON_ESISTE.test(e.message))
}

/** Code 100 on fields we asked for: the way of reading is not supported, not this one object. */
function campoNonSupportato(e: unknown): boolean {
  return codice(e) === 100 && !nonEsiste(e)
}

type ModoAnnidato = 'ricco' | 'base' | 'nessuno'
const PIU_IN_BASSO: Record<Exclude<ModoAnnidato, 'nessuno'>, ModoAnnidato> = { ricco: 'base', base: 'nessuno' }
const LIVELLO: Record<ModoAnnidato, number> = { ricco: 0, base: 1, nessuno: 2 }

/**
 * A read-only client of the Graph API. The fallbacks (participants, rich
 * fields, nested messages) are remembered per client: one run, one discovery.
 */
export function creaGraph(op: OpzioniGraph) {
  const { richiesta, url, controllaTempo } = richiedente(op)
  const get = (percorso: string, parametri: Record<string, string | number | undefined | null> = {}) =>
    richiesta(url(percorso, parametri))

  let partecipantiSupportati = true
  let campiRicchiOk = true
  // the way of reading the messages for the whole run: lowered only once a
  // lower way has worked on a chat where the higher one was refused
  let modoAnnidato: ModoAnnidato = 'ricco'
  const scendi = (modo: ModoAnnidato) => {
    if (LIVELLO[modo] > LIVELLO[modoAnnidato]) modoAnnidato = modo
  }

  /** The account the token belongs to. */
  async function me(): Promise<{ user_id: string | null; username: string | null }> {
    const j = await get('/me', { fields: 'user_id,username' })
    return {
      user_id: typeof j.user_id === 'string' || typeof j.user_id === 'number' ? String(j.user_id) : null,
      username: typeof j.username === 'string' ? j.username : null,
    }
  }

  /** One page of the inbox, most recent first, and the cursor of the next (null: the last). */
  async function paginaConversazioni(after?: string | null): Promise<{ conversazioni: ConversazioneGraph[]; after: string | null }> {
    const base = { platform: 'instagram', limit: PAGINA_CONVERSAZIONI, after: after ?? undefined }
    let j: Json | null = null
    if (partecipantiSupportati) {
      try {
        j = await get('/me/conversations', { ...base, fields: 'participants,updated_time' })
      } catch (e) {
        if (codice(e) !== 100) throw e
        partecipantiSupportati = false
      }
    }
    if (!j) j = await get('/me/conversations', { ...base, fields: 'updated_time' })

    const data = Array.isArray(j.data) ? (j.data as ConversazioneGraph[]) : []
    const paging = (j.paging ?? {}) as { next?: unknown; cursors?: { after?: unknown } }
    // the cursor only: paging.next is a URL with the token in it
    const prossimo = paging.next && typeof paging.cursors?.after === 'string' ? paging.cursors.after : null
    return { conversazioni: data.filter((c) => typeof c?.id === 'string'), after: prossimo }
  }

  /**
   * The conversations updated from `dal` on (the inbox is sorted by
   * updated_time, most recent first: the first older one ends the reading).
   */
  async function conversazioniDal(dal: Date, pagineMax = 20): Promise<{ conversazioni: ConversazioneGraph[]; troncato: boolean }> {
    const limite = dal.getTime()
    const out: ConversazioneGraph[] = []
    let cursore: string | null = null
    for (let pagina = 0; pagina < pagineMax; pagina++) {
      const { conversazioni, after } = await paginaConversazioni(cursore)
      for (const c of conversazioni) {
        const quando = Date.parse(c.updated_time ?? '')
        if (Number.isFinite(quando) && quando < limite) return { conversazioni: out, troncato: false }
        out.push(c)
      }
      if (!after) return { conversazioni: out, troncato: false }
      cursore = after
    }
    return { conversazioni: out, troncato: true }
  }

  /** One message by id; null when it no longer exists (deleted). */
  async function messaggio(id: string): Promise<MessaggioGraph | null> {
    if (campiRicchiOk) {
      try {
        return (await get(`/${id}`, { fields: CAMPI_RICCHI })) as MessaggioGraph
      } catch (e) {
        if (!(e instanceof ErroreInstagram)) throw e
        if (nonEsiste(e)) return null
        if (e.code !== 100) throw e
        campiRicchiOk = false
      }
    }
    try {
      return (await get(`/${id}`, { fields: CAMPI_BASE })) as MessaggioGraph
    } catch (e) {
      if (nonEsiste(e)) return null
      throw e
    }
  }

  /**
   * The last messages of a conversation (at most 20, Meta's limit), as Meta
   * returns them (most recent first), and how many were read: the ids listed,
   * so a deleted message still says that the chat was that long.
   */
  async function messaggi(conversazioneId: string, quanti = MESSAGGI_MAX): Promise<{ messaggi: MessaggioGraph[]; letti: number }> {
    const n = Math.max(1, Math.min(MESSAGGI_MAX, quanti))
    // 1) nested expansion, one call: from the run's way, down only for this
    // chat; the run follows only when the lower way works here. A chat that
    // is not there fails alone (among the uncertain ones), and three chats
    // refused at once in the rich way go down one step, never two.
    let modo = modoAnnidato
    let rifiutato = false
    while (modo !== 'nessuno') {
      const campi = modo === 'ricco' ? CAMPI_RICCHI : CAMPI_BASE
      let j: Json
      try {
        j = await get(`/${conversazioneId}`, { fields: `messages.limit(${n}){${campi}}` })
      } catch (e) {
        if (!campoNonSupportato(e)) throw e
        rifiutato = true
        modo = PIU_IN_BASSO[modo]
        continue
      }
      if (rifiutato) scendi(modo)
      const data = (((j.messages ?? {}) as Json).data ?? []) as MessaggioGraph[]
      if (!Array.isArray(data) || data.length === 0) return { messaggi: [], letti: 0 }
      if (data.every((m) => m?.created_time)) return { messaggi: data, letti: data.length }
      rifiutato = false
      break // incomplete data: the two-step way
    }
    // 2) the ids, then each message
    const j = await get(`/${conversazioneId}`, { fields: 'messages' })
    // both nested ways refused on this chat, and this one works: the run reads this way from now on
    if (rifiutato) scendi('nessuno')
    const elenco = (((j.messages ?? {}) as Json).data ?? []) as { id?: unknown }[]
    const ids = (Array.isArray(elenco) ? elenco : [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === 'string')
      .slice(0, n)
    // the client never has more than 3 requests on the wire, whoever asks
    const letti = await pool(ids, CONCORRENZA, (id) => messaggio(id))
    return { messaggi: letti.filter((m): m is MessaggioGraph => m !== null), letti: ids.length }
  }

  return { me, paginaConversazioni, conversazioniDal, messaggi, controllaTempo }
}

export type Graph = ReturnType<typeof creaGraph>

/**
 * Refreshes a long-lived token (60 days; Meta refreshes only a valid one
 * older than 24 hours). The new token and when it expires (null when Meta
 * does not say). The new token goes straight to the database, never anywhere
 * else.
 */
export async function rinnovaToken(op: OpzioniGraph): Promise<{ token: string; scadeIl: Date | null }> {
  const { richiesta, url } = richiedente(op)
  const j = await richiesta(url('/refresh_access_token', { grant_type: 'ig_refresh_token' }, false))
  const nuovo = typeof j.access_token === 'string' ? pulisciToken(j.access_token) : ''
  if (!/^[A-Za-z0-9_.|-]{20,2048}$/.test(nuovo)) {
    throw new ErroreInstagram('meta', 'Meta API: rinnovo del token senza un token valido nella risposta')
  }
  const secondi = numero(j.expires_in)
  return { token: nuovo, scadeIl: secondi && secondi > 0 ? new Date(Date.now() + secondi * 1000) : null }
}
