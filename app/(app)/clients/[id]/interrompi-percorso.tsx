'use client'

import { CircleStop } from 'lucide-react'
import { useState, useTransition } from 'react'

import { anteprimaInterruzione, interrompiPercorso, type AnteprimaInterruzione } from '@/app/(app)/clients/actions'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatData, formatEuro } from '@/lib/format'
import { cn } from '@/lib/utils'

const SCELTE = [
  { togli: false, titolo: 'Le tengo', testo: 'Le deve pagare comunque: restano da incassare.' },
  { togli: true, titolo: 'Le tolgo', testo: 'Non le pagherà: spariscono e il contratto scende di tanto.' },
] as const

/**
 * "Interrompi il percorso": a client who stops early. The sale ends on the chosen
 * day (the client is "Scaduto" from the day after) and the unpaid instalments
 * after it stay or go. The effect is computed by the database and shown before
 * the confirmation; the numbers here are only formatted.
 */
export function InterrompiPercorso({
  vendita,
  cliente,
  oggi,
}: {
  vendita: { id: string; data_inizio: string; data_fine: string }
  cliente: string
  oggi: string
}) {
  // today, within the path: a path not started yet proposes its first day, never a day before it
  const giornoProposto = oggi < vendita.data_inizio ? vendita.data_inizio : oggi < vendita.data_fine ? oggi : vendita.data_fine
  const [aperto, setAperto] = useState(false)
  const [giorno, setGiorno] = useState(giornoProposto)
  const [togli, setTogli] = useState(false)
  const [anteprima, setAnteprima] = useState<AnteprimaInterruzione | null>(null)
  const [erroreAnteprima, setErroreAnteprima] = useState<string | null>(null)
  const [caricamento, avvia] = useTransition()
  const [inCorso, setInCorso] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()

  function aggiorna(prossimoGiorno: string, prossimoTogli: boolean) {
    setGiorno(prossimoGiorno)
    setTogli(prossimoTogli)
    setErrore(null)
    avvia(async () => {
      const esito = await anteprimaInterruzione({
        sale_id: vendita.id,
        ultimo_giorno: prossimoGiorno,
        togli_rate: prossimoTogli,
      })
      setAnteprima(esito.ok ? esito.anteprima : null)
      setErroreAnteprima(esito.ok ? null : esito.errore)
    })
  }

  async function conferma(evento: React.FormEvent) {
    evento.preventDefault()
    setInCorso(true)
    const fatto = await salva(
      () => interrompiPercorso({ sale_id: vendita.id, ultimo_giorno: giorno, togli_rate: togli }),
      'Percorso interrotto',
    )
    setInCorso(false)
    if (fatto) setAperto(false)
  }

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (v) aggiorna(giornoProposto, false)
        else setErrore(null)
      }}
      trigger={<Button type="button" variant="outline" className="h-11" data-testid="interrompi-percorso" />}
      contenutoTrigger={
        <>
          <CircleStop className="size-4" aria-hidden="true" />
          Interrompi il percorso
        </>
      }
      titolo="Interrompi il percorso"
      descrizione={`${cliente} smette prima. Il percorso finisce nel giorno che scegli: dal giorno dopo risulta Scaduto, e dopo 90 giorni Ex cliente. Gli incassi già fatti non cambiano.`}
    >
      <form onSubmit={conferma} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="ip-giorno">Ultimo giorno di percorso</Label>
          <Input
            id="ip-giorno"
            type="date"
            min={vendita.data_inizio}
            max={vendita.data_fine}
            value={giorno}
            onChange={(e) => aggiorna(e.target.value, togli)}
            className="num h-11 [color-scheme:dark]"
          />
          <p className="text-xs text-muted-foreground">
            Il percorso andava dal <span className="num">{formatData(vendita.data_inizio)}</span> al{' '}
            <span className="num">{formatData(vendita.data_fine)}</span>.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Le rate non ancora pagate dopo quel giorno</legend>
          {SCELTE.map((s) => (
            <label
              key={s.titolo}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
                togli === s.togli ? 'border-primary bg-primary/10' : 'border-input',
              )}
            >
              <input
                type="radio"
                name="ip-rate"
                checked={togli === s.togli}
                onChange={() => aggiorna(giorno, s.togli)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{s.titolo}</span>
                <span className="block text-muted-foreground">{s.testo}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* what the database says will happen, before anything happens */}
        <div className="rounded-lg bg-muted/40 p-3 text-sm" aria-live="polite" data-testid="anteprima-interruzione">
          {caricamento && !anteprima ? (
            <p className="text-muted-foreground">Calcolo…</p>
          ) : erroreAnteprima ? (
            <p className="text-status-warning">{erroreAnteprima}</p>
          ) : anteprima ? (
            anteprima.rate_tolte > 0 ? (
              <p>
                Tolgo <span className="num font-medium">{anteprima.rate_tolte}</span>{' '}
                {anteprima.rate_tolte === 1 ? 'rata' : 'rate'} (<span className="num">{formatEuro(anteprima.importo_tolto)}</span>):
                il contratto passa da <span className="num">{formatEuro(anteprima.valore_prima)}</span> a{' '}
                <span className="num font-medium">{formatEuro(anteprima.valore_dopo)}</span>.
              </p>
            ) : (
              <p>
                Nessuna rata cambia: il contratto resta <span className="num">{formatEuro(anteprima.valore_prima)}</span>.
              </p>
            )
          ) : null}
        </div>

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={inCorso}>Interrompi il percorso</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
