'use client'

import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SheetClose } from '@/components/ui/sheet'
import { useTesti } from '@/components/i18n/lingua-provider'
import { ANALISI_REEL } from '@/lib/i18n/testi/analisi-reel'

/**
 * The X of the reel panel: inside the sticky header, above it (the sheet's own
 * X would sit under the header's background). A 44 px target named «Chiudi».
 */
export function ChiudiPannello() {
  const t = useTesti(ANALISI_REEL).pannello
  return (
    <SheetClose render={<Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 z-20 size-11" />}>
      <XIcon className="size-4" aria-hidden="true" />
      <span className="sr-only">{t.chiudi}</span>
    </SheetClose>
  )
}
