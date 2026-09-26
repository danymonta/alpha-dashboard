import type { Database } from '@/lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']

/** Roles that have an Economics area today. The others can sign in and see nothing. */
export const RUOLI_CON_AREA: readonly AppRole[] = ['admin', 'setter', 'closer']

export function haAreaDisponibile(ruolo: AppRole): boolean {
  return RUOLI_CON_AREA.includes(ruolo)
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
      return '/nessuna-area'
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
