import 'server-only'

import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import {
  CONCORRENZA,
  creaGraph,
  ErroreInstagram,
  pool,
  rinnovaToken,
  type ConversazioneGraph,
  type MessaggioGraph,
  type OpzioniGraph,
} from '@/lib/instagram/graph'
import {
  contaGiornoDm,
  contieneLinkCall,
  inizioGiornoRoma,
  normalizzaUsername,
  type ChatDm,
} from '@/lib/setting/conteggio-dm'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The setter's report of a day, proposed from the Instagram DMs (Dany,
 * 08/10/2026). Every night after midnight in Rome (app/api/cron/report-
 * instagram), or when the admin asks again (app/actions/report-instagram):
 * reads the DMs of the connected account (Loris writes from Dany's account:
 * everything sent from it is the connected setter's setting), counts the day
 * with lib/setting/conteggio-dm and leaves a PROPOSAL for the setter
 * (public.instagram_salva_proposta). Never confirmed by itself: the setter
 * confirms it, as it is or corrected, or discards it, and a decided proposal
 * is never touched again.
 *
 * Nothing of the messages is kept: no text, no username of a lead, only the
 * day's numbers. What this returns, and what it logs, is the outcome and the
 * number of chats: never the proposal's numbers (only the setter sees them),
 * never a username, never the token.
 *
 * Any failure (no token, token expired, network, Meta's limits) is recorded
 * for the admin in Italian (public.instagram_errore, which blanks any token)
 * and returned, never thrown.
 */

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc' | 'from'>

/** Meta refreshes a token older than 24 hours; we do it once a week, like the DM Reader. */
const RINNOVO_DOPO_MS = 7 * 86_400_000
/** Without Meta's expires_in, a refreshed token lasts 60 days. */
const DURATA_TOKEN_MS = 60 * 86_400_000
/**
 * Meta keeps only the last 20 messages of a chat: a day older than this does
 * not come back from the DMs any more (and its chats would be too many to read).
 */
export const GIORNI_INDIETRO_MAX = 7
/** Without a deadline from the caller: well inside the function's 300 seconds. */
const TEMPO_PREDEFINITO_MS = 240_000

export type MotivoErroreReport =
  /** the day is not a past day of the last week */
  | 'giorno'
  /** nobody chosen to work the DMs */
  | 'senza_setter'
  /** the setter chosen is no longer an active setter */
  | 'setter_non_attivo'
  /** no token in Vault */
  | 'senza_token'
  /** token expired or no longer valid (Meta's code 190) */
  | 'token'
  | 'limite'
  | 'rete'
  | 'tempo'
  | 'instagram'
  | 'database'

export type EsitoReportInstagram =
  | {
      ok: true
      giorno: string
      /** 'gia_decisa': the setter had already confirmed or discarded it, left as it was */
      proposta: 'salvata' | 'gia_decisa'
      chat_lette: number
      chat_incerte: number
      /** chats of the day Instagram did not return (counted among the uncertain ones) */
      chat_non_lette: number
      token_rinnovato: boolean
    }
  | { ok: false; giorno: string; motivo: MotivoErroreReport; errore: string }

/** The words the admin reads, by reason. */
export const FRASI_ERRORE: Record<Exclude<MotivoErroreReport, 'instagram' | 'database'>, string> = {
  giorno: `Si ricalcola solo un giorno già finito, degli ultimi ${GIORNI_INDIETRO_MAX} giorni: Instagram tiene solo gli ultimi 20 messaggi di ogni chat.`,
  senza_setter: 'Nessun setter scelto per i DM di Instagram: scegli chi li lavora e la proposta riparte la notte dopo.',
  setter_non_attivo: 'Il setter scelto per i DM di Instagram non è più un setter attivo: scegline un altro.',
  senza_token: 'Instagram non è collegato: manca il token. Incollalo di nuovo.',
  token: 'Il token di Instagram è scaduto o non è più valido: generane uno nuovo dal pannello Meta e incollalo di nuovo.',
  limite: 'Instagram ha limitato le letture per troppe richieste: si riprova la notte dopo, o più tardi con il ricalcolo.',
  rete: 'Instagram non ha risposto: si riprova la notte dopo, o più tardi con il ricalcolo.',
  tempo: 'Le chat da leggere erano troppe per il tempo a disposizione: nessuna proposta salvata. Riprova con il ricalcolo.',
}

export type OpzioniReport = {
  db: Db
  /** 'YYYY-MM-DD', a day already over (Europe/Rome) */
  giorno: string
  adesso?: Date
  /** epoch ms: past it no new request to Instagram starts */
  entro?: number
  /** where and how to reach the Graph API (the tests point it at a fake) */
  graph?: Pick<OpzioniGraph, 'base' | 'versione' | 'fetch' | 'attendi' | 'timeoutMs'>
}

/** A failure Instagram gives for every chat: the run stops. */
function fatale(e: unknown): boolean {
  return !(e instanceof ErroreInstagram) || e.tipo !== 'meta'
}

function motivoDi(e: ErroreInstagram): MotivoErroreReport {
  return e.tipo === 'meta' ? 'instagram' : e.tipo
}

function fraseDi(e: unknown): string {
  if (!(e instanceof ErroreInstagram)) return 'Lettura dei DM non riuscita per un errore inatteso: riprova con il ricalcolo.'
  if (e.tipo === 'meta') return `Instagram ha rifiutato la lettura dei DM. ${e.message}`
  return FRASI_ERRORE[e.tipo]
}

/** Who wrote a message: the account, by username (by id only when Meta gives no username). */
function scrittoDa(account: { username: string; id: string | null }) {
  return (m: MessaggioGraph): boolean => {
    const username = normalizzaUsername(m.from?.username)
    if (username) return username === account.username
    return Boolean(account.id && m.from?.id && String(m.from.id) === account.id)
  }
}

/** The lead's username, only to leave out the excluded accounts; never kept. */
function usernameDelLead(
  conversazione: ConversazioneGraph,
  messaggi: readonly MessaggioGraph[],
  account: string,
  nostro: (m: MessaggioGraph) => boolean,
): string | null {
  const candidati = [
    ...(conversazione.participants?.data ?? []).map((p) => p?.username),
    ...messaggi.filter((m) => !nostro(m)).map((m) => m.from?.username),
    ...messaggi.filter(nostro).flatMap((m) => (m.to?.data ?? []).map((p) => p?.username)),
  ]
  for (const c of candidati) {
    const u = normalizzaUsername(c)
    if (u && u !== account) return u
  }
  return null
}

/** From Meta's messages to what the count needs: when, whether ours, whether the call link. */
function versoChat(
  conversazione: ConversazioneGraph,
  letti: { messaggi: MessaggioGraph[]; letti: number },
  account: { username: string; id: string | null },
): ChatDm {
  const nostro = scrittoDa(account)
  return {
    username: usernameDelLead(conversazione, letti.messaggi, account.username, nostro),
    letti: letti.letti,
    // Meta gives the most recent first: oldest first, so equal instants keep their order
    messaggi: [...letti.messaggi].reverse().map((m) => {
      const mio = nostro(m)
      return {
        created_time: m.created_time ?? '',
        nostro: mio,
        calendly: mio && (contieneLinkCall(m.message) || (m.shares?.data ?? []).some((s) => contieneLinkCall(s?.link))),
      }
    }),
  }
}

/** Records the failure for the admin and returns it. Never throws. */
async function fallisci(
  db: Db,
  giorno: string,
  motivo: MotivoErroreReport,
  errore: string,
  registra = true,
): Promise<EsitoReportInstagram> {
  console.error('[instagram] report non calcolato:', giorno, motivo)
  if (registra) {
    const { error } = await db.rpc('instagram_errore', { p_messaggio: errore })
    if (error) console.error('[instagram] errore non registrato:', error.code ?? error.message)
  }
  return { ok: false, giorno, motivo, errore }
}

/**
 * Computes and saves the proposal of a day for the connected setter. Returns
 * the outcome and the number of chats read, never the proposal's numbers.
 */
export async function calcolaReportInstagram(op: OpzioniReport): Promise<EsitoReportInstagram> {
  const { db, giorno } = op
  const adesso = op.adesso ?? new Date()
  const entro = op.entro ?? Date.now() + TEMPO_PREDEFINITO_MS
  const oggi = oggiRoma(adesso)

  if (!isDataISO(giorno) || giorno >= oggi || giorno < aggiungiGiorni(oggi, -GIORNI_INDIETRO_MAX)) {
    return fallisci(db, String(giorno), 'giorno', FRASI_ERRORE.giorno, false)
  }

  // 1. the connection
  const { data: collegamento, error: erroreCollegamento } = await db
    .from('instagram_collegamento')
    .select('setter_id, account_username, account_id, token_aggiornato_il')
    .maybeSingle()
  if (erroreCollegamento) {
    return fallisci(db, giorno, 'database', 'Il collegamento di Instagram non si legge: riprova più tardi.')
  }

  // 2. the token, from Vault (service role only)
  const { data: salvato, error: erroreToken } = await db.rpc('instagram_token')
  if (erroreToken) return fallisci(db, giorno, 'database', 'Il token di Instagram non si legge: riprova più tardi.')
  let token = typeof salvato === 'string' ? salvato.trim() : ''

  const opzioniGraph = { ...op.graph, entro }

  // 3. a week old: refreshed, whoever works the DMs (with "Nessuno" or a
  // setter deactivated, for holidays or a change in the team, the token stays
  // alive until a setter is chosen again). A failed refresh is not the end of
  // the run, the token still works; an expired one is.
  let tokenRinnovato = false
  const aggiornatoIl = Date.parse(collegamento?.token_aggiornato_il ?? '')
  if (token && (!Number.isFinite(aggiornatoIl) || adesso.getTime() - aggiornatoIl > RINNOVO_DOPO_MS)) {
    try {
      const rinnovo = await rinnovaToken({ ...opzioniGraph, token })
      const scadeIl = rinnovo.scadeIl ?? new Date(adesso.getTime() + DURATA_TOKEN_MS)
      // saved only in place of the token refreshed here (p_vecchio)
      const { data: salvatoAlPosto, error } = await db.rpc('instagram_token_rinnovato', {
        p_vecchio: token,
        p_token: rinnovo.token,
        p_scade_il: scadeIl.toISOString(),
      })
      if (error) {
        // not saved: the old token still works, the new one serves this run
        console.error('[instagram] token rinnovato non salvato:', error.code ?? 'errore')
        token = rinnovo.token
      } else if (salvatoAlPosto === false) {
        // the admin removed the token meanwhile (it never comes back by
        // itself) or pasted another one (the refresh of the old one is
        // dropped, never written over it): the run goes on with what Vault
        // holds now, if anything
        const { data: ora, error: erroreOra } = await db.rpc('instagram_token')
        if (erroreOra) return fallisci(db, giorno, 'database', 'Il token di Instagram non si legge: riprova più tardi.')
        token = typeof ora === 'string' ? ora.trim() : ''
        if (!token) return fallisci(db, giorno, 'senza_token', FRASI_ERRORE.senza_token)
      } else {
        tokenRinnovato = true
        token = rinnovo.token
      }
    } catch (e) {
      if (e instanceof ErroreInstagram && (e.tipo === 'token' || e.tipo === 'tempo')) {
        return fallisci(db, giorno, motivoDi(e), fraseDi(e))
      }
      console.error('[instagram] rinnovo del token non riuscito:', e instanceof ErroreInstagram ? `${e.tipo} ${e.code ?? ''}` : 'errore')
    }
  }

  // 4. who gets the proposal: nobody chosen, or not an active setter, and the
  // DMs are not read (the token was refreshed all the same)
  if (!collegamento?.setter_id) return fallisci(db, giorno, 'senza_setter', FRASI_ERRORE.senza_setter)
  const setterId = collegamento.setter_id

  const { data: setter, error: erroreSetter } = await db
    .from('profiles')
    .select('ruolo, attivo')
    .eq('id', setterId)
    .maybeSingle()
  if (erroreSetter) return fallisci(db, giorno, 'database', 'Il setter collegato a Instagram non si legge: riprova più tardi.')
  if (setter?.ruolo !== 'setter' || !setter.attivo) {
    return fallisci(db, giorno, 'setter_non_attivo', FRASI_ERRORE.setter_non_attivo)
  }
  if (!token) return fallisci(db, giorno, 'senza_token', FRASI_ERRORE.senza_token)

  const graph = creaGraph({ ...opzioniGraph, token })

  try {
    // 5. the account: its messages are "ours"
    const me = await graph.me()
    const username = normalizzaUsername(me.username)
    if (!username) {
      return fallisci(db, giorno, 'instagram', 'Instagram non ha detto quale account è collegato: incolla di nuovo il token.')
    }
    const accountId = me.user_id && /^[0-9]{1,30}$/.test(me.user_id) ? me.user_id : null
    if (username !== collegamento.account_username || (accountId && accountId !== collegamento.account_id)) {
      const { error } = await db
        .from('instagram_collegamento')
        .update({ account_username: username, ...(accountId ? { account_id: accountId } : {}) })
        .eq('id', true)
      if (error) console.error('[instagram] account non registrato:', error.code ?? 'errore')
    }

    // 6. the accounts never counted
    const { data: esclusi, error: erroreEsclusi } = await db.from('instagram_esclusi').select('username')
    if (erroreEsclusi) {
      return fallisci(db, giorno, 'database', 'Gli account esclusi non si leggono: nessuna proposta salvata. Riprova più tardi.')
    }
    const daEscludere = new Set((esclusi ?? []).map((r) => r.username.toLowerCase()))

    // 7. the chats updated from the day before on (an answer of the lead the
    // evening before counts in the day's conversations), and their messages
    const { conversazioni, troncato } = await graph.conversazioniDal(inizioGiornoRoma(aggiungiGiorni(giorno, -1)))
    if (troncato) console.error('[instagram] troppe chat: lette solo le più recenti', conversazioni.length)

    const account = { username, id: accountId }
    const inizioGiorno = inizioGiornoRoma(giorno).getTime()
    let fermo: unknown = null
    type Lettura = { chat: ChatDm } | { fallita: boolean } | null
    const letture = await pool(conversazioni, CONCORRENZA, async (c): Promise<Lettura> => {
      if (fermo) return null
      try {
        return { chat: versoChat(c, await graph.messaggi(c.id), account) }
      } catch (e) {
        if (fatale(e)) {
          fermo ??= e
          return null
        }
        // one chat Instagram refuses: uncertain, if it may have messages of the day
        const quando = Date.parse(c.updated_time ?? '')
        const lead = (c.participants?.data ?? []).map((p) => normalizzaUsername(p?.username)).find((u) => u && u !== username)
        const delGiorno = !Number.isFinite(quando) || quando >= inizioGiorno
        return { fallita: delGiorno && !(lead && daEscludere.has(lead)) }
      }
    })
    if (fermo) throw fermo

    const chat = letture.flatMap((l) => (l && 'chat' in l ? [l.chat] : []))
    const nonLette = letture.filter((l) => l !== null && 'fallita' in l && l.fallita).length
    if (nonLette > 0 && chat.length === 0) {
      return fallisci(db, giorno, 'instagram', 'Instagram non ha dato i messaggi di nessuna chat: nessuna proposta salvata. Riprova con il ricalcolo.')
    }

    // 8. the day's numbers, and the proposal (discovery_prenotate: the
    // database counts the calls the setter booked that day)
    const conteggio = contaGiornoDm(chat, giorno, daEscludere)
    const chatLette = conteggio.chat_lette + nonLette
    const chatIncerte = conteggio.chat_incerte + nonLette
    const { data: id, error: erroreSalvataggio } = await db.rpc('instagram_salva_proposta', {
      p_setter: setterId,
      p_data: giorno,
      p_dm_outbound: conteggio.dm_outbound,
      p_dm_inbound: conteggio.dm_inbound,
      p_follow_up: conteggio.follow_up,
      p_conversazioni: conteggio.conversazioni,
      p_call_proposte: conteggio.call_proposte,
      p_chat_lette: chatLette,
      p_chat_incerte: chatIncerte,
    })
    if (erroreSalvataggio) {
      const parole =
        erroreSalvataggio.code === '22023' || erroreSalvataggio.code === '42501'
          ? erroreSalvataggio.message
          : 'errore del database, riprova più tardi.'
      return fallisci(db, giorno, 'database', `La proposta non si è salvata: ${parole}`)
    }

    console.info('[instagram] proposta', giorno, { chat_lette: chatLette, chat_incerte: chatIncerte, salvata: Boolean(id) })
    return {
      ok: true,
      giorno,
      proposta: id ? 'salvata' : 'gia_decisa',
      chat_lette: chatLette,
      chat_incerte: chatIncerte,
      chat_non_lette: nonLette,
      token_rinnovato: tokenRinnovato,
    }
  } catch (e) {
    return fallisci(db, giorno, e instanceof ErroreInstagram ? motivoDi(e) : 'instagram', fraseDi(e))
  }
}
