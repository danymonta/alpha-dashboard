'use client'

import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useNavigazioneInsight } from '@/components/insight/navigazione'
import { hrefInsight, type Canale } from '@/lib/insight/canale'
import { etichettaGiornoRecap, GIORNO } from '@/lib/insight/parole'
import { cn } from '@/lib/utils'

/**
 * «Giorno», as the artifact: the days with a recap of the tab, the newest
 * first («giovedì 8 ottobre»), a native select (one tap on a phone). Choosing
 * one opens that recap; the filter starts again from all the chats. Without a
 * recap, disabled with «nessun recap». The day is never remembered: without
 * ?giorno the page opens on the newest.
 */
export function SceltaGiorno({ canale, giorni, giorno }: { canale: Canale; giorni: readonly string[]; giorno: string | null }) {
  const { inAttesa, vai } = useNavigazioneInsight()
  // the day chosen stays on screen while its recap arrives; the address's wins once it is there
  const [mostrato, setMostrato] = useState(giorno)
  const [letto, setLetto] = useState(giorno)
  if (letto !== giorno) {
    setLetto(giorno)
    setMostrato(giorno)
  }

  return (
    <div className="grid w-full min-w-0 gap-1 sm:w-auto">
      <label htmlFor="giorno-recap" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {GIORNO.etichetta}
      </label>
      <div className="flex items-center gap-2">
        <select
          id="giorno-recap"
          className={cn(CLASSE_SELECT, 'num min-w-0 sm:w-60')}
          disabled={!giorni.length}
          value={giorni.length ? (mostrato ?? '') : ''}
          onChange={(e) => {
            setMostrato(e.target.value)
            vai(hrefInsight(canale, e.target.value))
          }}
        >
          {giorni.length ? (
            giorni.map((g) => (
              <option key={g} value={g}>
                {etichettaGiornoRecap(g)}
              </option>
            ))
          ) : (
            <option value="">{GIORNO.nessuno}</option>
          )}
        </select>
        {/* the other recap is on its way: a spinner after 120 ms, at a fixed size, so nothing moves */}
        <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
          {inAttesa ? (
            <span className="indicatore-link inline-flex">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
