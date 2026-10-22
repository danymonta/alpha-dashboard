import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/app-shell'
import { alfireConfigurata } from '@/lib/alfire/config'
import { haAreaDisponibile } from '@/lib/auth/roles'
import { requireProfilo, type Profilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { NESSUN_PROMEMORIA, type Promemoria } from '@/lib/nav'
import { COOKIE_SIDEBAR, statoSidebar } from '@/lib/shell/sidebar-stato'
import { contaCommentiMancanti } from '@/lib/setting/commenti-mancanti'
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
 * - The setter's own days from 08/10/2026 still without the required comment
 *   of the day (Dany: "deve lui sempre lasciare un commento della
 *   giornata"), on his "Oggi": the setter only, never the admin.
 * Never another person's number, no alert, no email. The layout does not
 * render again on a client navigation: this is the start, the browser counts
 * again (EsitiDaRegistrareProvider), and `letto` tells it when these counts
 * are fresh. Kept out of the render: it reads the clock.
 */
async function contaPromemoria(profilo: Profilo): Promise<{ promemoria: Promemoria; letto: number }> {
  const letto = Date.now()
  const contaEsiti = profilo.ruolo === 'admin' || profilo.ruolo === 'closer'
  const contaDaApprovare = profilo.ruolo === 'admin' || profilo.ruolo === 'setter'
  const contaCommenti = profilo.ruolo === 'setter'
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
  const commenti = async () =>
    contaCommenti ? ((await contaCommentiMancanti(supabase, profilo.id, oggiRoma(new Date(letto)))) ?? 0) : 0
  const [numeroEsiti, numeroDaApprovare, numeroCommenti] = await Promise.all([
    esiti(),
    daApprovare(),
    commenti(),
  ])
  return {
    promemoria: {
      esiti: numeroEsiti,
      daApprovare: numeroDaApprovare,
      commenti: numeroCommenti,
    },
    letto,
  }
}

/**
 * The person's unread notifications (1.41.0, the bell): one head count under
 * RLS, their own whatever the role; 0 when the query fails.
 */
async function contaNotifiche(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifiche')
    .select('id', { count: 'exact', head: true })
    .is('letta_il', null)
  return error ? 0 : (count ?? 0)
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()

  if (!haAreaDisponibile(profilo.ruolo)) {
    redirect('/nessuna-area')
  }

  const [{ promemoria, letto }, notificheNonLette] = await Promise.all([contaPromemoria(profilo), contaNotifiche()])

  // the sidebar's width, per device: read here so the first paint is already right
  const sidebarIniziale = statoSidebar((await cookies()).get(COOKIE_SIDEBAR)?.value)

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
      notificheNonLette={notificheNonLette}
      sidebarIniziale={sidebarIniziale}
    >
      {children}
    </AppShell>
  )
}
