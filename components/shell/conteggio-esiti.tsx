import { cn } from '@/lib/utils'

type Props = {
  numero: number
  /** On the active item (bordeaux background) the colours swap, so it stays readable. */
  attiva?: boolean
  className?: string
}

/**
 * The number of the person's own past calls still without an outcome, next to
 * a navigation item (07/10/2026). The digits are for the eyes: the item says it
 * in its name, "Le mie call, 2 esiti da registrare" (nomeConEsiti). Nothing at zero.
 * Only the person who has to record them sees it: never someone else's number,
 * never an alert (CLAUDE.md section 17).
 */
export function ConteggioEsiti({ numero, attiva = false, className }: Props) {
  if (numero <= 0) return null
  return (
    <span
      aria-hidden="true"
      data-testid="conteggio-esiti"
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
