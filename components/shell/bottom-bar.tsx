'use client'

import { MoreHorizontal } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useId, useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ConteggioPromemoria as Conteggio } from '@/components/shell/conteggio-esiti'
import { usePromemoria } from '@/components/shell/esiti-da-registrare'
import { LinkNav } from '@/components/shell/link-nav'
import type { AppRole } from '@/lib/auth/roles'
import {
  isAttiva,
  nomeConPromemoria,
  promemoriaDellaVoce,
  promemoriaDiAltro,
  vociNav,
} from '@/lib/nav'

// the badge sits on the icon's top right corner, inside the 44px target
const SUL_ICONA = 'absolute top-0.5 left-1/2 ml-1 ring-2 ring-sidebar'

/** Mobile navigation: at most four items plus "Altro". Touch targets >= 44px. */
export function BottomBar({ ruolo }: { ruolo: AppRole }) {
  const pathname = usePathname()
  // the person's own calls to record and days to decide (zero where the role has none)
  const promemoria = usePromemoria()
  const [apertoAltro, setApertoAltro] = useState(false)
  const { principali, altre, gruppiAltro } = vociNav(ruolo)
  const idBase = useId()
  // on a page reached from "Altro" (e.g. Impostazioni) the bar still says where you are
  const altroAttivo = altre.some((v) => isAttiva(pathname, v))
  // items with a count inside the sheet: "Altro" carries their numbers
  const inAltro = promemoriaDiAltro(altre, promemoria)

  if (principali.length === 0) return null

  return (
    <nav
      aria-label="Navigazione"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch">
        {principali.map((voce) => {
          const attiva = isAttiva(pathname, voce)
          const suoi = promemoriaDellaVoce(voce, promemoria)
          return (
            <li key={voce.href} className="flex-1">
              <LinkNav
                href={voce.href}
                data-tour={`nav-${voce.href}`}
                aria-current={attiva ? 'page' : undefined}
                aria-label={nomeConPromemoria(voce.etichetta, suoi)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight ${
                  attiva ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <voce.Icona className="size-5" aria-hidden="true" />
                <span className="truncate">{voce.etichetta}</span>
                <Conteggio promemoria={suoi} className={SUL_ICONA} />
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${attiva ? 'bg-primary-light' : 'bg-transparent'}`}
                />
              </LinkNav>
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
                    data-tour="nav-altro"
                    aria-label={nomeConPromemoria('Altro', inAltro)}
                    className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight ${
                      altroAttivo ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  />
                }
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
                <span>Altro</span>
                <Conteggio promemoria={inAltro} className={SUL_ICONA} />
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${altroAttivo ? 'bg-primary-light' : 'bg-transparent'}`}
                />
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-xl pb-8">
                <SheetHeader>
                  <SheetTitle>Altro</SheetTitle>
                </SheetHeader>
                {/* the same groups and titles as the desktop sidebar (1.38.0); two columns, so
                    the admin's fifteen items fit a phone without scrolling much */}
                <div className="space-y-3 overflow-y-auto px-4">
                  {gruppiAltro.map(({ titolo, voci }, i) => {
                    const idTitolo = `${idBase}-gruppo-${i}`
                    return (
                      <div
                        key={titolo ?? 'in-cima'}
                        role={titolo ? 'group' : undefined}
                        aria-labelledby={titolo ? idTitolo : undefined}
                      >
                        {titolo ? (
                          <p
                            id={idTitolo}
                            className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                          >
                            {titolo}
                          </p>
                        ) : null}
                        <ul className="grid grid-cols-2 gap-x-2">
                          {voci.map((voce) => {
                            const attiva = isAttiva(pathname, voce)
                            const suoi = promemoriaDellaVoce(voce, promemoria)
                            return (
                              <li key={voce.href}>
                                <LinkNav
                                  href={voce.href}
                                  onClick={() => setApertoAltro(false)}
                                  aria-current={attiva ? 'page' : undefined}
                                  aria-label={nomeConPromemoria(voce.etichetta, suoi)}
                                  // the sheet is already --accent (surface-2): the current page takes
                                  // the sidebar's active style, so it reads the same on every viewport
                                  className={`flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm ${
                                    attiva ? 'bg-primary text-primary-foreground' : 'hover:bg-background'
                                  }`}
                                >
                                  <voce.Icona
                                    className={`size-4 shrink-0 ${attiva ? '' : 'text-muted-foreground'}`}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0 truncate">{voce.etichetta}</span>
                                  <Conteggio promemoria={suoi} attiva={attiva} className="ml-auto" />
                                </LinkNav>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
