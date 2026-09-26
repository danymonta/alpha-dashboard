'use client'

import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { AppRole } from '@/lib/auth/roles'
import { isAttiva, vociNav } from '@/lib/nav'

/** Mobile navigation: at most four items plus "Altro". Touch targets >= 44px. */
export function BottomBar({ ruolo }: { ruolo: AppRole }) {
  const pathname = usePathname()
  const [apertoAltro, setApertoAltro] = useState(false)
  const { principali, altre } = vociNav(ruolo)

  if (principali.length === 0) return null

  return (
    <nav
      aria-label="Navigazione"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch">
        {principali.map((voce) => {
          const attiva = isAttiva(pathname, voce)
          return (
            <li key={voce.href} className="flex-1">
              <Link
                href={voce.href}
                aria-current={attiva ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight ${
                  attiva ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <voce.Icona className="size-5" aria-hidden="true" />
                <span className="truncate">{voce.etichetta}</span>
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${attiva ? 'bg-primary-light' : 'bg-transparent'}`}
                />
              </Link>
            </li>
          )
        })}

        {altre.length > 0 ? (
          <li className="flex-1">
            <Sheet open={apertoAltro} onOpenChange={setApertoAltro}>
              <SheetTrigger
                render={
                  <button
                    type="button"
                    className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight text-muted-foreground"
                  />
                }
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
                <span>Altro</span>
                <span aria-hidden="true" className="h-0.5 w-6" />
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-xl pb-8">
                <SheetHeader>
                  <SheetTitle>Altro</SheetTitle>
                </SheetHeader>
                <ul className="px-4">
                  {altre.map((voce) => (
                    <li key={voce.href}>
                      <Link
                        href={voce.href}
                        onClick={() => setApertoAltro(false)}
                        className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-sm hover:bg-accent"
                      >
                        <voce.Icona
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {voce.etichetta}
                      </Link>
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
