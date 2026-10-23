import type { ReactNode } from 'react'

import { AlfireProvider } from '@/components/alfire/alfire'
import { IntroIngresso } from '@/components/brand/intro-ingresso'
import { TimerProvider } from '@/components/pm/tempo/timer-provider'
import { TutorialProvider } from '@/components/tutorial/tutorial'
import { BottomBar } from '@/components/shell/bottom-bar'
import { ContenitoreShell } from '@/components/shell/contenitore-shell'
import { EsitiDaRegistrareProvider } from '@/components/shell/esiti-da-registrare'
import { NotificheProvider } from '@/components/shell/notifiche-provider'
import { Sidebar } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import { TransizionePagina } from '@/components/shell/transizione-pagina'
import type { AppRole } from '@/lib/auth/roles'
import type { Promemoria } from '@/lib/nav'
import type { StatoSidebar } from '@/lib/shell/sidebar-stato'

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
  /** The person's unread notifications (the bell, 1.41.0): counted by the layout, then by the browser. */
  notificheNonLette: number
  /** The sidebar's width as this device left it (cookie, read by the layout): no flash on the first paint. */
  sidebarIniziale: StatoSidebar
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
  notificheNonLette,
  sidebarIniziale,
  children,
}: Props) {
  return (
    // the running timer (Projects area) is shown in the sidebar and the top bar
    <TimerProvider profiloId={profiloId}>
      <AlfireProvider configurata={alfireConfigurata} ruolo={ruolo} nome={nome}>
      <TutorialProvider ruolo={ruolo} primoAccesso={primoAccesso}>
      <EsitiDaRegistrareProvider iniziale={promemoria} versione={promemoriaLetti} profiloId={profiloId} ruolo={ruolo}>
      <NotificheProvider iniziale={notificheNonLette} versione={promemoriaLetti}>
      <ContenitoreShell iniziale={sidebarIniziale}>
        <Sidebar ruolo={ruolo} nome={nome} foto={foto} />
        <TopBar ruolo={ruolo} nome={nome} foto={foto} />
        {/* with the sidebar shrunk the content really widens: max-w-5xl would eat the gain, so it grows to the
            screen (wide tables, like the Contenuti of Marketing, take the room through container queries) */}
        <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-24 group-data-[sidebar=ridotta]/shell:md:max-w-[90rem] md:px-8 md:pt-8 md:pb-10">
          <TransizionePagina>{children}</TransizionePagina>
        </main>
        <BottomBar ruolo={ruolo} />
        {/* Brand moment: once per session, removed from the DOM when done */}
        <IntroIngresso />
      </ContenitoreShell>
      </NotificheProvider>
      </EsitiDaRegistrareProvider>
      </TutorialProvider>
      </AlfireProvider>
    </TimerProvider>
  )
}
