'use client'

import { Search, X } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { Input } from '@/components/ui/input'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'

/**
 * «Cerca una persona» (1.71.0): the field above the numbers. Esc and the X
 * clear it; the results are drawn by RecapChat, from the recap on screen.
 */
export function CercaPersona({
  valore,
  onCambia,
}: {
  valore: string
  onCambia: (valore: string) => void
}) {
  const t = INSIGHT_RECAP[useLingua()].cerca
  return (
    <div role="search" className="grid gap-1.5">
      <label htmlFor="cerca-persona" className="text-sm font-medium">
        {t.etichetta}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="cerca-persona"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={valore}
          onChange={(e) => onCambia(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && valore) {
              e.preventDefault()
              onCambia('')
            }
          }}
          placeholder={t.segnaposto}
          className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
          data-testid="cerca-persona"
        />
        {valore ? (
          <button
            type="button"
            onClick={() => {
              onCambia('')
              document.getElementById('cerca-persona')?.focus()
            }}
            className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t.togli}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
