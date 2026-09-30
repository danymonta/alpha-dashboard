'use client'

import { CircleAlert } from 'lucide-react'
import { useId } from 'react'

import { ScalaCommento } from '@/components/setter/scala-commento'
import { Textarea } from '@/components/ui/textarea'
import {
  COMMENTO,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  type CampoScala,
  type CampoTesto,
} from '@/lib/setting/commento'
import { cn } from '@/lib/utils'

export type ValoriCommento = {
  lead_in_target?: string | null
  qualita_conversazioni?: string | null
  cosa_frenava?: string | null
  domande_contenuti?: string | null
  note?: string | null
}

/** Where "Da completare" leads: the section of the setter's own report. */
export const ANCORA_COMMENTO = 'commento-giornata'

const PILLOLA =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-status-warning/40 px-2 py-0.5 text-xs font-medium text-status-warning'

/**
 * "Da completare": the setter's own reminder on his own day. Icon and words,
 * never color alone. Never shown to the admin, never counted anywhere. With
 * `href` it is a link (44px tall) to the questions, and says what is missing.
 */
export function DaCompletare({ className, testId, href }: { className?: string; testId?: string; href?: string }) {
  const id = useId()
  const contenuto = (
    <>
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {COMMENTO.daCompletare}
    </>
  )
  if (!href) {
    return (
      <span title={COMMENTO.daCompletareSpiegazione} data-testid={testId} className={cn(PILLOLA, className)}>
        {contenuto}
      </span>
    )
  }
  return (
    <a
      href={href}
      title={COMMENTO.daCompletareSpiegazione}
      aria-describedby={`${id}-perche`}
      data-testid={testId}
      className={cn(
        'group inline-flex min-h-11 shrink-0 items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <span className={cn(PILLOLA, 'group-hover:bg-status-warning/10')}>{contenuto}</span>
      <span id={`${id}-perche`} className="sr-only">
        {COMMENTO.daCompletareSpiegazione}
      </span>
    </a>
  )
}

type Props = {
  valori: ValoriCommento
  onScala: (campo: CampoScala, valore: string | null) => void
  onTesto: (campo: CampoTesto, testo: string) => void
  /** Leaving a text: the report form saves right away */
  onFineTesto?: () => void
  /** The setter's own screen only: the day has activity and a scale is still empty */
  daCompletare?: boolean
  /** report: the setter's "Oggi", with its cards; foglio: the admin's sheet in Setting */
  variante?: 'report' | 'foglio'
}

/**
 * The four guided answers on a day, with the volumes (lib/setting/commento.ts
 * holds every word): lead in target and quality of the conversations, one tap
 * each, then what held the leads back from booking and what they asked, and
 * "Altre note", the report's note.
 */
export function CommentoReport({ valori, onScala, onTesto, onFineTesto, daCompletare = false, variante = 'report' }: Props) {
  const id = useId()
  const report = variante === 'report'

  return (
    <section
      aria-labelledby={`${id}-titolo`}
      // the setter's "Oggi": "Da completare" leads here, clear of the two sticky bars
      id={report ? ANCORA_COMMENTO : undefined}
      className={cn('space-y-2', report && 'scroll-mt-32 md:scroll-mt-16')}
      data-testid="commento-giornata"
    >
      {/* fixed height: the badge comes and goes without moving what is below */}
      <div className={cn('flex min-h-6 items-center justify-between gap-2', report && 'px-1')}>
        <h3
          id={`${id}-titolo`}
          className={report ? 'text-xs font-medium tracking-wide text-muted-foreground uppercase' : 'text-sm font-medium'}
        >
          {COMMENTO.titolo}
        </h3>
        {daCompletare ? <DaCompletare testId="da-completare-sezione" /> : null}
      </div>
      <p className={cn('text-xs leading-snug text-muted-foreground', report && 'px-1')}>
        {report ? COMMENTO.descrizione : COMMENTO.descrizioneAdmin}
      </p>

      <div className={cn('space-y-4', report && 'rounded-xl bg-card p-3')}>
        {SCALE_COMMENTO.map((scala) => (
          <ScalaCommento
            key={scala.campo}
            scala={scala}
            valore={valori[scala.campo]}
            onCambia={(v) => onScala(scala.campo, v)}
          />
        ))}
      </div>

      <div className={cn('space-y-3', report && 'rounded-xl bg-card p-3')}>
        {TESTI_COMMENTO.map((t) => (
          <div key={t.campo} className="space-y-1.5">
            <label htmlFor={`${id}-${t.campo}`} className="block text-sm font-medium">
              {t.domanda} <span className="font-normal text-muted-foreground">({COMMENTO.facoltativo})</span>
            </label>
            <Textarea
              id={`${id}-${t.campo}`}
              value={valori[t.campo] ?? ''}
              onChange={(e) => onTesto(t.campo, e.currentTarget.value)}
              onBlur={onFineTesto}
              placeholder={t.placeholder}
              maxLength={t.massimo}
              rows={2}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
