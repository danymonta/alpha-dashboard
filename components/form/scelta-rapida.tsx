'use client'

import { useId, type ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

import { cn } from '@/lib/utils'

type Opzione = { valore: string; etichetta: ReactNode; disabilitata?: boolean }

type Props = {
  legenda: string
  opzioni: readonly Opzione[]
  registrazione: UseFormRegisterReturn
  errore?: string
  aiuto?: string
  colonne?: 2 | 3 | 6
  /**
   * The value the form holds, when it may be a number (a radio's value is always a string, and
   * react-hook-form ticks a radio only when the two are the same): the button shows it chosen.
   */
  scelto?: string
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
  aiuto,
  colonne = 3,
  scelto,
}: Props) {
  const id = useId()

  return (
    <fieldset aria-describedby={errore ? `${id}-errore` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legenda}</legend>
      <div
        className={cn(
          'grid gap-2',
          colonne === 2 ? 'grid-cols-2' : colonne === 6 ? 'grid-cols-6' : 'grid-cols-3',
        )}
      >
        {opzioni.map((opzione) => (
          <label
            key={opzione.valore}
            className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border border-input bg-input/30 px-2 py-1.5 text-center text-sm leading-tight transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              value={opzione.valore}
              className="sr-only"
              disabled={opzione.disabilitata}
              {...registrazione}
              {...(scelto === undefined ? {} : { checked: opzione.valore === scelto })}
            />
            {opzione.etichetta}
          </label>
        ))}
      </div>
      {aiuto ? <p className="mt-1.5 text-xs text-muted-foreground">{aiuto}</p> : null}
      {errore ? (
        <p id={`${id}-errore`} role="alert" className="mt-1.5 text-sm text-status-critical">
          {errore}
        </p>
      ) : null}
    </fieldset>
  )
}
