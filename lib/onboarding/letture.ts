import 'server-only'

import { GIORNI_VENDITA_VICINA } from '@/lib/call/follow-up'
import type { Db } from '@/lib/call/operazioni'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { linkJoin, messaggioPronto } from '@/lib/onboarding/link'
import type { PersonaTeam, RigaOnboarding } from '@/lib/onboarding/stati'
import { isUuid } from '@/lib/progetti'
import type { Database } from '@/lib/supabase/database.types'
import type { AppRole } from '@/lib/auth/roles'
import type { TipoVendita } from '@/lib/validation/vendita'

/**
 * How the onboarding is read (1.77.0, release A): the section Onboarding, the card of a
 * client, the wizard's way in and the settings, with the client of whoever reads (the
 * cookie session, never the service role). RLS decides: in A only the admin reads the
 * views and the links (v_onboarding and v_vendite_senza_onboarding answer no row to
 * anyone else). Nothing is computed here: the states, «scaduto» included, come from SQL.
 *
 * A read that fails throws LetturaNonRiuscita, with the PostgREST code for the logs and
 * never its message: the pages show their error state with «Riprova».
 */

export type { RigaOnboarding } from '@/lib/onboarding/stati'

export class LetturaNonRiuscita extends Error {
  constructor(
    messaggio: string,
    /** the PostgREST or SQL code, for the logs */
    readonly codice?: string,
  ) {
    super(messaggio)
    this.name = 'LetturaNonRiuscita'
  }
}

function controlla(cosa: string, error: { code?: string } | null): void {
  if (error) throw new LetturaNonRiuscita(`Onboarding: ${cosa} non si legge`, error.code)
}

// ---------------------------------------------------------------------------
// Settings and people
// ---------------------------------------------------------------------------
type RigaImpostazioni = Database['public']['Tables']['onboarding_impostazioni']['Row']

export type ImpostazioniOnboarding = Pick<
  RigaImpostazioni,
  | 'aperto_ai_clienti'
  | 'giorni_validita_link'
  | 'coach_predefinito_id'
  | 'revisore_predefinito_id'
  | 'responsabile_predefinito_id'
  | 'link_community'
>

/** What the migration seeds: the answer when the row is not there (a restore with the triggers off). */
export const IMPOSTAZIONI_DI_BASE: ImpostazioniOnboarding = {
  aperto_ai_clienti: false,
  giorni_validita_link: 14,
  coach_predefinito_id: null,
  revisore_predefinito_id: null,
  responsabile_predefinito_id: null,
  link_community: null,
}

const COLONNE_IMPOSTAZIONI =
  'aperto_ai_clienti, giorni_validita_link, coach_predefinito_id, revisore_predefinito_id, responsabile_predefinito_id, link_community' as const

export async function leggiImpostazioni(db: Db): Promise<ImpostazioniOnboarding> {
  const { data, error } = await db.from('onboarding_impostazioni').select(COLONNE_IMPOSTAZIONI).maybeSingle()
  controlla('le impostazioni', error)
  return data ?? IMPOSTAZIONI_DI_BASE
}

export type PersonaDelTeam = PersonaTeam & { ruolo: AppRole }

/**
 * Who can follow a client: the active people of the team, by name (never the business
 * coach, who reads only the sales recap: the functions in SQL refuse him too).
 */
export async function leggiPersone(db: Db): Promise<PersonaDelTeam[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, nome, ruolo')
    .eq('attivo', true)
    .neq('ruolo', 'business_coach')
    .order('nome')
  controlla('le persone del team', error)
  return data ?? []
}

// ---------------------------------------------------------------------------
// The section Onboarding
// ---------------------------------------------------------------------------
export type VenditaSenzaOnboarding = Database['public']['Views']['v_vendite_senza_onboarding']['Row']

/** The list reads the most recent ones; the page says so when there are more. */
export const ELENCO_MAX = 200
export const SENZA_ONBOARDING_MAX = 100

export type ElencoOnboarding = {
  /** One row per client with an onboarding, the most recent first. */
  righe: RigaOnboarding[]
  /** There are more than ELENCO_MAX. */
  tagliato: boolean
  /** «Vendite nuove senza onboarding»: never an amount. */
  senza: VenditaSenzaOnboarding[]
  /** How many of those there are in all (the title counts them all). */
  senzaTotale: number
  /** onboarding_impostazioni.aperto_ai_clienti: an active link is «pronto» until it is on. */
  aperto: boolean
}

export async function leggiElenco(db: Db): Promise<ElencoOnboarding> {
  const [elenco, senza, impostazioni] = await Promise.all([
    db
      .from('v_onboarding')
      .select('*')
      .order('created_at', { ascending: false })
      .order('client_id')
      .limit(ELENCO_MAX + 1),
    db
      .from('v_vendite_senza_onboarding')
      .select('*', { count: 'exact' })
      .order('data_vendita', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SENZA_ONBOARDING_MAX),
    leggiImpostazioni(db),
  ])
  controlla('l’elenco', elenco.error)
  controlla('le vendite senza onboarding', senza.error)

  const righe = elenco.data ?? []
  return {
    righe: righe.slice(0, ELENCO_MAX),
    tagliato: righe.length > ELENCO_MAX,
    senza: senza.data ?? [],
    senzaTotale: senza.count ?? senza.data?.length ?? 0,
    aperto: impostazioni.aperto_ai_clienti,
  }
}

/**
 * The onboarding of one client, for the hooks on his card and on his sale: null when it
 * was never started («Avvia onboarding»), the row otherwise (the link to its card).
 */
export async function leggiOnboardingDelCliente(db: Db, clientId: string): Promise<RigaOnboarding | null> {
  if (!isUuid(clientId)) return null
  const { data, error } = await db.from('v_onboarding').select('*').eq('client_id', clientId).maybeSingle()
  controlla('l’onboarding del cliente', error)
  return data
}

/** What the hooks on the client's card and on his sale's page need: his onboarding, if any, and the switch. */
export type AggancioLetto = { riga: RigaOnboarding | null; aperto: boolean }

/**
 * The read of those hooks. Never a reason for the page around them to fail: null when it
 * could not be read, and then the hook is not shown (never «Avvia onboarding» by mistake).
 */
export async function leggiAggancio(db: Db, clientId: string): Promise<AggancioLetto | null> {
  try {
    const [riga, impostazioni] = await Promise.all([leggiOnboardingDelCliente(db, clientId), leggiImpostazioni(db)])
    return { riga, aperto: impostazioni.aperto_ai_clienti }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The card of a client in onboarding
// ---------------------------------------------------------------------------
export type TelegramCliente = Pick<
  Database['public']['Tables']['clienti_telegram']['Row'],
  'username' | 'gruppo_privato_url'
>

export type PassoScheda = {
  passo: string
  ordine: number
  titolo: string
  nodo: string
  attore: string
  richiede_verifica: boolean
  stato: string
  iniziato_il: string | null
  inviato_il: string | null
  completato_il: string | null
}

export type EventoScheda = {
  id: string
  tipo: string
  attore: string
  dettagli: Database['public']['Tables']['onboarding_eventi']['Row']['dettagli']
  created_at: string
  /** Only for the admin's own actions (confirm, revoke, reactivate, regenerate, start): his name. */
  autore: string | null
}

/** The log shows the most recent events; the card says so when there are more. */
export const EVENTI_MAX = 100

export type LinkScheda = {
  /** The address the client opens: /join/<slug>-<token>, from APP_URL. */
  indirizzo: string
  /** The ready message of the specification, with the address at the end. */
  messaggio: string
}

export type SchedaOnboarding = {
  riga: RigaOnboarding
  telegram: TelegramCliente | null
  /** The steps of the flow in their order, each with its state. */
  passi: PassoScheda[]
  eventi: EventoScheda[]
  /** There are more than EVENTI_MAX events. */
  eventiTagliati: boolean
  impostazioni: ImpostazioniOnboarding
  /**
   * «Copia link» and «Copia il messaggio»: only with the client area open
   * (aperto_ai_clienti) and a token still in clear (a link not used yet); null otherwise.
   * With the area closed the token is not even read.
   */
  link: LinkScheda | null
}

type PassoConDefinizione = {
  passo: string
  stato: string
  iniziato_il: string | null
  inviato_il: string | null
  completato_il: string | null
  def: { ordine: number; titolo: string; nodo: string; attore: string; richiede_verifica: boolean } | null
}

function passiInOrdine(righe: readonly PassoConDefinizione[]): PassoScheda[] {
  return righe
    .map((r) => ({
      passo: r.passo,
      // a step without its definition (a flow version removed) goes last, under its key
      ordine: r.def?.ordine ?? Number.MAX_SAFE_INTEGER,
      titolo: r.def?.titolo ?? r.passo,
      nodo: r.def?.nodo ?? '',
      attore: r.def?.attore ?? 'cliente',
      richiede_verifica: r.def?.richiede_verifica ?? false,
      stato: r.stato,
      iniziato_il: r.iniziato_il,
      inviato_il: r.inviato_il,
      completato_il: r.completato_il,
    }))
    .sort((a, b) => a.ordine - b.ordine || a.passo.localeCompare(b.passo))
}

/** The card: null when the client has no onboarding (or the reader is not the admin). */
export async function leggiScheda(db: Db, clientId: string): Promise<SchedaOnboarding | null> {
  if (!isUuid(clientId)) return null

  const [riga, telegram, passi, eventi, impostazioni] = await Promise.all([
    db.from('v_onboarding').select('*').eq('client_id', clientId).maybeSingle(),
    db.from('clienti_telegram').select('username, gruppo_privato_url').eq('client_id', clientId).maybeSingle(),
    db
      .from('onboarding_passi')
      .select(
        'passo, stato, iniziato_il, inviato_il, completato_il, def:onboarding_passi_def(ordine, titolo, nodo, attore, richiede_verifica)',
      )
      .eq('client_id', clientId),
    db
      .from('onboarding_eventi')
      .select('id, tipo, attore, dettagli, created_at, autore:profiles!onboarding_eventi_autore_id_fkey(nome)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(EVENTI_MAX + 1),
    leggiImpostazioni(db),
  ])
  controlla('la scheda', riga.error)
  if (!riga.data) return null
  controlla('Telegram', telegram.error)
  controlla('i passi', passi.error)
  controlla('il registro', eventi.error)

  const r = riga.data
  let link: LinkScheda | null = null
  // a test link (1.78.0) can be copied with the area closed
  if ((impostazioni.aperto_ai_clienti || r.prova === true) && r.invito_id && r.slug && r.invito_stato === 'attivo') {
    const { data: token, error } = await db
      .from('onboarding_inviti_token')
      .select('token')
      .eq('invito_id', r.invito_id)
      .maybeSingle()
    controlla('il link', error)
    const indirizzo = token ? linkJoin(r.slug, token.token) : null
    if (indirizzo) link = { indirizzo, messaggio: messaggioPronto(r.nome, indirizzo) }
  }

  const righeEventi = eventi.data ?? []
  return {
    riga: r,
    telegram: telegram.data,
    passi: passiInOrdine((passi.data ?? []) as PassoConDefinizione[]),
    eventi: righeEventi.slice(0, EVENTI_MAX).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      attore: e.attore,
      dettagli: e.dettagli,
      created_at: e.created_at,
      autore: e.autore?.nome ?? null,
    })),
    eventiTagliati: righeEventi.length > EVENTI_MAX,
    impostazioni,
    link,
  }
}

// ---------------------------------------------------------------------------
// The way into the wizard «Nuovo cliente»
// ---------------------------------------------------------------------------
/** The screen «Cliente» as it opens: what the app already knows, to check and complete. */
export type ClientePrecompilato = {
  nome: string
  cognome: string
  email: string
  telefono: string
  instagram_handle: string
  telegram: string
}

export const CLIENTE_VUOTO: ClientePrecompilato = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  instagram_handle: '',
  telegram: '',
}

/** A «nuovo» sale that exists: the wizard skips the screen «Vendita» and shows this. Never an amount. */
export type VenditaEsistente = {
  saleId: string
  prodotto: string | null
  data_vendita: string
  data_inizio: string
  data_fine: string
}

/** A sale without the call that looks like the one of this call (public.vendite_da_collegare). */
export type VenditaSimile = { sale_id: string; cliente: string; tipo: TipoVendita; data_vendita: string }

export type MotivoImpossibile =
  | 'call_non_trovata'
  | 'call_non_chiusa'
  | 'vendita_non_trovata'
  | 'vendita_non_nuovo'
  | 'cliente_non_trovato'
  | 'gia_avviato'

export type IngressoWizard =
  | {
      /** The three screens: client, sale, team. */
      modo: 'nuovo'
      origine: 'menu' | 'call' | 'cliente'
      cliente: ClientePrecompilato
      /** The client is already there (born from the lead, or chosen): the sale goes on him. */
      clienteId: string | null
      callId: string | null
      /** From a closed call: its day, who set it and who closed it. */
      call: { giorno: string; setter: string | null; closer: string | null } | null
      /** The day the sale is signed: the day of the call when it is past, today otherwise. */
      dataVendita: string
      simili: VenditaSimile[]
    }
  | {
      /** «Avvia onboarding»: the sale exists, only the screens «Cliente» and «Team». */
      modo: 'avvia'
      cliente: ClientePrecompilato
      clienteId: string
      vendita: VenditaEsistente
      callId: string | null
    }
  | { modo: 'impossibile'; motivo: MotivoImpossibile; clienteId?: string; saleId?: string }

/** "Marco De Luca" -> nome "Marco", cognome "De Luca". Only a prefill, editable. */
export function dividiNome(completo: string | null | undefined): { nome: string; cognome: string } {
  const [nome = '', ...resto] = (completo ?? '').trim().split(/\s+/)
  return { nome, cognome: resto.join(' ') }
}

type ClienteLetto = Pick<
  Database['public']['Tables']['clients']['Row'],
  'id' | 'nome' | 'cognome' | 'email' | 'telefono' | 'instagram_handle'
>

const COLONNE_CLIENTE = 'id, nome, cognome, email, telefono, instagram_handle' as const
const COLONNE_VENDITA =
  'id, tipo, client_id, call_id, data_vendita, data_inizio, data_fine, prodotto_personalizzato, prodotto:products(nome)' as const

async function precompila(db: Db, cliente: ClienteLetto): Promise<ClientePrecompilato> {
  const { data, error } = await db.from('clienti_telegram').select('username').eq('client_id', cliente.id).maybeSingle()
  controlla('Telegram', error)
  return {
    nome: cliente.nome ?? '',
    cognome: cliente.cognome ?? '',
    email: cliente.email ?? '',
    telefono: cliente.telefono ?? '',
    instagram_handle: cliente.instagram_handle ?? '',
    telegram: data?.username ?? '',
  }
}

/** A living link (waiting, active or used): the same rule as public.avvia_onboarding. */
async function haOnboardingVivo(db: Db, clientId: string): Promise<boolean> {
  const { data, error } = await db
    .from('onboarding_inviti')
    .select('id')
    .eq('client_id', clientId)
    .in('stato', ['in_attesa_pagamento', 'attivo', 'usato'])
    .limit(1)
  controlla('il link del cliente', error)
  return (data ?? []).length > 0
}

type VenditaLetta = {
  id: string
  tipo: TipoVendita
  client_id: string
  call_id: string | null
  data_vendita: string
  data_inizio: string
  data_fine: string
  prodotto_personalizzato: string | null
  prodotto: { nome: string } | null
}

async function daVendita(db: Db, vendita: VenditaLetta): Promise<IngressoWizard> {
  if (vendita.tipo !== 'nuovo') return { modo: 'impossibile', motivo: 'vendita_non_nuovo', saleId: vendita.id }

  const [{ data: cliente, error }, vivo] = await Promise.all([
    db.from('clients').select(COLONNE_CLIENTE).eq('id', vendita.client_id).maybeSingle(),
    haOnboardingVivo(db, vendita.client_id),
  ])
  controlla('il cliente', error)
  if (!cliente) return { modo: 'impossibile', motivo: 'cliente_non_trovato' }
  if (vivo) return { modo: 'impossibile', motivo: 'gia_avviato', clienteId: cliente.id, saleId: vendita.id }

  return {
    modo: 'avvia',
    cliente: await precompila(db, cliente),
    clienteId: cliente.id,
    callId: vendita.call_id,
    vendita: {
      saleId: vendita.id,
      prodotto: vendita.prodotto?.nome ?? vendita.prodotto_personalizzato,
      data_vendita: vendita.data_vendita,
      data_inizio: vendita.data_inizio,
      data_fine: vendita.data_fine,
    },
  }
}

/**
 * Where the wizard starts from (CLAUDE.md, the design of release A):
 * - `vendita`: a «nuovo» sale that exists: «Avvia onboarding» on it;
 * - `call`: a closed call. Without its sale, the three screens with the lead's data; with
 *   its sale already there, «Avvia onboarding» on that sale;
 * - `cliente`: his «nuovo» sale, the most recent («Avvia onboarding»), or the three
 *   screens on him when he has none;
 * - nothing: the three screens, empty (from the menu).
 * A client with a living link is never started twice: the page sends to his card.
 */
export async function leggiIngressoWizard(
  db: Db,
  parametri: { call?: string | null; vendita?: string | null; cliente?: string | null },
  oggi: string = oggiRoma(),
): Promise<IngressoWizard> {
  const { call: callId, vendita: saleId, cliente: clientId } = parametri

  if (saleId) {
    if (!isUuid(saleId)) return { modo: 'impossibile', motivo: 'vendita_non_trovata' }
    const { data, error } = await db.from('sales').select(COLONNE_VENDITA).eq('id', saleId).maybeSingle()
    controlla('la vendita', error)
    return data ? daVendita(db, data) : { modo: 'impossibile', motivo: 'vendita_non_trovata' }
  }

  if (callId) {
    if (!isUuid(callId)) return { modo: 'impossibile', motivo: 'call_non_trovata' }
    const [{ data: call, error: erroreCall }, { data: venditaDellaCall, error: erroreVendita }] = await Promise.all([
      db
        .from('calls')
        .select(
          'id, esito, lead_id, programmata_il, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
        )
        .eq('id', callId)
        .maybeSingle(),
      db.from('sales').select(COLONNE_VENDITA).eq('call_id', callId).maybeSingle(),
    ])
    controlla('la call', erroreCall)
    controlla('la vendita della call', erroreVendita)
    if (!call) return { modo: 'impossibile', motivo: 'call_non_trovata' }
    if (call.esito !== 'chiusa') return { modo: 'impossibile', motivo: 'call_non_chiusa' }
    // the call already has its sale: only the onboarding is missing
    if (venditaDellaCall) return daVendita(db, venditaDellaCall)

    const giornoCall = oggiRoma(new Date(call.programmata_il))
    const [{ data: cliente, error: erroreCliente }, candidate] = await Promise.all([
      db.from('clients').select(COLONNE_CLIENTE).eq('lead_id', call.lead_id).order('created_at').limit(1).maybeSingle(),
      // a reminder, never a reason for the wizard to fail: an error shows nothing
      db.rpc('vendite_da_collegare', { p_call_id: call.id }),
    ])
    controlla('il cliente del lead', erroreCliente)
    if (cliente && (await haOnboardingVivo(db, cliente.id))) {
      return { modo: 'impossibile', motivo: 'gia_avviato', clienteId: cliente.id }
    }

    const dal = aggiungiGiorni(giornoCall, -GIORNI_VENDITA_VICINA)
    const al = aggiungiGiorni(giornoCall, GIORNI_VENDITA_VICINA)
    const simili = (candidate.data ?? [])
      .filter((v) => v.stesso_cliente && v.data_vendita >= dal && v.data_vendita <= al)
      .map((v) => ({ sale_id: v.sale_id, cliente: v.cliente, tipo: v.tipo, data_vendita: v.data_vendita }))

    return {
      modo: 'nuovo',
      origine: 'call',
      cliente: cliente
        ? await precompila(db, cliente)
        : { ...CLIENTE_VUOTO, ...dividiNome(call.lead?.nome), instagram_handle: call.lead?.instagram_handle ?? '' },
      clienteId: cliente?.id ?? null,
      callId: call.id,
      call: { giorno: giornoCall, setter: call.setter?.nome ?? null, closer: call.closer?.nome ?? null },
      // a call closed on a past day is signed that day, as «Nuova vendita» does
      dataVendita: giornoCall < oggi ? giornoCall : oggi,
      simili,
    }
  }

  if (clientId) {
    if (!isUuid(clientId)) return { modo: 'impossibile', motivo: 'cliente_non_trovato' }
    const [{ data: cliente, error: erroreCliente }, { data: vendite, error: erroreVendite }] = await Promise.all([
      db.from('clients').select(COLONNE_CLIENTE).eq('id', clientId).maybeSingle(),
      db
        .from('sales')
        .select(COLONNE_VENDITA)
        .eq('client_id', clientId)
        .eq('tipo', 'nuovo')
        .order('data_vendita', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    controlla('il cliente', erroreCliente)
    controlla('le vendite del cliente', erroreVendite)
    if (!cliente) return { modo: 'impossibile', motivo: 'cliente_non_trovato' }
    const vendita = vendite?.[0]
    if (vendita) return daVendita(db, vendita)
    if (await haOnboardingVivo(db, cliente.id)) {
      return { modo: 'impossibile', motivo: 'gia_avviato', clienteId: cliente.id }
    }
    return {
      modo: 'nuovo',
      origine: 'cliente',
      cliente: await precompila(db, cliente),
      clienteId: cliente.id,
      callId: null,
      call: null,
      dataVendita: oggi,
      simili: [],
    }
  }

  return {
    modo: 'nuovo',
    origine: 'menu',
    cliente: CLIENTE_VUOTO,
    clienteId: null,
    callId: null,
    call: null,
    dataVendita: oggi,
    simili: [],
  }
}
