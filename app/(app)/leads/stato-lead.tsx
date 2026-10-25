'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarClock,
  ChevronLeft,
  CircleCheck,
  CircleX,
  Lightbulb,
  LoaderCircle,
  Pencil,
  RotateCw,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiornaStatoLead, eliminaLead, modificaLead } from '@/app/(app)/leads/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useLingua } from '@/components/i18n/lingua-provider'
import { cn } from '@/lib/utils'
import { FONTI } from '@/lib/validation/call'
import type { Lingua } from '@/lib/i18n/lingua'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { FOGLIO_LEAD } from '@/lib/i18n/testi/pipeline'
import {
  STATI_LEAD,
  modificaLeadSchema,
  type ModificaLeadInput,
  type StatoLead,
} from '@/lib/validation/lead'

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

function useAggiornaStato(leadId: string, nome: string, stato: StatoLead, lingua: Lingua) {
  const t = FOGLIO_LEAD[lingua]
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
        toast.error(t.connessione)
        return
      }
      if (esito.ok) {
        toast.success(t.fatto(nome, ETICHETTE[lingua].statoLead[nuovo]))
        dopo?.()
      } else {
        toast.error(traduciErrore(esito.errore, lingua))
      }
    })
  }

  return { mostrato, inCorso, cambia }
}

/**
 * The pipeline card: header (server-rendered children) with the status badge
 * beside the name. Manual by decision (CLAUDE.md section 8): nothing moves by
 * itself, but a mismatch with the last call is surfaced with the one action
 * that resolves it.
 */
export function StatoLeadArea({
  leadId,
  nome,
  stato,
  suggerimento,
  dati,
  titolo,
  eliminabile = false,
  lingua = 'it',
  children,
}: {
  leadId: string
  nome: string
  stato: StatoLead
  suggerimento: Suggerimento | null
  /** Present when the viewer may correct the lead (admin, owning setter). */
  dati: Omit<ModificaLeadInput, 'id'> | null
  /** The name: shares its line with the status, the details below get the full width. */
  titolo: ReactNode
  /** Admin: the lead can be deleted, with its calls. */
  eliminabile?: boolean
  /** The page's language (1.53.0): the status read on the card and its sheet. */
  lingua?: Lingua
  children: ReactNode
}) {
  const { mostrato, inCorso, cambia } = useAggiornaStato(leadId, nome, stato, lingua)
  const t = FOGLIO_LEAD[lingua]
  const [aperto, setAperto] = useState(false)
  const [vista, setVista] = useState<'stato' | 'dati'>('stato')
  const { Icona, tono } = ASPETTO[mostrato]
  // once the suggested state is reached, the hint has done its job
  const attivo = suggerimento && !(suggerimento.tipo === 'stato' && suggerimento.stato === mostrato)

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{titolo}</div>

        <span
          className={cn('-mt-3 inline-flex h-11 shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap', tono)}
          data-testid="stato-lead"
        >
          {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Icona className="size-4" aria-hidden="true" />}
          {ETICHETTE[lingua].statoLead[mostrato]}
        </span>

        <Sheet
          open={aperto}
          onOpenChange={(v) => {
            setAperto(v)
            if (!v) setVista('stato')
          }}
        >
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.cambiaStato(nome)}
                className="-mt-3 -mr-1 size-11 shrink-0 text-muted-foreground"
              />
            }
          >
            <Pencil className="size-4" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <SheetHeader>
              <SheetTitle>{nome}</SheetTitle>
              <SheetDescription>
                {vista === 'stato' ? t.descrizioneStato : t.descrizioneDati}
              </SheetDescription>
            </SheetHeader>
            {vista === 'stato' ? (
              <div className="space-y-3 px-4">
                <div role="radiogroup" aria-label={t.statoDi(nome)} className="grid grid-cols-2 gap-2">
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
                        {ETICHETTE[lingua].statoLead[s]}
                      </button>
                    )
                  })}
                </div>
                {dati ? (
                  <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setVista('dati')}>
                    <Pencil className="size-4" aria-hidden="true" />
                    {t.modificaDati}
                  </Button>
                ) : null}
              </div>
            ) : dati ? (
              <div className="space-y-2 px-4">
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
                  onClick={() => setVista('stato')}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  {t.stato}
                </button>
                <FormLead id={leadId} dati={dati} onSalvato={() => setAperto(false)} />
                {eliminabile ? (
                  <div className="border-t border-border pt-4">
                    <Elimina
                      etichetta={t.elimina}
                      cosa={nome}
                      fatto={t.eliminato}
                      anteprima={{ tipo: 'lead', id: leadId }}
                      azione={async () => tradotto(await eliminaLead({ id: leadId }), lingua)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
      <div className="-mt-5">{children}</div>

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
    </>
  )
}

function FormLead({
  id,
  dati,
  onSalvato,
}: {
  id: string
  dati: Omit<ModificaLeadInput, 'id'>
  onSalvato: () => void
}) {
  const lingua = useLingua()
  const t = FOGLIO_LEAD[lingua]
  const OPZIONI_FONTE = FONTI.map((f) => ({ valore: f, etichetta: ETICHETTE[lingua].fonte[f] }))
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  const { errore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ModificaLeadInput>({
    resolver: zodResolver(modificaLeadSchema),
    defaultValues: { id, ...dati, instagram_handle: dati.instagram_handle?.replace(/^@/, '') ?? '' },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaLead(valori), t.aggiornato)) onSalvato()
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`l-nome-${id}`}>{t.nome}</Label>
        <Input id={`l-nome-${id}`} className="h-11" aria-invalid={errors.nome ? true : undefined} {...register('nome')} />
        <ErroreCampo id={`l-nome-errore-${id}`} messaggio={tr(errors.nome?.message)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`l-ig-${id}`}>{t.handle}</Label>
        <Input id={`l-ig-${id}`} autoCapitalize="none" autoCorrect="off" className="h-11" {...register('instagram_handle')} />
        <ErroreCampo id={`l-ig-errore-${id}`} messaggio={tr(errors.instagram_handle?.message)} />
      </div>
      <SceltaRapida legenda={t.fonte} opzioni={OPZIONI_FONTE} registrazione={register('fonte')} errore={tr(errors.fonte?.message)} />
      <div className="space-y-1.5">
        <Label htmlFor={`l-note-${id}`}>{t.note}</Label>
        <Textarea id={`l-note-${id}`} rows={3} {...register('note')} />
      </div>
      <ErroreModulo testo={tr(errore ?? undefined) ?? null} />
      <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>
    </form>
  )
}
