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

import {
  API_BASE,
  API_VERSIONE,
  campoNonSupportato,
  codice,
  CONCORRENZA,
  creaRichiedente,
  ErroreInstagram,
  nonEsiste,
  numero,
  oscuraToken,
  pool,
  pulisciToken,
  semaforo,
  type Json,
  type OpzioniGraph,
  type TipoErroreInstagram,
} from '@/lib/instagram/richieste'

// The request machinery lives in richieste.ts (09/10/2026: the posts of the
// content calendar read with it too); the same names are exported from here.
export {
  API_BASE,
  API_VERSIONE,
  CONCORRENZA,
  ErroreInstagram,
  oscuraToken,
  pool,
  pulisciToken,
  semaforo,
  type OpzioniGraph,
  type TipoErroreInstagram,
}

/** Meta returns at most the last 20 messages of a chat. */
export const MESSAGGI_MAX = 20
/** Conversations per page (Meta's maximum for the inbox). */
const PAGINA_CONVERSAZIONI = 50

const CAMPI_RICCHI = 'id,created_time,from,to,message,shares'
const CAMPI_BASE = 'id,created_time,from,to,message'

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

type ModoAnnidato = 'ricco' | 'base' | 'nessuno'
const PIU_IN_BASSO: Record<Exclude<ModoAnnidato, 'nessuno'>, ModoAnnidato> = { ricco: 'base', base: 'nessuno' }
const LIVELLO: Record<ModoAnnidato, number> = { ricco: 0, base: 1, nessuno: 2 }

/**
 * A read-only client of the Graph API. The fallbacks (participants, rich
 * fields, nested messages) are remembered per client: one run, one discovery.
 */
export function creaGraph(op: OpzioniGraph) {
  const { richiesta, url, controllaTempo } = creaRichiedente(op)
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
  const { richiesta, url } = creaRichiedente(op)
  const j = await richiesta(url('/refresh_access_token', { grant_type: 'ig_refresh_token' }, false))
  const nuovo = typeof j.access_token === 'string' ? pulisciToken(j.access_token) : ''
  if (!/^[A-Za-z0-9_.|-]{20,2048}$/.test(nuovo)) {
    throw new ErroreInstagram('meta', 'Meta API: rinnovo del token senza un token valido nella risposta')
  }
  const secondi = numero(j.expires_in)
  return { token: nuovo, scadeIl: secondi && secondi > 0 ? new Date(Date.now() + secondi * 1000) : null }
}
