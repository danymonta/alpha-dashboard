'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { cn } from '@/lib/utils'

/**
 * Which setter the marketing section reads: everyone together or one person
 * (his reports and the calls he booked). Kept in the URL (?setter=) with the
 * period, so a reload keeps it; the page does not jump back to the top.
 */
export function FiltroSetter({
  valore,
  persone,
  parametri,
  etichetta,
  spiegazione,
  tutti,
}: {
  valore: string | null
  persone: readonly { id: string; nome: string }[]
  /** the period's parameters, kept as they are */
  parametri: Record<string, string>
  etichetta: string
  /** a line under the select: what the choice narrows */
  spiegazione?: string
  tutti: string
}) {
  const router = useRouter()
  const percorso = usePathname()
  const [inCorso, avvia] = useTransition()

  return (
    <div className="w-full space-y-1 sm:w-56">
      <label htmlFor="filtro-setter-commenti" className="block text-xs text-muted-foreground">
        {etichetta}
      </label>
      <select
        id="filtro-setter-commenti"
        value={valore ?? ''}
        aria-describedby={spiegazione ? 'filtro-setter-spiegazione' : undefined}
        aria-busy={inCorso}
        className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
        onChange={(e) => {
          const cerca = new URLSearchParams(parametri)
          const scelto = e.currentTarget.value
          if (scelto) cerca.set('setter', scelto)
          const testo = cerca.toString()
          avvia(() => router.push(testo ? `${percorso}?${testo}` : percorso, { scroll: false }))
        }}
      >
        <option value="">{tutti}</option>
        {persone.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      {spiegazione ? (
        <p id="filtro-setter-spiegazione" className="text-xs leading-snug text-muted-foreground">
          {spiegazione}
        </p>
      ) : null}
    </div>
  )
}
