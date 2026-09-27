import type { AppRole, LivelloPm } from '@/lib/auth/roles'

/**
 * Which tools Alfire receives for whom. The first filter only: every tool runs
 * with the user's own session, so RLS and the action guards still decide.
 * A collaborator never gets a tool that reads a client's payments, costs,
 * margin or someone else's pay (CLAUDE.md section 6).
 */
type Chi = { ruoli?: readonly AppRole[]; livelliPm?: readonly LivelloPm[] }

export const STRUMENTI = {
  // everyone
  guida: {},
  // admin: the money
  numeri_periodo: { ruoli: ['admin'] },
  cash_per_mese: { ruoli: ['admin'] },
  da_incassare: { ruoli: ['admin'] },
  cerca_clienti: { ruoli: ['admin'] },
  vendite_periodo: { ruoli: ['admin'] },
  metriche_setting: { ruoli: ['admin'] },
  provvigioni: { ruoli: ['admin'] },
  costi_periodo: { ruoli: ['admin'] },
  // setter: own numbers only
  miei_numeri: { ruoli: ['setter'] },
  // who has calls
  call_periodo: { ruoli: ['admin', 'setter', 'closer'] },
  // projects: every level sees what RLS lets them see
  progetti: { livelliPm: ['admin', 'manager', 'employee'] },
  miei_task: { livelliPm: ['admin', 'manager', 'employee'] },

  // writes: always behind the user's confirmation
  crea_cliente: { ruoli: ['admin'] },
  segna_incassata: { ruoli: ['admin'] },
  registra_costo: { ruoli: ['admin'] },
  aggiorna_report: { ruoli: ['setter'] },
  fissa_call: { ruoli: ['setter'] },
  crea_progetto: { livelliPm: ['admin', 'manager'] },
  aggiungi_task: { livelliPm: ['admin', 'manager', 'employee'] },
} as const satisfies Record<string, Chi>

export type NomeStrumento = keyof typeof STRUMENTI

export const SCRITTURE = [
  'crea_cliente',
  'segna_incassata',
  'registra_costo',
  'aggiorna_report',
  'fissa_call',
  'crea_progetto',
  'aggiungi_task',
] as const satisfies readonly NomeStrumento[]

export type NomeScrittura = (typeof SCRITTURE)[number]

export function isScrittura(nome: string): nome is NomeScrittura {
  return (SCRITTURE as readonly string[]).includes(nome)
}

export function strumentiConsentiti(ruolo: AppRole, livelloPm: LivelloPm | null): NomeStrumento[] {
  return (Object.entries(STRUMENTI) as [NomeStrumento, Chi][])
    .filter(([, chi]) => {
      if (chi.ruoli && !chi.ruoli.includes(ruolo)) return false
      if (chi.livelliPm && (!livelloPm || !chi.livelliPm.includes(livelloPm))) return false
      return true
    })
    .map(([nome]) => nome)
}
