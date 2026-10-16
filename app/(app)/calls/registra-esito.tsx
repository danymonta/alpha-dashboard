'use client'

import {
  Ban,
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Hourglass,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  UserX,
  Video,
  VideoOff,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { registraEsito } from '@/app/(app)/calls/actions'
import { CampiFollowUp } from '@/app/(app)/calls/follow-up'
import { CampiSpostamento } from '@/app/(app)/calls/sposta-call'
import { PassoRegistrazione } from '@/components/call/passo-registrazione'
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
import { FOLLOW_UP, quandoFollowUpDa } from '@/lib/call/follow-up'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { SPOSTA, spostamentoPredefinito } from '@/lib/call/spostamento'
import { etichettaGiorno } from '@/lib/date'
import { MASSIMO_MOTIVO, MASSIMO_NOTE_CLOSER, MOTIVO_NON_CHIUSURA, NOTE_CLOSER } from '@/lib/setting/commento'
import { cn } from '@/lib/utils'
import { erroreGiornoFollowUp, schemaSpostamento } from '@/lib/validation/call'
import { ETICHETTA_ESITO, esitoCallSchema, type EsitoCallInput, type SceltaEsito } from '@/lib/validation/esito'
import type { SceltaRegistrazioneInput } from '@/lib/validation/registrazione'

type Props = {
  callId: string
  nomeLead: string
  descrizione: string
  giaRegistrata: boolean
  /**
   * A call still to come is only cancelled, or put "In attesa di conferma",
   * here; it moves to a known date with «Sposta», beside this button.
   */
  futura: boolean
  /**
   * A held call or a no-show never moves (public.sposta_call, lib/call/spostamento.ts
   * restaNelSuoGiorno): neither rescheduling choice among its outcomes, and these words
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
  /** Europe/Rome day and time of the call: "Ha già una nuova data" starts from the day after. */
  giorno: string
  ora: string
  oggi: string
  /** The admin also records a move already happened, up to a year back. */
  admin?: boolean
  /** The call's setter, by name: a close on its follow-up call is still his sale. */
  setter?: string | null
  /**
   * The follow-up call this call already has ("giovedì 08/10 alle 18:00"): a
   * tap on "Follow-up" then asks no question, one call has one follow-up.
   */
  followUp?: string | null
  /**
   * A held call with no recording yet, from the day the link became required (Dany,
   * 16/10/2026): closed, follow-up and lost first ask for the link of its Fathom
   * recording, or «Call non registrata» (lib/validation/registrazione.ts).
   */
  chiedeRegistrazione?: boolean
}

/**
 * Where the sheet is. "followUp" asks whether a follow-up call was booked
 * (Dany, 07/10/2026), "dataFollowUp" when; "motivo" is the step that saves a
 * held call that did not close.
 */
type Passo =
  | { nome: 'scelte' }
  | { nome: 'registrazione'; esito: 'chiusa' | 'follow_up' | 'persa' }
  | { nome: 'nuovaData' }
  | { nome: 'attesa' }
  | { nome: 'followUp' }
  | { nome: 'dataFollowUp' }
  | { nome: 'motivo'; esito: 'follow_up' | 'persa' }

/** The answer to «Hai fissato una call di follow-up?»; "gia": the call already has its follow-up call. */
type SceltaFollowUp = { data: string; ora: string } | 'chat' | 'gia'

/**
 * A future call: cancelled, or waiting for the lead to confirm a new date;
 * moving it to a known date is «Sposta», right beside the button.
 */
const SOLO_FUTURE: SceltaEsito[] = ['cancellata']

const SCELTE: { esito: SceltaEsito; Icona: LucideIcon }[] = [
  { esito: 'chiusa', Icona: CircleCheck },
  { esito: 'follow_up', Icona: RotateCw },
  { esito: 'persa', Icona: CircleX },
  { esito: 'no_show', Icona: UserX },
  { esito: 'cancellata', Icona: Ban },
]

// a choice that fills two lines at 390px: icon on top of the words' first line
const SCELTA_LUNGA = 'h-14 justify-start gap-2 px-3 text-left text-sm leading-tight whitespace-normal'
const INDIETRO = 'flex min-h-11 items-center gap-1 text-left text-sm text-muted-foreground'

/**
 * Outcome in a few taps: open (1), pick (2). Closed jumps to the sale. For
 * follow-up or lost, the closer writes why it did not close (required, Dany
 * 30/09/2026), may add his notes (note_closer: the setter reads them, never
 * writes them), then says whether the lead was qualified: that tap saves (3).
 * Follow-up first asks whether a follow-up call was booked (Dany, 07/10/2026):
 * "Sì, call fissata" asks its day and time, and saving books a new call there,
 * with the same lead and setter (public.fissa_follow_up); "No, follow-up in
 * chat" asks nothing. Rescheduling is two choices (Dany, 04/10/2026): "Ha già
 * una nuova data" asks when, and the same call moves there, still to be held,
 * like "Sposta"; "In attesa di conferma" asks no date: the call stays on its
 * day until the lead confirms one. The shared schema decides what is missing.
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
  setter = null,
  followUp = null,
  chiedeRegistrazione = false,
}: Props) {
  const router = useRouter()
  const id = useId()
  // the day after the call, at its time, never before tomorrow: the new date and the follow-up call
  const giornoDopo = spostamentoPredefinito(giorno, ora, oggi)
  const [aperto, setAperto] = useState(false)
  const [passo, setPasso] = useState<Passo>({ nome: 'scelte' })
  const [nuovaData, setNuovaData] = useState(giornoDopo.data)
  const [nuovaOra, setNuovaOra] = useState(giornoDopo.ora)
  const [erroreData, setErroreData] = useState<string | null>(null)
  const [sceltaFollowUp, setSceltaFollowUp] = useState<SceltaFollowUp | null>(null)
  const [dataFollowUp, setDataFollowUp] = useState(giornoDopo.data)
  const [oraFollowUp, setOraFollowUp] = useState(giornoDopo.ora)
  const [erroreFollowUp, setErroreFollowUp] = useState<string | null>(null)
  const [registrazione, setRegistrazione] = useState<SceltaRegistrazioneInput | null>(null)
  const [motivo, setMotivo] = useState(motivoSalvato ?? '')
  const [note, setNote] = useState(noteSalvate ?? '')
  const [erroreMotivo, setErroreMotivo] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [annuncio, setAnnuncio] = useState('')
  const [inCorso, avvia] = useTransition()
  const campoMotivo = useRef<HTMLTextAreaElement>(null)
  const contenitorePasso = useRef<HTMLDivElement>(null)
  const passoCambiato = useRef(false)

  // a new step replaces the button just tapped: focus goes to the step, never to the page behind
  useEffect(() => {
    if (!passoCambiato.current) return
    passoCambiato.current = false
    contenitorePasso.current?.focus()
  }, [passo])

  /** To another step, with the follow-up answer it is about (by default the one already given). */
  function vai(prossimo: Passo, scelta: SceltaFollowUp | null = sceltaFollowUp) {
    passoCambiato.current = true
    setErrore(null)
    setSceltaFollowUp(scelta)
    setPasso(prossimo)
    setAnnuncio(titoloPasso(prossimo, scelta))
  }

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    // every opening starts from what is saved
    setPasso({ nome: 'scelte' })
    setNuovaData(giornoDopo.data)
    setNuovaOra(giornoDopo.ora)
    setErroreData(null)
    setSceltaFollowUp(null)
    setDataFollowUp(giornoDopo.data)
    setOraFollowUp(giornoDopo.ora)
    setErroreFollowUp(null)
    setRegistrazione(null)
    setMotivo(motivoSalvato ?? '')
    setNote(noteSalvate ?? '')
    setErroreMotivo(null)
    setErrore(null)
    setAnnuncio('')
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
      const spostata =
        input.esito === 'riprogrammata' && input.data && input.ora ? { data: input.data, ora: input.ora } : null
      const conFollowUp =
        input.esito === 'follow_up' && esito.followUp && input.follow_up_data && input.follow_up_ora
          ? quandoFollowUpDa(input.follow_up_data, input.follow_up_ora, oggi)
          : null
      const registrazioneInviata = 'registrazione' in input ? input.registrazione : undefined
      toast.success(spostata ? SPOSTA.fatto(nomeLead) : `${nomeLead}: ${ETICHETTA_ESITO[input.esito].toLowerCase()}`, {
        description: esito.vaiA
          ? 'Ora registra la vendita.'
          : spostata
            ? `${etichettaGiorno(spostata.data, oggi)} alle ${spostata.ora}`
            : conFollowUp
              ? FOLLOW_UP.diCall(conFollowUp)
              : registrazioneInviata && !esito.avvisoRegistrazione
                ? registrazioneInviata.tipo === 'link'
                  ? REGISTRAZIONE.toastCollegata
                  : REGISTRAZIONE.toastNonRegistrata
                : undefined,
      })
      // the outcome is saved, the recording is not: said, never asked to repeat the outcome
      if (esito.avvisoRegistrazione) toast.warning(esito.avvisoRegistrazione)
      // the outcome is saved, the follow-up call is not: say it, never ask to repeat the outcome;
      // the card's button only when booking it again can work (the call has none yet)
      if (esito.avviso) {
        toast.warning(esito.avviso, esito.avvisoRiprova ? { description: FOLLOW_UP.riprova } : undefined)
      }
      apriChiudi(false)
      if (esito.vaiA) {
        // the sale comes back to the page the call was closed from
        router.push(tornaA ? `${esito.vaiA}&${new URLSearchParams({ da: tornaA }).toString()}` : esito.vaiA)
      }
    })
  }

  function scegli(esito: SceltaEsito) {
    // a held call's outcome first asks for the recording (Dany, 16/10/2026)
    if (chiedeRegistrazione && registrazione === null && (esito === 'chiusa' || esito === 'follow_up' || esito === 'persa')) {
      vai({ nome: 'registrazione', esito }, sceltaFollowUp)
      return
    }
    procedi(esito, registrazione)
  }

  /** The recording is chosen (or not asked): the outcome goes on as before. */
  function procedi(esito: SceltaEsito, reg: SceltaRegistrazioneInput | null) {
    if (esito === 'follow_up') {
      // the answer already given about the follow-up call stays (the sheet came back to change the recording)
      if (sceltaFollowUp !== null) {
        vai({ nome: 'motivo', esito }, sceltaFollowUp)
        return
      }
      // one follow-up call per call: the one there is stays, the reason is asked
      if (followUp) vai({ nome: 'motivo', esito }, 'gia')
      else vai({ nome: 'followUp' }, null)
      return
    }
    if (esito === 'persa') {
      vai({ nome: 'motivo', esito }, null)
      return
    }
    salva({ call_id: callId, esito, ...(reg && esito === 'chiusa' ? { registrazione: reg } : {}) })
  }

  /** «Sì, call fissata»: its day and time are checked before the reason is asked. */
  function confermaDataFollowUp() {
    const problema = erroreGiornoFollowUp(
      { call_id: callId, data: dataFollowUp, ora: oraFollowUp },
      { giorno, ora },
      admin,
    )
    if (problema) {
      setErroreFollowUp(problema)
      return
    }
    vai({ nome: 'motivo', esito: 'follow_up' }, { data: dataFollowUp, ora: oraFollowUp })
  }

  /** "In attesa di conferma": no date, the closer's notes if he wants (note_closer). */
  function salvaInAttesa() {
    const input: EsitoCallInput = { call_id: callId, esito: 'riprogrammata', note_closer: note }
    const verifica = esitoCallSchema.safeParse(input)
    if (!verifica.success) {
      setErrore(verifica.error.issues[0]?.message ?? 'Esito non valido.')
      return
    }
    salva(input)
  }

  /** "Ha già una nuova data": the new day and time first, as "Sposta" asks them. */
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
    const conCall = esito === 'follow_up' && typeof sceltaFollowUp === 'object' && sceltaFollowUp !== null
    const input: EsitoCallInput = {
      call_id: callId,
      esito,
      qualificata,
      motivo,
      note_closer: note,
      ...(conCall ? { follow_up_data: sceltaFollowUp.data, follow_up_ora: sceltaFollowUp.ora } : {}),
      ...(registrazione ? { registrazione } : {}),
    }
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

  /** «Follow-up · call giovedì 08/10 alle 18:00» or «Follow-up in chat». */
  function riassuntoFollowUp(scelta: Exclude<SceltaFollowUp, 'gia'>): string {
    return scelta === 'chat' ? FOLLOW_UP.inChat : FOLLOW_UP.sceltaCall(quandoFollowUpDa(scelta.data, scelta.ora, oggi))
  }

  /** What a step is about: announced when it takes the place of the button just tapped. */
  function titoloPasso(passo: Passo, scelta: SceltaFollowUp | null): string {
    switch (passo.nome) {
      case 'scelte':
        return 'Esito della call'
      case 'registrazione':
        return REGISTRAZIONE.titolo
      case 'nuovaData':
        return SPOSTA.riprogrammata.domanda
      case 'attesa':
        return SPOSTA.attesa.etichetta
      case 'followUp':
        return FOLLOW_UP.domanda
      case 'dataFollowUp':
        return FOLLOW_UP.quando
      case 'motivo': {
        const esito =
          passo.esito === 'follow_up' && scelta !== null && scelta !== 'gia'
            ? riassuntoFollowUp(scelta)
            : ETICHETTA_ESITO[passo.esito]
        return `${esito} · ${MOTIVO_NON_CHIUSURA.titolo}`
      }
    }
  }

  /** The top of the reason step: the outcome (and the follow-up answer), with the way back. */
  function intestazioneMotivo(esito: 'follow_up' | 'persa') {
    if (esito === 'follow_up' && sceltaFollowUp !== null && sceltaFollowUp !== 'gia') {
      const call = sceltaFollowUp !== 'chat'
      return (
        <button
          type="button"
          className={INDIETRO}
          data-testid="scelta-follow-up"
          onClick={() => vai({ nome: call ? 'dataFollowUp' : 'followUp' })}
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          {call ? (
            <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{`${riassuntoFollowUp(sceltaFollowUp)}: ${FOLLOW_UP.cambia}`}</span>
        </button>
      )
    }
    return (
      <>
        <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'scelte' })}>
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          {ETICHETTA_ESITO[esito]}: cambia esito
        </button>
        {esito === 'follow_up' && sceltaFollowUp === 'gia' && followUp ? (
          <p className="flex items-start gap-1.5 text-sm" data-testid="follow-up-gia-fissata">
            <CalendarCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {FOLLOW_UP.giaFissata(followUp)}
          </p>
        ) : null}
      </>
    )
  }

  /** «Registrazione: link di Fathom · cambia», above the reason: the way back to the recording. */
  function rigaRegistrazione(esito: 'follow_up' | 'persa') {
    if (registrazione === null) return null
    return (
      <button
        type="button"
        className={INDIETRO}
        data-testid="scelta-registrazione"
        onClick={() => vai({ nome: 'registrazione', esito })}
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        {registrazione.tipo === 'link' ? (
          <Video className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <VideoOff className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          {registrazione.tipo === 'link' ? 'Registrazione: link di Fathom' : REGISTRAZIONE.nonRegistrata}: {REGISTRAZIONE.cambia}
        </span>
      </button>
    )
  }

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
        {giaRegistrata ? 'Cambia esito' : futura ? 'Annulla o rimanda' : 'Registra esito'}
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

        <div ref={contenitorePasso} tabIndex={-1} className="space-y-4 px-4 outline-none" data-testid="passo-esito">
          {/* the step that took the tapped button's place, said to whoever does not see it */}
          <p role="status" className="sr-only">
            {annuncio}
          </p>
          {passo.nome === 'registrazione' ? (
            <>
              <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'scelte' })}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {ETICHETTA_ESITO[passo.esito]}: cambia esito
              </button>
              <h3 className="text-sm font-medium">{REGISTRAZIONE.titolo}</h3>
              <p className="text-sm text-muted-foreground">{REGISTRAZIONE.domanda}</p>
              <PassoRegistrazione
                callId={callId}
                disabilitato={inCorso}
                valore={registrazione}
                oggi={oggi}
                onScelta={(scelta) => {
                  setRegistrazione(scelta)
                  procedi(passo.esito, scelta)
                }}
              />
            </>
          ) : passo.nome === 'nuovaData' ? (
            <>
              <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'scelte' })}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {SPOSTA.riprogrammata.scelta}: cambia esito
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
          ) : passo.nome === 'attesa' ? (
            <>
              <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'scelte' })}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {SPOSTA.attesa.etichetta}: cambia esito
              </button>
              <p className="text-sm text-muted-foreground">{SPOSTA.attesa.spiegazione}</p>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-note-attesa`}>
                  {NOTE_CLOSER.titolo} <span className="font-normal text-muted-foreground">({NOTE_CLOSER.facoltative})</span>
                </Label>
                <Textarea
                  id={`${id}-note-attesa`}
                  value={note}
                  onChange={(e) => setNote(e.currentTarget.value)}
                  maxLength={MASSIMO_NOTE_CLOSER}
                  rows={2}
                  aria-describedby={`${id}-attesa-senza-importi`}
                  placeholder={NOTE_CLOSER.placeholder}
                  className="max-h-40"
                />
                <p id={`${id}-attesa-senza-importi`} className="text-xs text-muted-foreground">
                  {MOTIVO_NON_CHIUSURA.senzaImporti}
                </p>
              </div>
              <Button type="button" className="h-11 w-full" disabled={inCorso} onClick={salvaInAttesa}>
                <Hourglass className="size-4" aria-hidden="true" />
                {SPOSTA.attesa.salva}
              </Button>
            </>
          ) : passo.nome === 'followUp' ? (
            <>
              <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'scelte' })}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {ETICHETTA_ESITO.follow_up}: cambia esito
              </button>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{FOLLOW_UP.domanda}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={SCELTA_LUNGA}
                    disabled={inCorso}
                    onClick={() => {
                      setErroreFollowUp(null)
                      vai({ nome: 'dataFollowUp' })
                    }}
                  >
                    <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
                    {FOLLOW_UP.si}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={SCELTA_LUNGA}
                    disabled={inCorso}
                    onClick={() => vai({ nome: 'motivo', esito: 'follow_up' }, 'chat')}
                  >
                    <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                    {FOLLOW_UP.no}
                  </Button>
                </div>
              </fieldset>
            </>
          ) : passo.nome === 'dataFollowUp' ? (
            <>
              <button type="button" className={INDIETRO} onClick={() => vai({ nome: 'followUp' })}>
                <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
                {FOLLOW_UP.si}: {FOLLOW_UP.cambia}
              </button>
              <CampiFollowUp
                id={`${id}-follow-up`}
                data={dataFollowUp}
                ora={oraFollowUp}
                onData={(valore) => {
                  setDataFollowUp(valore)
                  setErroreFollowUp(null)
                }}
                onOra={(valore) => {
                  setOraFollowUp(valore)
                  setErroreFollowUp(null)
                }}
                oggi={oggi}
                admin={admin}
                setter={setter}
                errore={erroreFollowUp}
              />
              <Button type="button" className="h-11 w-full" disabled={inCorso} onClick={confermaDataFollowUp}>
                {FOLLOW_UP.avanti}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : passo.nome === 'scelte' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {SCELTE.filter(({ esito }) => !futura || SOLO_FUTURE.includes(esito)).map(({ esito, Icona }) => (
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
              {/* rescheduling (04/10/2026): never for a held call or a no-show, which never move */}
              {ferma ? null : (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{SPOSTA.attesa.gruppo}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {/* a future call moves to a known date with «Sposta», beside the button */}
                    {futura ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        className={SCELTA_LUNGA}
                        disabled={inCorso}
                        onClick={() => vai({ nome: 'nuovaData' })}
                      >
                        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                        {SPOSTA.riprogrammata.scelta}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className={SCELTA_LUNGA}
                      disabled={inCorso}
                      onClick={() => vai({ nome: 'attesa' })}
                    >
                      <Hourglass className="size-4 shrink-0" aria-hidden="true" />
                      {SPOSTA.attesa.etichetta}
                    </Button>
                  </div>
                </fieldset>
              )}
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
              {intestazioneMotivo(passo.esito)}
              {rigaRegistrazione(passo.esito)}

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
                      onClick={() => salvaNonChiusa(passo.esito, valore)}
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
