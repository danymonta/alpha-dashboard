'use client'

import { useId } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

import { cn } from '@/lib/utils'

type Opzione = { valore: string; etichetta: string }

type Props = {
  legenda: string
  opzioni: readonly Opzione[]
  registrazione: UseFormRegisterReturn
  errore?: string
  colonne?: 2 | 3
}

/**
 * Radio group drawn as 44px buttons: one tap on a phone instead of opening a
 * dropdown. Native radios underneath, so arrow keys and screen readers work.
 */
export function SceltaRapida({
  legenda,
  opzioni,
  registrazione,
  errore,
  colonne = 3,
}: Props) {
  const id = useId()

  return (
    <fieldset aria-describedby={errore ? `${id}-errore` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legenda}</legend>
      <div className={cn('grid gap-2', colonne === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {opzioni.map((opzione) => (
          <label
            key={opzione.valore}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-input bg-input/30 px-2 text-center text-sm leading-tight transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              value={opzione.valore}
              className="sr-only"
              {...registrazione}
            />
            {opzione.etichetta}
          </label>
        ))}
      </div>
      {errore ? (
        <p id={`${id}-errore`} role="alert" className="mt-1.5 text-sm text-status-critical">
          {errore}
        </p>
      ) : null}
    </fieldset>
  )
}
