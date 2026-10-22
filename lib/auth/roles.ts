import { Constants, type Database } from '@/lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']
export type LivelloPm = Database['public']['Enums']['pm_livello']

export const TUTTI_I_RUOLI: readonly AppRole[] = Constants.public.Enums.app_role

/** Roles with the Economics area. Everyone has the Projects area; admin, editor and marketing the Marketing area. */
export const RUOLI_ECONOMICS: readonly AppRole[] = ['admin', 'setter', 'closer']

/**
 * Roles with the Marketing area, the content calendar (Dany, 08/10/2026): the admin,
 * the video editor and marketing. Same list as vede_marketing() in SQL.
 */
export const RUOLI_MARKETING: readonly AppRole[] = ['admin', 'editor', 'marketing']

/**
 * Who connects Claude to Alpha Management: every role with an active account
 * (Dany, 22/10/2026, Claude a 360 gradi; until then the Marketing area's three).
 * Each one reaches what the app gives that person; the calendar stays the
 * Marketing area's (RUOLI_MARKETING). The SQL puo_usare_mcp(), mcp_ruolo() and
 * mcp_chi_sono() accept the same roles.
 */
export const RUOLI_MCP: readonly AppRole[] = TUTTI_I_RUOLI

/**
 * The business coach (Dany, 22/10/2026: «Voglio che il business coach abbia
 * accessi in lettura e veda tutto»): an external consultant who reads what the
 * admin reads and never writes. Same list as legge_come_admin() in SQL.
 */
export const RUOLI_COME_ADMIN: readonly AppRole[] = ['admin', 'business_coach']

/** The roles that read and never write: no button, form or action that writes is theirs. */
export const RUOLI_SOLA_LETTURA: readonly AppRole[] = ['business_coach']

/** Who reads the Marketing area: its three roles, and the business coach in read only. */
export const RUOLI_MARKETING_LETTURA: readonly AppRole[] = [...RUOLI_MARKETING, 'business_coach']

/** The person reads like the admin (the admin, the business coach). */
export function leggeComeAdmin(ruolo: AppRole): boolean {
  return RUOLI_COME_ADMIN.includes(ruolo)
}

/** The person reads and never writes: the pages hide what writes, the actions refuse it. */
export function solaLettura(ruolo: AppRole): boolean {
  return RUOLI_SOLA_LETTURA.includes(ruolo)
}

/** The opposite of solaLettura: the one helper the pages use to show a button that writes. */
export function puoScrivere(ruolo: AppRole): boolean {
  return !solaLettura(ruolo)
}

/** What an action answers a read-only account. */
export const SOLA_LETTURA = 'Il tuo account legge e basta: questa modifica la fa l’admin.'

/** Every role has at least the Projects area (since 28/09/2026). */
export function haAreaDisponibile(ruolo: AppRole): boolean {
  return TUTTI_I_RUOLI.includes(ruolo)
}

export function haEconomics(ruolo: AppRole): boolean {
  return RUOLI_ECONOMICS.includes(ruolo)
}

export function haMarketing(ruolo: AppRole): boolean {
  return RUOLI_MARKETING.includes(ruolo)
}

/**
 * The app admin is always PM admin, whatever livello_pm says (same rule as SQL).
 * The business coach has no level in SQL (pm_livello_corrente() is null): he
 * reads every project and writes none, so here he is the lowest level, and the
 * guards (negaSeNonPm) refuse him by role.
 */
export function livelloPmEffettivo(ruolo: AppRole, livello: LivelloPm): LivelloPm {
  if (ruolo === 'admin') return 'admin'
  if (solaLettura(ruolo)) return 'employee'
  return livello
}

export const ETICHETTA_LIVELLO_PM: Record<LivelloPm, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

/** Landing page of each role. */
export function percorsoIniziale(ruolo: AppRole): string {
  switch (ruolo) {
    case 'admin':
    case 'business_coach':
      // he reads the admin's numbers first
      return '/'
    case 'setter':
      return '/today'
    case 'closer':
      return '/calls'
    case 'marketing':
      // the content calendar is the marketing role's daily work (Dany, 08/10/2026)
      return '/marketing/contenuti'
    default:
      // who works on projects starts from what is on their plate
      return '/task'
  }
}

export const ETICHETTA_RUOLO: Record<AppRole, string> = {
  // Dany runs the business and closes the calls himself (28/09/2026)
  admin: 'Admin · Closer',
  setter: 'Setter',
  closer: 'Closer',
  coach: 'Coach',
  editor: 'Video editor',
  marketing: 'Marketing',
  nutrizione: 'Nutrizione',
  dev: 'Dev',
  business_coach: 'Business coach',
}
