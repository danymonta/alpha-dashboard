'use client'

import { useId, useTransition } from 'react'

import { impostaLingua } from '@/app/actions/lingua'
import { Bandiera } from '@/components/i18n/bandiera'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LINGUE, type Lingua } from '@/lib/i18n/lingua'
import { SHELL } from '@/lib/i18n/testi/shell'
import { cn } from '@/lib/utils'

/**
 * The language in Profilo (1.53.0): the same choice as the flag of the top bar, with the
 * two languages side by side. Kept on this device, like the theme.
 */
export function SceltaLingua() {
  const lingua = useLingua()
  const t = SHELL[lingua].lingua
  const [inCorso, avvia] = useTransition()
  const idTitolo = useId()
  const descrizione: Record<Lingua, string> = { it: t.descrizioneIt, en: t.descrizioneEn }

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 id={idTitolo} className="font-heading text-base font-semibold">
          {t.titolo}
        </h2>
        <p className="text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <div role="radiogroup" aria-labelledby={idTitolo} aria-busy={inCorso || undefined} className="grid gap-2 sm:grid-cols-2">
        {LINGUE.map((l) => {
          const scelta = lingua === l
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={scelta}
              data-testid={`lingua-${l}`}
              lang={l}
              disabled={inCorso}
              onClick={() => {
                if (!scelta) avvia(() => impostaLingua(l))
              }}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                scelta ? 'border-selezione bg-selezione text-selezione-foreground' : 'border-input hover:bg-accent',
              )}
            >
              <Bandiera lingua={l} className="mt-1" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t[l]}</span>
                <span className={cn('block text-xs', scelta ? 'opacity-80' : 'text-muted-foreground')}>{descrizione[l]}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
