import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { BarraProva } from '@/components/percorso/prova/barra-prova'
import { ProvaProvider } from '@/components/percorso/prova/prova-provider'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { PROVA } from '@/lib/i18n/testi/prova'
import { leggiCampoProva, leggiDatiProva } from '@/lib/percorso/prova-dati'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: PROVA[await getLingua()].titoloPagina, robots: { index: false, follow: false } }
}

/**
 * «Prova del percorso» (1.82.0, CLAUDE.md section 34): the admin walks the onboarding as a client
 * sees it, with the very components of /percorso, and nothing is written. Outside the team's shell,
 * as the client's area. The contents, the steps, the consent and the team come from the admin's own
 * session (lib/percorso/prova-dati.ts); the state lives in the page (components/percorso/prova/).
 * The layout holds the state, so moving between the path, the questionnaire, the consents and the
 * link keeps it.
 */
export default async function LayoutProva({ children }: { children: ReactNode }) {
  await requireRuolo(['admin'])
  const db = await createClient()
  const dati = await leggiDatiProva(db)
  const campo = await leggiCampoProva(db, dati.team.find((p) => p.incarico === 'coach') ?? null)
  return (
    <div className="flex min-h-dvh flex-col" data-testid="prova-percorso">
      <ProvaProvider dati={dati} campo={campo}>
        <BarraProva />
        {children}
      </ProvaProvider>
    </div>
  )
}
