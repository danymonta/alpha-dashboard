'use client'

import { ChevronDown, LoaderCircle } from 'lucide-react'
import { Fragment, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { cambiaStatusContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { BadgeStatus } from '@/components/marketing/badge-status'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import { Pillola } from '@/components/marketing/pillola'
import { useUscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  COLORE_STATUS,
  ETICHETTA_GRUPPO,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
  type StatusContenuto,
} from '@/lib/marketing/etichette'
import { useLingua } from '@/components/i18n/lingua-provider'
import { CONTENUTO, traduciErroreContenuto } from '@/lib/i18n/testi/contenuto'
import { cn } from '@/lib/utils'

function isStatus(valore: unknown): valore is StatusContenuto {
  return typeof valore === 'string' && valore in ETICHETTA_STATUS
}

/**
 * The Status of a content with one tap, as in Notion: a menu with Notion's
 * groups (To-do, In progress, Complete) in Notion's order. No version check
 * (last write wins); the new updated_at goes to the content panel's copy.
 * Its own 44px button: on a card it never opens the card. In the list, a
 * Status outside the filters takes the row out: before the tap goes, the
 * list remembers where the focus goes (UscitaDallaLista), never <body>. No
 * router.refresh() after the action: its revalidatePath already brought the
 * page redrawn (1.33.0).
 */
export function MenuStatus({
  id,
  nome,
  stato,
  grande = false,
  className,
}: {
  id: string
  /** The content's Name, for the button's accessible name. */
  nome: string
  stato: StatusContenuto
  /** The content's page: a larger button under the title. */
  grande?: boolean
  className?: string
}) {
  const pannello = usePannello()
  const opzioniToast = useOpzioniToast()
  const lista = useUscitaDallaLista()
  const lingua = useLingua()
  const t = CONTENUTO[lingua].status
  const [mostrato, setMostrato] = useState(stato)
  const [daServer, setDaServer] = useState(stato)
  const [inCorso, avvia] = useTransition()
  // while the save (and the redraw it brings) is in flight, the panel knows
  const inizioSalvataggio = pannello?.inizioSalvataggio
  useEffect(() => (inCorso && inizioSalvataggio ? inizioSalvataggio() : undefined), [inCorso, inizioSalvataggio])
  // a new render from the server (refresh, another person's tap) is the truth
  if (daServer !== stato) {
    setDaServer(stato)
    setMostrato(stato)
  }

  function scegli(nuovo: StatusContenuto) {
    if (nuovo === mostrato) return
    const prima = mostrato
    setMostrato(nuovo)
    // the new Status is outside the list's filters: the refresh will take the row out
    const esce = Boolean(lista?.esce('stato', nuovo))
    if (esce) lista?.ricorda(id, nome)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof cambiaStatusContenuto>>
      try {
        esito = await cambiaStatusContenuto({ id, stato: nuovo })
      } catch {
        if (esce) lista?.dimentica()
        setMostrato(prima)
        toast.error(t.connessione, opzioniToast)
        return
      }
      if (!esito.ok) {
        // a content gone meanwhile: the action redrew the page, the list hands the focus on
        setMostrato(prima)
        toast.error(traduciErroreContenuto(esito.errore, lingua), opzioniToast)
        return
      }
      pannello?.aggiornaCampo(id, 'stato', nuovo, esito.versione)
      toast.success(`Status: ${ETICHETTA_STATUS[nuovo]}`, opzioniToast)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t.cambia(ETICHETTA_STATUS[mostrato], nome)}
            data-menu-status=""
            aria-busy={inCorso || undefined}
            className={cn(
              'relative z-10 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-transparent px-2 text-left transition-colors hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent',
              grande && 'border-input bg-input/30 px-3',
              className,
            )}
          />
        }
      >
        <BadgeStatus stato={mostrato} className={grande ? 'text-base' : undefined} />
        {inCorso ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : grande ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup
          value={mostrato}
          aria-label="Status"
          onValueChange={(valore) => {
            if (isStatus(valore)) scegli(valore)
          }}
        >
          {ORDINE_GRUPPI.map((gruppo, i) => (
            <Fragment key={gruppo}>
              {i > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                <DropdownMenuLabel>{ETICHETTA_GRUPPO[gruppo]}</DropdownMenuLabel>
                {GRUPPI_STATUS[gruppo].map((s) => (
                  <DropdownMenuRadioItem key={s} value={s} closeOnClick className="min-h-11 px-3">
                    <Pillola nome={ETICHETTA_STATUS[s]} colore={COLORE_STATUS[s]} punto />
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
