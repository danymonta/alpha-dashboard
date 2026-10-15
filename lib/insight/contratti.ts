import type Anthropic from '@anthropic-ai/sdk'

import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import type { DaChi, PostRecap, RecapCanale, TargetLead, TipoOrigine } from '@/lib/insight/recap'
import type { Enums } from '@/lib/supabase/database.types'

/**
 * The contracts between the groups that build the Insight (1.35.0, phase 0 of
 * the release): the shapes that cross a module boundary and the signatures of
 * the functions one group writes and another calls. Types only, nothing runs
 * here. The reading of Meta (lib/instagram/testo.ts, lib/messenger/graph.ts)
 * produces MessaggioChat; the orchestration (lib/insight/lettura.ts,
 * esecuzione.ts) stores ChatSalvata and ContestoApp and calls the AI layer
 * (blocchi.ts, esegui.ts, origine.ts, contenuti.ts, unione.ts) through the
 * signatures below; the page reads only lib/insight/recap.ts.
 *
 * An implementation is declared against its signature, for example
 * `export const contaPerPost: ContaPerPost = (op) => …`. A change to a shape
 * goes back through phase 0, never in one group alone.
 *
 * Privacy rules carried by these types: never a token, never a closer or
 * setter note, never an amount, never a client flag sent to the model (D15),
 * never an excluded chat (D5). Progress and counters hold ids and numbers
 * only, never a text or a username.
 */

// ---------- small shared names ----------

/** public.insight_canale */
export type CanaleInsight = 'instagram' | 'messenger'
/** public.insight_passo */
export type PassoInsight = 'lettura' | 'analisi' | 'unione'
/** public.insight_stato_esecuzione */
export type StatoEsecuzione = 'in_coda' | 'in_corso' | 'pronta' | 'fallita'
/** The age band Claude gives each chat (D22, D25). */
export type FasciaEta = 'sotto_14' | '14_17' | 'maggiorenne' | 'ignota'
/** insight_blocchi.tipo */
export type TipoBlocco = 'schede' | 'riattivazione' | 'agenda' | 'correzione' | 'sintesi'
/** insight_blocchi.stato */
export type StatoBlocco = 'da_fare' | 'in_corso' | 'fatto' | 'fallito'
/** insight_schede.tipo */
export type TipoScheda = 'lead' | 'non_lead' | 'riattivazione' | 'agenda' | 'show_up'

export type { DaChi, TargetLead, TipoOrigine }

// ---------- what is read from Meta and stored ----------

/**
 * One message as stored in insight_chat.messaggi (lib/instagram/testo.ts,
 * descriviMessaggio), oldest first. Never older than 30 days.
 */
export type MessaggioChat = {
  da: DaChi
  /** ISO UTC */
  il: string
  /** the text, or the reader's Italian labels ([messaggio vocale], [risposta a una storia], …) */
  testo: string
  /** the shortcodes of the instagram.com posts the message shares, or of the story it answers (shortcodeInstagram) */
  codici: string[]
  /** a reply to, or a mention in, a story */
  storia: boolean
}

/** A chat's origin (D26): frozen once found, only on a complete chat. */
export type OrigineChat = {
  tipo: TipoOrigine
  /** one of Dany's posts in instagram_contenuti; null only for a story whose post Meta does not say */
  shortcode: string | null
  /** ISO UTC: the chat's first message, when the lead arrived */
  il: string
  /** 'YYYY-MM-DD', the Rome day of `il`: the day the counts go to */
  giorno: string
  /** parola_chiave only: the keyword, as the caption asks it (never stored in the database) */
  parola?: string
}

/** A row of public.insight_chat as the code reads and writes it. No session ever reads it (D20). */
export type ChatSalvata = {
  id: string
  canale: CanaleInsight
  conversazione_id: string
  /** Instagram: the lead's username, lowercase */
  username: string | null
  /** Instagram user id or Messenger PSID */
  utente_id: string | null
  nome: string | null
  /** Meta's updated_time; null forces a new reading (D25 step 5) */
  aggiornata_il: string | null
  messaggi: MessaggioChat[]
  messaggi_letti: number
  /** fewer than 20 messages read: the start of the chat is visible */
  completa: boolean
  ultimo_da: DaChi | null
  ultimo_il: string | null
  calendly_inviato_il: string | null
  codici_condivisi: string[]
  non_lead: boolean
  letta_il: string
  origine_tipo: TipoOrigine | null
  origine_shortcode: string | null
  origine_il: string | null
  origine_giorno: string | null
  /** the latest classification of Claude, for the counts of the past days */
  ultimo_target: TargetLead | null
  minore_14: boolean
  /** the run that last wrote `messaggi` (D25 step 5) */
  letta_da: string | null
}

/** One of Dany's posts, from instagram_contenuti (1.33.0) with the latest statistics. */
export type PostInsight = {
  shortcode: string
  permalink: string
  /** ISO UTC */
  pubblicato_il: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  reel: boolean
  didascalia: string | null
  views: number | null
  saved: number | null
  shares: number | null
}

/** A post as Claude sees it in contesto_giorno: `post_ref` of a card is its `indice`. */
export type PostPerAnalisi = {
  indice: number
  shortcode: string
  /** 'GG/MM', the Rome day it was published */
  data: string
  tipo: 'reel' | 'post' | 'carosello'
  /** the first sentence of the caption, up to 90 characters */
  hook: string
}

// ---------- the app's state (contesto_app of the run) ----------

/** A row of public.insight_agenda(): never notes, amounts, contacts or the closer (D3). */
export type VoceAgendaApp = {
  giorno: 'ieri' | 'oggi' | 'domani'
  call_id: string
  /** ISO UTC */
  programmata_il: string
  lead_id: string
  nome: string | null
  /** lowercase, without @; null when the handle is not valid */
  username: string | null
  fonte: Enums<'lead_source'> | null
  stato: Enums<'call_status'>
  esito: Enums<'call_outcome'> | null
  di_follow_up: boolean
  volte_spostata: number
  no_show_precedenti: number
}

/**
 * A row of public.insight_stato_lead(): a handle, or a Messenger name that
 * matches exactly one lead. `cliente` and `ha_call` are for code only, never
 * sent to Claude (D15).
 */
export type StatoLeadApp = {
  chiave: string
  per: 'username' | 'nome'
  stato_lead: Enums<'lead_status'> | null
  fonte: Enums<'lead_source'> | null
  prossima_call_il: string | null
  prossima_call_stato: Enums<'call_status'> | null
  ultimo_esito: Enums<'call_outcome'> | null
  no_show_precedenti: number
  cliente: boolean
  ha_call: boolean
}

/** insight_esecuzioni.contesto_app: names and handles of booked leads, never notes or amounts. */
export type ContestoApp = {
  agenda: VoceAgendaApp[]
  stato_lead: StatoLeadApp[]
}

/** The chats left out by the settings: Instagram usernames and Messenger PSIDs. */
export type ChatEscluse = {
  instagram: ReadonlySet<string>
  messenger: ReadonlySet<string>
}

// ---------- what Claude receives for one chat ----------

/** One chat in a block of the analysis. */
export type ChatPerAnalisi = {
  /** the ref the code issued in this block ('c07'), the only key Claude writes back */
  ref: string
  canale: CanaleInsight
  conversation_id: string
  username: string | null
  user_id: string | null
  nome_profilo: string | null
  profilo: { follower: number | null; ti_segue: boolean | null; lo_segui: boolean | null } | null
  completa: boolean
  messaggi: { da: DaChi; /** 'GG/MM HH:MM' Rome */ quando: string; testo: string }[]
  ultimo_da: DaChi | null
  ultimo_il: string | null
  /** only when the lead has the last word */
  ore_attesa: number | null
  calendly_inviato_il: string | null
  app: {
    stato_lead: Enums<'lead_status'> | null
    call: { quando: string; stato: Enums<'call_status'>; esito: Enums<'call_outcome'> | null; di_follow_up: boolean } | null
    no_show_precedenti: number
  }
  /** shortcodes shared in the chat */
  contenuti_condivisi: string[]
  /** the origin is already known from code: `post_ref` is not asked */
  origine_da_codice: boolean
  /** riattivazione only */
  giorni_silenzio?: number
  passo?: 1 | 2 | 3
}

// ---------- the run ----------

/** insight_esecuzioni.progresso: conversation ids and counters only, never text or usernames. */
export type ProgressoEsecuzione = Record<string, unknown>

/**
 * p_contatori of insight_passo_finito: the whitelisted keys. Token counters
 * and servito_da_fallback are added up; the others replace; storico_dal is
 * written once, only while it is null (D27).
 */
export type ContatoriPasso = Partial<{
  chat_instagram: number
  chat_messenger: number
  chat_escluse: number
  contenuti: number
  blocchi_totali: number
  blocchi_fatti: number
  chat_attribuite: number
  token_input: number
  token_cache_scritti: number
  token_cache_letti: number
  token_output: number
  servito_da_fallback: number
  modello: string
  /** 'YYYY-MM-DD' */
  storico_dal: string
}>

/**
 * How a step ended. A step never throws (esecuzione.ts): it ends in
 * insight_passo_finito (`prossimo` the next step, the same one when out of
 * time, null when the run is ready) or in insight_fallita with a sentence of
 * FRASI_INSIGHT, never built from an error's message.
 */
export type EsitoPasso =
  | {
      ok: true
      prossimo: PassoInsight | null
      progresso: ProgressoEsecuzione
      avvisi: string[]
      contatori: ContatoriPasso
    }
  | { ok: false; errore: string }

/** Why the reading stopped (the causes of 1.33.0's run of the posts, plus Anthropic's). */
export type MotivoFallimento = 'senza_token' | 'token' | 'limite' | 'rete' | 'tempo' | 'meta' | 'database'

/** lettura.ts */
export type EsitoLettura =
  | {
      ok: true
      /** false: out of time, the same step again with `progresso` */
      completa: boolean
      progresso: ProgressoEsecuzione
      avvisi: string[]
      contatori: ContatoriPasso
      /** set once the reading is complete */
      contesto: ContestoApp | null
    }
  | { ok: false; motivo: MotivoFallimento; errore: string }

export type LeggiPerInsight = (op: {
  /** the service-role client */
  db: AdminClient
  esecuzione: string
  /** 'YYYY-MM-DD', the Rome day of the run */
  giorno: string
  adesso: Date
  /** epoch ms: no new request to Meta after it */
  entro: number
  progresso: ProgressoEsecuzione
}) => Promise<EsitoLettura>

// ---------- the AI layer ----------

/** A row of public.insight_blocchi. */
export type BloccoSalvato = {
  id: string
  esecuzione_id: string
  canale: CanaleInsight
  tipo: TipoBlocco
  indice: number
  /** conversazione_id (schede, riattivazione) or call_id (agenda) */
  chiavi: string[]
  stato: StatoBlocco
  tentativi: number
}

/** A block to insert, before it has an id. */
export type BloccoPianificato = Pick<BloccoSalvato, 'canale' | 'tipo' | 'indice' | 'chiavi'>

/** blocchi.ts: up to 10 chats and about 5K transcript tokens per block; never a minore_14 chat. */
export type PianificaBlocchi = (op: {
  canale: CanaleInsight
  tipo: 'schede' | 'riattivazione'
  chats: readonly Pick<ChatSalvata, 'conversazione_id' | 'messaggi' | 'minore_14'>[]
}) => BloccoPianificato[]

export type UsageBlocco = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
}

/** What is stored in insight_blocchi.errore: a code, never an exception's message (C18). */
export type CodiceErroreBlocco =
  | 'rate_limit'
  | 'timeout'
  | 'rete'
  | 'server'
  | 'json'
  | 'schema'
  | 'max_tokens'
  | 'interrotto'
  | 'autenticazione'
  | 'richiesta'
  | `refusal:${string}`

export type EsitoBlocco<T = unknown> =
  | {
      ok: true
      /** validated by the strict layer (verifica.ts) */
      risultato: T
      usage: UsageBlocco
      servito_da_fallback: boolean
      modello: string
      request_id: string | null
    }
  | {
      ok: false
      errore: CodiceErroreBlocco
      /**
       * da_rifare: back to da_fare (time, rate limit, network); fallito: its
       * chats get placeholder cards; fatale: the run stops (authentication,
       * permission, credit, bad request)
       */
      esito: 'da_rifare' | 'fallito' | 'fatale'
      usage: UsageBlocco | null
      /**
       * schede and riattivazione only: the cards the block had already
       * validated (and paid for) when it was interrupted, saved before the
       * block goes back, so only the chats without a card run again
       */
      parziale?: unknown
    }

/** The data of a block (bloccoDati of the prompt): what Claude reads after <passo>. */
export type PayloadBlocco = {
  passo: TipoBlocco
  canale: CanaleInsight
  dati: unknown
}

/** esegui.ts */
export type EseguiBlocco = <T = unknown>(op: {
  client: Anthropic
  blocco: BloccoSalvato
  payload: PayloadBlocco
  /** epoch ms: the attempt's timeout is min(150 s, scadenza - now - 15 s) */
  scadenza: number
  /** the step's AbortController, fired at `entro` */
  segnale: AbortSignal
  /** the first block of a run calls it at its first stream event: the pool then releases the others */
  alPrimoEvento?: () => void
}) => Promise<EsitoBlocco<T>>

/** origine.ts: D26's steps from code, on a complete chat, from the lead's first 3 messages. */
export type OrigineDaCodice = (op: {
  chat: Pick<ChatSalvata, 'messaggi' | 'completa'>
  post: readonly PostInsight[]
  adesso: Date
}) => OrigineChat | null

/** origine.ts: a `testo` origin from the card's post_ref, only on a complete chat. */
export type OrigineDalModello = (
  chat: Pick<ChatSalvata, 'messaggi' | 'completa'>,
  postRef: number | null,
  postDelGiorno: readonly PostPerAnalisi[],
) => OrigineChat | null

/** A row for public.instagram_contenuti_dm_salva (D27): never dm = 0. */
export type RigaContenutiDm = {
  shortcode: string
  /** 'YYYY-MM-DD', the Rome day the lead's chat started */
  giorno: string
  dm: number
  lead_in_target: number
  call_prenotate: number
  dm_certi: number
}

/** contenuti.ts: one row per shortcode and arrival day from `dal`, only dm > 0. */
export type ContaPerPost = (op: {
  chats: readonly ChatSalvata[]
  statoLead: readonly StatoLeadApp[]
  esclusi: ChatEscluse
  /** 'YYYY-MM-DD' */
  dal: string
  /** 'YYYY-MM-DD' */
  oggi: string
}) => RigaContenutiDm[]

/** Claude's verdict on a post (sintesi), mapped from its post_ref to the shortcode. */
export type VerdettoPost = { shortcode: string; verdict: string | null; why: string }

/**
 * contenuti.ts: the posts of the last 14 days, plus older posts with a lead
 * arrived in those days; dm, target and call from the same counting as
 * contaPerPost over the 14 days.
 */
export type PostDelRecap = (op: {
  media: readonly PostInsight[]
  chats: readonly ChatSalvata[]
  statoLead: readonly StatoLeadApp[]
  esclusi: ChatEscluse
  sintesi: readonly VerdettoPost[]
  /** 'YYYY-MM-DD' */
  oggi: string
}) => PostRecap[]

/** A row of public.insight_schede: a validated card of Claude for a chat or a call. */
export type SchedaSalvata = {
  tipo: TipoScheda
  /** conversazione_id or call_id */
  chiave: string
  impronta: string
  dati: unknown
}

/** A reactivation candidate (candidati.ts): the days of silence and the step are code's. */
export type CandidatoRiattivazione = {
  conversazione_id: string
  giorni_silenzio: number
  passo: 1 | 2 | 3
}

/** unione.ts: one channel's document; identity, messages, times, counts and origins only from code. */
export type UniscRecap = (op: {
  canale: CanaleInsight
  /** 'YYYY-MM-DD' */
  giorno: string
  /** ISO UTC, the start of the run */
  generatoIl: string
  /** every insight_chat row of the channel the run uses: today's, the candidates, the 14-day history */
  chat: readonly ChatSalvata[]
  schede: readonly SchedaSalvata[]
  candidati: readonly CandidatoRiattivazione[]
  /** the validated sintesi of the channel; null when it failed */
  sintesi: unknown | null
  contesto: ContestoApp | null
  contenuti: readonly PostInsight[]
  /** how many chats the settings left out (D5) */
  escluse: number
  avvisi: readonly string[]
  generatoCon: RecapCanale['generato_con']
}) => RecapCanale
