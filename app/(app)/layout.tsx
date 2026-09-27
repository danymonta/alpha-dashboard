import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/app-shell'
import { alfireConfigurata } from '@/lib/alfire/config'
import { haAreaDisponibile } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()

  if (!haAreaDisponibile(profilo.ruolo)) {
    redirect('/nessuna-area')
  }

  return (
    <AppShell
      profiloId={profilo.id}
      ruolo={profilo.ruolo}
      nome={profilo.nome}
      foto={profilo.foto_url}
      alfireConfigurata={alfireConfigurata()}
      primoAccesso={!profilo.tutorial_visto}
    >
      {children}
    </AppShell>
  )
}
