import 'server-only'

import type { InsightsMedia, MediaLetto } from '@/lib/instagram/contenuti'
import { salvaElencoContenuti, type AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { contestoApp, statiLead, vociAgenda } from '@/lib/insight/agenda'
import type {
  BloccoPianificato,
  BloccoSalvato,
  CanaleInsight,
  ChatEscluse,
  ChatSalvata,
  ContatoriPasso,
  ContestoApp,
  MessaggioChat,
  OrigineChat,
  PassoInsight,
  PostInsight,
  ProgressoEsecuzione,
  RigaContenutiDm,
  SchedaSalvata,
  StatoBlocco,
  StatoEsecuzione,
  StatoLeadApp,
  TipoBlocco,
  TipoScheda,
  VoceAgendaApp,
} from '@/lib/insight/contratti'
import { ErroreInsight } from '@/lib/insight/frasi'
import type { ProfiloInsight } from '@/lib/insight/prompt/dati'
import type { RecapCanale, TargetLead, TipoOrigine } from '@/lib/insight/recap'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Everything a run of the Insight reads and writes in the database (1.35.0,
 * CLAUDE.md section 29), behind one interface: the state machine
 * (esecuzione.ts) and the reading (lettura.ts) never build a query, and the
 * tests give them an archive in memory instead.
 *
 * The real one works with the service role (the run writes what no session
 * can: insight_chat, insight_profili, insight_blocchi and insight_schede have
 * a policy that denies every session, D21). A database error becomes
 * ErroreInsight('database'); the log says what failed and Postgres' code,
 * never a row.
 */

/** The run's row, as the steps read it. */
export type RigaEsecuzione = {
  id: string
  giorno: string
  stato: StatoEsecuzione
  creata_il: string
  iniziata_il: string | null
  contesto_app: ContestoApp | null
  modello: string | null
  token_input: number | null
  token_cache_scritti: number | null
  token_cache_letti: number | null
  token_output: number | null
  servito_da_fallback: number
}

/** What the listing compares with Meta's updated_time, and the flags the reading keeps. */
export type StatoChatSalvata = { aggiornata_il: string | null; non_lead: boolean; minore_14: boolean }

/** A chat as the reading writes it: the columns that come from Meta, and the run that wrote it. */
export type RigaChatDaSalvare = Pick<
  ChatSalvata,
  | 'canale'
  | 'conversazione_id'
  | 'username'
  | 'utente_id'
  | 'aggiornata_il'
  | 'messaggi'
  | 'messaggi_letti'
  | 'completa'
  | 'ultimo_da'
  | 'ultimo_il'
  | 'calendly_inviato_il'
  | 'codici_condivisi'
  | 'non_lead'
  | 'letta_il'
  | 'letta_da'
> & {
  /** Messenger only: the name Meta gives; Instagram's comes from the profile */
  nome?: string | null
}

/** The columns of a chat the unione step writes back (chatEffettive). */
export type CampiChat = Partial<
  Pick<
    ChatSalvata,
    | 'non_lead'
    | 'minore_14'
    | 'messaggi'
    | 'codici_condivisi'
    | 'ultimo_target'
    | 'origine_tipo'
    | 'origine_shortcode'
    | 'origine_il'
    | 'origine_giorno'
  >
>

/** The identity of a chat, for the profiles and the app's state. */
export type IdentitaChat = { canale: CanaleInsight; conversazione_id: string; username: string | null; utente_id: string | null; nome: string | null }

export type ProfiloSalvato = ProfiloInsight & { utente_id: string | null; letto_il: string }

/** A card of insight_schede with where it belongs. */
export type SchedaArchiviata = SchedaSalvata & { canale: CanaleInsight; giorno: string; esecuzione_id: string }

/** A block of insight_blocchi with its result. */
export type BloccoArchiviato = BloccoSalvato & { risultato: unknown; servito_da_fallback: boolean; errore: string | null }

export type CampiBlocco = Partial<{
  stato: StatoBlocco
  tentativi: number
  errore: string | null
  risultato: unknown
  usage: unknown
  servito_da_fallback: boolean
}>

export type Archivio = {
  // the run
  esecuzione(id: string): Promise<RigaEsecuzione | null>
  salvaContesto(id: string, contesto: ContestoApp): Promise<void>
  passoFinito(
    id: string,
    prossimo: PassoInsight | null,
    progresso: ProgressoEsecuzione,
    avvisi: readonly string[],
    contatori: ContatoriPasso,
  ): Promise<boolean>
  /** `contatori`: the tokens a failed step had spent (added to the run, the cost recomputed) */
  fallita(id: string, errore: string, contatori?: ContatoriPasso): Promise<boolean>
  /** when the latest ready run (another one) started: the last successful reading */
  ultimaLetturaRiuscita(escludi: string): Promise<string | null>
  storicoDal(): Promise<string | null>
  // tokens and exclusions
  tokenInstagram(): Promise<string | null>
  erroreInstagram(messaggio: string): Promise<void>
  tokenMessenger(): Promise<string | null>
  erroreMessenger(messaggio: string): Promise<void>
  esclusi(): Promise<ChatEscluse>
  // chats
  chatVuota(): Promise<boolean>
  statoChat(canale: CanaleInsight, ids: readonly string[]): Promise<Map<string, StatoChatSalvata>>
  salvaChat(righe: readonly RigaChatDaSalvare[]): Promise<void>
  identitaChat(canale: CanaleInsight, ids: readonly string[]): Promise<IdentitaChat[]>
  chiaviRecenti(dal: string): Promise<IdentitaChat[]>
  chatLetteSenzaOrigine(esecuzione: string): Promise<ChatSalvata[]>
  chatDellEsecuzione(op: { ids: Record<CanaleInsight, readonly string[]>; dal: string }): Promise<ChatSalvata[]>
  chatPerConteggi(dalGiorno: string): Promise<ChatSalvata[]>
  aggiornaChat(canale: CanaleInsight, conversazioneId: string, campi: CampiChat): Promise<void>
  /**
   * A chat found to be under 14 (D25): the words it left in the earlier recaps
   * and cards go (insight_scarta_minore); `esecuzione` is the run that found it,
   * whose own cards keep the warm closure.
   */
  scartaMinore(canale: CanaleInsight, conversazioneId: string, esecuzione: string): Promise<void>
  salvaOrigine(canale: CanaleInsight, conversazioneId: string, origine: OrigineChat): Promise<void>
  // profiles
  profili(usernames: readonly string[]): Promise<ProfiloSalvato[]>
  salvaProfili(righe: readonly ProfiloSalvato[]): Promise<void>
  // Dany's posts
  salvaElenco(media: readonly MediaLetto[]): Promise<number>
  salvaStatistiche(mediaId: string, statistiche: InsightsMedia): Promise<void>
  post(dal: string): Promise<PostInsight[]>
  // the app
  agenda(adesso: Date): Promise<VoceAgendaApp[]>
  statoLead(username: readonly string[], nomi: readonly string[]): Promise<StatoLeadApp[]>
  // cards and blocks
  schedePrecedenti(op: { esecuzione: string; dalGiorno: string; chiavi: readonly string[] }): Promise<SchedaArchiviata[]>
  schedeUguali(op: {
    esecuzione: string
    giorno: string
    canale: CanaleInsight
    impronte: readonly string[]
    tipi: readonly TipoScheda[]
  }): Promise<Map<string, { tipo: TipoScheda; dati: unknown }>>
  salvaSchede(esecuzione: string, giorno: string, canale: CanaleInsight, schede: readonly SchedaSalvata[]): Promise<void>
  schedeDellEsecuzione(esecuzione: string): Promise<SchedaArchiviata[]>
  blocchi(esecuzione: string): Promise<BloccoArchiviato[]>
  ripianifica(esecuzione: string): Promise<void>
  inserisciBlocchi(esecuzione: string, blocchi: readonly BloccoPianificato[]): Promise<void>
  aggiornaBlocco(id: string, campi: CampiBlocco): Promise<void>
  // the recap and the counts
  salvaRecap(op: { giorno: string; canale: CanaleInsight; esecuzione: string; generatoIl: string; documento: RecapCanale }): Promise<void>
  /**
   * `segnaGiorni` false: the reading was partial, the days it re-read are not
   * marked as counted (zero leads would mean «not read»)
   */
  salvaConteggi(righe: readonly RigaContenutiDm[], opzioni?: { segnaGiorni?: boolean }): Promise<number>
}

// ---------------------------------------------------------------------------
// Rows to shapes
// ---------------------------------------------------------------------------

const DA = new Set(['lead', 'alpha'])
const TIPI_ORIGINE = new Set<TipoOrigine>(['condivisione', 'parola_chiave', 'storia', 'testo'])
const TARGET = new Set<TargetLead>(['si', 'no', 'da verificare'])
const TIPI_MEDIA = new Set<PostInsight['media_type']>(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'])

/** insight_chat.messaggi as stored: only well-formed messages. */
export function messaggiDa(valore: unknown): MessaggioChat[] {
  if (!Array.isArray(valore)) return []
  const out: MessaggioChat[] = []
  for (const m of valore) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    if (typeof r.da !== 'string' || !DA.has(r.da) || typeof r.il !== 'string' || typeof r.testo !== 'string') continue
    out.push({
      da: r.da as MessaggioChat['da'],
      il: r.il,
      testo: r.testo,
      codici: Array.isArray(r.codici) ? r.codici.filter((c): c is string => typeof c === 'string') : [],
      storia: r.storia === true,
    })
  }
  return out
}

type RigaChat = Record<string, unknown>

const stringa = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** A row of insight_chat as ChatSalvata. */
export function chatDaRiga(r: RigaChat): ChatSalvata {
  const tipo = stringa(r.origine_tipo)
  const target = stringa(r.ultimo_target)
  const ultimoDa = stringa(r.ultimo_da)
  return {
    id: String(r.id ?? ''),
    canale: r.canale === 'messenger' ? 'messenger' : 'instagram',
    conversazione_id: String(r.conversazione_id ?? ''),
    username: stringa(r.username),
    utente_id: stringa(r.utente_id),
    nome: stringa(r.nome),
    aggiornata_il: stringa(r.aggiornata_il),
    messaggi: messaggiDa(r.messaggi),
    messaggi_letti: typeof r.messaggi_letti === 'number' ? r.messaggi_letti : 0,
    completa: r.completa === true,
    ultimo_da: ultimoDa && DA.has(ultimoDa) ? (ultimoDa as ChatSalvata['ultimo_da']) : null,
    ultimo_il: stringa(r.ultimo_il),
    calendly_inviato_il: stringa(r.calendly_inviato_il),
    codici_condivisi: Array.isArray(r.codici_condivisi) ? r.codici_condivisi.filter((c): c is string => typeof c === 'string') : [],
    non_lead: r.non_lead === true,
    letta_il: stringa(r.letta_il) ?? '',
    origine_tipo: tipo && TIPI_ORIGINE.has(tipo as TipoOrigine) ? (tipo as TipoOrigine) : null,
    origine_shortcode: stringa(r.origine_shortcode),
    origine_il: stringa(r.origine_il),
    origine_giorno: stringa(r.origine_giorno),
    ultimo_target: target && TARGET.has(target as TargetLead) ? (target as TargetLead) : null,
    minore_14: r.minore_14 === true,
    letta_da: stringa(r.letta_da),
  }
}

// ---------------------------------------------------------------------------
// The real archive
// ---------------------------------------------------------------------------

/** Rows of an `in` filter per request (the URL stays short). */
const BLOCCO_IN = 100
/** PostgREST's max_rows: longer readings go by pages. */
const PAGINA = 1000
const MASSIMO_RIGHE = 5000

const COLONNE_CHAT =
  'id, canale, conversazione_id, username, utente_id, nome, aggiornata_il, messaggi, messaggi_letti, completa, ultimo_da, ultimo_il, calendly_inviato_il, codici_condivisi, non_lead, letta_il, origine_tipo, origine_shortcode, origine_il, origine_giorno, ultimo_target, minore_14, letta_da'
const COLONNE_CHAT_SENZA_MESSAGGI =
  'id, canale, conversazione_id, username, utente_id, nome, aggiornata_il, messaggi_letti, completa, ultimo_da, ultimo_il, calendly_inviato_il, codici_condivisi, non_lead, letta_il, origine_tipo, origine_shortcode, origine_il, origine_giorno, ultimo_target, minore_14, letta_da'

function guasto(cosa: string, errore: { code?: string } | null | undefined): ErroreInsight {
  console.error('[insight] database:', cosa, errore?.code ?? 'errore')
  return new ErroreInsight('database')
}

function aBlocchi<T>(elementi: readonly T[], quanti = BLOCCO_IN): T[][] {
  const out: T[][] = []
  for (let i = 0; i < elementi.length; i += quanti) out.push(elementi.slice(i, i + quanti))
  return out
}

/** Reads a query page by page (range), up to MASSIMO_RIGHE rows. */
async function aPagine<T>(
  cosa: string,
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let da = 0; da < MASSIMO_RIGHE; da += PAGINA) {
    const { data, error } = await pagina(da, da + PAGINA - 1)
    if (error) throw guasto(cosa, error)
    out.push(...(data ?? []))
    if ((data ?? []).length < PAGINA) break
  }
  return out
}

function schedaDaRiga(r: Record<string, unknown>): SchedaArchiviata {
  return {
    tipo: r.tipo as TipoScheda,
    chiave: String(r.chiave ?? ''),
    impronta: String(r.impronta ?? ''),
    dati: r.dati,
    canale: r.canale === 'messenger' ? 'messenger' : 'instagram',
    giorno: String(r.giorno ?? ''),
    esecuzione_id: String(r.esecuzione_id ?? ''),
  }
}

const json = (v: unknown) => v as NonNullable<Json>

export function creaArchivio(db: AdminClient): Archivio {
  return {
    async esecuzione(id) {
      const { data, error } = await db
        .from('insight_esecuzioni')
        .select(
          'id, giorno, stato, creata_il, iniziata_il, contesto_app, modello, token_input, token_cache_scritti, token_cache_letti, token_output, servito_da_fallback',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw guasto('esecuzione non letta', error)
      if (!data) return null
      return { ...data, contesto_app: contestoApp(data.contesto_app) }
    },

    async salvaContesto(id, contesto) {
      const { error } = await db.from('insight_esecuzioni').update({ contesto_app: json(contesto) }).eq('id', id)
      if (error) throw guasto('contesto non salvato', error)
    },

    async passoFinito(id, prossimo, progresso, avvisi, contatori) {
      const { data, error } = await db.rpc('insight_passo_finito', {
        p_esecuzione: id,
        // null: the run is ready (the generated types say the enum only)
        p_prossimo: prossimo as PassoInsight,
        p_progresso: json(progresso),
        p_avvisi: [...avvisi],
        p_contatori: json(contatori),
      })
      if (error) throw guasto('passo non chiuso', error)
      return data === true
    },

    async fallita(id, errore, contatori) {
      const { data, error } = await db.rpc('insight_fallita', {
        p_esecuzione: id,
        p_errore: errore,
        ...(contatori ? { p_contatori: json(contatori) } : {}),
      })
      if (error) throw guasto('esecuzione non chiusa', error)
      return data === true
    },

    async ultimaLetturaRiuscita(escludi) {
      const { data, error } = await db
        .from('insight_esecuzioni')
        .select('iniziata_il')
        .eq('stato', 'pronta')
        .neq('id', escludi)
        .not('iniziata_il', 'is', null)
        .order('iniziata_il', { ascending: false })
        .limit(1)
      if (error) throw guasto('esecuzioni non lette', error)
      return data?.[0]?.iniziata_il ?? null
    },

    async storicoDal() {
      const { data, error } = await db.from('insight_impostazioni').select('storico_dal').maybeSingle()
      if (error) throw guasto('impostazioni non lette', error)
      return data?.storico_dal ?? null
    },

    async tokenInstagram() {
      const { data, error } = await db.rpc('instagram_token')
      if (error) throw guasto('token Instagram non letto', error)
      return typeof data === 'string' && data.trim() !== '' ? data.trim() : null
    },

    async erroreInstagram(messaggio) {
      const { error } = await db.rpc('instagram_errore', { p_messaggio: messaggio })
      if (error) console.error('[insight] errore Instagram non registrato:', error.code ?? 'errore')
    },

    async tokenMessenger() {
      const { data, error } = await db.rpc('messenger_token')
      if (error) throw guasto('token Messenger non letto', error)
      return typeof data === 'string' && data.trim() !== '' ? data.trim() : null
    },

    async erroreMessenger(messaggio) {
      const { error } = await db.rpc('messenger_errore', { p_messaggio: messaggio })
      if (error) console.error('[insight] errore Messenger non registrato:', error.code ?? 'errore')
    },

    async esclusi() {
      const [ig, fb] = await Promise.all([
        db.from('instagram_esclusi').select('username'),
        db.from('messenger_esclusi').select('utente_id'),
      ])
      if (ig.error) throw guasto('chat escluse non lette', ig.error)
      if (fb.error) throw guasto('chat Messenger escluse non lette', fb.error)
      return {
        instagram: new Set((ig.data ?? []).map((r) => r.username.toLowerCase())),
        messenger: new Set((fb.data ?? []).map((r) => r.utente_id)),
      }
    },

    async chatVuota() {
      const { data, error } = await db.from('insight_chat').select('id').limit(1)
      if (error) throw guasto('chat non lette', error)
      return (data ?? []).length === 0
    },

    async statoChat(canale, ids) {
      const out = new Map<string, StatoChatSalvata>()
      for (const blocco of aBlocchi(ids)) {
        const { data, error } = await db
          .from('insight_chat')
          .select('conversazione_id, aggiornata_il, non_lead, minore_14')
          .eq('canale', canale)
          .in('conversazione_id', blocco)
        if (error) throw guasto('stato delle chat non letto', error)
        for (const r of data ?? []) {
          out.set(r.conversazione_id, { aggiornata_il: r.aggiornata_il, non_lead: r.non_lead, minore_14: r.minore_14 })
        }
      }
      return out
    },

    async salvaChat(righe) {
      // the same columns in every row of a request (PostgREST writes null where a key is missing)
      const perColonne = new Map<string, RigaChatDaSalvare[]>()
      for (const r of righe) {
        const chiave = Object.keys(r).sort().join(',')
        perColonne.set(chiave, [...(perColonne.get(chiave) ?? []), r])
      }
      for (const gruppo of perColonne.values()) {
        for (const blocco of aBlocchi(gruppo)) {
          const { error } = await db
            .from('insight_chat')
            .upsert(
              blocco.map((r) => ({ ...r, messaggi: json(r.messaggi) })),
              { onConflict: 'canale,conversazione_id' },
            )
          if (error) throw guasto('chat non salvate', error)
        }
      }
    },

    async identitaChat(canale, ids) {
      const out: IdentitaChat[] = []
      for (const blocco of aBlocchi(ids)) {
        const { data, error } = await db
          .from('insight_chat')
          .select('canale, conversazione_id, username, utente_id, nome')
          .eq('canale', canale)
          .in('conversazione_id', blocco)
        if (error) throw guasto('chat non lette', error)
        out.push(...(data ?? []))
      }
      return out
    },

    async chiaviRecenti(dal) {
      return aPagine('chat recenti non lette', (da, a) =>
        db
          .from('insight_chat')
          .select('canale, conversazione_id, username, utente_id, nome')
          .gte('ultimo_il', dal)
          .order('id')
          .range(da, a),
      )
    },

    async chatLetteSenzaOrigine(esecuzione) {
      const righe = await aPagine('chat da attribuire non lette', (da, a) =>
        db
          .from('insight_chat')
          .select(COLONNE_CHAT)
          .eq('letta_da', esecuzione)
          .is('origine_tipo', null)
          .eq('completa', true)
          .eq('non_lead', false)
          .eq('minore_14', false)
          .order('id')
          .range(da, a),
      )
      return righe.map((r) => chatDaRiga(r as RigaChat))
    },

    async chatDellEsecuzione({ ids, dal }) {
      const perId = new Map<string, ChatSalvata>()
      const recenti = await aPagine('chat del recap non lette', (da, a) =>
        db.from('insight_chat').select(COLONNE_CHAT).gte('ultimo_il', dal).order('id').range(da, a),
      )
      for (const r of recenti) {
        const c = chatDaRiga(r as RigaChat)
        perId.set(c.id, c)
      }
      for (const canale of ['instagram', 'messenger'] as const) {
        for (const blocco of aBlocchi(ids[canale])) {
          const { data, error } = await db.from('insight_chat').select(COLONNE_CHAT).eq('canale', canale).in('conversazione_id', blocco)
          if (error) throw guasto('chat del giorno non lette', error)
          for (const r of data ?? []) {
            const c = chatDaRiga(r as RigaChat)
            perId.set(c.id, c)
          }
        }
      }
      return [...perId.values()]
    },

    async chatPerConteggi(dalGiorno) {
      const righe = await aPagine('chat per i conteggi non lette', (da, a) =>
        db
          .from('insight_chat')
          .select(COLONNE_CHAT_SENZA_MESSAGGI)
          .gte('origine_giorno', dalGiorno)
          .not('origine_shortcode', 'is', null)
          .order('id')
          .range(da, a),
      )
      return righe.map((r) => chatDaRiga(r as RigaChat))
    },

    async aggiornaChat(canale, conversazioneId, campi) {
      const valori = { ...campi, ...(campi.messaggi ? { messaggi: json(campi.messaggi) } : {}) }
      const { error } = await db
        .from('insight_chat')
        .update(valori)
        .eq('canale', canale)
        .eq('conversazione_id', conversazioneId)
      if (error) throw guasto('chat non aggiornata', error)
    },

    async scartaMinore(canale, conversazioneId, esecuzione) {
      const { error } = await db.rpc('insight_scarta_minore', {
        p_canale: canale,
        p_conversazione_id: conversazioneId,
        p_esecuzione: esecuzione,
      })
      if (error) throw guasto('minore non scartato', error)
    },

    async salvaOrigine(canale, conversazioneId, origine) {
      const { error } = await db
        .from('insight_chat')
        .update({
          origine_tipo: origine.tipo,
          origine_shortcode: origine.shortcode,
          origine_il: origine.il,
          origine_giorno: origine.giorno,
        })
        .eq('canale', canale)
        .eq('conversazione_id', conversazioneId)
        // frozen once found
        .is('origine_tipo', null)
      if (error) throw guasto('origine non salvata', error)
    },

    async profili(usernames) {
      const out: ProfiloSalvato[] = []
      for (const blocco of aBlocchi(usernames)) {
        const { data, error } = await db
          .from('insight_profili')
          .select('username, utente_id, nome, follower, verificato, ti_segue, lo_segui, letto_il')
          .in('username', blocco)
        if (error) throw guasto('profili non letti', error)
        out.push(...(data ?? []))
      }
      return out
    },

    async salvaProfili(righe) {
      for (const blocco of aBlocchi(righe)) {
        const { error } = await db.from('insight_profili').upsert([...blocco], { onConflict: 'username' })
        if (error) throw guasto('profili non salvati', error)
      }
    },

    async salvaElenco(media) {
      try {
        return await salvaElencoContenuti(db, media)
      } catch {
        throw guasto('post non salvati', null)
      }
    },

    async salvaStatistiche(mediaId, statistiche) {
      const valori = statistiche.valori
      const letto = Object.values(valori).some((v) => typeof v === 'number')
      const { error } = await db
        .from('instagram_contenuti')
        .update({
          ...valori,
          metriche_stato: statistiche.stato,
          // 1.36.0's snapshot follows metriche_il: only when a number was read (D28)
          ...(letto ? { metriche_il: new Date().toISOString() } : {}),
        })
        .eq('media_id', mediaId)
      if (error) throw guasto('statistiche non salvate', error)
    },

    async post(dal) {
      const { data, error } = await db
        .from('instagram_contenuti')
        .select('shortcode, permalink, pubblicato_il, media_type, reel, didascalia, views, saved, shares')
        .gte('pubblicato_il', dal)
        .order('pubblicato_il', { ascending: false })
        .limit(PAGINA)
      if (error) throw guasto('post non letti', error)
      return (data ?? []).map((p) => ({
        ...p,
        media_type: TIPI_MEDIA.has(p.media_type as PostInsight['media_type']) ? (p.media_type as PostInsight['media_type']) : 'IMAGE',
      }))
    },

    async agenda(adesso) {
      const { data, error } = await db.rpc('insight_agenda', { p_adesso: adesso.toISOString() })
      if (error) throw guasto('agenda non letta', error)
      return vociAgenda(data)
    },

    async statoLead(username, nomi) {
      if (username.length === 0 && nomi.length === 0) return []
      const { data, error } = await db.rpc('insight_stato_lead', { p_username: [...username], p_nomi: [...nomi] })
      if (error) throw guasto('stato dei lead non letto', error)
      return statiLead(data)
    },

    async schedePrecedenti({ esecuzione, dalGiorno, chiavi }) {
      const out: (SchedaArchiviata & { _il: string; _id: string })[] = []
      for (const blocco of aBlocchi(chiavi)) {
        // page by page: PostgREST cuts a long answer at max_rows without an error, and the
        // cut would take the newest cards, the ones ultimaSchedaPerChat lets win
        const righe = await aPagine('schede precedenti non lette', (da, a) =>
          db
            .from('insight_schede')
            .select('id, esecuzione_id, giorno, canale, tipo, chiave, impronta, dati, created_at')
            .gte('giorno', dalGiorno)
            .neq('esecuzione_id', esecuzione)
            .in('chiave', blocco)
            // newest first: if the cap of aPagine ever cuts, it cuts the oldest cards
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(da, a),
        )
        for (const r of righe) out.push({ ...schedaDaRiga(r), _il: String(r.created_at), _id: String(r.id) })
      }
      return out
        .sort((a, b) => a._il.localeCompare(b._il) || a._id.localeCompare(b._id))
        .map(({ _il, _id, ...s }) => {
          void _il
          void _id
          return s
        })
    },

    async schedeUguali({ esecuzione, giorno, canale, impronte, tipi }) {
      const out = new Map<string, { tipo: TipoScheda; dati: unknown; il: string }>()
      for (const blocco of aBlocchi(impronte)) {
        const { data, error } = await db
          .from('insight_schede')
          .select('tipo, impronta, dati, created_at')
          .eq('giorno', giorno)
          .eq('canale', canale)
          .neq('esecuzione_id', esecuzione)
          .in('tipo', [...tipi])
          .in('impronta', blocco)
        if (error) throw guasto('schede uguali non lette', error)
        for (const r of data ?? []) {
          const prima = out.get(r.impronta)
          if (!prima || prima.il < r.created_at) out.set(r.impronta, { tipo: r.tipo as TipoScheda, dati: r.dati, il: r.created_at })
        }
      }
      return new Map([...out].map(([k, v]) => [k, { tipo: v.tipo, dati: v.dati }]))
    },

    async salvaSchede(esecuzione, giorno, canale, schede) {
      for (const blocco of aBlocchi(schede)) {
        const { error } = await db.from('insight_schede').upsert(
          blocco.map((s) => ({ esecuzione_id: esecuzione, giorno, canale, tipo: s.tipo, chiave: s.chiave, impronta: s.impronta, dati: json(s.dati) })),
          { onConflict: 'esecuzione_id,canale,tipo,chiave' },
        )
        if (error) throw guasto('schede non salvate', error)
      }
    },

    async schedeDellEsecuzione(esecuzione) {
      const righe = await aPagine('schede dell’esecuzione non lette', (da, a) =>
        db
          .from('insight_schede')
          .select('id, esecuzione_id, giorno, canale, tipo, chiave, impronta, dati, created_at')
          .eq('esecuzione_id', esecuzione)
          .order('created_at')
          .order('id')
          .range(da, a),
      )
      return righe.map((r) => schedaDaRiga(r))
    },

    async blocchi(esecuzione) {
      const { data, error } = await db
        .from('insight_blocchi')
        .select('id, esecuzione_id, canale, tipo, indice, chiavi, stato, tentativi, risultato, servito_da_fallback, errore')
        .eq('esecuzione_id', esecuzione)
        .order('tipo')
        .order('canale')
        .order('indice')
      if (error) throw guasto('blocchi non letti', error)
      return (data ?? []).map((b) => ({
        ...b,
        tipo: b.tipo as TipoBlocco,
        stato: b.stato as StatoBlocco,
      }))
    },

    async ripianifica(esecuzione) {
      const blocchi = await db.from('insight_blocchi').delete().eq('esecuzione_id', esecuzione)
      if (blocchi.error) throw guasto('blocchi non tolti', blocchi.error)
      const schede = await db.from('insight_schede').delete().eq('esecuzione_id', esecuzione)
      if (schede.error) throw guasto('schede non tolte', schede.error)
    },

    async inserisciBlocchi(esecuzione, blocchi) {
      for (const blocco of aBlocchi(blocchi)) {
        const { error } = await db
          .from('insight_blocchi')
          .insert(blocco.map((b) => ({ esecuzione_id: esecuzione, canale: b.canale, tipo: b.tipo, indice: b.indice, chiavi: [...b.chiavi] })))
        if (error) throw guasto('blocchi non salvati', error)
      }
    },

    async aggiornaBlocco(id, campi) {
      const { risultato, usage, ...resto } = campi
      const valori = {
        ...resto,
        ...('risultato' in campi ? { risultato: json(risultato) } : {}),
        ...('usage' in campi ? { usage: json(usage) } : {}),
      }
      const { error } = await db.from('insight_blocchi').update(valori).eq('id', id)
      if (error) throw guasto('blocco non aggiornato', error)
    },

    async salvaRecap({ giorno, canale, esecuzione, generatoIl, documento }) {
      // the setter reads the whole row of insight_recap: the warnings and how the recap was made
      // are the admin's (D23), so they go on the run (insight_esecuzioni, admin only)
      const { avvisi, generato_con: generatoCon, ...pubblico } = documento
      const { data: run, error: erroreRun } = await db.from('insight_esecuzioni').select('dettagli_recap').eq('id', esecuzione).maybeSingle()
      if (erroreRun) throw guasto('dettagli del recap non letti', erroreRun)
      const prima = run?.dettagli_recap && typeof run.dettagli_recap === 'object' && !Array.isArray(run.dettagli_recap) ? run.dettagli_recap : {}
      const { error: erroreDettagli } = await db
        .from('insight_esecuzioni')
        .update({ dettagli_recap: json({ ...prima, [canale]: { avvisi, generato_con: generatoCon } }) })
        .eq('id', esecuzione)
      if (erroreDettagli) throw guasto('dettagli del recap non salvati', erroreDettagli)
      // never delete-and-insert: a delete would take that day's Fatto with it (C16)
      const { error } = await db.from('insight_recap').upsert(
        { giorno, canale, esecuzione_id: esecuzione, generato_il: generatoIl, stato: documento.stato, dati: json(pubblico) },
        { onConflict: 'giorno,canale' },
      )
      if (error) throw guasto('recap non salvato', error)
    },

    async salvaConteggi(righe, opzioni) {
      const { data, error } = await db.rpc('instagram_contenuti_dm_salva', {
        p_righe: json(righe),
        p_segna_giorni: opzioni?.segnaGiorni !== false,
      })
      if (error) throw guasto('conteggi non salvati', error)
      return typeof data === 'number' ? data : 0
    },
  }
}
