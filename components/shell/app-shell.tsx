import type { ReactNode } from 'react'

import { IntroIngresso } from '@/components/brand/intro-ingresso'
import { BottomBar } from '@/components/shell/bottom-bar'
import { Sidebar } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import type { AppRole } from '@/lib/auth/roles'

type Props = {
  ruolo: AppRole
  nome: string
  children: ReactNode
}

/**
 * One shell for every area. Today only Economics exists; the navigation is
 * already keyed by role so a second area is just more entries.
 */
export function AppShell({ ruolo, nome, children }: Props) {
  return (
    <div className="min-h-dvh md:pl-60">
      <Sidebar ruolo={ruolo} nome={nome} />
      <TopBar ruolo={ruolo} nome={nome} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-10">
        {children}
      </main>
      <BottomBar ruolo={ruolo} />
      {/* Brand moment: once per session, removed from the DOM when done */}
      <IntroIngresso />
    </div>
  )
}
