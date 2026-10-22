'use client'

import { Moon, Sun } from 'lucide-react'

import { useTema } from '@/components/tema/tema-provider'
import { cn } from '@/lib/utils'

/**
 * The quick switch of the top bar: one tap goes to the other theme (from «Sistema» too:
 * to the opposite of what the page shows now). The icon is where the tap leads, the name
 * says it. The three-way choice, with «Sistema», is in Profilo.
 */
export function BottoneTema({ className }: { className?: string }) {
  const { chiara, imposta } = useTema()
  return (
    <button
      type="button"
      data-testid="bottone-tema"
      aria-label={chiara ? 'Passa al tema scuro' : 'Passa al tema chiaro'}
      onClick={() => imposta(chiara ? 'scuro' : 'chiaro')}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      {chiara ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />}
    </button>
  )
}
