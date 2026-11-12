'use client'

import { Check } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { cn } from '@/lib/utils'

export type PassoIndicatore = {
  chiave: string
  titolo: string
  stato: 'fatto' | 'corrente' | 'futuro'
  /** A finished step the admin may go back to: its circle is a button. */
  onVai?: () => void
}

/**
 * The three steps of the wizard, always in view: where you are, what is done, what
 * comes. A line runs under the circles and fills as the steps are done (a transform,
 * never a width: nothing moves around it). Never colour alone: a done step has its
 * check and says «fatto», the current one is `aria-current="step"`.
 */
export function IndicatorePassi({ passi, completo = false }: { passi: readonly PassoIndicatore[]; completo?: boolean }) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua].wizard
  const corrente = passi.findIndex((p) => p.stato === 'corrente')
  // how much of the line is filled: up to the current step, all of it at the summary and after
  const fatti = completo || corrente < 0 ? passi.length - 1 : corrente
  const quota = passi.length > 1 ? fatti / (passi.length - 1) : 1

  return (
    <nav aria-label={t.indicatore} className="vetro rounded-2xl px-2 py-3" data-testid="indicatore-passi">
      <div className="relative">
        {/* the track goes from the centre of the first circle to the centre of the last */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[1.375rem] block h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-border"
          style={{ left: `${50 / passi.length}%`, right: `${50 / passi.length}%` }}
        >
          <span
            className="block h-full origin-left bg-primary transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${quota})` }}
            data-testid="indicatore-avanzamento"
          />
        </span>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${passi.length}, minmax(0, 1fr))` }}>
        {passi.map((passo, i) => {
          const cerchio = (
            <span
              className={cn(
                'num relative flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-300',
                passo.stato === 'fatto' && 'border-primary bg-primary text-primary-foreground',
                passo.stato === 'corrente' && 'glow-primario border-2 border-primary bg-background text-foreground',
                passo.stato === 'futuro' && 'border-border bg-background text-muted-foreground',
              )}
            >
              {passo.stato === 'fatto' ? <Check className="wizard-spunta size-4" aria-hidden="true" /> : i + 1}
            </span>
          )
          const etichetta = (
            <span
              className={cn(
                'text-xs leading-tight',
                passo.stato === 'corrente' ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {passo.titolo}
            </span>
          )
          const nome =
            passo.stato === 'fatto' ? t.passoFatto(passo.titolo) : t.passoDi(i + 1, passi.length, passo.titolo)
          return (
            <li
              key={passo.chiave}
              className="relative flex justify-center"
              aria-current={passo.stato === 'corrente' ? 'step' : undefined}
              data-passo={passo.chiave}
              data-stato={passo.stato}
            >
              {passo.onVai ? (
                <button
                  type="button"
                  onClick={passo.onVai}
                  aria-label={`${nome}. ${t.riepilogo.modifica(passo.titolo)}`}
                  className="flex min-h-11 min-w-11 flex-col items-center gap-1.5 rounded-xl px-2 py-1 text-center outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {cerchio}
                  {etichetta}
                </button>
              ) : (
                <span className="flex min-h-11 flex-col items-center gap-1.5 px-2 py-1 text-center">
                  <span className="sr-only">{nome}</span>
                  <span aria-hidden="true" className="contents">
                    {cerchio}
                    {etichetta}
                  </span>
                </span>
              )}
            </li>
          )
        })}
        </ol>
      </div>
    </nav>
  )
}
