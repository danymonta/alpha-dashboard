import { MessageCircle } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** "Scrivi su WhatsApp": opens the chat with the message ready. Nothing when there is no number. */
export function BottoneWhatsApp({
  href,
  etichetta,
  compatto = false,
  className,
}: {
  href: string | null
  /** accessible name: "Scrivi a Mario su WhatsApp" */
  etichetta: string
  compatto?: boolean
  className?: string
}) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={etichetta}
      title={etichetta}
      data-testid="whatsapp"
      className={cn(
        // the same look as the outline buttons beside it ("…", "Registra rinnovo")
        buttonVariants({ variant: 'outline' }),
        'h-11 shrink-0 gap-1.5',
        // compact: icon only from md up; on the phone the word says what it is
        compatto ? 'max-md:px-3 md:size-11' : 'px-3',
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {compatto ? <span className="md:sr-only">WhatsApp</span> : 'WhatsApp'}
    </a>
  )
}
