import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { leggiBlocchi, type BloccoPercorso } from '@/lib/percorso/blocchi'
import { leggiStima, type Stima } from '@/lib/percorso/stima'
import type { Database } from '@/lib/supabase/database.types'

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
}

const STATI_PASSO: readonly StatoPasso[] = ['bloccato', 'disponibile', 'in_corso', 'inviato', 'in_attesa_team', 'fatto']

function oggetto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function stringa(v: unknown): string | null {
  return typeof v === 'string' ? v : null
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

/** The step the panel shows: the first of the client available or in progress, by the order of the flow. */
export function passoDaFare(percorso: Percorso): PassoPercorso | null {
  return (
    percorso.passi.find((p) => p.attore === 'cliente' && (p.stato === 'disponibile' || p.stato === 'in_corso')) ?? null
  )
}
