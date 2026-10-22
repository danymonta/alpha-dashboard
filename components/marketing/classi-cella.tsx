import { Plus } from 'lucide-react'

/** The cell's button: 44 px tall inside the cell's padding, so the table keeps its 960 px. */
export const CLASSE_BOTTONE_CELLA =
  'relative z-10 -mx-1.5 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-transparent px-1.5 text-left transition-colors hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent aria-busy:opacity-70'

/** A card's chip on the phone: 44 px. */
export const CLASSE_CHIP =
  'relative z-10 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-transparent px-2 text-left text-sm transition-colors hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent aria-busy:opacity-70'

/** A property of the panel and of the content's page: Notion's look, no border at rest, still 44 px. */
export const CLASSE_CAMPO =
  'relative z-10 flex min-h-11 w-full min-w-0 items-center gap-1 rounded-lg border border-transparent px-2.5 text-left text-base transition-colors hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent aria-busy:opacity-70 md:text-sm'

/** The "+" of an empty cell: at rest nothing, on the row's hover or focus a muted "+", always with a finger. */
export function PiuVuoto() {
  return (
    <Plus
      className="size-4 text-muted-foreground/60 opacity-0 transition-opacity group-hover/riga:opacity-100 group-focus-within/riga:opacity-100 pointer-coarse:opacity-100"
      aria-hidden="true"
    />
  )
}
