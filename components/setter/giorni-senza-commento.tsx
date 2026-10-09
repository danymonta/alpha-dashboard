import { CircleAlert } from 'lucide-react'
import Link from 'next/link'

import { etichettaGiornoBreve } from '@/lib/date'
import { ANCORA_COMMENTO, COMMENTO_OBBLIGATORIO } from '@/lib/setting/commento'

type Props = {
  /** His days without the comment, oldest first, at most GIORNI_SENZA_COMMENTO_MAX (the open one aside). */
  giorni: string[]
  /** How many in all, the open one aside. */
  totale: number
  oggi: string
}

/**
 * On top of the setter's "Oggi": his other days from 08/10/2026 still without
 * the required comment of the day (Dany, 08/10/2026: "deve lui sempre
 * lasciare un commento della giornata"), each a link to its questions, then
 * "e altri N giorni". His own reminder on his own screen: never the admin's,
 * never a list of a person for someone else (CLAUDE.md section 17). Nothing
 * when there is none. Icon and words, never color alone; links 44 px.
 */
export function GiorniSenzaCommento({ giorni, totale, oggi }: Props) {
  if (giorni.length === 0) return null
  const altri = totale - giorni.length
  return (
    <nav
      aria-labelledby="giorni-senza-commento-titolo"
      className="mb-4 rounded-xl border border-status-critical/40 px-3 py-2 text-sm"
      data-testid="giorni-senza-commento"
    >
      <p id="giorni-senza-commento-titolo" className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
        {COMMENTO_OBBLIGATORIO.giorni}
      </p>
      <ul className="-mx-1 flex flex-wrap items-center">
        {giorni.map((giorno) => (
          <li key={giorno}>
            <Link
              href={`${giorno === oggi ? '/today' : `/today?data=${giorno}`}#${ANCORA_COMMENTO}`}
              className="num inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 underline underline-offset-4 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {etichettaGiornoBreve(giorno, oggi)}
            </Link>
          </li>
        ))}
        {altri > 0 ? (
          <li className="px-1 text-muted-foreground" data-testid="giorni-senza-commento-altri">
            {COMMENTO_OBBLIGATORIO.altri(altri)}
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
