'use client'

import { ChevronDown, LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { cambiaStatusContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { BadgeStatus, ICONA_STATUS, classeStatus } from '@/components/marketing/badge-status'
import { useUscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import { useVersioneContenuto } from '@/components/marketing/versione-contenuto'
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
  ETICHETTA_GRUPPO,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
  type StatusContenuto,
} from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'

function isStatus(valore: unknown): valore is StatusContenuto {
  return typeof valore === 'string' && valore in ETICHETTA_STATUS
}

/**
 * The Status of a content with one tap, as in Notion: a menu with Notion's
 * groups (To-do, In progress, Complete) in Notion's order. No version check
 * (last write wins); the new updated_at goes to the content's page, so the
 * person's properties sheet stays in step. Its own 44px button: on a card it
 * never opens the card. In the list, a Status outside the filters takes the
 * row out: before the tap goes, the list remembers where the focus goes
 * (SezioneContenuti), never <body>.
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
  const router = useRouter()
  const versione = useVersioneContenuto()
  const lista = useUscitaDallaLista()
  const [mostrato, setMostrato] = useState(stato)
  const [daServer, setDaServer] = useState(stato)
  const [inCorso, avvia] = useTransition()
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
    const esce = Boolean(lista?.stati && !lista.stati.includes(nuovo))
    if (esce) lista?.ricorda(id, nome)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof cambiaStatusContenuto>>
      try {
        esito = await cambiaStatusContenuto({ id, stato: nuovo })
      } catch {
        if (esce) lista?.dimentica()
        setMostrato(prima)
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        // the refresh decides: a row that stays keeps the focus, one gone meanwhile hands it on
        setMostrato(prima)
        toast.error(esito.errore)
        router.refresh()
        return
      }
      versione?.aggiorna(esito.versione)
      toast.success(`Status: ${ETICHETTA_STATUS[nuovo]}`)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${ETICHETTA_STATUS[mostrato]}: cambia lo Status di ${nome}`}
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
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
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
                {GRUPPI_STATUS[gruppo].map((s) => {
                  const Icona = ICONA_STATUS[s]
                  return (
                    <DropdownMenuRadioItem key={s} value={s} closeOnClick className="min-h-11 px-3">
                      <Icona className={cn('size-4', classeStatus(s))} aria-hidden="true" />
                      {ETICHETTA_STATUS[s]}
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
