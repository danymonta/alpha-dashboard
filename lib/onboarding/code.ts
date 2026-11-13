/**
 * The onboarding as the people in charge read it (release B2, 1.81.0,
 * docs/onboarding/rilascio-b.md, «Letture degli incaricati»): the groups of their list and
 * the queues on top of it. Pure: every row comes from public.onboarding_incaricati_elenco(),
 * which decides the group and gives each person only the queues of his incarico (the reviewer
 * only «Test da rivedere»; all of them to the admin). This file only orders and names them.
 * Never a person of the team compared to another (CLAUDE.md section 17): the queues are about
 * clients.
 */

export const GRUPPI_INCARICATI = ['tocca_a_te', 'tocca_al_cliente', 'in_pausa', 'completati'] as const
export type GruppoIncaricato = (typeof GRUPPI_INCARICATI)[number]

/** The queues, in the order of the work (spec 4.1): the call first, the programme last. */
export const CODE = [
  'call_da_confermare',
  'call_da_segnare',
  'preparazione_incompleta',
  'richiesta_community',
  'presentazione_da_controllare',
  'obiettivo_da_impostare',
  'test_da_confermare',
  'test_da_rivedere',
  'programma_da_consegnare',
] as const
export type Coda = (typeof CODE)[number]

export const INCARICHI = ['coach', 'responsabile', 'revisore'] as const
export type Incarico = (typeof INCARICHI)[number]

export type RigaIncaricato = {
  client_id: string
  nome: string | null
  cognome: string | null
  /** The main one: coach, then responsible, then reviewer; null for the admin who has none. */
  incarico: string | null
  incarichi: string[] | null
  gruppo: string
  passo: string | null
  passo_titolo: string | null
} & Record<Coda, boolean | null>

export function eGruppo(valore: unknown): valore is GruppoIncaricato {
  return typeof valore === 'string' && (GRUPPI_INCARICATI as readonly string[]).includes(valore)
}

/** The group of a row: an unknown one (a later release) waits with the client. */
export function gruppoDi(riga: Pick<RigaIncaricato, 'gruppo'>): GruppoIncaricato {
  return eGruppo(riga.gruppo) ? riga.gruppo : 'tocca_al_cliente'
}

/** The rows by group, in the order they came (the database orders by name). */
export function perGruppoIncaricati<T extends Pick<RigaIncaricato, 'gruppo'>>(
  righe: readonly T[],
): Record<GruppoIncaricato, T[]> {
  const gruppi: Record<GruppoIncaricato, T[]> = { tocca_a_te: [], tocca_al_cliente: [], in_pausa: [], completati: [] }
  for (const riga of righe) gruppi[gruppoDi(riga)].push(riga)
  return gruppi
}

/** The queues a row is in, in the order of the work; none for a client paused or completed. */
export function codeDellaRiga(riga: Partial<Record<Coda, boolean | null>> & Pick<RigaIncaricato, 'gruppo'>): Coda[] {
  const g = gruppoDi(riga)
  if (g === 'in_pausa' || g === 'completati') return []
  return CODE.filter((coda) => riga[coda] === true)
}

export type CodaConClienti<T> = { coda: Coda; righe: T[] }

/** The queues with their clients, only the ones with someone in them, in the order of the work. */
export function codeDelleRighe<T extends Partial<Record<Coda, boolean | null>> & Pick<RigaIncaricato, 'gruppo'>>(
  righe: readonly T[],
): CodaConClienti<T>[] {
  return CODE.map((coda) => ({ coda, righe: righe.filter((r) => codeDellaRiga(r).includes(coda)) })).filter(
    (c) => c.righe.length > 0,
  )
}

/** The incarichi of a row, in a fixed order (coach, responsabile, revisore), only the known ones. */
export function incarichiDi(riga: Pick<RigaIncaricato, 'incarichi'>): Incarico[] {
  const presenti = new Set(riga.incarichi ?? [])
  return INCARICHI.filter((i) => presenti.has(i))
}

/** What a person may do on a client, from his incarichi (the functions in SQL check the same). */
export type PermessiTeam = {
  /** The coach in charge and the admin: call, test, programme, deliveries, unlock, restart. */
  coach: boolean
  /** The community: the coach, the responsible and the admin. */
  community: boolean
  /** The questionnaire and its files: the coach and the admin. */
  questionario: boolean
}

export function permessiTeam(incarichi: readonly string[], admin: boolean): PermessiTeam {
  const coach = admin || incarichi.includes('coach')
  return {
    coach,
    community: coach || incarichi.includes('responsabile'),
    questionario: coach,
  }
}
