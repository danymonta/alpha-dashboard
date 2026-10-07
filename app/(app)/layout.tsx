import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/app-shell'
import { alfireConfigurata } from '@/lib/alfire/config'
import { haAreaDisponibile } from '@/lib/auth/roles'
import { requireProfilo, type Profilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The person's own past calls still without an outcome (07/10/2026: Dany has
 * to record them every day): a badge on "Le mie call" and on the closer's
 * page. Admin and closer only, always and only their own calls (closer_id),
 * one head count under RLS; 0 when the query fails: the badge is a reminder,
 * never a reason for the page not to open. Never the setter, never another
 * person's number, no alert (CLAUDE.md section 17). The layout does not render
 * again on a client navigation: this is the start, the browser counts again
 * (EsitiDaRegistrareProvider), and `letto` tells it when this count is fresh.
 * Kept out of the render: it reads the clock.
 */
async function contaEsitiDaRegistrare(profilo: Profilo): Promise<{ numero: number; letto: number }> {
  const letto = Date.now()
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer') return { numero: 0, letto }
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('closer_id', profilo.id)
    .eq('stato', 'programmata')
    .lt('programmata_il', new Date(letto).toISOString())
  return { numero: error ? 0 : (count ?? 0), letto }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()

  if (!haAreaDisponibile(profilo.ruolo)) {
    redirect('/nessuna-area')
  }

  const esitiDaRegistrare = await contaEsitiDaRegistrare(profilo)

  return (
    <AppShell
      profiloId={profilo.id}
      ruolo={profilo.ruolo}
      nome={profilo.nome}
      foto={profilo.foto_url}
      alfireConfigurata={alfireConfigurata()}
      primoAccesso={!profilo.tutorial_visto}
      esitiDaRegistrare={esitiDaRegistrare.numero}
      esitiLetti={esitiDaRegistrare.letto}
    >
      {children}
    </AppShell>
  )
}
