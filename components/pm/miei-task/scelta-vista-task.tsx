'use client'

import { Columns3, List, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { useLingua } from '@/components/i18n/lingua-provider'
import { BACHECA_TASK } from '@/lib/i18n/testi/task'
import { cookieVistaTask, type VistaTask } from '@/lib/miei-task'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaTask; Icona: LucideIcon }[] = [
  { valore: 'bacheca', Icona: Columns3 },
  { valore: 'elenco', Icona: List },
]

function ricorda(vista: VistaTask) {
  try {
    document.cookie = cookieVistaTask(vista, window.location.protocol === 'https:')
  } catch {
    // cookies blocked: the address still says the view
  }
}

/**
 * «Bacheca | Elenco» on /task (1.75.0): two links, so the view lives in the
 * address (?vista=elenco); the tap also remembers it in a cookie of this
 * browser, and /task without ?vista opens the one chosen last.
 */
export function SceltaVistaTask({ vista, completati }: { vista: VistaTask; completati?: string }) {
  const t = BACHECA_TASK[useLingua()]
  function href(valore: VistaTask) {
    const cerca = new URLSearchParams()
    cerca.set('vista', valore)
    if (completati) cerca.set('completati', completati)
    return `/task?${cerca.toString()}`
  }
  return (
    <div role="group" aria-label={t.vista} className="inline-flex">
      {VISTE.map(({ valore, Icona }, i) => {
        const attiva = valore === vista
        return (
          <Link
            key={valore}
            href={href(valore)}
            scroll={false}
            aria-current={attiva ? 'page' : undefined}
            onClick={() => ricorda(valore)}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 border px-3 text-sm transition-colors focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              i === 0 ? 'rounded-l-lg' : '-ml-px rounded-r-lg',
              attiva
                ? 'z-[1] border-foreground/30 bg-accent font-medium text-foreground'
                : 'border-input bg-input/30 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icona className="size-4" aria-hidden="true" />
            {t.viste[valore]}
          </Link>
        )
      })}
    </div>
  )
}
