'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { esci } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import { Button } from '@/components/ui/button'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { isAttiva, perSezione, vociNav } from '@/lib/nav'

type Props = {
  ruolo: AppRole
  nome: string
  foto: string | null
}

export function Sidebar({ ruolo, nome, foto }: Props) {
  const pathname = usePathname()
  const { principali, altre } = vociNav(ruolo)
  const gruppi = perSezione([...principali, ...altre])

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex items-center gap-3 px-4 py-4">
        <LogoFuoco dimensione="compatto" />
        <p className="font-heading text-base leading-tight font-semibold">Alpha Management</p>
      </div>


      <nav aria-label="Navigazione principale" className="flex-1 space-y-4 overflow-y-auto px-2">
        {gruppi.map(({ sezione, voci }) => (
          <div key={sezione}>
            {/* one heading per area, only when there is more than one */}
            {gruppi.length > 1 ? (
              <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{sezione}</p>
            ) : null}
            <ul className="space-y-0.5">
              {voci.map((voce) => {
                const attiva = isAttiva(pathname, voce)
                return (
                  <li key={voce.href}>
                    <Link
                      href={voce.href}
                      data-tour={`nav-${voce.href}`}
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
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            data-tour="profilo"
            aria-current={pathname.startsWith('/account') ? 'page' : undefined}
            aria-label={`Il tuo profilo: ${nome}`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-accent"
          >
            <FotoProfilo nome={nome} foto={foto} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{nome}</span>
              <span className="block text-xs text-muted-foreground">{ETICHETTA_RUOLO[ruolo]}</span>
            </span>
          </Link>
          <form action={esci}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground"
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
