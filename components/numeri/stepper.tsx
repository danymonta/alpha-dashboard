'use client'

import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  etichetta: string
  valore: number
  onCambia: (valore: number) => void
  onFineModifica?: () => void
  massimo?: number
  className?: string
}

/**
 * Counter for the daily report: −1, direct input, +1, +5.
 * Every target is 44px. The input keeps its own text while focused so the
 * setter can clear it and type "35" without fighting a forced "0".
 */
export function Stepper({
  etichetta,
  valore,
  onCambia,
  onFineModifica,
  massimo = 9999,
  className,
}: Props) {
  const id = useId()
  const [testo, setTesto] = useState<string | null>(null)

  const imposta = (n: number) => onCambia(Math.min(massimo, Math.max(0, n)))

  return (
    <div
      role="group"
      aria-labelledby={`${id}-etichetta`}
      className={cn('flex items-center gap-3 py-1.5', className)}
    >
      <label
        id={`${id}-etichetta`}
        htmlFor={`${id}-valore`}
        className="min-w-0 flex-1 text-sm leading-tight"
      >
        {etichetta}
      </label>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="size-11 text-sm"
          onClick={() => imposta(valore - 1)}
          disabled={valore <= 0}
          aria-label={`${etichetta}: meno 1`}
        >
          −1
        </Button>

        <input
          id={`${id}-valore`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={testo ?? String(valore)}
          onFocus={(e) => {
            setTesto(String(valore))
            e.currentTarget.select()
          }}
          onChange={(e) => {
            const cifre = e.currentTarget.value.replace(/\D/g, '').slice(0, 4)
            setTesto(cifre)
            if (cifre !== '') imposta(Number(cifre))
          }}
          onBlur={() => {
            if (testo === '') imposta(0)
            setTesto(null)
            onFineModifica?.()
          }}
          className="num h-11 w-12 rounded-lg border border-input bg-input/30 text-center text-base font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <Button
          type="button"
          variant="secondary"
          className="size-11 text-sm"
          onClick={() => imposta(valore + 1)}
          aria-label={`${etichetta}: più 1`}
        >
          +1
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="size-11 text-sm"
          onClick={() => imposta(valore + 5)}
          aria-label={`${etichetta}: più 5`}
        >
          +5
        </Button>
      </div>
    </div>
  )
}
