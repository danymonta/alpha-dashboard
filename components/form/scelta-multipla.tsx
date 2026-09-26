'use client'

import { Check } from 'lucide-react'
import { useId } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

import { cn } from '@/lib/utils'

type Props = {
  legenda: string
  opzioni: readonly { valore: string; etichetta: string }[]
  registrazione: UseFormRegisterReturn
  errore?: string
  colonne?: 2 | 3
}

/** Checkbox group drawn as 44px chips; React Hook Form collects the values in an array. */
export function SceltaMultipla({ legenda, opzioni, registrazione, errore, colonne = 3 }: Props) {
  const id = useId()
  return (
    <fieldset aria-describedby={errore ? `${id}-errore` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legenda}</legend>
      <div className={cn('grid gap-2', colonne === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {opzioni.map((o) => (
          <label
            key={o.valore}
            className="group flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-input/30 px-2 text-sm hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/15 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input type="checkbox" value={o.valore} className="sr-only" {...registrazione} />
            <Check className="hidden size-4 group-has-[:checked]:block" aria-hidden="true" />
            {o.etichetta}
          </label>
        ))}
      </div>
      {errore ? (
        <p id={`${id}-errore`} role="alert" className="mt-1.5 text-sm text-status-critical">{errore}</p>
      ) : null}
    </fieldset>
  )
}
