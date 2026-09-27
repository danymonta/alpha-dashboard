'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { BottoneAlfire } from '@/components/alfire/alfire'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TimerInCima } from '@/components/pm/tempo/timer-attivo'
import { TestaTutorial } from '@/components/tutorial/testa-tutorial'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'

/**
 * Top of every page. Mobile: identity, the running timer, Alfire and the
 * profile (which opens the user settings, where "Esci" lives). Desktop: the
 * sidebar has identity and profile, so the timer and Alfire, top right. Its real height
 * (it grows with the timer strip) is published as --altezza-topbar, so sticky
 * bars below it (project tabs) sit right under it.
 */
export function TopBar({ ruolo, nome, foto }: { ruolo: AppRole; nome: string; foto: string | null }) {
  const barra = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = barra.current
    if (!el) return
    const radice = document.documentElement
    const aggiorna = () => radice.style.setProperty('--altezza-topbar', `${el.offsetHeight}px`)
    aggiorna()
    const osservatore = new ResizeObserver(aggiorna)
    osservatore.observe(el)
    return () => {
      osservatore.disconnect()
      radice.style.removeProperty('--altezza-topbar')
    }
  }, [])

  return (
    <header ref={barra} className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <LogoFuoco dimensione="mini" />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold">Percorso Alpha</p>
            <p className="truncate text-xs text-muted-foreground">
              {nome} · {ETICHETTA_RUOLO[ruolo]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ruolo === 'admin' ? <TestaTutorial /> : null}
          <TimerInCima compatto />
          <BottoneAlfire />
          <Link
            href="/account"
            data-tour="profilo"
            aria-label={`Il tuo profilo: ${nome}`}
            className="flex size-11 items-center justify-center rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <FotoProfilo nome={nome} foto={foto} className="size-8" />
          </Link>
        </div>
      </div>
      <div className="hidden h-14 items-center justify-end gap-1 px-6 md:flex">
        {ruolo === 'admin' ? <TestaTutorial conEtichetta /> : null}
        <TimerInCima />
        <BottoneAlfire conEtichetta />
      </div>
    </header>
  )
}
