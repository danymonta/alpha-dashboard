'use client'

import { useTransition } from 'react'

import { impostaLingua } from '@/app/actions/lingua'
import { Bandiera } from '@/components/i18n/bandiera'
import { useLingua } from '@/components/i18n/lingua-provider'
import type { Lingua } from '@/lib/i18n/lingua'
import { SHELL } from '@/lib/i18n/testi/shell'
import { cn } from '@/lib/utils'

/**
 * The flag of the top bar (1.53.0, Dany: «con la bandierina da qualche parte»), next to
 * the theme's sun and moon, for every role: the flag and the code of the page's language
 * (never the flag alone), and a name that says where the tap leads. One tap passes to the
 * other language: the cookie is written by the server, and the page comes back in it.
 */
export function BottoneLingua({ className }: { className?: string }) {
  const lingua = useLingua()
  const [inCorso, avvia] = useTransition()
  const t = SHELL[lingua].lingua
  const prossima: Lingua = lingua === 'it' ? 'en' : 'it'

  return (
    <button
      type="button"
      data-testid="bottone-lingua"
      aria-label={t.nome}
      aria-busy={inCorso || undefined}
      disabled={inCorso}
      onClick={() => avvia(() => impostaLingua(prossima))}
      className={cn(
        'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
        className,
      )}
    >
      <Bandiera lingua={lingua} />
      <span aria-hidden="true">{t.codice}</span>
    </button>
  )
}
