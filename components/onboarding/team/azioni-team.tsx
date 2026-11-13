'use client'

import {
  CalendarCheck,
  CircleCheck,
  ClipboardCheck,
  LoaderCircle,
  LockOpen,
  PackageCheck,
  Plus,
  Target,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { useId, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'

import {
  aggiungiConsegna,
  confermaCall,
  consegnaProgramma,
  esitoCall,
  obiettivoImpostato,
  riavviaOnboarding,
  sbloccaPasso,
  segnaCommunity,
  testRicevuti,
  togliConsegna,
  type EsitoTeam,
} from '@/app/(app)/onboarding/actions'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING, ONBOARDING_TEAM, titoloPasso, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import {
  ESITI_CALL,
  LIMITI_ONBOARDING_TEAM,
  TIPI_CONSEGNA,
  confermaCallSchema,
  consegnaSchema,
  esitoCallSchema,
  programmaSchema,
  riavviaSchema,
  sbloccaPassoSchema,
  type EsitoCallOnboarding,
  type TipoConsegna,
} from '@/lib/validation/onboarding-team'
import { cn } from '@/lib/utils'

/*
 * The team's actions on an onboarding (release B2): each one is a clear sheet with 44 px
 * targets, the error in place and a short toast. When the client's turn comes back the
 * toast says whether the email left; if not (off in the settings, or refused) it offers
 * «Copia il messaggio per Telegram». The functions in SQL decide who may; the page leaves
 * the refresh to the action's own revalidation.
 */

/** The toast of a done action, with the notice to the client when there is one. */
export function toastEsito(esito: Extract<EsitoTeam, { ok: true }>, fatto: string, lingua: Lingua) {
  const t = ONBOARDING_TEAM[lingua].avviso
  const a = esito.avviso
  if (!a) {
    toast.success(fatto)
    return
  }
  if (a.inviata) {
    toast.success(fatto, { description: t.inviato })
    return
  }
  const messaggio = a.messaggio
  toast.success(fatto, {
    description: a.spento ? t.spento : t.nonInviato,
    duration: 20_000,
    action: {
      label: t.copia,
      onClick: () => {
        navigator.clipboard.writeText(messaggio).then(
          () => toast.success(t.copiato),
          () => toast.error(t.nonCopiato),
        )
      },
    },
  })
}

/** One action through its server action: the error in place, never a raw message. */
export function useAzioneTeam() {
  const lingua = useLingua()
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function esegui(azione: () => Promise<EsitoTeam>, fatto: string, dopo?: () => void) {
    setErrore(null)
    avvia(async () => {
      let esito: EsitoTeam
      try {
        esito = await azione()
      } catch {
        setErrore(ONBOARDING[lingua].connessione)
        return
      }
      if (!esito.ok) {
        setErrore(traduciErroreOnboarding(esito.errore, lingua))
        return
      }
      toastEsito(esito, fatto, lingua)
      dopo?.()
    })
  }

  return { errore, setErrore, inCorso, esegui }
}

export function ErroreAzione({ testo }: { testo: string | null }) {
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

function Rotella({ inCorso, children }: { inCorso: boolean; children: ReactNode }) {
  return inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <>{children}</>
}

/** The frame of every sheet: title, words, the fields, the error, «Annulla» and the action. */
function Foglio({
  aperto,
  setAperto,
  inCorso,
  titolo,
  testo,
  children,
  errore,
  conferma,
  icona,
  onConferma,
  distruttivo = false,
  testId,
}: {
  aperto: boolean
  setAperto: (v: boolean) => void
  inCorso: boolean
  titolo: string
  testo: ReactNode
  children?: ReactNode
  errore: string | null
  conferma: string
  icona: ReactNode
  onConferma: () => void
  distruttivo?: boolean
  testId: string
}) {
  const t = ONBOARDING[useLingua()]
  return (
    <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
      <DialogContent showCloseButton={false} data-testid={`${testId}-foglio`}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{testo}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onConferma()
          }}
        >
          {children}
          <ErroreAzione testo={errore} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              {t.annulla}
            </Button>
            <Button
              type="submit"
              variant={distruttivo ? 'destructive' : 'default'}
              className="h-11"
              disabled={inCorso}
              data-testid={`${testId}-si`}
            >
              <Rotella inCorso={inCorso}>{icona}</Rotella>
              {conferma}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Day and hour of Rome, side by side, 44 px. */
function GiornoOra({
  id,
  giorno,
  ora,
  setGiorno,
  setOra,
  etichettaGiorno,
  etichettaOra,
  minimo,
  errori,
}: {
  id: string
  giorno: string
  ora: string
  setGiorno: (v: string) => void
  setOra: (v: string) => void
  etichettaGiorno: string
  etichettaOra: string
  minimo?: string
  errori: { giorno?: string; ora?: string }
}) {
  return (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${id}-giorno`}>{etichettaGiorno}</Label>
        <Input
          id={`${id}-giorno`}
          type="date"
          className="num h-11"
          min={minimo}
          value={giorno}
          onChange={(e) => setGiorno(e.target.value)}
          aria-invalid={errori.giorno ? true : undefined}
          aria-describedby={errori.giorno ? `${id}-giorno-errore` : undefined}
        />
        <ErroreCampo id={`${id}-giorno-errore`} messaggio={errori.giorno} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${id}-ora`}>{etichettaOra}</Label>
        <Input
          id={`${id}-ora`}
          type="time"
          step={300}
          className="num h-11"
          value={ora}
          onChange={(e) => setOra(e.target.value)}
          aria-invalid={errori.ora ? true : undefined}
          aria-describedby={errori.ora ? `${id}-ora-errore` : undefined}
        />
        <ErroreCampo id={`${id}-ora-errore`} messaggio={errori.ora} />
      </div>
    </div>
  )
}

/** The errors of a schema by field, translated. */
function erroriDi(issues: { path: (string | number)[]; message: string }[], lingua: Lingua): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const i of issues) {
    const campo = String(i.path[0] ?? '')
    fuori[campo] ??= traduciErroreOnboarding(i.message, lingua)
  }
  return fuori
}

/** «Conferma la call»: the day and hour the client booked, editable, and the Meet link. */
/** `evidenza`: the one primary action of the card list (LavoroTeam picks it); the others are outline. */
export function ConfermaCall({ clientId, inizio, evidenza = false }: { clientId: string; inizio: string; evidenza?: boolean }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].call.conferma
  const [aperto, setAperto] = useState(false)
  const [giorno, setGiorno] = useState(oggiRoma(new Date(inizio)))
  const [ora, setOra] = useState(formatOra(inizio))
  const [meet, setMeet] = useState('')
  const [errori, setErrori] = useState<Record<string, string>>({})
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function conferma() {
    const input = { client_id: clientId, giorno, ora, meet_url: meet }
    const valido = confermaCallSchema.safeParse(input)
    if (!valido.success) {
      setErrori(erroriDi(valido.error.issues, lingua))
      return
    }
    setErrori({})
    esegui(() => confermaCall(input), t.fatto, () => setAperto(false))
  }

  return (
    <>
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        data-testid="conferma-call"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <CalendarCheck className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={t.si}
        icona={<CalendarCheck className="size-4" aria-hidden="true" />}
        onConferma={conferma}
        testId="conferma-call"
      >
        <GiornoOra
          id={id}
          giorno={giorno}
          ora={ora}
          setGiorno={setGiorno}
          setOra={setOra}
          etichettaGiorno={t.giorno}
          etichettaOra={t.ora}
          minimo={oggiRoma()}
          errori={errori}
        />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-meet`}>{t.meet}</Label>
          <Input
            id={`${id}-meet`}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="h-11"
            placeholder={t.meetAiuto}
            value={meet}
            onChange={(e) => setMeet(e.target.value)}
            aria-invalid={errori.meet_url ? true : undefined}
            aria-describedby={errori.meet_url ? `${id}-meet-errore` : undefined}
          />
          <ErroreCampo id={`${id}-meet-errore`} messaggio={errori.meet_url} />
        </div>
      </Foglio>
    </>
  )
}

/**
 * The outcome of a booked call (onboarding or checkpoint): held (only once it began), no
 * show or moved, the last two with the new day.
 */
export function EsitoCall({
  callId,
  inizio,
  etichetta,
  passata,
  evidenza = false,
}: {
  callId: string
  inizio: string
  /** «Com’è andata» on a past call, «Sposta» on one still to come. */
  etichetta: string
  passata: boolean
  evidenza?: boolean
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].call.esito
  const [aperto, setAperto] = useState(false)
  const [esito, setEsito] = useState<EsitoCallOnboarding>(passata ? 'svolta' : 'spostata')
  const [giorno, setGiorno] = useState(aggiungiGiorni(oggiRoma(), 1))
  const [ora, setOra] = useState(formatOra(inizio))
  const [errori, setErrori] = useState<Record<string, string>>({})
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function salva() {
    const input = { call_id: callId, esito, giorno, ora }
    const valido = esitoCallSchema.safeParse(input)
    if (!valido.success) {
      setErrori(erroriDi(valido.error.issues, lingua))
      return
    }
    setErrori({})
    esegui(() => esitoCall(input), t.fatto[esito], () => setAperto(false))
  }

  return (
    <>
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        data-testid="esito-call"
        onClick={() => {
          setErrore(null)
          setEsito(passata ? 'svolta' : 'spostata')
          setAperto(true)
        }}
      >
        <ClipboardCheck className="size-4" aria-hidden="true" />
        {etichetta}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={t.si}
        icona={<ClipboardCheck className="size-4" aria-hidden="true" />}
        onConferma={salva}
        testId="esito-call"
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">{t.titolo}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ESITI_CALL.map((e) => {
              const spenta = e === 'svolta' && !passata
              return (
                <label
                  key={e}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm has-checked:border-primary has-checked:bg-selezione has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                    spenta && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-esito`}
                    value={e}
                    checked={esito === e}
                    disabled={spenta}
                    onChange={() => setEsito(e)}
                    className="size-4 accent-primary"
                    data-testid={`esito-${e}`}
                  />
                  {t.scelte[e]}
                </label>
              )
            })}
          </div>
          {!passata ? <p className="text-xs text-muted-foreground">{t.svoltaFutura}</p> : null}
        </fieldset>
        {esito !== 'svolta' ? (
          <GiornoOra
            id={id}
            giorno={giorno}
            ora={ora}
            setGiorno={setGiorno}
            setOra={setOra}
            etichettaGiorno={t.nuovoGiorno}
            etichettaOra={t.nuovaOra}
            minimo={oggiRoma()}
            errori={errori}
          />
        ) : null}
      </Foglio>
    </>
  )
}

/** «Test ricevuti»: one question, then the reviewer is told. */
export function TestRicevuti({ clientId, evidenza = false }: { clientId: string; evidenza?: boolean }) {
  const t = ONBOARDING_TEAM[useLingua()].test.ricevuti
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()
  return (
    <>
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        data-testid="test-ricevuti"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <CircleCheck className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={t.si}
        icona={<CircleCheck className="size-4" aria-hidden="true" />}
        onConferma={() => esegui(() => testRicevuti({ client_id: clientId }), t.fatto, () => setAperto(false))}
        testId="test-ricevuti"
      />
    </>
  )
}

/** «Segna obiettivo impostato»: the goal set on Coach Plus after the call; the client is told. */
export function ObiettivoImpostato({ clientId, evidenza = false }: { clientId: string; evidenza?: boolean }) {
  const t = ONBOARDING_TEAM[useLingua()].obiettivo.impostato
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()
  return (
    <>
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        data-testid="obiettivo-impostato"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <Target className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={t.si}
        icona={<Target className="size-4" aria-hidden="true" />}
        onConferma={() => esegui(() => obiettivoImpostato({ client_id: clientId }), t.fatto, () => setAperto(false))}
        testId="obiettivo-impostato"
      />
    </>
  )
}

/** «Aggiungi una consegna»: video, PDF or link; a video can be compulsory. */
export function AggiungiConsegna({ clientId }: { clientId: string }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].programma
  const a = t.aggiungi
  const [aperto, setAperto] = useState(false)
  const [tipo, setTipo] = useState<TipoConsegna>('video')
  const [titolo, setTitolo] = useState('')
  const [url, setUrl] = useState('')
  const [obbligatoria, setObbligatoria] = useState(true)
  const [errori, setErrori] = useState<Record<string, string>>({})
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function aggiungi() {
    const input = { client_id: clientId, tipo, titolo, url, obbligatoria: tipo === 'video' && obbligatoria }
    const valido = consegnaSchema.safeParse(input)
    if (!valido.success) {
      setErrori(erroriDi(valido.error.issues, lingua))
      return
    }
    setErrori({})
    esegui(() => aggiungiConsegna(input), a.fatto, () => {
      setAperto(false)
      setTitolo('')
      setUrl('')
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        data-testid="aggiungi-consegna"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        {a.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={a.titolo}
        testo={a.testo}
        errore={errore}
        conferma={a.si}
        icona={<Plus className="size-4" aria-hidden="true" />}
        onConferma={aggiungi}
        testId="aggiungi-consegna"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{a.tipo}</legend>
          <div className="grid grid-cols-3 gap-2">
            {TIPI_CONSEGNA.map((k) => (
              <label
                key={k}
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm has-checked:border-primary has-checked:bg-selezione has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name={`${id}-tipo`}
                  value={k}
                  checked={tipo === k}
                  onChange={() => setTipo(k)}
                  className="size-4 accent-primary"
                />
                {t.tipi[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-titolo`}>{a.titoloCampo}</Label>
          <Input
            id={`${id}-titolo`}
            className="h-11"
            maxLength={LIMITI_ONBOARDING_TEAM.titolo}
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            aria-invalid={errori.titolo ? true : undefined}
            aria-describedby={errori.titolo ? `${id}-titolo-errore` : undefined}
          />
          <ErroreCampo id={`${id}-titolo-errore`} messaggio={errori.titolo} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`}>{a.url[tipo]}</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="h-11"
            maxLength={LIMITI_ONBOARDING_TEAM.url}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={errori.url ? true : undefined}
            aria-describedby={errori.url ? `${id}-url-errore` : undefined}
          />
          <ErroreCampo id={`${id}-url-errore`} messaggio={errori.url} />
        </div>
        {tipo === 'video' ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={obbligatoria}
              onChange={(e) => setObbligatoria(e.target.checked)}
              className="size-5 accent-primary"
            />
            {a.obbligatoria}
          </label>
        ) : null}
      </Foglio>
    </>
  )
}

/** «Togli» a delivery, after a question. */
export function TogliConsegna({ consegnaId, titolo }: { consegnaId: string; titolo: string }) {
  const t = ONBOARDING_TEAM[useLingua()].programma.togli
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-11 shrink-0 text-rosso-testo hover:text-rosso-testo"
        aria-label={t.nomeAccessibile(titolo)}
        data-testid="togli-consegna"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{t.bottone}</span>
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo(titolo)}
        errore={errore}
        conferma={t.si}
        distruttivo
        icona={<Trash2 className="size-4" aria-hidden="true" />}
        onConferma={() => esegui(() => togliConsegna({ id: consegnaId }), t.fatto, () => setAperto(false))}
        testId="togli-consegna"
      />
    </>
  )
}

/** «Programma consegnato», with the first checkpoint (about five weeks ahead by default). */
export function ConsegnaProgramma({
  clientId,
  consegne,
  evidenza = false,
}: {
  clientId: string
  consegne: number
  evidenza?: boolean
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].programma.consegna
  const [aperto, setAperto] = useState(false)
  const [giorno, setGiorno] = useState(aggiungiGiorni(oggiRoma(), 35))
  const [ora, setOra] = useState('18:00')
  const [errori, setErrori] = useState<Record<string, string>>({})
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function consegna() {
    const input = { client_id: clientId, giorno, ora }
    const valido = programmaSchema.safeParse(input)
    if (!valido.success) {
      setErrori(erroriDi(valido.error.issues, lingua))
      return
    }
    setErrori({})
    esegui(() => consegnaProgramma(input), t.fatto, () => setAperto(false))
  }

  return (
    <>
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        data-testid="consegna-programma"
        aria-describedby={consegne === 0 ? `${id}-serve` : undefined}
        onClick={() => {
          setErrore(consegne === 0 ? t.serveConsegna : null)
          setAperto(true)
        }}
      >
        <PackageCheck className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      {consegne === 0 ? (
        <p id={`${id}-serve`} className="text-xs text-muted-foreground">
          {t.serveConsegna}
        </p>
      ) : null}
      <Foglio
        aperto={aperto}
        setAperto={setAperto}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={t.si}
        icona={<PackageCheck className="size-4" aria-hidden="true" />}
        onConferma={consegna}
        testId="consegna-programma"
      >
        <GiornoOra
          id={id}
          giorno={giorno}
          ora={ora}
          setGiorno={setGiorno}
          setOra={setOra}
          etichettaGiorno={t.giorno}
          etichettaOra={t.ora}
          minimo={oggiRoma()}
          errori={errori}
        />
      </Foglio>
    </>
  )
}

/** The community: one tap each, «Segna accesso approvato» and «Segna presentazione controllata». */
export function BottoneCommunity({
  clientId,
  cliente,
  azione,
  evidenza,
}: {
  clientId: string
  cliente: string
  azione: 'approvata' | 'controllata'
  /** The one primary action of the card list (LavoroTeam picks it). */
  evidenza: boolean
}) {
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].community
  const { errore, inCorso, esegui } = useAzioneTeam()
  const etichetta = azione === 'approvata' ? t.approva : t.controlla
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant={evidenza ? 'default' : 'outline'}
        className="h-11"
        disabled={inCorso}
        aria-label={azione === 'approvata' ? t.approvaNomeAccessibile(cliente) : t.controllaNomeAccessibile(cliente)}
        data-testid={`community-${azione}`}
        onClick={() =>
          esegui(
            () => segnaCommunity({ client_id: clientId, azione }),
            azione === 'approvata' ? t.fattoApprovata : t.fattoControllata,
          )
        }
      >
        <Rotella inCorso={inCorso}>
          <Users className="size-4" aria-hidden="true" />
        </Rotella>
        {etichetta}
      </Button>
      <ErroreAzione testo={errore} />
    </div>
  )
}

/** A reason, then a second tap: «Sblocca step» and «Riavvia onboarding» share this. */
function useSecondaConferma() {
  const [sicuro, setSicuro] = useState(false)
  return { sicuro, setSicuro }
}

/** «Sblocca step»: a step to open (or one stuck on its video, to close), the reason, a second tap. */
export function SbloccaPasso({ clientId, bloccati }: { clientId: string; bloccati: { chiave: string; titolo: string | null }[] }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].passi.sblocca
  const [aperto, setAperto] = useState(false)
  const [passo, setPasso] = useState(bloccati[0]?.chiave ?? '')
  const [motivo, setMotivo] = useState('')
  const [erroreCampo, setErroreCampo] = useState<string | undefined>()
  const { sicuro, setSicuro } = useSecondaConferma()
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function avanti() {
    const input = { client_id: clientId, passo, motivo }
    const valido = sbloccaPassoSchema.safeParse(input)
    if (!valido.success) {
      setErroreCampo(traduciErroreOnboarding(valido.error.issues[0]?.message ?? '', lingua))
      setSicuro(false)
      return
    }
    setErroreCampo(undefined)
    if (!sicuro) {
      setSicuro(true)
      return
    }
    esegui(() => sbloccaPasso(input), t.fatto, () => {
      setAperto(false)
      setSicuro(false)
      setMotivo('')
    })
  }

  if (bloccati.length === 0) return null
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        data-testid="sblocca-passo"
        onClick={() => {
          setErrore(null)
          setSicuro(false)
          setPasso((p) => (bloccati.some((b) => b.chiave === p) ? p : (bloccati[0]?.chiave ?? '')))
          setAperto(true)
        }}
      >
        <LockOpen className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={(v) => {
          setAperto(v)
          if (!v) setSicuro(false)
        }}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={sicuro ? t.si : t.avanti}
        icona={<LockOpen className="size-4" aria-hidden="true" />}
        onConferma={avanti}
        testId="sblocca-passo"
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-passo`}>{t.passo}</Label>
          <select
            id={`${id}-passo`}
            className={CLASSE_SELECT}
            value={passo}
            onChange={(e) => {
              setPasso(e.target.value)
              setSicuro(false)
            }}
          >
            {bloccati.map((b) => (
              <option key={b.chiave} value={b.chiave}>
                {titoloPasso(b.chiave, b.titolo, lingua)}
              </option>
            ))}
          </select>
        </div>
        <CampoMotivo
          id={id}
          etichetta={t.motivo}
          aiuto={t.motivoAiuto}
          motivo={motivo}
          setMotivo={(v) => {
            setMotivo(v)
            setSicuro(false)
          }}
          errore={erroreCampo}
        />
        {sicuro ? <SecondaConferma testo={t.secondaConferma} /> : null}
      </Foglio>
    </>
  )
}

/** «Riavvia onboarding»: the reason, a second tap. */
export function RiavviaOnboarding({ clientId }: { clientId: string }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].passi.riavvia
  const [aperto, setAperto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroreCampo, setErroreCampo] = useState<string | undefined>()
  const { sicuro, setSicuro } = useSecondaConferma()
  const { errore, setErrore, inCorso, esegui } = useAzioneTeam()

  function avanti() {
    const input = { client_id: clientId, motivo }
    const valido = riavviaSchema.safeParse(input)
    if (!valido.success) {
      setErroreCampo(traduciErroreOnboarding(valido.error.issues[0]?.message ?? '', lingua))
      setSicuro(false)
      return
    }
    setErroreCampo(undefined)
    if (!sicuro) {
      setSicuro(true)
      return
    }
    esegui(() => riavviaOnboarding(input), t.fatto, () => {
      setAperto(false)
      setSicuro(false)
      setMotivo('')
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-11 text-rosso-testo hover:text-rosso-testo"
        data-testid="riavvia-onboarding"
        onClick={() => {
          setErrore(null)
          setSicuro(false)
          setAperto(true)
        }}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Foglio
        aperto={aperto}
        setAperto={(v) => {
          setAperto(v)
          if (!v) setSicuro(false)
        }}
        inCorso={inCorso}
        titolo={t.titolo}
        testo={t.testo}
        errore={errore}
        conferma={sicuro ? t.si : t.avanti}
        distruttivo={sicuro}
        icona={<RotateCcw className="size-4" aria-hidden="true" />}
        onConferma={avanti}
        testId="riavvia-onboarding"
      >
        <CampoMotivo
          id={id}
          etichetta={t.motivo}
          aiuto={t.motivoAiuto}
          motivo={motivo}
          setMotivo={(v) => {
            setMotivo(v)
            setSicuro(false)
          }}
          errore={erroreCampo}
        />
        {sicuro ? <SecondaConferma testo={t.secondaConferma} /> : null}
      </Foglio>
    </>
  )
}

function CampoMotivo({
  id,
  etichetta,
  aiuto,
  motivo,
  setMotivo,
  errore,
}: {
  id: string
  etichetta: string
  aiuto: string
  motivo: string
  setMotivo: (v: string) => void
  errore: string | undefined
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-motivo`}>{etichetta}</Label>
      <Textarea
        id={`${id}-motivo`}
        rows={3}
        maxLength={LIMITI_ONBOARDING_TEAM.motivo}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        aria-required="true"
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${id}-motivo-errore` : `${id}-motivo-aiuto`}
      />
      <ErroreCampo id={`${id}-motivo-errore`} messaggio={errore} />
      <p id={`${id}-motivo-aiuto`} className="text-xs text-muted-foreground">
        {aiuto}
      </p>
    </div>
  )
}

function SecondaConferma({ testo }: { testo: string }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-status-warning" data-testid="seconda-conferma">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}
