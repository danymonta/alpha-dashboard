'use client'

import { Eye } from 'lucide-react'
import { useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { BackendPercorsoProvider, BACKEND_REALE, type BackendPercorso } from '@/components/percorso/backend-percorso'
import { CampoBaseCliente } from '@/components/percorso/campo-base/campo-base'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CAMPO_TEAM } from '@/lib/i18n/testi/campo-base'
import type { CampoBase } from '@/lib/percorso/campo-base'

/** A preview never writes: every write answers that it is a preview, the video counts nothing. */
const SOLA_LETTURA: BackendPercorso = {
  ...BACKEND_REALE,
  async avanzaPasso() {
    return { ok: false, errore: 'Anteprima: niente si salva.' }
  },
  async daiConsenso() {
    return { ok: false, errore: 'Anteprima: niente si salva.' }
  },
  async completaLezione() {
    return { ok: false, errore: 'Anteprima: niente si salva.' }
  },
  async video() {
    return { percentuale: 0, visto: false }
  },
  chiaveVisto: 'alpha_percorso_visto_anteprima',
}

/**
 * «Come lo vede il cliente» (1.83.0): the client's own dashboard, in a sheet, read only: the tabs
 * Home, Aula, Le mie call, Regole and Community with his data (never the team's notes).
 */
export function AnteprimaCliente({ campo }: { campo: CampoBase }) {
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua]
  const [aperta, setAperta] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setAperta(true)} data-testid="come-lo-vede">
        <Eye className="size-4" aria-hidden="true" />
        {t.comeLoVede}
      </Button>
      <Sheet open={aperta} onOpenChange={setAperta}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>{t.comeLoVede}</SheetTitle>
            <SheetDescription>{t.comeLoVedeDescrizione}</SheetDescription>
          </SheetHeader>
          <div lang="it" className="px-4 pb-8">
            <BackendPercorsoProvider valore={SOLA_LETTURA}>
              <CampoBaseCliente percorso={null} campo={campo} anteprima />
            </BackendPercorsoProvider>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
