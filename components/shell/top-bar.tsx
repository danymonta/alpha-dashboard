'use client'

import { LogOut } from 'lucide-react'

import { esci } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { Button } from '@/components/ui/button'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'

/** Mobile header: identity and the way out. The sidebar covers this on desktop. */
export function TopBar({ ruolo, nome }: { ruolo: AppRole; nome: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:hidden">
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
    </header>
  )
}
