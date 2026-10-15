import 'server-only'

import type { AllegatoGraph } from '@/lib/instagram/graph'
import {
  baseGraph,
  campoNonSupportato,
  CONCORRENZA,
  creaRichiedente,
  ErroreInstagram,
  nonEsiste,
  pool,
  type Json,
  type OpzioniGraph,
} from '@/lib/instagram/richieste'
import { chatDaMessaggi, istanteISO, messaggiInOrdine, type ChatTesto } from '@/lib/instagram/testo'

/**
 * A read-only client of the Messenger chats of the Percorso Alpha Page
 * (1.35.0, CLAUDE.md section 29): the Insight reads them with the Page token
 * the admin pastes in Impostazioni › Instagram e Messenger (Vault,
 * messenger_token). It never sends a message. Ported from the DM Reader's
 * Messenger part (server/index.js): graph.facebook.com at its one version,
 * the conversations with participants and updated_time on the cursor only,
 * the messages nested with the rich fields, then the basic ones, then the ids
 * and each message; a message is "ours" when the Page wrote it.
 *
 * Built on the request machinery of the Instagram readers
 * (lib/instagram/richieste.ts): the same retries, deadline, test-token guard
 * and token blanking, with its own limiter (another host, another rate-limit
 * bucket: it reads alongside Instagram) and «Messenger» in its messages.
 * What Meta gives about a person beyond the id and the name (the `email` of
 * `from` and of the participants) is dropped as soon as it arrives. The token
 * never leaves this module; nothing here logs.
 */

export const MESSENGER_BASE = 'https://graph.facebook.com'
/** The DM reader's version, the only one: no version ladder. */
export const MESSENGER_VERSIONE = 'v23.0'
/** Messages per chat Meta returns at most. */
export const MESSAGGI_MAX_MESSENGER = 20
export const FB_COMPLETI = 'id,created_time,from,to,message,attachments,sticker,shares'
export const FB_BASE = 'id,created_time,from,to,message'

/** Conversations per page (Meta's maximum). */
const PAGINA_CONVERSAZIONI = 50
/** A cursor that never ends: at most this many pages per reading. */
const PAGINE_MAX = 20
/** A Page id or a PSID: digits only (messenger_collegamento.pagina_id, messenger_esclusi.utente_id). */
const RE_ID = /^[0-9]{1,30}$/
/** messenger_collegamento.pagina_nome, insight_chat.nome */
const NOME_MAX = 120

/** A participant: the Page, or the lead (`id` is the PSID). Never the email Meta adds. */
export type UtenteMessenger = { id?: string; name?: string }

export type PaginaMessenger = { id: string; nome: string | null }

export type ConversazioneMessenger = {
  id: string
  updated_time?: string
  participants?: { data?: UtenteMessenger[] }
}

export type AllegatoMessenger = AllegatoGraph

export type MessaggioMessenger = {
  id?: string
  created_time?: string
  from?: UtenteMessenger
  to?: { data?: UtenteMessenger[] }
  message?: string
  attachments?: { data?: (AllegatoMessenger | null)[] }
  sticker?: unknown
  shares?: { data?: { link?: string }[] }
  /** set by this client, never by Meta: a message Meta refused to give */
  non_leggibile?: true
}

/** The lead of a chat: the participant whose id is not the Page's. */
export type LeadMessenger = { nome: string | null; utente_id: string }

/**
 * The Page token as pasted (a port of the DM reader's cleanFbToken): spaces,
 * line breaks and quotes go, `FB_PAGE_TOKEN=` and `access_token=` too, and a
 * whole URL keeps only the token. An unexpanded placeholder ("${…}") is no
 * token.
 */
export function pulisciTokenPagina(grezzo: unknown): string {
  const s = String(grezzo ?? '')
    .replace(/\s+/g, '')
    .replace(/^["']+|["']+$/g, '')
  if (s.includes('${')) return ''
  const trovato = s.match(/EA[A-Za-z0-9]{20,}/)
  if (trovato) return trovato[0]
  return s
    .replace(/^FB_PAGE_TOKEN=/, '')
    .replace(/^.*access_token=/, '')
    .replace(/[&"'].*$/, '')
}

function nomeDa(valore: unknown): string | null {
  if (typeof valore !== 'string' || valore.trim() === '') return null
  return [...valore.trim()].slice(0, NOME_MAX).join('')
}

function idDa(valore: unknown): string | null {
  const id = typeof valore === 'string' || typeof valore === 'number' ? String(valore) : null
  return id && RE_ID.test(id) ? id : null
}

function oggetto(valore: unknown): Json | null {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore) ? (valore as Json) : null
}

/** A participant with its id and name only (Meta adds an email: never kept). */
function utente(grezzo: unknown): UtenteMessenger | undefined {
  const j = oggetto(grezzo)
  if (!j) return undefined
  const u: UtenteMessenger = {}
  if (typeof j.id === 'string' || typeof j.id === 'number') u.id = String(j.id)
  if (typeof j.name === 'string') u.name = j.name
  return u
}

function utenti(grezzo: unknown): { data: UtenteMessenger[] } | undefined {
  const data = oggetto(grezzo)?.data
  if (!Array.isArray(data)) return undefined
  return { data: data.map(utente).filter((u): u is UtenteMessenger => u !== undefined) }
}

/** A conversation of Meta's answer with only what the Insight uses. */
function conversazioneDa(grezzo: unknown): ConversazioneMessenger | null {
  const j = oggetto(grezzo)
  if (!j || typeof j.id !== 'string' || j.id === '') return null
  const c: ConversazioneMessenger = { id: j.id }
  if (typeof j.updated_time === 'string') c.updated_time = j.updated_time
  const partecipanti = utenti(j.participants)
  if (partecipanti) c.participants = partecipanti
  return c
}

/** A message of Meta's answer with only the fields the Insight reads. */
function messaggioDa(grezzo: unknown): MessaggioMessenger | null {
  const j = oggetto(grezzo)
  if (!j) return null
  const m: MessaggioMessenger = {}
  if (typeof j.id === 'string') m.id = j.id
  if (typeof j.created_time === 'string') m.created_time = j.created_time
  const da = utente(j.from)
  if (da) m.from = da
  const a = utenti(j.to)
  if (a) m.to = a
  if (typeof j.message === 'string') m.message = j.message
  const allegati = oggetto(j.attachments)?.data
  if (Array.isArray(allegati)) m.attachments = { data: allegati.map((x) => oggetto(x) as AllegatoMessenger | null) }
  if (j.sticker) m.sticker = j.sticker
  const condivisi = oggetto(j.shares)?.data
  if (Array.isArray(condivisi)) {
    m.shares = {
      data: condivisi.map((x) => {
        const link = oggetto(x)?.link
        return typeof link === 'string' ? { link } : {}
      }),
    }
  }
  return m
}

/** The lead among some participants: the first one with a PSID that is not the Page's. */
function leadTra(candidati: readonly (UtenteMessenger | undefined)[], paginaId: string): LeadMessenger | null {
  for (const c of candidati) {
    const id = idDa(c?.id)
    if (id && id !== paginaId) return { utente_id: id, nome: nomeDa(c?.name) }
  }
  return null
}

/** The lead of a conversation, from its participants. */
export function leadDellaConversazione(conversazione: ConversazioneMessenger, paginaId: string): LeadMessenger | null {
  return leadTra(conversazione.participants?.data ?? [], paginaId)
}

/** The lead from the messages: who wrote to the Page, or whom the Page wrote to. */
function leadDaiMessaggi(messaggi: readonly MessaggioMessenger[], paginaId: string): LeadMessenger | null {
  return leadTra(
    [
      ...messaggi.filter((m) => m.from?.id !== paginaId).map((m) => m.from),
      ...messaggi.filter((m) => m.from?.id === paginaId).flatMap((m) => m.to?.data ?? []),
    ],
    paginaId,
  )
}

type ModoAnnidato = 'completo' | 'base' | 'nessuno'
type ModoCampi = Exclude<ModoAnnidato, 'nessuno'>
const PIU_IN_BASSO: Record<ModoCampi, ModoAnnidato> = { completo: 'base', base: 'nessuno' }
const LIVELLO: Record<ModoAnnidato, number> = { completo: 0, base: 1, nessuno: 2 }
const CAMPI_DEL_MODO: Record<ModoCampi, string> = { completo: FB_COMPLETI, base: FB_BASE }

/**
 * A read-only client of the Page's conversations. The fallbacks
 * (participants, fields, nested messages) and the Page are remembered per
 * client, like the Instagram readers.
 */
export function creaGraphMessenger(op: OpzioniGraph) {
  const { richiesta, url, controllaTempo } = creaRichiedente({
    ...op,
    base: op.base ?? baseGraph(MESSENGER_BASE),
    versione: MESSENGER_VERSIONE,
    servizio: 'Messenger',
  })
  const get = (percorso: string, parametri: Record<string, string | number | undefined | null> = {}) =>
    richiesta(url(percorso, parametri))

  let paginaLetta: Promise<PaginaMessenger> | null = null
  let partecipantiSupportati = true
  // the fields of a message read on its own: lowered for the client at the first refusal
  let campiMessaggio: ModoCampi = 'completo'
  // the nested way for the run: lowered only once a lower way has worked on a chat
  let modoAnnidato: ModoAnnidato = 'completo'
  const scendi = (modo: ModoAnnidato) => {
    if (LIVELLO[modo] > LIVELLO[modoAnnidato]) modoAnnidato = modo
  }

  /** The Page the token belongs to (GET /me?fields=id,name), read once per client. */
  async function pagina(): Promise<PaginaMessenger> {
    paginaLetta ??= (async () => {
      const j = await get('/me', { fields: 'id,name' })
      const id = idDa(j.id)
      if (!id) throw new ErroreInstagram('meta', 'Meta API: il token non ha detto di quale Pagina è (manca il suo id).')
      return { id, nome: nomeDa(j.name) }
    })()
    try {
      return await paginaLetta
    } catch (e) {
      // a failure is not remembered: the next call asks again
      paginaLetta = null
      throw e
    }
  }

  /** One page of the Page's inbox, most recent first, and the cursor of the next (null: the last). */
  async function paginaConversazioni(
    after?: string | null,
    limite: number = PAGINA_CONVERSAZIONI,
  ): Promise<{ conversazioni: ConversazioneMessenger[]; after: string | null }> {
    const base = { platform: 'messenger', limit: limite, after: after ?? undefined }
    let j: Json | null = null
    if (partecipantiSupportati) {
      try {
        j = await get('/me/conversations', { ...base, fields: 'participants,updated_time' })
      } catch (e) {
        if (!campoNonSupportato(e)) throw e
        partecipantiSupportati = false
      }
    }
    if (!j) j = await get('/me/conversations', { ...base, fields: 'updated_time' })

    const data = Array.isArray(j.data) ? (j.data as unknown[]) : []
    const paging = (j.paging ?? {}) as { next?: unknown; cursors?: { after?: unknown } }
    // the cursor only: paging.next is a URL with the token in it
    const prossimo = paging.next && typeof paging.cursors?.after === 'string' ? paging.cursors.after : null
    return {
      conversazioni: data.map(conversazioneDa).filter((c): c is ConversazioneMessenger => c !== null),
      after: prossimo,
    }
  }

  /** The conversations updated from `dal` on, most recent first. */
  async function conversazioniDal(dal: Date, pagineMax = PAGINE_MAX): Promise<{ conversazioni: ConversazioneMessenger[]; troncato: boolean }> {
    const limite = dal.getTime()
    const out: ConversazioneMessenger[] = []
    let cursore: string | null = null
    for (let n = 0; n < pagineMax; n++) {
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

  /** The `quante` most recent conversations (1 proves that the token reads the messages). */
  async function conversazioniRecenti(quante: number): Promise<ConversazioneMessenger[]> {
    const n = Math.max(1, Math.floor(Number.isFinite(quante) ? quante : 1))
    const out: ConversazioneMessenger[] = []
    let cursore: string | null = null
    for (let p = 0; p < PAGINE_MAX && out.length < n; p++) {
      const { conversazioni, after } = await paginaConversazioni(cursore, Math.min(PAGINA_CONVERSAZIONI, n - out.length))
      out.push(...conversazioni)
      if (!after) break
      cursore = after
    }
    return out.slice(0, n)
  }

  /** One message by id; null when it no longer exists; "[non leggibile]" when Meta refuses it. */
  async function messaggio(id: string, quando?: string): Promise<MessaggioMessenger | null> {
    for (;;) {
      const livello = campiMessaggio
      try {
        return messaggioDa(await get(`/${id}`, { fields: CAMPI_DEL_MODO[livello] }))
      } catch (e) {
        if (!(e instanceof ErroreInstagram)) throw e
        if (nonEsiste(e)) return null
        const sotto = PIU_IN_BASSO[livello]
        if (e.code === 100 && sotto !== 'nessuno') {
          if (LIVELLO[sotto] > LIVELLO[campiMessaggio]) campiMessaggio = sotto
          continue
        }
        // never the error itself in the message: only that it was not read
        if (e.tipo === 'meta') return { id, ...(quando ? { created_time: quando } : {}), non_leggibile: true }
        throw e
      }
    }
  }

  /**
   * The last messages of a chat (at most 20), most recent first as Meta gives
   * them, how many were read (the ids listed) and its lead from the messages
   * (the participant whose id is not the Page's).
   */
  async function messaggi(
    conversazioneId: string,
    quanti: number = MESSAGGI_MAX_MESSENGER,
  ): Promise<{ messaggi: MessaggioMessenger[]; letti: number; lead: LeadMessenger | null }> {
    const n = Math.max(1, Math.min(MESSAGGI_MAX_MESSENGER, quanti))
    const { id: paginaId } = await pagina()
    const fine = (letti: MessaggioMessenger[], quantiLetti: number) => ({
      messaggi: letti,
      letti: quantiLetti,
      lead: leadDaiMessaggi(letti, paginaId),
    })

    // 1) nested, from the run's way, down only for this chat (as Instagram)
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
      const data = oggetto(j.messages)?.data
      const letti = (Array.isArray(data) ? data : []).map(messaggioDa).filter((m): m is MessaggioMessenger => m !== null)
      if (letti.length === 0) return fine([], 0)
      if (letti.every((m) => m.created_time)) return fine(letti, letti.length)
      rifiutato = false
      break // incomplete data: the two-step way
    }

    // 2) the ids, then each message (at most 3 on the wire, whoever asks)
    const j = await get(`/${conversazioneId}`, { fields: 'messages' })
    if (rifiutato) scendi('nessuno')
    const elenco = oggetto(j.messages)?.data
    const voci = (Array.isArray(elenco) ? elenco : [])
      .map(oggetto)
      .filter((m): m is Json & { id: string } => typeof m?.id === 'string')
      .slice(0, n)
    const letti = await pool(voci, CONCORRENZA, (m) =>
      messaggio(m.id, typeof m.created_time === 'string' ? m.created_time : undefined),
    )
    return fine(letti.filter((m): m is MessaggioMessenger => m !== null), voci.length)
  }

  return { pagina, conversazioniDal, conversazioniRecenti, messaggi, controllaTempo }
}

export type GraphMessenger = ReturnType<typeof creaGraphMessenger>

/**
 * A Messenger chat as the Insight keeps it: the lead's PSID and name (from
 * the participants, then from the messages), no username, the messages
 * oldest first with the same labels as Instagram (lib/instagram/testo.ts).
 * Older messages are dropped before storing (senzaVecchi).
 */
export function versoChatMessenger(
  conversazione: ConversazioneMessenger,
  letti: { messaggi: readonly MessaggioMessenger[]; letti: number; lead?: LeadMessenger | null },
  pagina: Pick<PaginaMessenger, 'id'>,
): ChatTesto {
  const nostro = (m: MessaggioMessenger) => idDa(m.from?.id) === pagina.id
  const lead = leadDellaConversazione(conversazione, pagina.id) ?? letti.lead ?? leadDaiMessaggi(letti.messaggi, pagina.id)
  const inOrdine = messaggiInOrdine(letti.messaggi, nostro, (m) => !m.non_leggibile && Boolean(m.from?.id))
  return {
    conversazione_id: conversazione.id,
    username: null,
    utente_id: lead?.utente_id ?? null,
    nome: lead?.nome ?? null,
    aggiornata_il: istanteISO(conversazione.updated_time),
    ...chatDaMessaggi(inOrdine, letti.letti),
  }
}
