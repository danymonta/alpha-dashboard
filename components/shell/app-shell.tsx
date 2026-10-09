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
import type { Promemoria } from '@/lib/nav'

type Props = {
  profiloId: string
  ruolo: AppRole
  nome: string
  foto: string | null
  /** The model key is set (server env): otherwise Alfire explains what is missing. */
  alfireConfigurata: boolean
  /** First sign-in after the invite: the guided tour starts by itself. */
  primoAccesso: boolean
  /** The person's own calls to record and setters' days to decide: badges on their items. */
  promemoria: Promemoria
  /** When the layout counted them: a new value means a fresh server count. */
  promemoriaLetti: number
  children: ReactNode
}

/**
 * One shell for every area: Economics (admin, setter, closer), Marketing
 * (admin, video editor, marketing: the content calendar) and Projects
 * (everyone). The navigation is keyed by role and grouped by area.
 */
export function AppShell({
  profiloId,
  ruolo,
  nome,
  foto,
  alfireConfigurata,
  primoAccesso,
  promemoria,
  promemoriaLetti,
  children,
}: Props) {
  return (
    // the running timer (Projects area) is shown in the sidebar and the top bar
    <TimerProvider profiloId={profiloId}>
      <AlfireProvider configurata={alfireConfigurata} ruolo={ruolo} nome={nome}>
      <TutorialProvider ruolo={ruolo} primoAccesso={primoAccesso}>
      <EsitiDaRegistrareProvider iniziale={promemoria} versione={promemoriaLetti} profiloId={profiloId} ruolo={ruolo}>
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
