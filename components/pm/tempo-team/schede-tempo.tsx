'use client'

import { usePathname } from 'next/navigation'

import { useLingua } from '@/components/i18n/lingua-provider'
import { SchedePagina } from '@/components/shell/schede-pagina'
import { TEMPO } from '@/lib/i18n/testi/tempo'

/**
 * "Il mio tempo" and "Team" side by side. Admin only (the layout decides):
 * everyone else has just their own time and no tabs at all. Since 1.73.1 the
 * same glass pill as every other page's tabs; both start on the current week,
 * and each keeps its own period: nothing travels between them.
 */
export function SchedeTempo() {
  const pathname = usePathname()
  const t = TEMPO[useLingua()].schede
  return (
    <SchedePagina
      etichetta={t.aria}
      schede={[
        { href: '/tempo', etichetta: t.mio, attiva: pathname === '/tempo' },
        { href: '/tempo/team', etichetta: t.team, attiva: pathname === '/tempo/team' || pathname.startsWith('/tempo/team/') },
      ]}
    />
  )
}
