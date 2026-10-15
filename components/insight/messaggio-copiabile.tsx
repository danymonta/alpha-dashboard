import { BottoneCopia } from '@/components/insight/bottone-copia'
import { cn } from '@/lib/utils'

/**
 * A message to copy and paste in the DM (suggested message, its alternative,
 * the reply to an objection, the reminder of a call): its eyebrow, «Copia» on
 * the same row (never over the text, as the artifact did on the phone), then
 * the text as written, line breaks kept.
 */
export function MessaggioCopiabile({
  eyebrow,
  testo,
  nomeCopia,
  sullaCard = false,
}: {
  eyebrow: string
  testo: string
  /** the copy button's accessible name, starting with «Copia» */
  nomeCopia: string
  /** on a card marked Fatto the box takes the card's colour, as the artifact */
  sullaCard?: boolean
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5 rounded-lg p-3 text-sm', sullaCard ? 'bg-card' : 'bg-muted')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</span>
        <BottoneCopia testo={testo} nome={nomeCopia} />
      </div>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{testo}</p>
    </div>
  )
}
