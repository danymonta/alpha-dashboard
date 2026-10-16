import { Sparkles } from 'lucide-react'

import { SchedePagina } from '@/components/shell/schede-pagina'

/**
 * The Insight of the last 24 hours is a tab, not an item of the menu (1.38.0,
 * Dany 16/10/2026: «la parte Insight 24h deve essere solo una tab dentro
 * Setter»): for the admin the second tab of «Setter» («Numeri | Insight 24h»,
 * /setting and /insight), for the setter the second tab of «Oggi» («Il mio
 * giorno | Insight 24h», /today and /insight). The addresses stay the same.
 * The sparkles keep the brand's flame (CLAUDE.md section 11).
 */
export const SCHEDE_INSIGHT = {
  admin: { aria: 'Sezioni di Setter', principale: { href: '/setting', etichetta: 'Numeri' } },
  setter: { aria: 'Sezioni di Oggi', principale: { href: '/today', etichetta: 'Il mio giorno' } },
} as const

export function SchedeInsight({ ruolo, attiva }: { ruolo: 'admin' | 'setter'; attiva: 'principale' | 'insight' }) {
  const { aria, principale } = SCHEDE_INSIGHT[ruolo]
  return (
    <SchedePagina
      etichetta={aria}
      schede={[
        { ...principale, attiva: attiva === 'principale' },
        {
          href: '/insight',
          etichetta: 'Insight 24h',
          attiva: attiva === 'insight',
          Icona: Sparkles,
          classeIcona: 'text-[var(--brand-fire-flame)]',
          dataTour: 'scheda-insight',
        },
      ]}
    />
  )
}
