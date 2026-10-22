import { totalePromemoria, type Promemoria } from '@/lib/nav'
import { cn } from '@/lib/utils'

type Props = {
  numero: number
  /** On the active item (bordeaux background) the colours swap, so it stays readable. */
  attiva?: boolean
  /**
   * "conteggio-esiti" (outcomes to record), "conteggio-da-approvare" (days to
   * decide), "conteggio-commenti" (days without the comment),
   * "conteggio-post-da-collegare" (posts to link, the menu item's),
   * "conteggio-altro" (more than one of them).
   */
  testId?: string
  className?: string
}

/**
 * A number next to a navigation item: the person's own past calls still
 * without an outcome (07/10/2026), the setters' days from Instagram still to
 * decide (08/10/2026), or the setter's own days still without the required
 * comment (08/10/2026). The digits are for the eyes: the item says it in its
 * name, "Le mie call, 2 esiti da registrare", "Setter, 1 giornata da
 * approvare", "Oggi, 2 commenti da scrivere" (nomeConPromemoria). Nothing at
 * zero. Only the person who has something to do sees it, never an alert
 * (CLAUDE.md section 17).
 */
export function ConteggioEsiti({ numero, attiva = false, testId = 'conteggio-esiti', className }: Props) {
  if (numero <= 0) return null
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className={cn(
        'num inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs leading-none font-semibold',
        attiva ? 'bg-primary-foreground text-primary' : 'bg-primary-light text-primary-foreground',
        className,
      )}
    >
      {numero > 99 ? '99+' : numero}
    </span>
  )
}

/** The badge of an item: one count, or more ("Altro", the setter's "Oggi"): the digits add up, the name says each. */
export function ConteggioPromemoria({
  promemoria,
  attiva,
  className,
}: {
  promemoria: Promemoria
  attiva?: boolean
  className?: string
}) {
  const tipi = [
    promemoria.esiti > 0 ? 'conteggio-esiti' : null,
    promemoria.daApprovare > 0 ? 'conteggio-da-approvare' : null,
    promemoria.commenti > 0 ? 'conteggio-commenti' : null,
  ].filter((tipo) => tipo !== null)
  const testId = tipi.length > 1 ? 'conteggio-altro' : (tipi[0] ?? 'conteggio-esiti')
  return <ConteggioEsiti numero={totalePromemoria(promemoria)} attiva={attiva} testId={testId} className={className} />
}
