'use client'

import {
  Ban,
  CalendarClock,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { registraEsito } from '@/app/(app)/calls/actions'
import { CampiSpostamento } from '@/app/(app)/calls/sposta-call'
import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { SPOSTA, spostamentoPredefinito } from '@/lib/call/spostamento'
import { etichettaGiorno } from '@/lib/date'
import { MASSIMO_MOTIVO, MASSIMO_NOTE_CLOSER, MOTIVO_NON_CHIUSURA, NOTE_CLOSER } from '@/lib/setting/commento'
import { cn } from '@/lib/utils'
import { schemaSpostamento } from '@/lib/validation/call'
import { ETICHETTA_ESITO, esitoCallSchema, type EsitoCallInput, type SceltaEsito } from '@/lib/validation/esito'

type Props = {
  callId: string
  nomeLead: string
  descrizione: string
  giaRegistrata: boolean
  /** A call still to come can only be cancelled here; it moves with «Sposta», beside this button. */
  futura: boolean
  /**
   * A held call or a no-show never moves (public.sposta_call, lib/call/spostamento.ts
   * restaNelSuoGiorno): no "Riprogrammata" among its outcomes, and these words
   * (avvisoEsitoFermo) say why, above «Annulla l’esito»: a wrong date is
   * corrected with the pencil, a wrong outcome is undone first. Null: the call moves.
   */
  ferma?: string | null
  /** Where the sale form returns after saving (an internal path): the closer's day. */
  tornaA?: string | null
  /** What is saved now: the sheet opens on them when the outcome changes. */
  motivo?: string | null
  /** The closer's "Note aggiuntive" (calls.note_closer), never the setter's note. */
  noteCloser?: string | null
  /** Europe/Rome day and time of the call: "Riprogrammata" starts from the day after. */
  giorno: string
  ora: string
  oggi: string
  /** The admin also records a move already happened, up to a year back. */
  admin?: boolean
}

/** A future call: moving it is «Sposta», right beside the button. */
const SOLO_FUTURE: SceltaEsito[] = ['cancellata']

const SCELTE: { esito: SceltaEsito; Icona: LucideIcon }[] = [
  { esito: 'chiusa', Icona: CircleCheck },
  { esito: 'follow_up', Icona: RotateCw },
  { esito: 'persa', Icona: CircleX },
  { esito: 'no_show', Icona: UserX },
  { esito: 'cancellata', Icona: Ban },
  { esito: 'riprogrammata', Icona: CalendarClock },
]

/**
 * Outcome in a few taps: open (1), pick (2). Closed jumps to the sale. For
 * follow-up or lost, the closer writes why it did not close (required, Dany
 * 30/09/2026), may add his notes (note_closer: the setter reads them, never
 * writes them), then says whether the lead was qualified: that tap saves (3).
 * "Riprogrammata" asks when (Dany, 02/10/2026): the same call moves there and
 * is still to be held, like "Sposta". The shared schema decides what is missing.
 */
export function RegistraEsito({
  callId,
  nomeLead,
  descrizione,
  giaRegistrata,
  futura,
  ferma = null,
  tornaA = null,
  motivo: motivoSalvato = null,
  noteCloser: noteSalvate = null,
  giorno,
  ora,
  oggi,
  admin = false,
}: Props) {
  const router = useRouter()
  const id = useId()
  const nuovaDataIniziale = spostamentoPredefinito(giorno, ora, oggi)
  const [aperto, setAperto] = useState(false)
  const [inAttesaQualifica, setInAttesaQualifica] = useState<'follow_up' | 'persa' | null>(null)
  const [inAttesaData, setInAttesaData] = useState(false)
  const [nuovaData, setNuovaData] = useState(nuovaDataIniziale.data)
  const [nuovaOra, setNuovaOra] = useState(nuovaDataIniziale.ora)
  const [erroreData, setErroreData] = useState<string | null>(null)
  const [motivo, setMotivo] = useState(motivoSalvato ?? '')
  const [note, setNote] = useState(noteSalvate ?? '')
  const [erroreMotivo, setErroreMotivo] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const campoMotivo = useRef<HTMLTextAreaElement>(null)

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    // every opening starts from what is saved
    setInAttesaQualifica(null)
    setInAttesaData(false)
    setNuovaData(nuovaDataIniziale.data)
    setNuovaOra(nuovaDataIniziale.ora)
    setErroreData(null)
    setMotivo(motivoSalvato ?? '')
    setNote(noteSalvate ?? '')
    setErroreMotivo(null)
    setErrore(null)
  }

  function salva(input: EsitoCallInput) {
    setErrore(null)
    avvia(async () => {
      let esito
      try {
        esito = await registraEsito(input)
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(`${nomeLead}: ${ETICHETTA_ESITO[input.esito].toLowerCase()}`, {
        description: esito.vaiA
          ? 'Ora registra la vendita.'
          : input.esito === 'riprogrammata'
            ? `${etichettaGiorno(input.data, oggi)} alle ${input.ora}`
            : undefined,
      })
      apriChiudi(false)
      if (esito.vaiA) {
        // the sale comes back to the page the call was closed from
        router.push(tornaA ? `${esito.vaiA}&${new URLSearchParams({ da: tornaA }).toString()}` : esito.vaiA)
      }
    })
  }

  function scegli(esito: SceltaEsito) {
    if (esito === 'follow_up' || esito === 'persa') {
      setInAttesaQualifica(esito)
      return
    }
    if (esito === 'riprogrammata') {
      setInAttesaData(true)
      return
    }
    salva({ call_id: callId, esito })
  }

  /** Riprogrammata: the new day and time first, as "Sposta" asks them. */
  function salvaRiprogrammata() {
    const input: EsitoCallInput = { call_id: callId, esito: 'riprogrammata', data: nuovaData, ora: nuovaOra }
    const verifica = schemaSpostamento(admin).safeParse(input)
    if (!verifica.success) {
      setErroreData(verifica.error.issues[0]?.message ?? 'Scegli il nuovo giorno')
      return
    }
    salva(input)
  }

  /** Sì or No: the schema says what is missing before anything is sent. */
  function salvaNonChiusa(esito: 'follow_up' | 'persa', qualificata: boolean) {
    const input: EsitoCallInput = { call_id: callId, esito, qualificata, motivo, note_closer: note }
    const verifica = esitoCallSchema.safeParse(input)
    if (!verifica.success) {
      const problema = verifica.error.issues[0]
      if (problema?.path[0] === 'motivo') {
        setErroreMotivo(problema.message)
        campoMotivo.current?.focus()
      } else {
        setErrore(problema?.message ?? 'Esito non valido.')
      }
      return
    }
    salva(input)
  }

  const senzaMotivo = motivo.trim() === ''

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant={giaRegistrata ? 'ghost' : futura ? 'outline' : 'default'}
            data-tour="registra-esito"
            className="h-11 shrink-0"
          />
        }
      >
        {giaRegistrata ? 'Cambia esito' : futura ? 'Annulla la call' : 'Registra esito'}
      </SheetTrigger>

      {/* never taller than the screen: with the texts filled (or the keyboard open) it scrolls */}
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{nomeLead}</SheetTitle>
          <SheetDescription>{descrizione}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          {inAttesaData ? (
            <>
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
                onClick={() => setInAttesaData(false)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {ETICHETTA_ESITO.riprogrammata}: cambia esito
              </button>
              <CampiSpostamento
                id={`${id}-nuova-data`}
                legenda={SPOSTA.riprogrammata.domanda}
                data={nuovaData}
                ora={nuovaOra}
                onData={(valore) => {
                  setNuovaData(valore)
                  setErroreData(null)
                }}
                onOra={(valore) => {
                  setNuovaOra(valore)
                  setErroreData(null)
                }}
                oggi={oggi}
                admin={admin}
                errore={erroreData}
              />
              <p className="text-xs text-muted-foreground">{SPOSTA.riprogrammata.spiegazione}</p>
              <Button type="button" className="h-11 w-full" disabled={inCorso} onClick={salvaRiprogrammata}>
                <CalendarClock className="size-4" aria-hidden="true" />
                {SPOSTA.riprogrammata.salva}
              </Button>
            </>
          ) : inAttesaQualifica === null ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {SCELTE.filter(
                  ({ esito }) => (!futura || SOLO_FUTURE.includes(esito)) && !(ferma && esito === 'riprogrammata'),
                ).map(({ esito, Icona }) => (
                  <Button
                    key={esito}
                    type="button"
                    variant={esito === 'chiusa' ? 'default' : 'outline'}
                    className="h-14 justify-start gap-2 px-3 text-sm"
                    disabled={inCorso}
                    onClick={() => scegli(esito)}
                  >
                    <Icona className="size-4" aria-hidden="true" />
                    {ETICHETTA_ESITO[esito]}
                  </Button>
                ))}
              </div>
              {ferma && giaRegistrata ? (
                <p className="text-xs text-muted-foreground" data-testid="esito-fermo">
                  {ferma}
                </p>
              ) : null}
              {giaRegistrata ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-muted-foreground"
                  disabled={inCorso}
                  onClick={() => salva({ call_id: callId, esito: 'programmata' })}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Annulla l’esito, torna da fare
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
                onClick={() => setInAttesaQualifica(null)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {ETICHETTA_ESITO[inAttesaQualifica]}: cambia esito
              </button>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-motivo`}>
                  {MOTIVO_NON_CHIUSURA.titolo}{' '}
                  <span className="font-normal text-muted-foreground">({MOTIVO_NON_CHIUSURA.obbligatorio})</span>
                </Label>
                <p id={`${id}-motivo-domanda`} className="text-xs text-muted-foreground">
                  {MOTIVO_NON_CHIUSURA.domanda}
                </p>
                <Textarea
                  ref={campoMotivo}
                  id={`${id}-motivo`}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.currentTarget.value)
                    if (erroreMotivo) setErroreMotivo(null)
                  }}
                  maxLength={MASSIMO_MOTIVO}
                  rows={2}
                  required
                  aria-required="true"
                  aria-invalid={erroreMotivo ? true : undefined}
                  aria-describedby={`${id}-motivo-domanda ${id}-senza-importi${erroreMotivo ? ` ${id}-motivo-errore` : ''}`}
                  placeholder={MOTIVO_NON_CHIUSURA.placeholder}
                  className="max-h-40"
                />
                <ErroreCampo id={`${id}-motivo-errore`} messaggio={erroreMotivo ?? undefined} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-note`}>
                  {NOTE_CLOSER.titolo} <span className="font-normal text-muted-foreground">({NOTE_CLOSER.facoltative})</span>
                </Label>
                <Textarea
                  id={`${id}-note`}
                  value={note}
                  onChange={(e) => setNote(e.currentTarget.value)}
                  maxLength={MASSIMO_NOTE_CLOSER}
                  rows={2}
                  aria-describedby={`${id}-senza-importi`}
                  placeholder={NOTE_CLOSER.placeholder}
                  className="max-h-40"
                />
                {/* the setter who booked the call reads these two texts, never the amount pitched */}
                <p id={`${id}-senza-importi`} className="text-xs text-muted-foreground">
                  {MOTIVO_NON_CHIUSURA.senzaImporti}
                </p>
              </div>

              <fieldset aria-describedby={`${id}-salva`}>
                <legend className="mb-2 text-sm font-medium">Era qualificata?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { etichetta: 'Sì', valore: true },
                    { etichetta: 'No', valore: false },
                  ].map(({ etichetta, valore }) => (
                    <Button
                      key={etichetta}
                      type="button"
                      variant="outline"
                      className="h-14"
                      disabled={inCorso}
                      aria-describedby={`${id}-salva`}
                      onClick={() => salvaNonChiusa(inAttesaQualifica, valore)}
                    >
                      {etichetta}
                    </Button>
                  ))}
                </div>
                {/* what the tap does, and what is still missing before it can */}
                <p
                  id={`${id}-salva`}
                  className={cn(
                    'mt-2 flex items-start gap-1.5 text-xs',
                    senzaMotivo ? 'text-status-warning' : 'text-muted-foreground',
                  )}
                  data-testid="salva-esito-aiuto"
                >
                  {senzaMotivo ? <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
                  {senzaMotivo ? MOTIVO_NON_CHIUSURA.perSalvare : MOTIVO_NON_CHIUSURA.salva}
                </p>
              </fieldset>
            </>
          )}

          {inCorso ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Salvataggio…
            </p>
          ) : null}

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
