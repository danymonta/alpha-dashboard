import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { leggiBlocchi, type BloccoPercorso } from '@/lib/percorso/blocchi'
import { primoPassoDelCliente } from '@/lib/percorso/nodi'
import { leggiStima, type Stima } from '@/lib/percorso/stima'
import { leggiAllegati, type AllegatoCliente } from '@/lib/percorso/allegati'
import { leggiCampoBase, type CampoBase } from '@/lib/percorso/campo-base'
import type { Database } from '@/lib/supabase/database.types'
import { risposteValide, type NumeroSchermata, type Risposte } from '@/lib/validation/questionario'

/**
 * The page of the client, read from percorso_cliente() with the client's own session
 * (release B1a): the client reads nothing else. The JSON is checked here into the shapes
 * the components use; a part that does not read becomes empty, never raw data.
 */

export type StatoPasso = 'bloccato' | 'disponibile' | 'in_corso' | 'inviato' | 'in_attesa_team' | 'fatto'

export type NodoPercorso = {
  chiave: string
  ordine: number
  stato: 'completato' | 'attuale' | 'futuro'
  completatoIl: string | null
}

export type PassoPercorso = {
  chiave: string
  titolo: string
  nodo: string
  attore: 'cliente' | 'team'
  stato: StatoPasso
  completatoIl: string | null
  /** Only for the unlocked steps. */
  blocchi: BloccoPercorso[] | null
}

export type PersonaTeam = { incarico: 'coach' | 'revisore' | 'responsabile'; ruolo: string; nome: string; fotoUrl: string | null }

export type ConsensoCliente = { tipo: string; versioneInVigore: string; versione: string | null; datoIl: string | null }

/** The onboarding call or the next checkpoint (release B2): day and hour of Rome from the database. */
export type CallCliente = {
  giorno: string
  ora: string
  inizio: string
  durataMinuti: number
  stato: 'da_confermare' | 'prenotata' | 'svolta' | 'non_presentato' | 'annullata'
  /** Only once the coach confirmed it. */
  meetUrl: string | null
}

/** A material the coach delivered for the programme (release B2): a video to watch, a PDF or a link. */
export type ConsegnaCliente = {
  id: string
  tipo: 'video' | 'pdf' | 'link'
  titolo: string
  url: string | null
  youtubeId: string | null
  obbligatoria: boolean
  video: { percentuale: number; visto: boolean } | null
}

export type CommunityCliente = {
  username: string | null
  richiestaInviataIl: string | null
  presentatoIl: string | null
}

/** Who of the team the client waits for and what that person is doing (first name, role and photo only). */
export type AttesaTeam = {
  passo: string
  cosa: string
  chi: { nome: string; ruolo: string; fotoUrl: string | null } | null
}

export type Percorso = {
  nome: string
  stato: string | null
  giornoZero: string | null
  completatoIl: string | null
  nodi: NodoPercorso[]
  passi: PassoPercorso[]
  team: PersonaTeam[]
  consensi: ConsensoCliente[]
  stima: Stima | null
  inAttesa: boolean
  /** Release B2. */
  call: CallCliente | null
  checkpoint: CallCliente | null
  consegne: ConsegnaCliente[]
  community: CommunityCliente | null
  linkCommunity: string | null
  linkPrenotazione: string | null
  gruppoPrivatoUrl: string | null
  attesaTeam: AttesaTeam | null
  lanciato: boolean
  dopoLancio: BloccoPercorso[]
}

const STATI_PASSO: readonly StatoPasso[] = ['bloccato', 'disponibile', 'in_corso', 'inviato', 'in_attesa_team', 'fatto']

function oggetto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function stringa(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function https(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null
}

const STATI_CALL: readonly CallCliente['stato'][] = ['da_confermare', 'prenotata', 'svolta', 'non_presentato', 'annullata']

function leggiCall(valore: unknown): CallCliente | null {
  const c = oggetto(valore)
  if (!c) return null
  const giorno = stringa(c.giorno)
  const ora = stringa(c.ora)
  const inizio = stringa(c.inizio)
  if (!giorno || !/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !ora || !inizio) return null
  const durata = typeof c.durata_minuti === 'number' ? c.durata_minuti : 30
  return {
    giorno,
    ora,
    inizio,
    durataMinuti: durata,
    stato: (STATI_CALL as readonly unknown[]).includes(c.stato) ? (c.stato as CallCliente['stato']) : 'prenotata',
    meetUrl: typeof c.meet_url === 'string' && c.meet_url.startsWith('https://meet.google.com/') ? c.meet_url : null,
  }
}

function leggiConsegne(valore: unknown): ConsegnaCliente[] {
  return lista(valore)
    .map((c): ConsegnaCliente | null => {
      const id = stringa(c.id)
      const titolo = stringa(c.titolo)
      if (!id || !titolo) return null
      if (c.tipo === 'video') {
        const youtubeId = typeof c.youtube_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(c.youtube_id) ? c.youtube_id : null
        if (!youtubeId) return null
        const v = oggetto(c.video) ?? {}
        const p = typeof v.percentuale === 'number' ? v.percentuale : Number(v.percentuale ?? 0)
        return {
          id,
          tipo: 'video',
          titolo,
          url: null,
          youtubeId,
          obbligatoria: c.obbligatoria === true,
          video: { percentuale: Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0, visto: v.visto === true },
        }
      }
      if (c.tipo === 'pdf' || c.tipo === 'link') {
        const url = https(c.url)
        return url ? { id, tipo: c.tipo, titolo, url, youtubeId: null, obbligatoria: false, video: null } : null
      }
      return null
    })
    .filter((c): c is ConsegnaCliente => c !== null)
}

function leggiAttesa(valore: unknown): AttesaTeam | null {
  const a = oggetto(valore)
  if (!a) return null
  const passo = stringa(a.passo)
  const cosa = stringa(a.cosa)
  if (!passo || !cosa) return null
  const chi = oggetto(a.chi)
  return {
    passo,
    cosa,
    chi: chi && stringa(chi.nome) ? { nome: stringa(chi.nome)!, ruolo: stringa(chi.ruolo) ?? '', fotoUrl: stringa(chi.foto_url) } : null,
  }
}

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(oggetto).filter((x): x is Record<string, unknown> => x !== null) : []
}

/** percorso_cliente() as the page uses it; null when the document does not read at all. */
export function leggiPercorso(valore: unknown): Percorso | null {
  const v = oggetto(valore)
  if (!v) return null
  const cliente = oggetto(v.cliente)
  const percorso = oggetto(v.percorso)

  const nodi: NodoPercorso[] = lista(v.nodi)
    .map((n) => ({
      chiave: stringa(n.chiave) ?? '',
      ordine: typeof n.ordine === 'number' ? n.ordine : 0,
      stato: (n.stato === 'completato' || n.stato === 'attuale' ? n.stato : 'futuro') as NodoPercorso['stato'],
      completatoIl: stringa(n.completato_il),
    }))
    .filter((n) => n.chiave !== '')
    .sort((a, b) => a.ordine - b.ordine)

  const passi: PassoPercorso[] = lista(v.passi)
    .map((p) => ({
      chiave: stringa(p.chiave) ?? '',
      titolo: stringa(p.titolo) ?? '',
      nodo: stringa(p.nodo) ?? '',
      attore: p.attore === 'team' ? ('team' as const) : ('cliente' as const),
      stato: (STATI_PASSO as readonly unknown[]).includes(p.stato) ? (p.stato as StatoPasso) : ('bloccato' as const),
      completatoIl: stringa(p.completato_il),
      blocchi: 'blocchi' in p ? leggiBlocchi(p.blocchi) : null,
    }))
    .filter((p) => p.chiave !== '')

  const team: PersonaTeam[] = lista(v.team)
    .filter((t) => t.incarico === 'coach' || t.incarico === 'revisore' || t.incarico === 'responsabile')
    .map((t) => ({
      incarico: t.incarico as PersonaTeam['incarico'],
      ruolo: stringa(t.ruolo) ?? '',
      nome: stringa(t.nome) ?? '',
      fotoUrl: stringa(t.foto_url),
    }))

  const consensi: ConsensoCliente[] = lista(v.consensi)
    .filter((c) => typeof c.tipo === 'string' && typeof c.versione_in_vigore === 'string')
    .map((c) => ({
      tipo: c.tipo as string,
      versioneInVigore: c.versione_in_vigore as string,
      versione: stringa(c.versione),
      datoIl: stringa(c.dato_il),
    }))

  return {
    nome: stringa(cliente?.nome) ?? '',
    stato: stringa(percorso?.stato),
    giornoZero: stringa(percorso?.giorno_zero),
    completatoIl: stringa(percorso?.completato_il),
    nodi,
    passi,
    team,
    consensi,
    stima: leggiStima(v.stima),
    inAttesa: v.in_attesa === true,
    call: leggiCall(v.call),
    checkpoint: leggiCall(v.checkpoint),
    consegne: leggiConsegne(v.consegne),
    community: (() => {
      const c = oggetto(v.community)
      return c
        ? { username: stringa(c.username), richiestaInviataIl: stringa(c.richiesta_inviata_il), presentatoIl: stringa(c.presentato_il) }
        : null
    })(),
    linkCommunity: https(v.link_community),
    linkPrenotazione: https(v.link_prenotazione),
    gruppoPrivatoUrl: https(v.gruppo_privato_url),
    attesaTeam: leggiAttesa(v.attesa_team),
    lanciato: v.lanciato === true,
    dopoLancio: leggiBlocchi(v.dopo_lancio),
  }
}

export type EsitoLettura = { ok: true; percorso: Percorso } | { ok: false; motivo: 'accesso' | 'errore' }

/** The page's one read. 42501: the account is not active any more (the layout says why). */
export async function leggiPercorsoCliente(db: SupabaseClient<Database>): Promise<EsitoLettura> {
  const { data, error } = await db.rpc('percorso_cliente')
  if (error) {
    if (error.code === '42501') return { ok: false, motivo: 'accesso' }
    console.error('[percorso] lettura non riuscita:', error.code)
    return { ok: false, motivo: 'errore' }
  }
  const percorso = leggiPercorso(data)
  return percorso ? { ok: true, percorso } : { ok: false, motivo: 'errore' }
}

/**
 * The step the panel shows: the first of the client available or in progress, by the order of
 * the flow; the programme too (a step of the team) once delivered, when the client watches its
 * videos (release B2).
 */
export function passoDaFare(percorso: Pick<Percorso, 'passi'>): PassoPercorso | null {
  return primoPassoDelCliente(percorso.passi)
}

// ---------------------------------------------------------------------------
// The questionnaire (release B1b)
// ---------------------------------------------------------------------------

export type QuestionarioCliente = {
  risposte: Risposte
  versione: number
  schermata: NumeroSchermata
  inviatoIl: string | null
  allegati: AllegatoCliente[]
}

export type EsitoQuestionario =
  | { ok: true; questionario: QuestionarioCliente }
  | { ok: false; motivo: 'accesso' | 'inviato' | 'non_disponibile' | 'errore' }

/**
 * questionario_cliente() with the client's own session: the answers, the version to save over,
 * the screen he was on, the files uploaded. 22023 says the step is not open (not yet, or
 * already sent): the page goes back to the path.
 */
export async function leggiQuestionarioCliente(db: SupabaseClient<Database>): Promise<EsitoQuestionario> {
  const { data, error } = await db.rpc('questionario_cliente')
  if (error) {
    if (error.code === '42501') return { ok: false, motivo: 'accesso' }
    if (error.code === '22023') return { ok: false, motivo: /inviato/.test(error.message) ? 'inviato' : 'non_disponibile' }
    console.error('[percorso] questionario non letto:', error.code)
    return { ok: false, motivo: 'errore' }
  }
  const v = oggetto(data)
  if (!v) return { ok: false, motivo: 'errore' }
  const versione = typeof v.versione === 'number' ? v.versione : Number(v.versione ?? 0)
  const schermata = typeof v.schermata === 'number' && v.schermata >= 1 && v.schermata <= 4 ? v.schermata : 1
  return {
    ok: true,
    questionario: {
      // answers that do not read as answers never reach the form: it starts empty, the database keeps them
      risposte: risposteValide(v.risposte) ? v.risposte : {},
      versione: Number.isFinite(versione) ? versione : 0,
      schermata: schermata as NumeroSchermata,
      inviatoIl: stringa(v.inviato_il),
      allegati: leggiAllegati(v.allegati),
    },
  }
}

// ---------------------------------------------------------------------------
// The home base (1.83.0): campo_base_cliente() with the client's own session
// ---------------------------------------------------------------------------
export type EsitoCampoBase = { ok: true; campo: CampoBase } | { ok: false; motivo: 'accesso' | 'errore' }

export async function leggiCampoBaseCliente(db: SupabaseClient<Database>): Promise<EsitoCampoBase> {
  const { data, error } = await db.rpc('campo_base_cliente')
  if (error) {
    if (error.code === '42501') return { ok: false, motivo: 'accesso' }
    console.error('[percorso] campo base non letto:', error.code)
    return { ok: false, motivo: 'errore' }
  }
  const campo = leggiCampoBase(data)
  return campo ? { ok: true, campo } : { ok: false, motivo: 'errore' }
}
