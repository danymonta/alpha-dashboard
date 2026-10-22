'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarRange, Check, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, FoglioModifica } from '@/components/form/foglio-modifica'
import { IndicatoreLink } from '@/components/shell/link-riga'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ORIZZONTE_MESI,
  aggiungiMesiData,
  hrefPeriodo,
  presetPeriodi,
  puoAndareAvanti,
  schemaIntervallo,
  type IntervalloInput,
  type Periodo,
} from '@/lib/periodo'
import { cn } from '@/lib/utils'

type Props = {
  periodo: Periodo
  /** Today in Europe/Rome, from the server: presets and limits depend on it. */
  oggi: string
  percorso: string
  /** Other query params to keep while changing period (filters, tabs). */
  parametri?: Record<string, string | undefined>
  /** False on a page that shows the period alone: the sheet promises no comparison. */
  confronto?: boolean
  className?: string
}

const CLASSI_FRECCIA =
  'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

/** How long a quick choice of period may show its spinner without arriving. */
const ATTESA_MASSIMA_MS = 15_000

/**
 * Month arrows plus a "Periodo" sheet with quick choices and a custom range.
 * With a range active the arrows move it by its own length (lib/periodo.ts).
 * Everything lives in the URL: the page reads it back with leggiPeriodo.
 */
export function SelettorePeriodo({ periodo, oggi, percorso, parametri, confronto = true, className }: Props) {
  const unMese = periodo.mese !== null
  const successivo = puoAndareAvanti(periodo, oggi)

  return (
    // -ml-3: the chevron glyph (not its 44px hit area) lines up with the content edge
    <nav aria-label="Scegli il periodo" className={cn('-ml-3 flex items-center gap-1', className)}>
      <Link
        href={hrefPeriodo(percorso, periodo.precedente, parametri)}
        aria-label={unMese ? 'Mese precedente' : 'Periodo precedente'}
        className={CLASSI_FRECCIA}
      >
        <IndicatoreLink className="size-5" riposo={<ChevronLeft className="size-5" />} />
      </Link>

      <FoglioPeriodo periodo={periodo} oggi={oggi} percorso={percorso} parametri={parametri} confronto={confronto} />

      {successivo ? (
        <Link
          href={hrefPeriodo(percorso, periodo.successivo, parametri)}
          aria-label={unMese ? 'Mese successivo' : 'Periodo successivo'}
          className={CLASSI_FRECCIA}
        >
          <IndicatoreLink className="size-5" riposo={<ChevronRight className="size-5" />} />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${CLASSI_FRECCIA} opacity-30 hover:bg-transparent`}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  )
}

function FoglioPeriodo({ periodo, oggi, percorso, parametri, confronto }: Omit<Props, 'className'>) {
  const id = useId()
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [inCorso, avvia] = useTransition()
  // A quick choice closes the sheet at once and the page stays as it is until the
  // new period arrives: the trigger says it is on its way (the period it left from,
  // so the new one ends it by itself)
  const daQui = `${periodo.da}/${periodo.a}`
  const [partitoDa, setPartitoDa] = useState<string | null>(null)
  const inViaggio = inCorso || partitoDa === daQui
  // a navigation that never arrives (cancelled by another tap) does not keep the
  // spinner: after a while the trigger is itself again
  useEffect(() => {
    if (partitoDa === null) return
    const t = setTimeout(() => setPartitoDa(null), ATTESA_MASSIMA_MS)
    return () => clearTimeout(t)
  }, [partitoDa])
  const preset = presetPeriodi(oggi)
  const attivo = preset.find((p) => p.da === periodo.da && p.a === periodo.a)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IntervalloInput>({
    resolver: zodResolver(schemaIntervallo(oggi)),
    defaultValues: { da: periodo.da, a: periodo.a },
  })

  const invia = handleSubmit((valori) => {
    // the sheet closes once the new period has rendered
    avvia(() => {
      router.push(hrefPeriodo(percorso, valori, parametri))
      setAperto(false)
    })
  })

  const errore = errors.da?.message ?? errors.a?.message

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        // the page may have moved to another period since the last opening
        if (v) reset({ da: periodo.da, a: periodo.a })
      }}
      trigger={
        <Button
          type="button"
          variant="outline"
          aria-label={`Periodo: ${periodo.etichetta}`}
          aria-busy={inViaggio || undefined}
          data-testid="etichetta-periodo"
          className="h-11 min-w-36 shrink gap-2 px-3"
        />
      }
      contenutoTrigger={
        <>
          {inViaggio ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="num min-w-0 truncate">{periodo.etichetta}</span>
        </>
      }
      titolo="Periodo"
      descrizione={
        confronto
          ? 'Scegli un periodo pronto o due date. I numeri si confrontano con il periodo precedente di pari durata.'
          : 'Scegli un periodo pronto o due date.'
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-sm">
          <dt className="text-muted-foreground">In uso</dt>
          <dd className="num font-medium">{periodo.etichetta}</dd>
          {confronto ? (
            <>
              <dt className="text-muted-foreground">Confronto</dt>
              <dd className="num">{periodo.precedente.etichetta}</dd>
            </>
          ) : null}
        </dl>

        <section aria-labelledby={`${id}-rapide`} className="space-y-2">
          <h3 id={`${id}-rapide`} className="text-sm font-medium">
            Scelte rapide
          </h3>
          <ul className="grid grid-cols-2 gap-2">
            {preset.map((p) => {
              const selezionato = p === attivo
              return (
                <li key={p.chiave}>
                  <Link
                    href={hrefPeriodo(percorso, p, parametri)}
                    aria-current={selezionato ? 'true' : undefined}
                    onClick={() => {
                      setAperto(false)
                      if (!selezionato) setPartitoDa(daQui)
                    }}
                    className={cn(
                      'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-center text-sm leading-tight transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      selezionato
                        ? 'border-selezione bg-selezione text-selezione-foreground'
                        : 'border-input bg-input/30 hover:bg-accent',
                    )}
                  >
                    {selezionato ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                    {p.etichetta}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <form onSubmit={invia} noValidate className="space-y-3" aria-labelledby={`${id}-personalizzato`}>
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${id}-personalizzato`} className="text-sm font-medium">
              Personalizzato
            </h3>
            {attivo ? null : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden="true" />
                In uso
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-da`}>Da</Label>
              <Input
                id={`${id}-da`}
                type="date"
                max={aggiungiMesiData(oggi, ORIZZONTE_MESI)}
                className="num h-11"
                aria-invalid={errors.da ? true : undefined}
                aria-describedby={errore ? `${id}-errore` : undefined}
                {...register('da')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-a`}>A</Label>
              <Input
                id={`${id}-a`}
                type="date"
                max={aggiungiMesiData(oggi, ORIZZONTE_MESI)}
                className="num h-11"
                aria-invalid={errors.a ? true : undefined}
                aria-describedby={errore ? `${id}-errore` : undefined}
                {...register('a')}
              />
            </div>
          </div>
          <ErroreCampo id={`${id}-errore`} messaggio={errore} />
          <BottoneSalva inCorso={inCorso}>Mostra il periodo</BottoneSalva>
        </form>

        <p className="text-xs text-muted-foreground">
          {confronto
            ? 'Mesi interi si confrontano con gli stessi mesi prima (luglio–settembre con aprile–giugno); le altre date con lo stesso numero di giorni subito prima. Massimo 3 anni.'
            : 'Un periodo copre al massimo 3 anni.'}
        </p>
      </div>
    </FoglioModifica>
  )
}
