import { Hammer } from 'lucide-react'

import { StatoVuoto } from '@/components/stati/stato-vuoto'

/**
 * Placeholder for a screen whose behaviour lands in a later phase.
 * The route, the guard and the navigation are already real.
 */
export function InArrivo({ fase, cosa }: { fase: 2 | 3 | 4; cosa: string }) {
  return (
    <StatoVuoto
      Icona={Hammer}
      titolo={`Disponibile dalla Fase ${fase}`}
      descrizione={`${cosa} La struttura, l’accesso per ruolo e i permessi sono già attivi.`}
    />
  )
}
