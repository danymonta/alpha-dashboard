'use client'

import { Info } from 'lucide-react'

import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { VoceLegenda } from '@/lib/metriche/legenda'
import { cn } from '@/lib/utils'

/**
 * A number's label with an "i": a tap (or hovering on a desktop) says what it
 * counts, with the words of lib/metriche/legenda. The icon is small, its touch
 * area is 44px.
 */
export function EtichettaConNota({ voce, className }: { voce: VoceLegenda; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {voce.etichetta}
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={150}
          aria-label={`Cosa conta «${voce.etichetta}»`}
          render={
            <button
              type="button"
              className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          }
        >
          <Info className="size-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent side="top" className="w-64">
          <PopoverTitle>{voce.etichetta}</PopoverTitle>
          <PopoverDescription>{voce.spiegazione}</PopoverDescription>
        </PopoverContent>
      </Popover>
    </span>
  )
}
