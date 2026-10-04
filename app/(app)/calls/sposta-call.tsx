'use client'

import { CalendarClock, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { spostaCall } from '@/app/(app)/calls/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SPOSTA, scorciatoieSpostamento, spostamentoPredefinito } from '@/lib/call/spostamento'
import { aggiungiGiorni, etichettaGiorno } from '@/lib/date'
import { cn } from '@/lib/utils'
import { GIORNI_AVANTI_CALL, GIORNI_INDIETRO_CALL_ADMIN, schemaSpostamento } from '@/lib/validation/call'

// The look of "Nuova call": unselected options outlined, the chosen one tinted
// with a bordeaux ring; the solid fill stays for the button that saves.
const OPZIONE = 'h-11 px-2 font-normal border-border bg-transparent text-foreground hover:bg-accent'
const OPZIONE_SCELTA = 'border-primary bg-primary/15 ring-1 ring-primary hover:bg-primary/15'

/**
 * The new day and time of a moved call: a tap on today, tomorrow or the day
 * after (the admin also yesterday), or any date and time. Controlled: the
 * "Sposta" sheet and the outcome "Ha già una nuova data" hold the values.
 */
export function CampiSpostamento({
  id,
  legenda,
  data,
  ora,
  onData,
  onOra,
  oggi,
  admin,
  errore,
}: {
  id: string
  legenda: string
  data: string
  ora: string
  onData: (valore: string) => void
  onOra: (valore: string) => void
  oggi: string
  admin: boolean
  errore?: string | null
}) {
  const idErrore = `${id}-errore`
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{legenda}</legend>
      <div className={cn('grid gap-2', admin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {scorciatoieSpostamento(oggi, admin).map(({ etichetta, valore }) => (
          <Button
            key={etichetta}
            type="button"
            variant="outline"
            aria-pressed={data === valore}
            className={cn(OPZIONE, data === valore && OPZIONE_SCELTA)}
            onClick={() => onData(valore)}
          >
            {etichetta}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-data`} className="sr-only">
            Giorno
          </Label>
          <Input
            id={`${id}-data`}
            type="date"
            min={aggiungiGiorni(oggi, admin ? -GIORNI_INDIETRO_CALL_ADMIN : 0)}
            max={aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)}
            className="num h-11"
            value={data}
            onChange={(e) => onData(e.currentTarget.value)}
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? idErrore : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-ora`} className="sr-only">
            Ora
          </Label>
          <Input
            id={`${id}-ora`}
            type="time"
            step={300}
            className="num h-11"
            value={ora}
            onChange={(e) => onOra(e.currentTarget.value)}
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? idErrore : undefined}
          />
        </div>
      </div>
      <ErroreCampo id={idErrore} messaggio={errore ?? undefined} />
    </fieldset>
  )
}

type Props = {
  callId: string
  nomeLead: string
  /** "Discovery · oggi alle 19:00": where the call is now. */
  descrizione: string
  /** Europe/Rome day and time of the call now. */
  giorno: string
  ora: string
  oggi: string
  /** The admin also records a move already happened, up to a year back. */
  admin: boolean
  /** A call "In attesa di conferma": once the lead confirms, moving it is the thing to do. */
  inEvidenza?: boolean
}

/**
 * "Sposta" (Dany, 02/10/2026): the same call goes to a new day and time,
 * still to be held, and its card keeps "Spostata dal …". The closer, the admin
 * and the setter who booked it (while it is still to be held): the database
 * decides and says why in words.
 */
export function SpostaCall({ callId, nomeLead, descrizione, giorno, ora, oggi, admin, inEvidenza = false }: Props) {
  const id = useId()
  const iniziale = spostamentoPredefinito(giorno, ora, oggi)
  const [aperto, setAperto] = useState(false)
  const [data, setData] = useState(iniziale.data)
  const [oraScelta, setOraScelta] = useState(iniziale.ora)
  const [erroreCampo, setErroreCampo] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    // every opening starts from the day after the call, at its time
    setData(iniziale.data)
    setOraScelta(iniziale.ora)
    setErroreCampo(null)
    setErrore(null)
  }

  function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrore(null)
    const input = { call_id: callId, data, ora: oraScelta }
    const verifica = schemaSpostamento(admin).safeParse(input)
    if (!verifica.success) {
      setErroreCampo(verifica.error.issues[0]?.message ?? 'Scegli il nuovo giorno')
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await spostaCall(input)
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(SPOSTA.fatto(nomeLead), { description: `${etichettaGiorno(data, oggi)} alle ${oraScelta}` })
      setAperto(false)
    })
  }

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant={inEvidenza ? 'default' : 'outline'}
            aria-label={SPOSTA.nomeBottone(nomeLead)}
            className="h-11 shrink-0 gap-1.5 px-3"
          />
        }
      >
        <CalendarClock className="size-4" aria-hidden="true" />
        {SPOSTA.bottone}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{SPOSTA.titolo(nomeLead)}</SheetTitle>
          <SheetDescription>{descrizione}</SheetDescription>
        </SheetHeader>

        <form onSubmit={invia} noValidate className="space-y-4 px-4">
          <CampiSpostamento
            id={id}
            legenda={SPOSTA.quando}
            data={data}
            ora={oraScelta}
            onData={(valore) => {
              setData(valore)
              setErroreCampo(null)
            }}
            onOra={(valore) => {
              setOraScelta(valore)
              setErroreCampo(null)
            }}
            oggi={oggi}
            admin={admin}
            errore={erroreCampo}
          />
          <p className="text-xs text-muted-foreground">{SPOSTA.descrizione}</p>

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={inCorso}>
            {inCorso ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarClock className="size-4" aria-hidden="true" />
            )}
            {SPOSTA.salva}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
