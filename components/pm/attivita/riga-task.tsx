'use client'

import { useEffect, useOptimistic, useRef, useTransition } from 'react'
import { toast } from 'sonner'

import { completaTask } from '@/app/(app)/progetti/[id]/actions'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { puoModificare, useAttivita, type TaskVista } from '@/components/pm/attivita/contesto'
import { DettaglioTask } from '@/components/pm/attivita/dettaglio-task'
import { MetaTask } from '@/components/pm/attivita/meta-task'
import { AvviaTimer } from '@/components/pm/tempo/avvia-timer'
import { Checkbox } from '@/components/ui/checkbox'
import { ATTIVITA } from '@/lib/i18n/testi/attivita'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { cn } from '@/lib/utils'

/**
 * One task: a 44px checkbox to close it, the title opens its sheet, the line
 * below says state, priority, assignee and due date. Sub-tasks nest under it.
 */
export function RigaTask({ task, figli = [] }: { task: TaskVista; figli?: TaskVista[] }) {
  const t = useTesti(ATTIVITA)
  const lingua = useLingua()
  const a = useAttivita()
  const modificabile = puoModificare(a, task)
  // the task a link asked for (05/10/2026): in sight, marked, its sheet open
  const daAprire = a.daAprire === task.id
  const evidenziato = a.evidenziato === task.id
  const riga = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (daAprire) riga.current?.scrollIntoView({ block: 'center' })
  }, [daAprire])
  const [completato, setCompletato] = useOptimistic(task.stato === 'completato')
  const [inCorso, avvia] = useTransition()

  function cambia(valore: boolean) {
    avvia(async () => {
      setCompletato(valore)
      let esito
      try {
        esito = await completaTask({ id: task.id, completato: valore })
      } catch {
        toast.error(traduciErroreProgetti('Connessione assente. Riprova.', lingua))
        return
      }
      if (!esito.ok) toast.error(traduciErroreProgetti(esito.errore, lingua))
      else toast.success(valore ? t.taskCompletato : t.taskRiaperto)
    })
  }

  return (
    <li aria-label={task.titolo} data-testid="task" data-task={task.id}>
      <div
        ref={riga}
        data-evidenziato={evidenziato || undefined}
        className={cn(
          'flex scroll-mt-20 items-start gap-1 pr-2',
          // the row the link brought me to: a tint and a bar on its edge (its open sheet names it)
          evidenziato && 'bg-primary/15 shadow-[inset_3px_0_0_var(--color-primary-light)]',
        )}
      >
        <label
          className={cn(
            'flex size-11 shrink-0 items-center justify-center',
            modificabile ? 'cursor-pointer' : 'cursor-not-allowed',
          )}
        >
          <Checkbox
            checked={completato}
            // Base UI draws a span: the disabled look comes from data-disabled.
            // A dashed border says "not yours to close" without fading it out.
            className="size-5 data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:opacity-60"
            disabled={!modificabile || inCorso}
            onCheckedChange={(v) => cambia(v)}
            aria-label={completato ? t.riapri(task.titolo) : t.completa(task.titolo)}
          />
        </label>
        <div className="min-w-0 flex-1 pb-2.5">
          <DettaglioTask
            task={task}
            trigger={
              <button
                type="button"
                className={cn(
                  'flex min-h-11 w-full items-center rounded-sm py-2 text-left text-sm font-medium break-words hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  completato && 'text-muted-foreground line-through',
                )}
              />
            }
            contenutoTrigger={task.titolo}
            apriSubito={daAprire}
            onChiuso={a.scordaLink}
          />
          <div className="-mt-1.5">
            <MetaTask task={task} membri={a.membri} lingua={lingua} />
          </div>
        </div>
        {/* time is tracked by whoever works on it: every member, on open tasks */}
        {completato ? null : (
          <AvviaTimer progettoId={task.progetto_id} taskId={task.id} titolo={task.titolo} className="shrink-0" lingua={lingua} />
        )}
      </div>
      {figli.length > 0 ? (
        <ul aria-label={t.sottoTaskDi(task.titolo)} className="mb-2 ml-11 border-l border-border pl-1">
          {figli.map((f) => (
            <RigaTask key={f.id} task={f} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
