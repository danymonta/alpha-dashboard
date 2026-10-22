'use client'

import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useNavigazioneInsight } from '@/components/insight/navigazione'
import { hrefInsight, type Canale } from '@/lib/insight/canale'
import { useLingua } from '@/components/i18n/lingua-provider'
import { GIORNI_EN, MESI_EN } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { INSIGHT } from '@/lib/i18n/testi/insight'
import { etichettaGiornoRecap } from '@/lib/insight/parole'
import { cn } from '@/lib/utils'

/** «Thursday 8 October» in English, the artifact's option otherwise. */
function etichettaGiorno(giorno: string, lingua: Lingua): string {
  if (lingua === 'it') return etichettaGiornoRecap(giorno)
  const [a, m, g] = giorno.split('-').map(Number)
  if (!a || !m || !g) return giorno
  const data = new Date(Date.UTC(a, m - 1, g, 12))
  return `${GIORNI_EN[data.getUTCDay()]} ${g} ${MESI_EN[m - 1]}`
}

/**
 * «Giorno», as the artifact: the days with a recap of the tab, the newest
 * first («giovedì 8 ottobre»), a native select (one tap on a phone). Choosing
 * one opens that recap; the filter starts again from all the chats. Without a
 * recap, disabled with «nessun recap». The day is never remembered: without
 * ?giorno the page opens on the newest.
 */
export function SceltaGiorno({ canale, giorni, giorno }: { canale: Canale; giorni: readonly string[]; giorno: string | null }) {
  const { inAttesa, vai } = useNavigazioneInsight()
  const lingua = useLingua()
  const t = INSIGHT[lingua]
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
        {t.giorno}
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
                {etichettaGiorno(g, lingua)}
              </option>
            ))
          ) : (
            <option value="">{t.giornoNessuno}</option>
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
