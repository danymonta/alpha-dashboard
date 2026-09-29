'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A list that opens short on the phone: the first items, then "Mostra tutte
 * (N)". The items are rendered on the server and only shown or left out here.
 */
export function MostraTutte({
  primi,
  altri,
  totale,
  className,
}: {
  primi: ReactNode
  /** empty: no button */
  altri: ReactNode[]
  /** how many items the whole list has, for the button */
  totale: number
  className?: string
}) {
  const id = useId()
  const [aperta, setAperta] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)

  return (
    <div className="space-y-3">
      <ul id={id} className={className}>
        {primi}
        {aperta ? altri : null}
      </ul>
      {altri.length > 0 ? (
        <Button
          ref={bottone}
          type="button"
          variant="outline"
          className="h-11 w-full"
          aria-expanded={aperta}
          aria-controls={id}
          onClick={() => {
            setAperta(!aperta)
            // closing a long list: keep the button where the thumb is
            if (aperta) requestAnimationFrame(() => bottone.current?.scrollIntoView({ block: 'nearest' }))
          }}
        >
          {/* one span: the button's flex gap would split "(21)" */}
          {aperta ? (
            'Mostra meno'
          ) : (
            <span>
              Mostra tutte (<span className="num">{totale}</span>)
            </span>
          )}
          <ChevronDown className={cn('size-4 transition-transform', aperta && 'rotate-180')} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
