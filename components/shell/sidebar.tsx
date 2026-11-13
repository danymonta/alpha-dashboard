'use client'

import { ChevronLeft, LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef } from 'react'

import { esci } from '@/app/auth/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import { ConteggioPromemoria } from '@/components/shell/conteggio-esiti'
import { usePromemoria } from '@/components/shell/esiti-da-registrare'
import { useSidebar } from '@/components/shell/contenitore-shell'
import { LinkNav } from '@/components/shell/link-nav'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AppRole } from '@/lib/auth/roles'
import { SHELL } from '@/lib/i18n/testi/shell'
import { etichettaVoce, isAttiva, nomeConPromemoria, promemoriaDellaVoce, titoloGruppo, vociNav } from '@/lib/nav'
import { cn } from '@/lib/utils'

type Props = {
  ruolo: AppRole
  nome: string
  foto: string | null
  /** The item «Onboarding» for a person in charge (release B2). */
  onboarding?: boolean
}

export function Sidebar({ ruolo, nome, foto, onboarding = false }: Props) {
  const pathname = usePathname()
  // shrunk to a column of icons (the choice lives in a cookie, per device)
  const { ridotta, inverti } = useSidebar()
  // the person's own calls to record and days to decide (zero where the role has none)
  const promemoria = usePromemoria()
  const { gruppi } = vociNav(ruolo, { onboarding })
  const lingua = useLingua()
  const t = SHELL[lingua]
  const idBase = useId()
  // sixteen items do not fit a laptop screen: the list scrolls, and the lit item must never be out of sight
  const elenco = useRef<HTMLElement>(null)
  useEffect(() => {
    elenco.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])

  // the arrow turns: it points to where the sidebar goes
  const bottoneRiduci = (
    <button
      type="button"
      onClick={inverti}
      aria-expanded={!ridotta}
      aria-label={ridotta ? t.espandiBarra : t.riduciBarra}
      data-testid="sidebar-toggle"
      className={cn(
        'flex min-h-11 w-full items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        ridotta ? 'justify-center' : 'gap-3 px-3',
      )}
    >
      <ChevronLeft
        className={cn('size-4 shrink-0 transition-transform duration-150', ridotta && 'rotate-180')}
        aria-hidden="true"
      />
      {ridotta ? null : t.riduci}
    </button>
  )

  return (
    <TooltipProvider delay={300}>
    <aside
      data-sidebar={ridotta ? 'ridotta' : 'estesa'}
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-150 ease-out data-[sidebar=ridotta]:w-16 md:flex"
    >
      <div className={cn('flex items-center gap-3 py-4', ridotta ? 'justify-center px-2' : 'px-4')}>
        <div className="palco-logo palco-logo-piccolo">
          <LogoFuoco dimensione={ridotta ? 'mini' : 'compatto'} />
        </div>
        {ridotta ? null : <p className="font-heading text-base leading-tight font-semibold">Alpha Management</p>}
      </div>

      <nav
        ref={elenco}
        aria-label={t.navigazionePrincipale}
        className="flex-1 space-y-4 overflow-y-auto px-2 pt-2"
      >
        {gruppi.map(({ titolo, voci }, i) => {
          const idTitolo = `${idBase}-gruppo-${i}`
          return (
            // a real group with its title (1.38.0); the first group has none: its item stands on top.
            // Shrunk, the title stays for screen readers and a thin line separates the groups.
            <div
              key={titolo ?? 'in-cima'}
              role={titolo ? 'group' : undefined}
              aria-labelledby={titolo ? idTitolo : undefined}
              className={cn(ridotta && i > 0 && 'border-t border-border pt-3')}
            >
              {titolo ? (
                <p
                  id={idTitolo}
                  className={cn(
                    ridotta ? 'sr-only' : 'px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                  )}
                >
                  {titoloGruppo(titolo, lingua)}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {voci.map((voce) => {
                  const attiva = isAttiva(pathname, voce)
                  const suoi = promemoriaDellaVoce(voce, promemoria)
                  const etichetta = etichettaVoce(voce, lingua)
                  const link = (
                    <LinkNav
                      href={voce.href}
                      data-tour={`nav-${voce.href}`}
                      aria-current={attiva ? 'page' : undefined}
                      aria-label={nomeConPromemoria(etichetta, suoi, lingua)}
                      className={cn(
                        'relative flex min-h-11 items-center rounded-lg text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                        ridotta ? 'justify-center' : 'gap-3 px-3',
                        attiva
                          ? 'bg-primary text-primary-foreground glow-primario'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <voce.Icona className={cn('shrink-0', ridotta ? 'size-5' : 'size-4')} aria-hidden="true" />
                      {ridotta ? <span className="sr-only">{etichetta}</span> : etichetta}
                      <ConteggioPromemoria
                        promemoria={suoi}
                        attiva={attiva}
                        className={ridotta ? 'absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[10px]' : 'ml-auto'}
                      />
                    </LinkNav>
                  )
                  return (
                    <li key={voce.href}>
                      {ridotta ? (
                        <Tooltip>
                          <TooltipTrigger render={link} />
                          <TooltipContent side="right">{etichetta}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        {ridotta ? (
          <Tooltip>
            <TooltipTrigger render={bottoneRiduci} />
            <TooltipContent side="right">{t.espandiBarra}</TooltipContent>
          </Tooltip>
        ) : (
          bottoneRiduci
        )}
        <div className={cn('flex gap-1', ridotta ? 'flex-col items-center' : 'items-center')}>
          <LinkNav
            href="/account"
            data-tour="profilo"
            aria-current={pathname.startsWith('/account') ? 'page' : undefined}
            aria-label={t.profilo(nome)}
            className={cn(
              'flex min-h-11 items-center rounded-lg hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-accent',
              ridotta ? 'size-11 justify-center' : 'min-w-0 flex-1 gap-3 px-2 py-1.5',
            )}
          >
            <FotoProfilo nome={nome} foto={foto} />
            {ridotta ? null : (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{nome}</span>
                <span className="block text-xs text-muted-foreground">{t.ruoli[ruolo]}</span>
              </span>
            )}
          </LinkNav>
          <form action={esci}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground"
              aria-label={t.esci}
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>
    </aside>
    </TooltipProvider>
  )
}
