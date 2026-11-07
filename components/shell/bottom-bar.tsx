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
import { useLingua } from '@/components/i18n/lingua-provider'
import { ConteggioPromemoria as Conteggio } from '@/components/shell/conteggio-esiti'
import { usePromemoria } from '@/components/shell/esiti-da-registrare'
import { LinkNav } from '@/components/shell/link-nav'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import type { AppRole } from '@/lib/auth/roles'
import { SHELL } from '@/lib/i18n/testi/shell'
import {
  etichettaVoce,
  isAttiva,
  nomeConPromemoria,
  promemoriaDellaVoce,
  promemoriaDiAltro,
  titoloGruppo,
  vociNav,
} from '@/lib/nav'

// the badge sits on the icon's top right corner, inside the 44px target
const SUL_ICONA = 'absolute top-0.5 left-1/2 ml-1 ring-2 ring-background'

/** Mobile navigation: at most four items plus "Altro". Touch targets >= 44px. */
export function BottomBar({ ruolo }: { ruolo: AppRole }) {
  const pathname = usePathname()
  // the person's own calls to record and days to decide (zero where the role has none)
  const promemoria = usePromemoria()
  const [apertoAltro, setApertoAltro] = useState(false)
  const { principali, altre, gruppiAltro } = vociNav(ruolo)
  const idBase = useId()
  const lingua = useLingua()
  const t = SHELL[lingua]
  // on a page reached from "Altro" (e.g. Impostazioni) the bar still says where you are
  const altroAttivo = altre.some((v) => isAttiva(pathname, v))
  // items with a count inside the sheet: "Altro" carries their numbers
  const inAltro = promemoriaDiAltro(altre, promemoria)

  if (principali.length === 0) return null

  return (
    // a floating pill of liquid glass (1.72.0): the page scrolls under it, above the home bar
    <VetroLiquido
      as="nav"
      aria-label={t.navigazione}
      raggio={22}
      sfocatura={10}
      piega={0.45}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-30 overflow-hidden rounded-[22px] md:hidden"
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
                aria-label={nomeConPromemoria(etichettaVoce(voce, lingua), suoi, lingua)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight ${
                  attiva ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <voce.Icona className="size-5" aria-hidden="true" />
                <span className="truncate">{etichettaVoce(voce, lingua)}</span>
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
                    aria-label={nomeConPromemoria(t.altro, inAltro, lingua)}
                    className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] leading-tight ${
                      altroAttivo ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  />
                }
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
                <span>{t.altro}</span>
                <Conteggio promemoria={inAltro} className={SUL_ICONA} />
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${altroAttivo ? 'bg-primary-light' : 'bg-transparent'}`}
                />
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-xl pb-8">
                <SheetHeader>
                  <SheetTitle>{t.altro}</SheetTitle>
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
                            {titoloGruppo(titolo, lingua)}
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
                                  aria-label={nomeConPromemoria(etichettaVoce(voce, lingua), suoi, lingua)}
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
                                  <span className="min-w-0 leading-tight">{etichettaVoce(voce, lingua)}</span>
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
    </VetroLiquido>
  )
}
