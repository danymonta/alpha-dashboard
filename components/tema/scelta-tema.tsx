'use client'

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useId } from 'react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { useTema } from '@/components/tema/tema-provider'
import { ACCOUNT } from '@/lib/i18n/testi/account'
import { TEMI, type Tema } from '@/lib/tema/tema'
import { cn } from '@/lib/utils'

const ICONA: Record<Tema, LucideIcon> = { chiaro: Sun, scuro: Moon, sistema: Monitor }


/**
 * The theme, three choices (Profilo): Chiaro, Scuro, Sistema. It applies at once and is
 * kept on this device, so a phone and a computer can differ.
 */
export function SceltaTema() {
  const { tema, imposta } = useTema()
  const idTitolo = useId()
  const t = useTesti(ACCOUNT).tema
  const etichetta: Record<Tema, string> = { chiaro: t.chiaro, scuro: t.scuro, sistema: t.sistema }
  const descrizione: Record<Tema, string> = { chiaro: t.descChiaro, scuro: t.descScuro, sistema: t.descSistema }

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 id={idTitolo} className="font-heading text-base font-semibold">
          {t.titolo}
        </h2>
        <p className="text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <div role="radiogroup" aria-labelledby={idTitolo} className="grid gap-2 sm:grid-cols-3">
        {TEMI.map((valore) => {
          const Icona = ICONA[valore]
          const scelto = tema === valore
          return (
            <button
              key={valore}
              type="button"
              role="radio"
              aria-checked={scelto}
              data-testid={`tema-${valore}`}
              onClick={() => imposta(valore)}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                scelto ? 'border-selezione bg-selezione text-selezione-foreground' : 'border-input hover:bg-accent',
              )}
            >
              <Icona className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{etichetta[valore]}</span>
                <span className={cn('block text-xs', scelto ? 'opacity-80' : 'text-muted-foreground')}>
                  {descrizione[valore]}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
