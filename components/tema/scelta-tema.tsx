'use client'

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useId } from 'react'

import { useTema } from '@/components/tema/tema-provider'
import { ETICHETTA_TEMA, TEMI, type Tema } from '@/lib/tema/tema'
import { cn } from '@/lib/utils'

const ICONA: Record<Tema, LucideIcon> = { chiaro: Sun, scuro: Moon, sistema: Monitor }

const DESCRIZIONE: Record<Tema, string> = {
  chiaro: 'Sfondo crema, come un foglio.',
  scuro: 'Quello di sempre.',
  sistema: 'Segue il tema del telefono o del computer.',
}

/**
 * The theme, three choices (Profilo): Chiaro, Scuro, Sistema. It applies at once and is
 * kept on this device, so a phone and a computer can differ.
 */
export function SceltaTema() {
  const { tema, imposta } = useTema()
  const idTitolo = useId()

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 id={idTitolo} className="font-heading text-base font-semibold">
          Tema
        </h2>
        <p className="text-sm text-muted-foreground">Vale solo su questo dispositivo.</p>
      </div>
      <div role="radiogroup" aria-labelledby={idTitolo} className="grid gap-2 sm:grid-cols-3">
        {TEMI.map((t) => {
          const Icona = ICONA[t]
          const scelto = tema === t
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={scelto}
              data-testid={`tema-${t}`}
              onClick={() => imposta(t)}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                scelto ? 'border-selezione bg-selezione text-selezione-foreground' : 'border-input hover:bg-accent',
              )}
            >
              <Icona className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{ETICHETTA_TEMA[t]}</span>
                <span className={cn('block text-xs', scelto ? 'opacity-80' : 'text-muted-foreground')}>
                  {DESCRIZIONE[t]}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
