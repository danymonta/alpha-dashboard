import { totalePromemoria, type Promemoria } from '@/lib/nav'
import { cn } from '@/lib/utils'

type Props = {
  numero: number
  /** On the active item (bordeaux background) the colours swap, so it stays readable. */
  attiva?: boolean
  /** "conteggio-esiti" (outcomes to record), "conteggio-da-approvare" (days to decide), "conteggio-altro". */
  testId?: string
  className?: string
}

/**
 * A number next to a navigation item: the person's own past calls still
 * without an outcome (07/10/2026), or the setters' days from Instagram still
 * to decide (08/10/2026). The digits are for the eyes: the item says it in its
 * name, "Le mie call, 2 esiti da registrare", "Setter, 1 giornata da
 * approvare" (nomeConPromemoria). Nothing at zero. Only the person who has
 * something to do sees it, never an alert (CLAUDE.md section 17).
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

/** The badge of an item: one count, or both on "Altro" (the digits add up, the name says each). */
export function ConteggioPromemoria({
  promemoria,
  attiva,
  className,
}: {
  promemoria: Promemoria
  attiva?: boolean
  className?: string
}) {
  const testId =
    promemoria.esiti > 0 && promemoria.daApprovare > 0
      ? 'conteggio-altro'
      : promemoria.daApprovare > 0
        ? 'conteggio-da-approvare'
        : 'conteggio-esiti'
  return <ConteggioEsiti numero={totalePromemoria(promemoria)} attiva={attiva} testId={testId} className={className} />
}
