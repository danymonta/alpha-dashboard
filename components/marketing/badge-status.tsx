import { Pillola } from '@/components/marketing/pillola'
import { COLORE_STATUS, ETICHETTA_STATUS, type StatusContenuto } from '@/lib/marketing/etichette'

/** The Name of a content in a list: a Canceled one reads struck through and muted. */
export function classeNome(stato: StatusContenuto): string {
  return stato === 'canceled' ? 'text-muted-foreground line-through' : ''
}

/**
 * The Status of a content as Notion shows it (21/10/2026): a pill with a dot
 * of the Status's colour (Not started grey, To be recorded blue, To be edited
 * purple, To be posted orange, Posted green, Canceled red) and always its name,
 * so it never reads by colour alone.
 */
export function BadgeStatus({ stato, className }: { stato: StatusContenuto; className?: string }) {
  // the labels are short (at most "To be recorded"): never cut
  return <Pillola nome={ETICHETTA_STATUS[stato]} colore={COLORE_STATUS[stato]} punto className={className} />
}
