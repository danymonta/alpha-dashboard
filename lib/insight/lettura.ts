import 'server-only'

import { z } from 'zod'

import { oggiRoma } from '@/lib/date'
import { creaGraphContenuti, type MediaLetto } from '@/lib/instagram/contenuti'
import { creaGraph, type ConversazioneGraph } from '@/lib/instagram/graph'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { baseGraph, CONCORRENZA, ErroreInstagram, pool, semaforo, type OpzioniGraph } from '@/lib/instagram/richieste'
import { scrittoDa, senzaVecchi, usernameDelLead, versoChatTesto, type ChatTesto } from '@/lib/instagram/testo'
import { chiaviStatoLead } from '@/lib/insight/agenda'
import { creaArchivio, type Archivio, type IdentitaChat, type RigaChatDaSalvare, type StatoChatSalvata } from '@/lib/insight/archivio'
import { giorniTra } from '@/lib/insight/candidati'
import type { CanaleInsight, ChatEscluse, ContatoriPasso, ContestoApp, EsitoLettura, LeggiPerInsight, MotivoFallimento } from '@/lib/insight/contratti'
import { AVVISI_INSIGHT, ErroreInsight, frasiAvvisi, fraseDelMotivo, motivoDi, type CodiceAvviso, type MotivoInsight } from '@/lib/insight/frasi'
import { origineDaCodice } from '@/lib/insight/origine'
import {
  creaGraphMessenger,
  leadDellaConversazione,
  versoChatMessenger,
  type ConversazioneMessenger,
  type GraphMessenger,
} from '@/lib/messenger/graph'
import { normalizzaUsername } from '@/lib/setting/conteggio-dm'

/**
 * The reading step of a run of the Insight (1.35.0, CLAUDE.md section 29),
 * resumable: what is left goes into the run's progress (conversation ids,
 * Meta's times and counters, never a text or a username), and the same step
 * is dispatched again when the time is over.
 *
 * In order:
 * 1. the Instagram token, read only (the night report refreshes it: two jobs
 *    never contend for Vault), the account, the excluded chats;
 * 2. the chats: the 30 most recent and the ones updated in the last 24 hours
 *    (today's set), plus the history of 14 days while insight_chat covers
 *    fewer than 7 days or after skipped days (at most 120). An excluded chat
 *    is never read when the participants say who it is, otherwise read and
 *    dropped in memory (D5); an unchanged chat (Meta's updated_time equal to
 *    the stored one) is not read again. Every chat read is saved at once, by
 *    tens, with the run that read it (letta_da: a failed run empties them,
 *    D25); an under-14 chat keeps only its ids and times (D25);
 * 3. Messenger at the same time, with its own token and limiter: a failure is
 *    a warning (and messenger_errore on a token error), never the run's end;
 * 4. the profiles missing or older than 7 days (never the picture);
 * 5. Dany's posts of the last 14 days (salvaElencoContenuti of 1.33.0, never
 *    a second upsert) and their latest statistics (D28);
 * 6. where each new complete chat comes from, by code (D26);
 * 7. the agenda and the leads' state in the app, into contesto_app.
 *
 * The Instagram DMs, the profiles and the statistics share one limiter: at
 * most 3 requests on the wire for the account. The log says counts only.
 */

/** The routine's «last 30». */
export const CHAT_RECENTI = 30
export const ORE_DEL_GIORNO = 24
export const GIORNI_STORICO = 14
/** Chats of the history read from Meta in one run, at most. */
export const STORICO_MAX = 120
/** Below this coverage of insight_chat the history is read again from Meta. */
export const GIORNI_COPERTURA = 7
export const GIORNI_PROFILO = 7
/** Profiles read in one run, at most (today's chats first). */
export const PROFILI_MAX = 150
export const GIORNI_CONTENUTI = 14
export const CONTENUTI_MAX = 50
/** The posts a lead can come from: the listing of 1.33.0 covers 180 days. */
export const GIORNI_POST_ORIGINE = 180
/** No request to Meta starts this close to the step's end (a request lasts up to 20 s, and is retried). */
export const MARGINE_META_MS = 30_000
/** The chats read are saved by tens. */
const SALVA_OGNI = 10

const ORA_MS = 3_600_000
const GIORNO_MS = 86_400_000

// ---------------------------------------------------------------------------
// The progress
// ---------------------------------------------------------------------------

const schemaCanale = z.object({
  elencato: z.boolean().default(false),
  /** today's set (the 30 most recent and the last 24 hours): the conversations of the recap */
  oggi: z.array(z.string()).default([]),
  /** [conversation id, Meta's updated_time] still to read */
  da_leggere: z.array(z.tuple([z.string(), z.string().nullable()])).default([]),
  lette: z.number().int().nonnegative().default(0),
  saltate: z.number().int().nonnegative().default(0),
  fallite: z.number().int().nonnegative().default(0),
  escluse: z.number().int().nonnegative().default(0),
  finito: z.boolean().default(false),
  /** Messenger: read, without a token, or failed (a warning) */
  stato: z.enum(['letto', 'senza_token', 'errore']).optional(),
})

const schemaLettura = z.object({
  /** insight_chat was empty when the run began: its first day becomes storico_dal (D27) */
  vuota: z.boolean().optional(),
  /** the instant the history is read from (ISO UTC), or null without a bootstrap */
  storico_da: z.string().nullable().optional(),
  instagram: schemaCanale.default({}),
  messenger: schemaCanale.default({}),
  profili: z.boolean().default(false),
  contenuti: z.boolean().default(false),
  media: z.number().int().nonnegative().default(0),
  origini: z.boolean().default(false),
  attribuite: z.number().int().nonnegative().default(0),
  avvisi: z.array(z.string()).default([]),
})

export type ProgressoCanale = z.infer<typeof schemaCanale>
export type ProgressoLettura = z.infer<typeof schemaLettura>

/** The reading's progress from the run's progress (under `lettura`); a broken one starts over. */
export function progressoLettura(progresso: Record<string, unknown> | null | undefined): ProgressoLettura {
  const letto = schemaLettura.safeParse(progresso?.lettura ?? {})
  return letto.success ? letto.data : schemaLettura.parse({})
}

function avvisa(p: ProgressoLettura, codice: CodiceAvviso) {
  if (!p.avvisi.includes(codice)) p.avvisi.push(codice)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function stessoIstante(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = Date.parse(a)
  const y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

function unici<T extends { id: string }>(...elenchi: readonly (readonly T[])[]): T[] {
  const visti = new Set<string>()
  const out: T[] = []
  for (const elenco of elenchi) {
    for (const c of elenco) {
      if (visti.has(c.id)) continue
      visti.add(c.id)
      out.push(c)
    }
  }
  return out
}

/** Whether the time for Meta is over. */
const finito = (entroMeta: number) => Date.now() >= entroMeta

/** A chat as insight_chat stores it: an under-14 chat without its words (D25), no message older than 30 days. */
export function rigaDaSalvare(op: {
  canale: CanaleInsight
  chat: ChatTesto
  salvata: StatoChatSalvata | undefined
  esecuzione: string
  adesso: Date
}): RigaChatDaSalvare {
  const { chat, canale } = op
  const minore = op.salvata?.minore_14 === true
  const messaggi = minore ? [] : senzaVecchi(chat.messaggi, op.adesso)
  const codici: string[] = []
  for (const m of messaggi) for (const c of m.codici) if (!codici.includes(c)) codici.push(c)
  return {
    canale,
    conversazione_id: chat.conversazione_id,
    username: chat.username,
    utente_id: chat.utente_id,
    aggiornata_il: chat.aggiornata_il,
    messaggi,
    messaggi_letti: chat.messaggi_letti,
    completa: chat.completa,
    ultimo_da: chat.ultimo_da,
    ultimo_il: chat.ultimo_il,
    calendly_inviato_il: chat.calendly_inviato_il,
    codici_condivisi: codici,
    // a chat read again is analysed again: a non-lead keeps no message (C14)
    non_lead: false,
    letta_il: op.adesso.toISOString(),
    letta_da: op.esecuzione,
    ...(canale === 'messenger' ? { nome: chat.nome } : {}),
  }
}

/** Where the history is read from (null: no bootstrap). */
export function inizioStorico(op: { adesso: Date; storicoDal: string | null; ultimaLettura: string | null }): Date | null {
  const quattordici = op.adesso.getTime() - GIORNI_STORICO * GIORNO_MS
  const oggi = oggiRoma(op.adesso)
  const copre = op.storicoDal ? giorniTra(op.storicoDal, oggi) + 1 : 0
  if (copre < GIORNI_COPERTURA) return new Date(quattordici)
  const ultima = op.ultimaLettura ? Date.parse(op.ultimaLettura) : Number.NaN
  if (!Number.isFinite(ultima)) return new Date(quattordici)
  // skipped days: from the last reading (one hour before it), never more than 14 days
  if (op.adesso.getTime() - ultima > ORE_DEL_GIORNO * ORA_MS) return new Date(Math.max(quattordici, ultima - ORA_MS))
  return null
}

// ---------------------------------------------------------------------------
// One channel's chats
// ---------------------------------------------------------------------------

type Lettore<C extends { id: string; updated_time?: string }> = {
  canale: CanaleInsight
  recenti: () => Promise<C[]>
  dal: (dal: Date) => Promise<{ conversazioni: C[]; troncato: boolean }>
  /** the lead's key when the participants say it (Instagram username, Messenger PSID) */
  chiaveDaPartecipanti: (c: C) => string | null
  escluso: (chiave: string) => boolean
  leggi: (c: C) => Promise<ChatTesto>
  /** the key of a chat read (Instagram username, Messenger PSID) */
  chiaveDellaChat: (chat: ChatTesto) => string | null
  conversazione: (id: string, aggiornata: string | null) => C
}

type EsitoCanale = 'fatto' | 'tempo'

async function elenca<C extends { id: string; updated_time?: string }>(
  l: Lettore<C>,
  p: ProgressoCanale,
  op: { archivio: Archivio; adesso: Date; storico: Date | null },
  lettura: ProgressoLettura,
): Promise<void> {
  const recenti = await l.recenti()
  const ultime = await l.dal(new Date(op.adesso.getTime() - ORE_DEL_GIORNO * ORA_MS))
  if (ultime.troncato && l.canale === 'instagram') avvisa(lettura, 'chat_troppe')
  const storico = op.storico ? (await l.dal(op.storico)).conversazioni.slice(0, STORICO_MAX) : []

  const delGiorno = unici(recenti, ultime.conversazioni)
  const idsDelGiorno = new Set(delGiorno.map((c) => c.id))
  const tutte = unici(delGiorno, storico).filter((c) => {
    const chiave = l.chiaveDaPartecipanti(c)
    if (chiave && l.escluso(chiave)) {
      if (idsDelGiorno.has(c.id)) p.escluse++
      idsDelGiorno.delete(c.id)
      return false
    }
    return true
  })
  const salvate = await op.archivio.statoChat(l.canale, tutte.map((c) => c.id))
  const daLeggere = tutte.filter((c) => !stessoIstante(salvate.get(c.id)?.aggiornata_il, c.updated_time))
  p.elencato = true
  p.oggi = delGiorno.map((c) => c.id).filter((id) => idsDelGiorno.has(id))
  p.da_leggere = daLeggere.map((c) => [c.id, c.updated_time ?? null])
  p.saltate = tutte.length - daLeggere.length
}

async function leggiChat<C extends { id: string; updated_time?: string }>(
  l: Lettore<C>,
  p: ProgressoCanale,
  op: { archivio: Archivio; adesso: Date; esecuzione: string },
): Promise<{ esito: EsitoCanale; fermo: 'limite' | null; fallite: number }> {
  const voci = p.da_leggere
  if (voci.length === 0) return { esito: 'fatto', fermo: null, fallite: 0 }
  const salvate = await op.archivio.statoChat(l.canale, voci.map(([id]) => id))
  const fatti = new Set<string>()
  const daSalvare: RigaChatDaSalvare[] = []
  let fermo: 'tempo' | 'limite' | null = null
  let fatale: unknown = null
  let fallite = 0

  const salva = async () => {
    const blocco = daSalvare.splice(0)
    if (blocco.length > 0) await op.archivio.salvaChat(blocco)
  }

  await pool(voci, CONCORRENZA, async ([id, aggiornata]) => {
    if (fermo || fatale) return
    try {
      const chat = await l.leggi(l.conversazione(id, aggiornata))
      const chiave = l.chiaveDellaChat(chat)
      if (chiave && l.escluso(chiave)) {
        // known only now (no participants): dropped in memory, never stored (D5)
        if (p.oggi.includes(id)) {
          p.oggi = p.oggi.filter((x) => x !== id)
          p.escluse++
        }
        fatti.add(id)
        return
      }
      daSalvare.push(rigaDaSalvare({ canale: l.canale, chat, salvata: salvate.get(id), esecuzione: op.esecuzione, adesso: op.adesso }))
      fatti.add(id)
      p.lette++
      if (daSalvare.length >= SALVA_OGNI) await salva()
    } catch (e) {
      if (e instanceof ErroreInstagram) {
        if (e.tipo === 'tempo') fermo ??= 'tempo'
        else if (e.tipo === 'token') fatale ??= e
        else if (e.tipo === 'limite' || e.tipo === 'rete') fermo ??= 'limite'
        else {
          // a chat Meta refuses: its stored version stays, read again next time
          fallite++
          fatti.add(id)
        }
        return
      }
      fatale ??= e
    }
  })
  await salva()
  if (fatale) throw fatale
  p.fallite += fallite
  if (fermo === 'tempo') {
    p.da_leggere = voci.filter(([id]) => !fatti.has(id))
    return { esito: 'tempo', fermo: null, fallite }
  }
  p.da_leggere = []
  p.finito = true
  return { esito: 'fatto', fermo, fallite }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export type OpLettura = Parameters<LeggiPerInsight>[0] & {
  /** where and how to reach Meta (the tests point it at a fake); the base defaults to baseGraph() */
  graph?: Partial<Pick<OpzioniGraph, 'base' | 'fetch' | 'attendi' | 'timeoutMs'>>
}

/** The reading step with the real archive (the service role). */
export const leggiPerInsight: LeggiPerInsight = (op) => leggiConArchivio({ ...op, archivio: creaArchivio(op.db) })

function fallimento(motivo: MotivoFallimento | 'account'): EsitoLettura {
  return { ok: false, motivo: motivoFallimento(motivo), errore: fraseDelMotivo(motivo) }
}

/** The reading step against any archive (the tests' one in memory). Never throws. */
export async function leggiConArchivio(op: OpLettura & { archivio: Archivio }): Promise<EsitoLettura> {
  const { archivio, adesso, esecuzione } = op
  const p = progressoLettura(op.progresso)
  const entroMeta = op.entro - MARGINE_META_MS
  const avvio = Date.now()
  try {
    // 1. the token (read only), the account, the excluded chats
    const token = await archivio.tokenInstagram()
    if (!token) return fallimento('senza_token')
    const inFila = semaforo(CONCORRENZA)
    const base = op.graph?.base ?? baseGraph()
    const opzioni = { ...op.graph, base, token, entro: entroMeta, inFila }
    const graph = creaGraph({ ...opzioni, lettura: 'testo' })
    const contenuti = creaGraphContenuti(opzioni)

    const me = await graph.me()
    const username = normalizzaUsername(me.username)
    if (!username) return fallimento('account')
    const account = { username, id: me.user_id && /^[0-9]{1,30}$/.test(me.user_id) ? me.user_id : null }
    const esclusi = await archivio.esclusi()

    // the history (first invocation only)
    if (p.vuota === undefined) {
      p.vuota = await archivio.chatVuota()
      const inizio = inizioStorico({
        adesso,
        storicoDal: await archivio.storicoDal(),
        ultimaLettura: await archivio.ultimaLetturaRiuscita(esecuzione),
      })
      p.storico_da = inizio ? inizio.toISOString() : null
    }
    const storico = p.storico_da ? new Date(p.storico_da) : null

    // 2-3. the chats of the two channels, at the same time
    const nostro = scrittoDa(account)
    const instagram: Lettore<ConversazioneGraph> = {
      canale: 'instagram',
      recenti: () => graph.conversazioniRecenti(CHAT_RECENTI),
      dal: (dal) => graph.conversazioniDal(dal),
      chiaveDaPartecipanti: (c) => (c.participants?.data?.length ? usernameDelLead(c, [], account.username, nostro) : null),
      escluso: (u) => esclusi.instagram.has(u),
      leggi: async (c) => versoChatTesto(c, await graph.messaggi(c.id), account),
      chiaveDellaChat: (chat) => chat.username,
      conversazione: (id, aggiornata) => ({ id, ...(aggiornata ? { updated_time: aggiornata } : {}) }),
    }
    const [ig, fb] = await Promise.allSettled([
      leggiCanale(instagram, p.instagram, { archivio, adesso, esecuzione, storico, entroMeta }, p),
      leggiMessenger(p, { archivio, adesso, esecuzione, storico, entroMeta, esclusi, base: op.graph?.base, graph: op.graph }),
    ])
    if (ig.status === 'rejected') throw ig.reason
    if (fb.status === 'rejected') throw fb.reason
    if (ig.value === 'tempo' || fb.value === 'tempo' || finito(entroMeta)) return incompleta(p)

    // 4. the profiles
    if (!p.profili) {
      if ((await leggiProfili({ graph, archivio, p, adesso, esecuzione, entroMeta })) === 'tempo') return incompleta(p)
      p.profili = true
    }

    // 5. Dany's posts and their statistics
    if (!p.contenuti) {
      const esito = await leggiContenuti({ contenuti, archivio, p, adesso })
      if (esito === 'tempo') return incompleta(p)
      p.contenuti = true
    }

    // 6. where the new complete chats come from (after the posts: the ones just listed count)
    if (!p.origini) {
      const post = await archivio.post(new Date(adesso.getTime() - GIORNI_POST_ORIGINE * GIORNO_MS).toISOString())
      for (const chat of await archivio.chatLetteSenzaOrigine(esecuzione)) {
        const origine = origineDaCodice({ chat, post, adesso })
        if (!origine) continue
        await archivio.salvaOrigine(chat.canale, chat.conversazione_id, origine)
        p.attribuite++
      }
      p.origini = true
    }

    // 7. the app's state
    const contesto = await contestoDellApp({ archivio, adesso, p })
    console.info(
      '[insight] lettura',
      `ig ${p.instagram.oggi.length} oggi, ${p.instagram.lette} lette, ${p.instagram.saltate} uguali, ${p.instagram.fallite} non lette`,
      `fb ${p.messenger.oggi.length} oggi, ${p.messenger.lette} lette`,
      `escluse ${p.instagram.escluse + p.messenger.escluse}`,
      `post ${p.media}`,
      `${Math.round((Date.now() - avvio) / 1000)}s`,
    )
    return {
      ok: true,
      completa: true,
      progresso: { lettura: p },
      avvisi: frasiAvvisi(p.avvisi),
      contatori: contatoriLettura(p),
      contesto,
    }
  } catch (e) {
    const motivo = motivoDi(e)
    // the time over is not a failure: the same step again, from where it stopped
    if (motivo === 'tempo') return incompleta(p)
    console.error('[insight] lettura non riuscita:', motivo)
    // Impostazioni › Instagram shows the token as expired, as for the night report
    if (motivo === 'token') await archivio.erroreInstagram(FRASI_ERRORE.token)
    return { ok: false, motivo: motivoFallimento(motivo), errore: fraseDelMotivo(motivo) }
  }
}

/** The reason of EsitoLettura for any reason of the Insight. */
function motivoFallimento(motivo: MotivoInsight): MotivoFallimento {
  switch (motivo) {
    case 'senza_token':
    case 'token':
    case 'limite':
    case 'rete':
    case 'tempo':
    case 'meta':
    case 'database':
      return motivo
    case 'account':
      return 'meta'
    default:
      return 'database'
  }
}

function incompleta(p: ProgressoLettura): EsitoLettura {
  return { ok: true, completa: false, progresso: { lettura: p }, avvisi: frasiAvvisi(p.avvisi), contatori: {}, contesto: null }
}

/** The counters of the reading, for the run's row (whitelisted by insight_passo_finito). */
export function contatoriLettura(p: ProgressoLettura): ContatoriPasso {
  return {
    chat_instagram: p.instagram.oggi.length,
    chat_messenger: p.messenger.oggi.length,
    chat_escluse: p.instagram.escluse + p.messenger.escluse,
    contenuti: p.media,
    // the first day of the history, once (D27): only when insight_chat was empty
    ...(p.vuota && p.storico_da ? { storico_dal: oggiRoma(new Date(p.storico_da)) } : {}),
  }
}

async function leggiCanale<C extends { id: string; updated_time?: string }>(
  l: Lettore<C>,
  pc: ProgressoCanale,
  op: { archivio: Archivio; adesso: Date; esecuzione: string; storico: Date | null; entroMeta: number },
  p: ProgressoLettura,
): Promise<EsitoCanale> {
  if (pc.finito) return 'fatto'
  if (!pc.elencato) await elenca(l, pc, op, p)
  const r = await leggiChat(l, pc, op)
  if (r.fermo === 'limite') avvisa(p, l.canale === 'instagram' ? 'instagram_limitato' : 'messenger_non_letto')
  if (r.fallite > 0) avvisa(p, l.canale === 'instagram' ? 'chat_non_lette' : 'messenger_chat_non_lette')
  return r.esito
}

/** Messenger: never the run's end. Without a token nothing is read and nothing is said (the tab says it). */
async function leggiMessenger(
  p: ProgressoLettura,
  op: {
    archivio: Archivio
    adesso: Date
    esecuzione: string
    storico: Date | null
    entroMeta: number
    esclusi: ChatEscluse
    base: string | undefined
    graph: OpLettura['graph']
  },
): Promise<EsitoCanale> {
  const pc = p.messenger
  if (pc.finito) return 'fatto'
  let fb: GraphMessenger
  let paginaId: string
  try {
    const token = await op.archivio.tokenMessenger()
    if (!token) {
      pc.stato = 'senza_token'
      pc.finito = true
      return 'fatto'
    }
    fb = creaGraphMessenger({ ...op.graph, ...(op.base ? { base: op.base } : {}), token, entro: op.entroMeta })
    paginaId = (await fb.pagina()).id
    const lettore: Lettore<ConversazioneMessenger> = {
      canale: 'messenger',
      recenti: () => fb.conversazioniRecenti(CHAT_RECENTI),
      dal: (dal) => fb.conversazioniDal(dal),
      chiaveDaPartecipanti: (c) => leadDellaConversazione(c, paginaId)?.utente_id ?? null,
      escluso: (psid) => op.esclusi.messenger.has(psid),
      leggi: async (c) => versoChatMessenger(c, await fb.messaggi(c.id), { id: paginaId }),
      chiaveDellaChat: (chat) => chat.utente_id,
      conversazione: (id, aggiornata) => ({ id, ...(aggiornata ? { updated_time: aggiornata } : {}) }),
    }
    const esito = await leggiCanale(lettore, pc, op, p)
    if (esito === 'fatto') pc.stato = 'letto'
    return esito
  } catch (e) {
    if (e instanceof ErroreInstagram && e.tipo === 'tempo') return 'tempo'
    if (e instanceof ErroreInsight) throw e
    const token = e instanceof ErroreInstagram && e.tipo === 'token'
    avvisa(p, token ? 'messenger_token' : 'messenger_non_letto')
    if (token) await op.archivio.erroreMessenger(AVVISI_INSIGHT.messenger_token)
    console.error('[insight] messenger non letto:', e instanceof ErroreInstagram ? e.tipo : 'errore')
    pc.stato = 'errore'
    pc.finito = true
    pc.da_leggere = []
    return 'fatto'
  }
}

/** The profiles of today's Instagram chats, missing or older than 7 days (never the picture). */
async function leggiProfili(op: {
  graph: ReturnType<typeof creaGraph>
  archivio: Archivio
  p: ProgressoLettura
  adesso: Date
  esecuzione: string
  entroMeta: number
}): Promise<EsitoCanale> {
  const { archivio, adesso } = op
  const delGiorno = await archivio.identitaChat('instagram', op.p.instagram.oggi)
  const chiavi = new Map<string, IdentitaChat>()
  for (const c of delGiorno) if (c.username && c.utente_id) chiavi.set(c.username, c)
  if (chiavi.size === 0) return 'fatto'
  const salvati = new Map((await archivio.profili([...chiavi.keys()])).map((r) => [r.username, r]))
  const vecchio = adesso.getTime() - GIORNI_PROFILO * GIORNO_MS
  const daLeggere = [...chiavi.values()]
    .filter((c) => {
      const s = salvati.get(c.username as string)
      return !s || !(Date.parse(s.letto_il) >= vecchio)
    })
    .slice(0, PROFILI_MAX)

  const letti: Parameters<Archivio['salvaProfili']>[0][number][] = []
  let tempo = false
  let fermo = false
  let fatale: unknown = null
  await pool(daLeggere, CONCORRENZA, async (c) => {
    if (tempo || fermo || fatale) return
    try {
      const profilo = await op.graph.profilo(c.utente_id as string)
      if (!profilo) return
      letti.push({
        username: c.username as string,
        utente_id: c.utente_id,
        nome: profilo.nome,
        follower: profilo.follower,
        verificato: profilo.verificato,
        ti_segue: profilo.ti_segue,
        lo_segui: profilo.lo_segui,
        letto_il: adesso.toISOString(),
      })
    } catch (e) {
      if (e instanceof ErroreInstagram && e.tipo === 'tempo') tempo = true
      else if (e instanceof ErroreInstagram && e.tipo === 'token') fatale ??= e
      // Meta's limits or the network: the profiles wait for the next run
      else fermo = true
    }
  })
  if (letti.length > 0) await archivio.salvaProfili(letti)
  if (fatale) throw fatale
  return tempo ? 'tempo' : 'fatto'
}

/** Dany's posts of the last 14 days, saved as 1.33.0 does, and their statistics (D28). */
async function leggiContenuti(op: {
  contenuti: ReturnType<typeof creaGraphContenuti>
  archivio: Archivio
  p: ProgressoLettura
  adesso: Date
}): Promise<EsitoCanale> {
  const dal = new Date(op.adesso.getTime() - GIORNI_CONTENUTI * GIORNO_MS)
  const elenco = await op.contenuti.contenutiDal(dal, CONTENUTI_MAX)
  if (elenco.errore?.tipo === 'token') throw elenco.errore
  if (elenco.errore?.tipo === 'tempo') return 'tempo'
  if (elenco.errore && elenco.media.length === 0) {
    avvisa(op.p, 'contenuti_non_letti')
    return 'fatto'
  }
  if (elenco.media.length > 0) await op.archivio.salvaElenco(elenco.media)
  op.p.media = elenco.media.length

  const recenti: MediaLetto[] = elenco.media.filter((m) => Date.parse(m.pubblicato_il) >= dal.getTime())
  let tempo = false
  let fermo = false
  let fatale: unknown = null
  let senzaPermesso = false
  await pool(recenti, CONCORRENZA, async (m) => {
    if (tempo || fermo || fatale) return
    try {
      const statistiche = await op.contenuti.insights(m)
      if (statistiche.stato === 'senza_permesso') senzaPermesso = true
      await op.archivio.salvaStatistiche(m.media_id, statistiche)
    } catch (e) {
      if (e instanceof ErroreInstagram && e.tipo === 'tempo') tempo = true
      else if (e instanceof ErroreInstagram && e.tipo === 'token') fatale ??= e
      else if (e instanceof ErroreInstagram) fermo = true
      else fatale ??= e
    }
  })
  if (fatale) throw fatale
  if (senzaPermesso) avvisa(op.p, 'statistiche')
  return tempo ? 'tempo' : 'fatto'
}

/** The agenda (yesterday, today, tomorrow) and the leads' state for the chats of the run (D3, D15). */
async function contestoDellApp(op: { archivio: Archivio; adesso: Date; p: ProgressoLettura }): Promise<ContestoApp> {
  const { archivio, adesso, p } = op
  const recenti = await archivio.chiaviRecenti(new Date(adesso.getTime() - (GIORNI_STORICO + 1) * GIORNO_MS).toISOString())
  const delGiorno = [
    ...(await archivio.identitaChat('instagram', p.instagram.oggi)),
    ...(await archivio.identitaChat('messenger', p.messenger.oggi)),
  ]
  const { username, nomi } = chiaviStatoLead([...recenti, ...delGiorno])
  const [agenda, statoLead] = await Promise.all([archivio.agenda(adesso), archivio.statoLead(username, nomi)])
  return { agenda, stato_lead: statoLead }
}

