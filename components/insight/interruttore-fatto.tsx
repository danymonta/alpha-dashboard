'use client'

import { CircleCheck } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { useFatti } from '@/components/insight/fatti'
import { Switch } from '@/components/ui/switch'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { cn } from '@/lib/utils'

/**
 * «Fatto» / «Da fare» on a lead's card, as the artifact: a switch in a 44 px
 * label, the word beside it (with an icon when done: never colour alone) and
 * «Non salvato, riprova» for 3 seconds when the write fails.
 */
export function InterruttoreFatto({ chiave, chi }: { chiave: string; chi: string }) {
  const { fatto, segna, inErrore, solaLettura } = useFatti()
  const t = INSIGHT_RECAP[useLingua()]
  const FATTO = t.fatto
  const on = fatto(chiave)
  const errore = inErrore(chiave)

  return (
    <label className={cn('inline-flex min-h-11 items-center gap-2', solaLettura ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <Switch
        checked={on}
        disabled={solaLettura}
        aria-label={t.nomeFatto(chi)}
        onCheckedChange={(valore) => segna(chiave, valore, chi)}
        className="data-checked:bg-status-ok"
      />
      {errore ? (
        <span className="text-xs font-medium text-rosso-testo">{FATTO.nonSalvato}</span>
      ) : (
        <span
          data-fatto={on}
          className="inline-flex min-w-14 items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase data-[fatto=true]:text-status-ok"
        >
          {on ? <CircleCheck className="size-3.5" aria-hidden="true" /> : null}
          {on ? FATTO.fatto : FATTO.daFare}
        </span>
      )}
    </label>
  )
}

/** «3/12 fatte» of a group (none: nothing; all: with the icon, ok tone). Never per person. */
export function ConteggioFatte({ chiavi }: { chiavi: readonly string[] }) {
  const { fatto } = useFatti()
  const t = INSIGHT_RECAP[useLingua()]
  const conChiave = chiavi.filter(Boolean)
  const fatte = conChiave.filter(fatto).length
  if (!fatte) return null
  const tutte = fatte === conChiave.length
  return (
    <span
      data-testid="conteggio-fatte"
      className={cn('num inline-flex items-center gap-1 text-xs', tutte ? 'text-status-ok' : 'text-muted-foreground')}
    >
      {tutte ? <CircleCheck className="size-3.5" aria-hidden="true" /> : null}
      {t.contaFatte(fatte, conChiave.length)}
    </span>
  )
}
