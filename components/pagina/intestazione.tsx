import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  titolo: string
  /** A sentence; may hold a link to the sibling page. */
  descrizione?: ReactNode
  azione?: ReactNode
  /** Detail and settings pages: the way up, above the title. */
  indietro?: { href: string; etichetta: string }
}

export function IntestazionePagina({ titolo, descrizione, azione, indietro }: Props) {
  return (
    <div className="mb-6 space-y-1">
      {indietro ? (
        // ghost link: -ml-2 puts the chevron on the content edge, min-h-11 keeps the 44px target
        <Link
          href={indietro.href}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {indietro.etichetta}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* min-w-0 and break-words: a title written by someone (a content's Name, a pasted link)
            wraps inside the screen, never widens the page */}
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-xl font-semibold break-words md:text-2xl">{titolo}</h1>
          {descrizione ? <p className="text-sm text-muted-foreground">{descrizione}</p> : null}
        </div>
        {azione}
      </div>
    </div>
  )
}
