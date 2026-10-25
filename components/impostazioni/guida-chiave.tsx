import { BookOpen } from 'lucide-react'

import type { ChiaveId } from '@/lib/impostazioni/chiavi'
import type { Lingua } from '@/lib/i18n/lingua'
import { CHIAVI } from '@/lib/i18n/testi/chiavi'

/**
 * The step-by-step guide beside a key (1.38.0): a collapsible panel, closed
 * at first so the page stays about the state. A native <details>: keyboard and
 * screen readers know it, and the summary is a 44 px target.
 */
export function GuidaChiave({ id, lingua = 'it' }: { id: ChiaveId; lingua?: Lingua }) {
  const t = CHIAVI[lingua].guida
  const guida = t.guide[id]
  return (
    <details className="group rounded-lg border border-border" data-testid={`guida-${id}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-medium marker:hidden hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {t.apri}
        <span aria-hidden="true" className="ml-auto text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
        <p className="text-muted-foreground">{guida.aCosaServe}</p>
        <div>
          <p className="font-medium">{t.comeFare}</p>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5">
            {guida.passi.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="font-medium">{t.doveIncollarla}</p>
          <p className="text-muted-foreground">{guida.doveIncollarla}</p>
        </div>
        <div>
          <p className="font-medium">{t.comeCapire}</p>
          <p className="text-muted-foreground">{guida.comeCapireCheFunziona}</p>
        </div>
        <div>
          <p className="font-medium">{t.seScade}</p>
          <p className="text-muted-foreground">{guida.seScade}</p>
        </div>
        <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">{t.nonInChat}</p>
      </div>
    </details>
  )
}
