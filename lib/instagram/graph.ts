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
 * The Insight (1.35.0) reads the same chats with their text (`lettura:
 * 'testo'`): one step more on top of the ladder, the Reader's complete fields
 * (attachments, stories, unsupported content), so a voice note or a story
 * reply is a label and not "[contenuto non disponibile]"; a single message
 * Meta refuses becomes "[non leggibile]" instead of failing the chat. It also
 * reads the leads' profiles (never their picture) and the most recent chats.
 * The night report keeps reading as before (`lettura: 'conteggio'`).
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
  type OpzioniGraph as OpzioniRichieste,
  type TipoErroreInstagram,
} from '@/lib/instagram/richieste'
import { normalizzaUsername } from '@/lib/setting/conteggio-dm'

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
  type TipoErroreInstagram,
}

/**
 * How the chats are read: 'conteggio' for the night report (times, who wrote,
 * the call link: today's ladder from the rich fields), 'testo' for the
 * Insight (the complete fields on top, and an unreadable message kept as a
 * placeholder).
 */
export type LetturaGraph = 'conteggio' | 'testo'

export type OpzioniGraph = OpzioniRichieste & {
  /** default 'conteggio' */
  lettura?: LetturaGraph
}

/** Meta returns at most the last 20 messages of a chat. */
export const MESSAGGI_MAX = 20
/** Conversations per page (Meta's maximum for the inbox). */
const PAGINA_CONVERSAZIONI = 50
/** A cursor that never ends: at most this many pages per reading of the inbox. */
const PAGINE_MAX = 20

/** The DM Reader's RICH fields: what the Insight reads first. */
export const CAMPI_COMPLETI = 'id,created_time,from,to,message,attachments,story,shares,is_unsupported'
const CAMPI_RICCHI = 'id,created_time,from,to,message,shares'
const CAMPI_BASE = 'id,created_time,from,to,message'

/**
 * A lead's profile, from the richest set Meta gives down to the name; never
 * the profile picture (a CDN link that expires, not needed).
 */
const CAMPI_PROFILO = [
  'name,username,follower_count,is_verified_user,is_user_follow_business,is_business_follow_user',
  'name,username,follower_count',
  'name,username',
] as const
/** An Instagram-scoped user id: digits only (insight_chat.utente_id). Anything else never reaches a URL. */
const RE_UTENTE_ID = /^[0-9]{1,30}$/
/** insight_profili.nome */
const NOME_MAX = 120
const INTERO_MAX = 2_147_483_647

export type Utente = { username?: string; id?: string }

export type ConversazioneGraph = {
  id: string
  updated_time?: string
  participants?: { data?: Utente[] }
}

/** An attachment of a message (Instagram and Messenger have the same shape). */
export type AllegatoGraph = {
  mime_type?: string
  image_data?: unknown
  video_data?: unknown
  audio_data?: unknown
  generic_template?: unknown
  file_url?: string
}

/** The story a message answers or mentions: its link is a CDN asset, never kept. */
export type StoriaGraph = {
  reply_to?: { link?: string; id?: string }
  mention?: { link?: string; id?: string }
}

export type MessaggioGraph = {
  id?: string
  created_time?: string
  from?: Utente
  to?: { data?: Utente[] }
  message?: string
  attachments?: { data?: (AllegatoGraph | null)[] }
  story?: StoriaGraph
  shares?: { data?: { link?: string }[] }
  sticker?: unknown
  is_unsupported?: boolean
  /**
   * set by this client, never by Meta: a message whose reading Meta refused
   * with the text read ('testo'); only its id and, from the list, its time
   */
  non_leggibile?: true
}

/** A lead's profile as the Insight keeps it (insight_profili). */
export type ProfiloLead = {
  nome: string | null
  username: string | null
  follower: number | null
  verificato: boolean | null
  ti_segue: boolean | null
  lo_segui: boolean | null
}

type ModoAnnidato = 'completo' | 'ricco' | 'base' | 'nessuno'
type ModoCampi = Exclude<ModoAnnidato, 'nessuno'>
const PIU_IN_BASSO: Record<ModoCampi, ModoAnnidato> = { completo: 'ricco', ricco: 'base', base: 'nessuno' }
const LIVELLO: Record<ModoAnnidato, number> = { completo: 0, ricco: 1, base: 2, nessuno: 3 }
const CAMPI_DEL_MODO: Record<ModoCampi, string> = { completo: CAMPI_COMPLETI, ricco: CAMPI_RICCHI, base: CAMPI_BASE }

function testoValido(valore: unknown): string | null {
  return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null
}

/** A name at most 120 code points; an empty one is none. */
function nomeDa(valore: unknown): string | null {
  const nome = testoValido(valore)
  return nome === null ? null : [...nome].slice(0, NOME_MAX).join('')
}

function interoDa(valore: unknown): number | null {
  const n = numero(valore)
  return n !== null && Number.isInteger(n) && n >= 0 && n <= INTERO_MAX ? n : null
}

const booleano = (valore: unknown): boolean | null => (typeof valore === 'boolean' ? valore : null)

/**
 * A read-only client of the Graph API. The fallbacks (participants, rich
 * fields, nested messages, profile fields) are remembered per client: one
 * run, one discovery.
 */
export function creaGraph(op: OpzioniGraph) {
  const { richiesta, url, controllaTempo } = creaRichiedente(op)
  const get = (percorso: string, parametri: Record<string, string | number | undefined | null> = {}) =>
    richiesta(url(percorso, parametri))
  const testo = op.lettura === 'testo'
  // the way the night report reads stays the same: from the rich fields
  const primo: ModoCampi = testo ? 'completo' : 'ricco'

  let partecipantiSupportati = true
  // the fields of a message read on its own: lowered for the client at the first refusal
  let campiMessaggio: ModoCampi = primo
  // the way of reading the messages for the whole run: lowered only once a
  // lower way has worked on a chat where the higher one was refused
  let modoAnnidato: ModoAnnidato = primo
  const scendi = (modo: ModoAnnidato) => {
    if (LIVELLO[modo] > LIVELLO[modoAnnidato]) modoAnnidato = modo
  }
  let gradinoProfilo = 0

  /** The account the token belongs to. */
  async function me(): Promise<{ user_id: string | null; username: string | null }> {
    const j = await get('/me', { fields: 'user_id,username' })
    return {
      user_id: typeof j.user_id === 'string' || typeof j.user_id === 'number' ? String(j.user_id) : null,
      username: typeof j.username === 'string' ? j.username : null,
    }
  }

  /** One page of the inbox, most recent first, and the cursor of the next (null: the last). */
  async function paginaConversazioni(
    after?: string | null,
    limite: number = PAGINA_CONVERSAZIONI,
  ): Promise<{ conversazioni: ConversazioneGraph[]; after: string | null }> {
    const base = { platform: 'instagram', limit: limite, after: after ?? undefined }
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
  async function conversazioniDal(dal: Date, pagineMax = PAGINE_MAX): Promise<{ conversazioni: ConversazioneGraph[]; troncato: boolean }> {
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

  /** The `quante` most recent conversations, whatever their date (the routine's "last 30"). */
  async function conversazioniRecenti(quante: number): Promise<ConversazioneGraph[]> {
    const n = Math.max(1, Math.floor(Number.isFinite(quante) ? quante : 1))
    const out: ConversazioneGraph[] = []
    let cursore: string | null = null
    for (let pagina = 0; pagina < PAGINE_MAX && out.length < n; pagina++) {
      const { conversazioni, after } = await paginaConversazioni(cursore, Math.min(PAGINA_CONVERSAZIONI, n - out.length))
      out.push(...conversazioni)
      if (!after) break
      cursore = after
    }
    return out.slice(0, n)
  }

  /**
   * One message by id; null when it no longer exists (deleted). Reading the
   * text, a message Meta refuses is kept as "[non leggibile]" with the time
   * the list gave (`quando`): the chat is still read.
   */
  async function messaggio(id: string, quando?: string): Promise<MessaggioGraph | null> {
    for (;;) {
      const livello = campiMessaggio
      try {
        return (await get(`/${id}`, { fields: CAMPI_DEL_MODO[livello] })) as MessaggioGraph
      } catch (e) {
        if (!(e instanceof ErroreInstagram)) throw e
        if (nonEsiste(e)) return null
        const sotto = PIU_IN_BASSO[livello]
        if (e.code === 100 && sotto !== 'nessuno') {
          if (LIVELLO[sotto] > LIVELLO[campiMessaggio]) campiMessaggio = sotto
          continue
        }
        // never the error itself in the message: only that it was not read
        if (testo && e.tipo === 'meta') return { id, ...(quando ? { created_time: quando } : {}), non_leggibile: true }
        throw e
      }
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
      let j: Json
      try {
        j = await get(`/${conversazioneId}`, { fields: `messages.limit(${n}){${CAMPI_DEL_MODO[modo]}}` })
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
    const elenco = (((j.messages ?? {}) as Json).data ?? []) as { id?: unknown; created_time?: unknown }[]
    const voci = (Array.isArray(elenco) ? elenco : [])
      .filter((m): m is { id: string; created_time?: unknown } => typeof m?.id === 'string')
      .slice(0, n)
    // the client never has more than 3 requests on the wire, whoever asks
    const letti = await pool(voci, CONCORRENZA, (m) =>
      messaggio(m.id, typeof m.created_time === 'string' ? m.created_time : undefined),
    )
    return { messaggi: letti.filter((m): m is MessaggioGraph => m !== null), letti: voci.length }
  }

  /**
   * A lead's profile by its Instagram-scoped id: from the richest set of
   * fields down to the name (code 100: the next set, remembered for the
   * client). Null when Meta says the user is not there or does not give the
   * profile (a refusal about this lead, such as the consent the profile API
   * asks); the token, Meta's limits, the network and the time still throw.
   */
  async function profilo(utenteId: string): Promise<ProfiloLead | null> {
    if (!RE_UTENTE_ID.test(utenteId)) return null
    while (gradinoProfilo < CAMPI_PROFILO.length) {
      const gradino = gradinoProfilo
      let j: Json
      try {
        j = await get(`/${utenteId}`, { fields: CAMPI_PROFILO[gradino] })
      } catch (e) {
        if (!(e instanceof ErroreInstagram) || e.tipo !== 'meta') throw e
        if (nonEsiste(e)) return null
        if (e.code === 100) {
          if (gradinoProfilo === gradino) gradinoProfilo = gradino + 1
          continue
        }
        return null
      }
      return {
        nome: nomeDa(j.name),
        username: normalizzaUsername(j.username),
        follower: interoDa(j.follower_count),
        verificato: booleano(j.is_verified_user),
        ti_segue: booleano(j.is_user_follow_business),
        lo_segui: booleano(j.is_business_follow_user),
      }
    }
    return null
  }

  return { me, paginaConversazioni, conversazioniDal, conversazioniRecenti, messaggi, profilo, controllaTempo }
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
