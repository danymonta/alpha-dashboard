import { MessageCircle } from 'lucide-react'

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
        'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-input text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        compatto ? 'size-11' : 'px-3',
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {compatto ? null : 'WhatsApp'}
    </a>
  )
}
