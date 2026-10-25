'use client'

import { CircleStop } from 'lucide-react'
import { useState, useTransition } from 'react'

import { anteprimaInterruzione, interrompiPercorso, type AnteprimaInterruzione } from '@/app/(app)/clients/actions'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato } from '@/lib/format'
import { INTERROMPI } from '@/lib/i18n/testi/clienti-fogli'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { cn } from '@/lib/utils'

const TOGLI = [false, true] as const

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
  const lingua = useLingua()
  const t = INTERROMPI[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const SCELTE = TOGLI.map((togli, i) => ({ togli, ...t.scelte[i] }))

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
      t.interrotto,
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
          {t.titolo}
        </>
      }
      titolo={t.titolo}
      // the Italian words written here as Alfire reads them (lib/alfire/conseguenze.ts, tests/alfire-scritture.test.ts)
      descrizione={
        lingua === 'it'
          ? `${cliente} smette prima. Il percorso finisce nel giorno che scegli: dal giorno dopo risulta Scaduto, e dopo 90 giorni Ex cliente. Gli incassi già fatti non cambiano.`
          : t.descrizione(cliente)
      }
    >
      <form onSubmit={conferma} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="ip-giorno">{t.ultimoGiorno}</Label>
          <Input
            id="ip-giorno"
            type="date"
            min={vendita.data_inizio}
            max={vendita.data_fine}
            value={giorno}
            onChange={(e) => aggiorna(e.target.value, togli)}
            className="num h-11"
          />
          <p className="text-xs text-muted-foreground">
            {t.andava} <span className="num">{formatData(vendita.data_inizio)}</span> {t.al}{' '}
            <span className="num">{formatData(vendita.data_fine)}</span>.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t.rate}</legend>
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
            <p className="text-muted-foreground">{t.calcolo}</p>
          ) : erroreAnteprima ? (
            <p className="text-status-warning">{traduciErrore(erroreAnteprima, lingua)}</p>
          ) : anteprima ? (
            anteprima.rate_tolte > 0 ? (
              <p>
                {t.tolgo} <span className="num font-medium">{anteprima.rate_tolte}</span>{' '}
                {t.rata(anteprima.rate_tolte)} (<span className="num">{formatEuro(anteprima.importo_tolto)}</span>):
                {' '}{t.passa} <span className="num">{formatEuro(anteprima.valore_prima)}</span> {t.a}{' '}
                <span className="num font-medium">{formatEuro(anteprima.valore_dopo)}</span>.
              </p>
            ) : (
              <p>
                {t.nessunaCambia} <span className="num">{formatEuro(anteprima.valore_prima)}</span>.
              </p>
            )
          ) : null}
        </div>

        <ErroreModulo testo={traduciErrore(errore, lingua) ?? null} />
        <BottoneSalva inCorso={inCorso}>{t.titolo}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
