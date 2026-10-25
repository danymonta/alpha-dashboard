'use client'

import { CircleAlert } from 'lucide-react'
import { useId } from 'react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { ScalaCommento } from '@/components/setter/scala-commento'
import { Textarea } from '@/components/ui/textarea'
import {
  ANCORA_COMMENTO,
  CAMPI_OBBLIGATORI,
  risposteMancanti,
  type CampoObbligatorio,
  type CampoScala,
  type CampoTesto,
} from '@/lib/setting/commento'
import { COMMENTO_GIORNATA } from '@/lib/i18n/testi/commento-giornata'
import { cn } from '@/lib/utils'

export type ValoriCommento = {
  lead_in_target?: string | null
  qualita_conversazioni?: string | null
  cosa_frenava?: string | null
  domande_contenuti?: string | null
  note?: string | null
}

// Where "Da completare" leads: the section of the setter's own report
export { ANCORA_COMMENTO }

/** What the setter's own day says of its comment (statoCommento). */
export type StatoCommento = 'manca' | 'da_completare'

const PILLOLA = {
  da_completare: 'border-status-warning/40 text-status-warning',
  manca: 'border-status-critical/50 text-status-critical',
} satisfies Record<StatoCommento, string>

const HOVER = {
  da_completare: 'group-hover:bg-status-warning/10',
  manca: 'group-hover:bg-status-critical/10',
} satisfies Record<StatoCommento, string>

function paroleDi(t: (typeof COMMENTO_GIORNATA)['it']): Record<StatoCommento, { testo: string; spiegazione: string }> {
  return {
    da_completare: { testo: t.commento.daCompletare, spiegazione: t.commento.daCompletareSpiegazione },
    manca: { testo: t.obbligatorio.manca, spiegazione: t.obbligatorio.mancaSpiegazione },
  }
}

/**
 * "Da completare" (a day before 08/10/2026: the two scales, asked) or "Manca
 * il commento della giornata" (from 08/10/2026: the three answers, required):
 * the setter's own reminder on his own day. Icon and words, never color
 * alone. Never shown to the admin. With `href` it is a link (44px tall) to
 * the questions, and says what is missing.
 */
export function DaCompletare({
  className,
  testId,
  href,
  stato = 'da_completare',
}: {
  className?: string
  testId?: string
  href?: string
  stato?: StatoCommento
}) {
  const id = useId()
  const { testo, spiegazione } = paroleDi(useTesti(COMMENTO_GIORNATA))[stato]
  const classi = cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', PILLOLA[stato])
  const contenuto = (
    <>
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {testo}
    </>
  )
  if (!href) {
    return (
      <span title={spiegazione} data-testid={testId} data-stato={stato} className={cn(classi, 'shrink-0', className)}>
        {contenuto}
      </span>
    )
  }
  return (
    <a
      href={href}
      title={spiegazione}
      aria-describedby={`${id}-perche`}
      data-testid={testId}
      data-stato={stato}
      className={cn(
        'group inline-flex min-h-11 min-w-0 shrink items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {/* on a phone, next to "Salvato alle": the words go on two lines, never out of the bar */}
      <span className={cn(classi, 'min-w-0 text-balance', HOVER[stato])}>{contenuto}</span>
      <span id={`${id}-perche`} className="sr-only">
        {spiegazione}
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
  /**
   * The setter's own screen only: what his day still misses (statoCommento).
   * 'manca' also puts its error under each required answer still missing.
   */
  stato?: StatoCommento | null
  /**
   * The setter's own day from 08/10/2026 (commentoObbligatorio): lead in
   * target, quality of the conversations and what held the leads back say
   * they are required. Never on the admin's sheets: nothing is required there.
   */
  obbligatorio?: boolean
  /** report: the setter's "Oggi", with its cards; foglio: the admin's sheet in Setting */
  variante?: 'report' | 'foglio'
}

/**
 * The four guided answers on a day, with the volumes (lib/setting/commento.ts
 * holds every word): lead in target and quality of the conversations, one tap
 * each, then what held the leads back from booking and what they asked, and
 * "Altre note", the report's note.
 */
export function CommentoReport({
  valori,
  onScala,
  onTesto,
  onFineTesto,
  stato = null,
  obbligatorio = false,
  variante = 'report',
}: Props) {
  const id = useId()
  const t = useTesti(COMMENTO_GIORNATA)
  const report = variante === 'report'
  const richiesta = report && obbligatorio
  // on a day to complete, each required answer still missing says so
  const mancanti = new Set<CampoObbligatorio>(stato === 'manca' ? risposteMancanti(valori) : [])
  const obbligatoria = (campo: string) => richiesta && (CAMPI_OBBLIGATORI as readonly string[]).includes(campo)

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
          {t.commento.titolo}
        </h3>
        {stato ? <DaCompletare testId="da-completare-sezione" stato={stato} /> : null}
      </div>
      <p className={cn('text-xs leading-snug text-muted-foreground', report && 'px-1')}>
        {!report ? t.commento.descrizioneAdmin : richiesta ? t.obbligatorio.descrizione : t.commento.descrizione}
      </p>

      <div className={cn('space-y-4', report && 'rounded-xl bg-card p-3')}>
        {t.scale.map((scala) => (
          <ScalaCommento
            key={scala.campo}
            scala={scala}
            valore={valori[scala.campo]}
            onCambia={(v) => onScala(scala.campo, v)}
            obbligatoria={obbligatoria(scala.campo)}
            errore={mancanti.has(scala.campo) ? t.obbligatorio.errore[scala.campo] : null}
          />
        ))}
      </div>

      <div className={cn('space-y-3', report && 'rounded-xl bg-card p-3')}>
        {t.testi.map((testo) => {
          const errore =
            testo.campo === 'cosa_frenava' && mancanti.has(testo.campo) ? t.obbligatorio.errore.cosa_frenava : null
          const richiesto = obbligatoria(testo.campo)
          return (
            <div key={testo.campo} className="space-y-1.5">
              <label htmlFor={`${id}-${testo.campo}`} className="block text-sm font-medium">
                {testo.domanda}{' '}
                <span className="font-normal text-muted-foreground">
                  ({richiesto ? t.obbligatorio.obbligatoria : t.commento.facoltativo})
                </span>
              </label>
              <Textarea
                id={`${id}-${testo.campo}`}
                value={valori[testo.campo] ?? ''}
                onChange={(e) => onTesto(testo.campo, e.currentTarget.value)}
                onBlur={onFineTesto}
                placeholder={testo.placeholder}
                maxLength={testo.massimo}
                rows={2}
                aria-required={richiesto || undefined}
                aria-invalid={errore ? true : undefined}
                aria-describedby={errore ? `${id}-${testo.campo}-errore` : undefined}
              />
              {errore ? (
                <p
                  id={`${id}-${testo.campo}-errore`}
                  className="flex items-start gap-1.5 text-xs text-status-critical"
                  data-testid={`errore-${testo.campo}`}
                >
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  {errore}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
