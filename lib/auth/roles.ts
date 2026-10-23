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
 * (Dany, 22/10/2026, Claude a 360 gradi; until then the Marketing area's three),
 * except the business coach, who sees only the sales recap (23/10/2026, 1.58.0).
 * Each one reaches what the app gives that person; the calendar stays the
 * Marketing area's (RUOLI_MARKETING). The SQL puo_usare_mcp(), mcp_ruolo() and
 * mcp_chi_sono() accept the same roles.
 */
export const RUOLI_MCP: readonly AppRole[] = TUTTI_I_RUOLI.filter((ruolo) => ruolo !== 'business_coach')

/**
 * Who opens the sales recap (/recap, 1.58.0): the business coach, whose only
 * page it is, and the admin, to see what he sees. Same roles as recap_sales() in SQL.
 */
export const RUOLI_RECAP: readonly AppRole[] = ['admin', 'business_coach']

/**
 * The business coach (Dany, 23/10/2026: «lui vede una pagina, una dashboard con
 * le informazioni principali del business»): one page, the sales recap, and
 * nothing else of the app. The (app) layout sends him there from every other page.
 */
export function soloRecap(ruolo: AppRole): boolean {
  return ruolo === 'business_coach'
}

/**
 * The roles that never write. The business coach reads only his recap: the
 * server actions refuse him anyway (negaPer, negaSeNonPm), and RLS before them.
 */
export const RUOLI_SOLA_LETTURA: readonly AppRole[] = ['business_coach']

/** The person never writes: every action refuses it (SOLA_LETTURA). */
export function solaLettura(ruolo: AppRole): boolean {
  return RUOLI_SOLA_LETTURA.includes(ruolo)
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
 * The business coach has no level in SQL (pm_livello_corrente() is null): no
 * project is his, so here he is the lowest level, and the guards (negaSeNonPm)
 * refuse him by role.
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
      return '/'
    case 'business_coach':
      // his one page (1.58.0)
      return '/recap'
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
