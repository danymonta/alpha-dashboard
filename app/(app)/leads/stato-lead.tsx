'use client'

import {
  CalendarClock,
  CircleCheck,
  CircleX,
  Lightbulb,
  LoaderCircle,
  RotateCw,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { aggiornaStatoLead } from '@/app/(app)/leads/actions'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ETICHETTA_STATO_LEAD, STATI_LEAD, type StatoLead } from '@/lib/validation/lead'

const ASPETTO: Record<StatoLead, { Icona: LucideIcon; tono: string }> = {
  call_fissata: { Icona: CalendarClock, tono: 'text-foreground' },
  follow_up: { Icona: RotateCw, tono: 'text-status-warning' },
  cliente: { Icona: CircleCheck, tono: 'text-status-ok' },
  perso: { Icona: CircleX, tono: 'text-muted-foreground' },
}

/** What the card proposes when the last call and the lead status disagree. */
export type Suggerimento =
  | { tipo: 'stato'; testo: string; stato: StatoLead; etichetta: string; link?: { href: string; etichetta: string } }
  | { tipo: 'link'; testo: string; href: string; etichetta: string }
  | { tipo: 'info'; testo: string }

function useAggiornaStato(leadId: string, nome: string, stato: StatoLead) {
  const [inCorso, avvia] = useTransition()
  const [mostrato, impostaMostrato] = useOptimistic(stato)

  function cambia(nuovo: StatoLead, dopo?: () => void) {
    if (nuovo === mostrato) return
    avvia(async () => {
      impostaMostrato(nuovo)
      let esito
      try {
        esito = await aggiornaStatoLead({ lead_id: leadId, stato: nuovo })
      } catch {
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (esito.ok) {
        toast.success(`${nome}: ${ETICHETTA_STATO_LEAD[nuovo].toLowerCase()}`)
        dopo?.()
      } else {
        toast.error(esito.errore)
      }
    })
  }

  return { mostrato, inCorso, cambia }
}

/**
 * The pipeline card's status area. Manual by decision (CLAUDE.md section 8):
 * nothing moves by itself, but a mismatch with the last call is surfaced with
 * the one action that resolves it.
 */
export function StatoLeadArea({
  leadId,
  nome,
  stato,
  suggerimento,
}: {
  leadId: string
  nome: string
  stato: StatoLead
  suggerimento: Suggerimento | null
}) {
  const { mostrato, inCorso, cambia } = useAggiornaStato(leadId, nome, stato)
  const [aperto, setAperto] = useState(false)
  const { Icona, tono } = ASPETTO[mostrato]
  // once the suggested state is reached, the hint has done its job
  const attivo = suggerimento && !(suggerimento.tipo === 'stato' && suggerimento.stato === mostrato)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', tono)} data-testid="stato-lead">
          {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Icona className="size-4" aria-hidden="true" />}
          {ETICHETTA_STATO_LEAD[mostrato]}
        </span>

        <Sheet open={aperto} onOpenChange={setAperto}>
          <SheetTrigger render={<Button type="button" variant="ghost" className="h-11 text-muted-foreground" />}>
            Cambia stato
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto w-full max-w-lg rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <SheetHeader>
              <SheetTitle>{nome}</SheetTitle>
              <SheetDescription>Stato nella pipeline, aggiornato a mano.</SheetDescription>
            </SheetHeader>
            <div role="radiogroup" aria-label={`Stato di ${nome}`} className="grid grid-cols-2 gap-2 px-4">
              {STATI_LEAD.map((s) => {
                const { Icona: I, tono: t } = ASPETTO[s]
                const scelto = s === mostrato
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={scelto}
                    onClick={() => cambia(s, () => setAperto(false))}
                    className={cn(
                      'flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      scelto ? 'border-primary bg-primary/15 text-foreground' : 'border-input hover:bg-accent',
                    )}
                  >
                    <I className={cn('size-4', t)} aria-hidden="true" />
                    {ETICHETTA_STATO_LEAD[s]}
                  </button>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {attivo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2" data-testid="suggerimento-lead">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
            {suggerimento.testo}
          </p>
          {suggerimento.tipo === 'stato' ? (
            <div className="flex flex-wrap gap-2">
              {suggerimento.link ? (
                <Link href={suggerimento.link.href} className={cn(buttonVariants({ variant: 'default' }), 'h-11')}>
                  {suggerimento.link.etichetta}
                </Link>
              ) : null}
              <Button
                type="button"
                variant={suggerimento.link ? 'outline' : 'default'}
                className="h-11"
                disabled={inCorso}
                onClick={() => cambia(suggerimento.stato)}
              >
                {suggerimento.etichetta}
              </Button>
            </div>
          ) : suggerimento.tipo === 'link' ? (
            <Link href={suggerimento.href} className={cn(buttonVariants({ variant: 'default' }), 'h-11')}>
              {suggerimento.etichetta}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
