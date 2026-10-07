import type { ReactNode } from 'react'

import { AlfireProvider } from '@/components/alfire/alfire'
import { IntroIngresso } from '@/components/brand/intro-ingresso'
import { TimerProvider } from '@/components/pm/tempo/timer-provider'
import { TutorialProvider } from '@/components/tutorial/tutorial'
import { BottomBar } from '@/components/shell/bottom-bar'
import { EsitiDaRegistrareProvider } from '@/components/shell/esiti-da-registrare'
import { Sidebar } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import type { AppRole } from '@/lib/auth/roles'

type Props = {
  profiloId: string
  ruolo: AppRole
  nome: string
  foto: string | null
  /** The model key is set (server env): otherwise Alfire explains what is missing. */
  alfireConfigurata: boolean
  /** First sign-in after the invite: the guided tour starts by itself. */
  primoAccesso: boolean
  /** The person's own past calls still without an outcome: a badge on their items (admin and closer). */
  esitiDaRegistrare: number
  /** When the layout counted them: a new value means a fresh server count. */
  esitiLetti: number
  children: ReactNode
}

/**
 * One shell for every area: Economics (admin, setter, closer) and Projects
 * (everyone). The navigation is keyed by role and grouped by area.
 */
export function AppShell({
  profiloId,
  ruolo,
  nome,
  foto,
  alfireConfigurata,
  primoAccesso,
  esitiDaRegistrare,
  esitiLetti,
  children,
}: Props) {
  return (
    // the running timer (Projects area) is shown in the sidebar and the top bar
    <TimerProvider profiloId={profiloId}>
      <AlfireProvider configurata={alfireConfigurata} ruolo={ruolo} nome={nome}>
      <TutorialProvider ruolo={ruolo} primoAccesso={primoAccesso}>
      <EsitiDaRegistrareProvider iniziale={esitiDaRegistrare} versione={esitiLetti} profiloId={profiloId} ruolo={ruolo}>
      <div className="min-h-dvh md:pl-60">
        <Sidebar ruolo={ruolo} nome={nome} foto={foto} />
        <TopBar ruolo={ruolo} nome={nome} foto={foto} />
        <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-10">
          {children}
        </main>
        <BottomBar ruolo={ruolo} />
        {/* Brand moment: once per session, removed from the DOM when done */}
        <IntroIngresso />
      </div>
      </EsitiDaRegistrareProvider>
      </TutorialProvider>
      </AlfireProvider>
    </TimerProvider>
  )
}
