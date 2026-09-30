'use client'

import { useSyncExternalStore } from 'react'

import { CHIAVE_LEGGI, useAlfire } from '@/components/alfire/alfire'
import { Fiamma } from '@/components/alfire/fiamma'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

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

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4">
        <Fiamma className="size-10" accesa />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium">Alfire {configurata ? 'è attiva' : 'non è ancora attiva'}</p>
          <p className="text-sm text-muted-foreground">
            Risponde sui numeri che il tuo ruolo può vedere e registra solo dopo la tua conferma.
          </p>
        </div>
        <Button type="button" className="h-11" onClick={apri}>
          Apri la chat
        </Button>
      </section>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl bg-card p-4">
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">Leggi le risposte ad alta voce</span>
          <span className="block text-sm text-muted-foreground">Utile quando le parli col vocale. Vale solo su questo dispositivo.</span>
        </span>
        <Switch checked={leggiRisposte} onCheckedChange={(v) => scrivi(v)} aria-label="Leggi le risposte ad alta voce" />
      </label>

      <section className="space-y-1.5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Dove vanno i dati</p>
        <p>
          Alfire usa il modello open source <span className="text-foreground">{modello}</span> su Groq, con server negli Stati
          Uniti. Le tue domande, i dati che Alfire legge per risponderti e i vocali passano da lì; nella dashboard non resta
          nessuna registrazione audio e la chat si cancella quando chiudi l’app.
        </p>
        <p data-testid="privacy-allegati">
          Anche i file che alleghi (PDF, foto, Word, Excel, CSV) vanno a Groq per essere letti
          {modelloVisione ? (
            <>
              ; foto e scansioni le legge il modello open source <span className="text-foreground">{modelloVisione}</span>
            </>
          ) : null}
          . Non vengono salvati da nessuna parte: vivono solo nella chat aperta e spariscono con lei.
        </p>
      </section>
    </div>
  )
}
