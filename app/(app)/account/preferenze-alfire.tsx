'use client'

import { useSyncExternalStore } from 'react'

import { CHIAVE_LEGGI, useAlfire } from '@/components/alfire/alfire'
import { Fiamma } from '@/components/alfire/fiamma'
import { useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ACCOUNT } from '@/lib/i18n/testi/account'

// a per-browser convenience, not data: localStorage, with a listener so the switch follows
const ascoltatori = new Set<() => void>()
function iscrivi(cb: () => void) {
  ascoltatori.add(cb)
  return () => ascoltatori.delete(cb)
}
function leggi(): boolean {
  try {
    return localStorage.getItem(CHIAVE_LEGGI) === '1'
  } catch {
    return false
  }
}
function scrivi(valore: boolean) {
  try {
    localStorage.setItem(CHIAVE_LEGGI, valore ? '1' : '0')
  } catch {
    // private mode: the preference simply does not stick
  }
  ascoltatori.forEach((cb) => cb())
}

export function PreferenzeAlfire({
  configurata,
  modello,
  modelloVisione,
}: {
  configurata: boolean
  modello: string
  /** Reads photos and scans; null when the reading of images is off. */
  modelloVisione: string | null
}) {
  const { apri } = useAlfire()
  const leggiRisposte = useSyncExternalStore(iscrivi, leggi, () => false)
  const t = useTesti(ACCOUNT).alfire

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4">
        <Fiamma className="size-10" accesa />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium">{t.attiva(configurata)}</p>
          <p className="text-sm text-muted-foreground">
            {t.cosaFa}
          </p>
        </div>
        <Button type="button" className="h-11" onClick={apri}>
          {t.apri}
        </Button>
      </section>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl bg-card p-4">
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t.leggi}</span>
          <span className="block text-sm text-muted-foreground">{t.leggiNota}</span>
        </span>
        <Switch checked={leggiRisposte} onCheckedChange={(v) => scrivi(v)} aria-label={t.leggi} />
      </label>

      <section className="space-y-1.5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t.dati}</p>
        <p>
          {t.datiPrima} <span className="text-foreground">{modello}</span> {t.datiDopo}
        </p>
        <p data-testid="privacy-allegati">
          {t.allegati}
          {modelloVisione ? (
            <>
              {t.allegatiVisione} <span className="text-foreground">{modelloVisione}</span>
            </>
          ) : null}
          {t.allegatiDopo}
        </p>
      </section>
    </div>
  )
}
