import { Constants, type Database } from '@/lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']
export type LivelloPm = Database['public']['Enums']['pm_livello']

export const TUTTI_I_RUOLI: readonly AppRole[] = Constants.public.Enums.app_role

/** Roles with the Economics area. Everyone has the Projects area. */
export const RUOLI_ECONOMICS: readonly AppRole[] = ['admin', 'setter', 'closer']

/** Every role has at least the Projects area (since 28/09/2026). */
export function haAreaDisponibile(ruolo: AppRole): boolean {
  return TUTTI_I_RUOLI.includes(ruolo)
}

export function haEconomics(ruolo: AppRole): boolean {
  return RUOLI_ECONOMICS.includes(ruolo)
}

/** The app admin is always PM admin, whatever livello_pm says (same rule as SQL). */
export function livelloPmEffettivo(ruolo: AppRole, livello: LivelloPm): LivelloPm {
  return ruolo === 'admin' ? 'admin' : livello
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
    case 'setter':
      return '/today'
    case 'closer':
      return '/calls'
    default:
      // who works on projects starts from what is on their plate
      return '/task'
  }
}

export const ETICHETTA_RUOLO: Record<AppRole, string> = {
  admin: 'Admin',
  setter: 'Setter',
  closer: 'Closer',
  coach: 'Coach',
  editor: 'Video editor',
  nutrizione: 'Nutrizione',
  dev: 'Dev',
}
