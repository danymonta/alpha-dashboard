'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIEI_NUMERI } from '@/lib/i18n/testi/miei-numeri'
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
  lingua = 'it',
}: {
  primi: ReactNode
  /** empty: no button */
  altri: ReactNode[]
  /** how many items the whole list has, for the button */
  totale: number
  className?: string
  lingua?: Lingua
}) {
  const t = MIEI_NUMERI[lingua]
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
            t.mostraMeno
          ) : (
            <span>
              {t.mostraTutte} (<span className="num">{totale}</span>)
            </span>
          )}
          <ChevronDown className={cn('size-4 transition-transform', aperta && 'rotate-180')} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
