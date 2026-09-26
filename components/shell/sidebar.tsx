'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { esci } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { isAttiva, vociNav } from '@/lib/nav'

type Props = {
  ruolo: AppRole
  nome: string
}

export function Sidebar({ ruolo, nome }: Props) {
  const pathname = usePathname()
  const { principali, altre } = vociNav(ruolo)
  const voci = [...principali, ...altre]

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
      <div className="px-4 py-5">
        <p className="text-[0.625rem] font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Percorso Alpha
        </p>
        <p className="font-heading text-base font-semibold">Economics</p>
      </div>

      <nav aria-label="Navigazione principale" className="flex-1 px-2">
        <ul className="space-y-0.5">
          {voci.map((voce) => {
            const attiva = isAttiva(pathname, voce)
            return (
              <li key={voce.href}>
                <Link
                  href={voce.href}
                  aria-current={attiva ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                    attiva
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <voce.Icona className="size-4 shrink-0" aria-hidden="true" />
                  {voce.etichetta}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{nome}</p>
            <p className="text-xs text-muted-foreground">{ETICHETTA_RUOLO[ruolo]}</p>
          </div>
          <form action={esci}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Esci"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>
    </aside>
  )
}
