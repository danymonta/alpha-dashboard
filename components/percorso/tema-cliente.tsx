'use client'

import { Moon, Sun } from 'lucide-react'

import { useTema } from '@/components/tema/tema-provider'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

/**
 * The quick switch of the theme in the client's area: the same as the team's top bar
 * (components/tema/bottone-tema.tsx), with the client's own Italian words.
 */
export function TemaCliente() {
  const { chiara, imposta } = useTema()
  return (
    <button
      type="button"
      data-testid="bottone-tema"
      aria-label={chiara ? T.temaScuro : T.temaChiaro}
      onClick={() => imposta(chiara ? 'scuro' : 'chiaro')}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {chiara ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />}
    </button>
  )
}
