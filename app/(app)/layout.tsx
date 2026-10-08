import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/app-shell'
import { alfireConfigurata } from '@/lib/alfire/config'
import { haAreaDisponibile } from '@/lib/auth/roles'
import { requireProfilo, type Profilo } from '@/lib/auth/session'
import { NESSUN_PROMEMORIA, type Promemoria } from '@/lib/nav'
import { createClient } from '@/lib/supabase/server'

/**
 * What the navigation reminds the person of, each only to whom has something
 * to do (CLAUDE.md section 17), one head count under RLS each; 0 when a query
 * fails: the badge is a reminder, never a reason for the page not to open.
 * - The person's own past calls still without an outcome (07/10/2026: Dany has
 *   to record them every day), on "Le mie call" and on the closer's page:
 *   admin and closer, always and only their own calls (closer_id).
 * - The setters' days proposed from the Instagram DMs still to decide
 *   (08/10/2026: "una tab con una notifica «tracciamento setter da
 *   approvare»"), on the setter's "Oggi" (his own) and on the admin's
 *   "Setter" (every setter's: he decides them too).
 * Never another person's number, no alert, no email. The layout does not
 * render again on a client navigation: this is the start, the browser counts
 * again (EsitiDaRegistrareProvider), and `letto` tells it when these counts
 * are fresh. Kept out of the render: it reads the clock.
 */
async function contaPromemoria(profilo: Profilo): Promise<{ promemoria: Promemoria; letto: number }> {
  const letto = Date.now()
  const contaEsiti = profilo.ruolo === 'admin' || profilo.ruolo === 'closer'
  const contaDaApprovare = profilo.ruolo === 'admin' || profilo.ruolo === 'setter'
  if (!contaEsiti && !contaDaApprovare) return { promemoria: NESSUN_PROMEMORIA, letto }

  const supabase = await createClient()
  const esiti = async () => {
    if (!contaEsiti) return 0
    const { count, error } = await supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('closer_id', profilo.id)
      .eq('stato', 'programmata')
      .lt('programmata_il', new Date(letto).toISOString())
    return error ? 0 : (count ?? 0)
  }
  const daApprovare = async () => {
    if (!contaDaApprovare) return 0
    let query = supabase
      .from('report_proposte_instagram')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'da_confermare')
    // the setter's own (RLS says the same); the admin's: every setter's
    if (profilo.ruolo === 'setter') query = query.eq('setter_id', profilo.id)
    const { count, error } = await query
    return error ? 0 : (count ?? 0)
  }
  const [numeroEsiti, numeroDaApprovare] = await Promise.all([esiti(), daApprovare()])
  return { promemoria: { esiti: numeroEsiti, daApprovare: numeroDaApprovare }, letto }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()

  if (!haAreaDisponibile(profilo.ruolo)) {
    redirect('/nessuna-area')
  }

  const { promemoria, letto } = await contaPromemoria(profilo)

  return (
    <AppShell
      profiloId={profilo.id}
      ruolo={profilo.ruolo}
      nome={profilo.nome}
      foto={profilo.foto_url}
      alfireConfigurata={alfireConfigurata()}
      primoAccesso={!profilo.tutorial_visto}
      promemoria={promemoria}
      promemoriaLetti={letto}
    >
      {children}
    </AppShell>
  )
}
