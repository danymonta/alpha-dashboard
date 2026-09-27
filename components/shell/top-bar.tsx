'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { BottoneAlfire } from '@/components/alfire/alfire'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TimerAttivo } from '@/components/pm/tempo/timer-attivo'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'

/**
 * Top of every page. Mobile: identity, Alfire and the profile (which opens the
 * user settings, where "Esci" lives), plus the running timer. Desktop: the
 * sidebar has identity and profile, so only Alfire, top right. Its real height
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
            <p className="font-heading text-sm font-semibold">Percorso Alpha</p>
            <p className="truncate text-xs text-muted-foreground">
              {nome} · {ETICHETTA_RUOLO[ruolo]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BottoneAlfire />
          <Link
            href="/account"
            aria-label={`Il tuo profilo: ${nome}`}
            className="flex size-11 items-center justify-center rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <FotoProfilo nome={nome} foto={foto} className="size-8" />
          </Link>
        </div>
      </div>
      <div className="hidden h-14 items-center justify-end px-6 md:flex">
        <BottoneAlfire conEtichetta />
      </div>
      {/* desktop: the running timer is in the sidebar */}
      <div className="md:hidden">
        <TimerAttivo variante="barra" />
      </div>
    </header>
  )
}
