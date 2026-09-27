'use client'

import { LogOut } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { esci } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TimerAttivo } from '@/components/pm/tempo/timer-attivo'
import { Button } from '@/components/ui/button'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'

/**
 * Mobile header: identity and the way out, plus the running timer. The sidebar
 * covers this on desktop. Its real height (it grows with the timer strip) is
 * published as --altezza-topbar, so sticky bars below it (project tabs) sit
 * right under it.
 */
export function TopBar({ ruolo, nome }: { ruolo: AppRole; nome: string }) {
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
    <header ref={barra} className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <LogoFuoco dimensione="mini" />
          <div className="min-w-0">
            <p className="font-heading text-sm font-semibold">Percorso Alpha</p>
            <p className="truncate text-xs text-muted-foreground">
              {nome} · {ETICHETTA_RUOLO[ruolo]}
            </p>
          </div>
        </div>
        <form action={esci}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Esci"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
      <TimerAttivo variante="barra" />
    </header>
  )
}
