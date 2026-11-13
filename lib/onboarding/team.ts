import 'server-only'

import type { Db } from '@/lib/call/operazioni'
import type { Coda, RigaIncaricato } from '@/lib/onboarding/code'
import { LetturaNonRiuscita } from '@/lib/onboarding/letture'

/**
 * How the people in charge read their clients (release B2, 1.81.0,
 * docs/onboarding/rilascio-b.md, «Letture degli incaricati»): only from the two functions,
 * with the session of whoever reads, never a table of the client and never the service role.
 * The admin reads the same functions for the team's queues and actions on his own pages.
 * Never an email, a phone, a note, the link, the sale, the payment or the log.
 */

export async function leggiElencoIncaricati(db: Db): Promise<RigaIncaricato[]> {
  const { data, error } = await db.rpc('onboarding_incaricati_elenco')
  if (error) throw new LetturaNonRiuscita('Onboarding: l’elenco degli incaricati non si legge', error.code)
  return (data ?? []) as RigaIncaricato[]
}

/** How many registered clients a person has an incarico on: the item «Onboarding» of the menu. */
export async function contaIncarichi(db: Db, io: string): Promise<number> {
  // RLS gives the person in charge his rows only from the client's registration on
  const { count, error } = await db
    .from('onboarding_incarichi')
    .select('client_id', { count: 'exact', head: true })
    .or(`coach_id.eq.${io},revisore_id.eq.${io},responsabile_id.eq.${io}`)
  return error ? 0 : (count ?? 0)
}

export type PassoIncaricato = {
  chiave: string
  titolo: string | null
  nodo: string | null
  attore: string | null
  stato: string
  completato_il: string | null
  /** What «Sblocca step» can do on it: open it (locked) or close it (stuck on its video). */
  sbloccabile?: boolean
}

export type VideoIncaricato = {
  tipo: 'blocco' | 'consegna'
  passo: string | null
  titolo: string
  obbligatorio: boolean
  percentuale: number
  visto: boolean
}

export type CallIncaricato = {
  id: string
  inizio: string
  durata_minuti: number
  stato: 'da_confermare' | 'prenotata' | 'svolta' | 'non_presentato' | 'annullata'
  meet_url: string | null
}

export type ConsegnaIncaricato = {
  id: string
  tipo: 'video' | 'pdf' | 'link'
  titolo: string
  url: string | null
  youtube_id: string | null
  obbligatoria: boolean
  percentuale: number
  visto: boolean
}

export type CommunityIncaricato = {
  richiesta_inviata_il: string | null
  community_approvata_il: string | null
  presentato_il: string | null
  presentazione_controllata_il: string | null
}

export type SchedaIncaricato = {
  client_id: string
  nome: string | null
  cognome: string | null
  incarichi: string[]
  in_pausa: boolean
  gruppo: string
  percorso: { stato: string; giorno_zero: string | null; completato_il: string | null } | null
  passi: PassoIncaricato[]
  video: VideoIncaricato[]
  call: CallIncaricato | null
  checkpoint: CallIncaricato | null
  consegne: ConsegnaIncaricato[]
  community: CommunityIncaricato | null
  test: { voci: { id: string; titolo: string | null; spuntata: boolean }[] } | null
  code: Partial<Record<Coda, boolean>>
  /** The coach, the responsible and the admin. */
  telegram?: { username: string | null; gruppo_privato_url: string | null } | null
  /** The coach and the admin: never the reviewer or the responsible. */
  questionario?: { risposte: Record<string, unknown>; inviato_il: string | null } | null
  allegati?: { id: string; campo: string; nome_file: string }[]
}

/**
 * One client for the person in charge (or the admin). Null when he is not one of the
 * caller's, or not registered: the page says «not one of yours» without telling which.
 */
export async function leggiSchedaIncaricato(db: Db, clientId: string): Promise<SchedaIncaricato | null> {
  const { data, error } = await db.rpc('onboarding_scheda_incaricato', { p_client_id: clientId })
  if (error) {
    // not his (42501) or not registered (22023): nothing to show
    if (error.code === '42501' || error.code === '22023' || error.code === '22P02') return null
    throw new LetturaNonRiuscita('Onboarding: la scheda dell’incaricato non si legge', error.code)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const s = data as Record<string, unknown>
  const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    client_id: String(s.client_id),
    nome: (s.nome as string | null) ?? null,
    cognome: (s.cognome as string | null) ?? null,
    incarichi: lista<string>(s.incarichi),
    in_pausa: s.in_pausa === true,
    gruppo: typeof s.gruppo === 'string' ? s.gruppo : 'tocca_al_cliente',
    percorso: (s.percorso as SchedaIncaricato['percorso']) ?? null,
    passi: lista<PassoIncaricato>(s.passi),
    video: lista<VideoIncaricato>(s.video),
    call: (s.call as CallIncaricato | null) ?? null,
    checkpoint: (s.checkpoint as CallIncaricato | null) ?? null,
    consegne: lista<ConsegnaIncaricato>(s.consegne),
    community: (s.community as CommunityIncaricato | null) ?? null,
    test: (s.test as SchedaIncaricato['test']) ?? null,
    code: (s.code as SchedaIncaricato['code']) ?? {},
    ...('telegram' in s ? { telegram: (s.telegram as SchedaIncaricato['telegram']) ?? null } : {}),
    ...('questionario' in s ? { questionario: (s.questionario as SchedaIncaricato['questionario']) ?? null } : {}),
    ...('allegati' in s ? { allegati: lista<{ id: string; campo: string; nome_file: string }>(s.allegati) } : {}),
  }
}

/** The moment of the read, for the pages (outside the render: it reads the clock). */
export function momentoLettura(): number {
  return Date.now()
}
