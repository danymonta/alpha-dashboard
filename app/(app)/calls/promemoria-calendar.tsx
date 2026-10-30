'use client'

import { BellPlus, ExternalLink, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  ERRORI_CON_RIPIEGO,
  GIORNI_AVANTI_PROMEMORIA,
  MASSIMO_DESCRIZIONE,
  MASSIMO_TITOLO,
  ORA_PROMEMORIA,
  descrizionePromemoria,
  erroreEvento,
  linkModelloCalendar,
  scorciatoiePromemoria,
  type CodiceErroreCalendar,
  type EventoPromemoria,
} from '@/lib/call/promemoria-calendar'
import { aggiungiGiorni } from '@/lib/date'
import { calendarPronto, caricaGoogleCalendar, chiediTokenCalendar, inserisciEvento } from '@/lib/google/calendar-browser'
import { inserimentoDiretto, type ConfigCalendar } from '@/lib/google/calendar'
import { PROMEMORIA_CALENDAR_TESTI } from '@/lib/i18n/testi/promemoria-calendar'
import { cn } from '@/lib/utils'

// The look of the "Sposta" shortcuts: unselected options outlined, the chosen one tinted.
const OPZIONE = 'h-11 px-2 font-normal border-border bg-transparent text-foreground hover:bg-accent'
const OPZIONE_SCELTA = 'border-primary bg-primary/15 ring-1 ring-primary hover:bg-primary/15'

const EVENTO_APRI = 'alpha:promemoria-calendar'

/** A request from the outcome's toast that arrived before the card's button was on the page. */
let inAttesa: string | null = null

/**
 * The action on the toast of a «Follow-up in chat» outcome: opens this call's
 * reminder sheet, now or as soon as the card shows its button (the page is
 * redrawn after the outcome is saved).
 */
export function apriPromemoriaCalendar(callId: string) {
  inAttesa = callId
  window.dispatchEvent(new CustomEvent(EVENTO_APRI, { detail: callId }))
}

type Props = {
  callId: string
  nomeLead: string
  /** Europe/Rome day of the call: the first line of the note. */
  giornoCall: string
  oggi: string
  /** The reason for not closing, as the closer wrote it: never an amount (lib/validation/esito.ts). */
  motivo: string | null
  linkFathom: string | null
  /** Where the call is in the app (APP_URL + /calls). */
  linkCall: string
  /** Read per request by the server, handed only to the call's closer and the admin. */
  config: ConfigCalendar
}

/**
 * «Promemoria su Calendar» (Dany, 29/10/2026): on a follow-up by chat, a
 * 15-minute «Risentire …» event in Google Calendar. With the client id and the
 * «Follow up» calendar configured the browser writes it there (the token stays
 * in the page's memory); otherwise, and whenever Google refuses, Google's own
 * prefilled «new event» page opens in another tab. Nothing is saved by the app.
 */
export function PromemoriaCalendar({ callId, nomeLead, giornoCall, oggi, motivo, linkFathom, linkCall, config }: Props) {
  const id = useId()
  const lingua = useLingua()
  const t = PROMEMORIA_CALENDAR_TESTI[lingua]
  const diretto = inserimentoDiretto(config)
  const iniziali = (): EventoPromemoria => ({
    titolo: t.titoloEvento(nomeLead),
    descrizione: descrizionePromemoria({ giornoCall, motivo, linkFathom, linkCall }, t.righe),
    data: aggiungiGiorni(oggi, 1),
    ora: ORA_PROMEMORIA,
  })
  const [aperto, setAperto] = useState(false)
  const [evento, setEvento] = useState<EventoPromemoria>(iniziali)
  const [erroreCampo, setErroreCampo] = useState<'giorno' | 'ora' | 'titolo' | null>(null)
  const [errore, setErrore] = useState<CodiceErroreCalendar | null>(null)
  const [inCorso, avvia] = useTransition()

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    if (valore) {
      // every opening starts from tomorrow at 10:00 and the note of the call as it is now
      setEvento(iniziali())
      setErroreCampo(null)
      setErrore(null)
      // the library arrives while the person picks the day: the tap can then open Google's window
      if (diretto) caricaGoogleCalendar().catch(() => undefined)
    }
  }

  // the outcome's toast: «Promemoria su Calendar» opens this sheet
  useEffect(() => {
    function apri(e: Event) {
      if ((e as CustomEvent<string>).detail !== callId) return
      inAttesa = null
      apriChiudi(true)
    }
    // the toast was tapped before the redrawn card had this button: it opens as soon as it is here
    const subito = inAttesa === callId ? window.setTimeout(() => apri(new CustomEvent(EVENTO_APRI, { detail: callId }))) : null
    window.addEventListener(EVENTO_APRI, apri)
    return () => {
      if (subito !== null) window.clearTimeout(subito)
      window.removeEventListener(EVENTO_APRI, apri)
    }
    // apriChiudi reads the props of this render: the listener is set once per call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId])

  function cambia(campo: keyof EventoPromemoria, valore: string) {
    setEvento((prima) => ({ ...prima, [campo]: valore }))
    setErroreCampo(null)
    setErrore(null)
  }

  const sbagliato = erroreEvento(evento, oggi)
  // built only on valid values: a time being typed has no end yet
  const link = sbagliato ? null : linkModelloCalendar(evento, config.calendarioId)

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    if (sbagliato) {
      setErroreCampo(sbagliato)
      return
    }
    if (!diretto || !config.clientId || !config.calendarioId) return
    // Google's window opens only inside the tap: before the library is there, load it and ask for one more tap
    if (!calendarPronto()) {
      caricaGoogleCalendar().then(
        () => toast.info(t.pronto),
        () => setErrore('caricamento'),
      )
      return
    }
    const calendario = config.calendarioId
    const daSalvare = evento
    // asked right now, still inside the tap; awaited below
    const richiesta = chiediTokenCalendar(config.clientId)
    avvia(async () => {
      const accesso = await richiesta
      if (!accesso.ok) {
        fallito(accesso.codice)
        return
      }
      const esito = await inserisciEvento(accesso.valore, calendario, daSalvare)
      if (!esito.ok) {
        fallito(esito.codice)
        return
      }
      const pagina = esito.valore
      toast.success(t.fatto, {
        description: t.titoloEvento(nomeLead),
        action: pagina
          ? { label: t.apriEvento, onClick: () => void window.open(pagina, '_blank', 'noopener,noreferrer') }
          : undefined,
      })
      setAperto(false)
    })
  }

  function fallito(codice: CodiceErroreCalendar) {
    setErrore(codice)
    // Google refused: the prefilled page is the way, and the toast says so
    if (ERRORI_CON_RIPIEGO.includes(codice)) toast.warning(t.errori[codice])
  }

  const idErroreCampo = `${id}-errore`
  const ripiego = errore !== null && ERRORI_CON_RIPIEGO.includes(errore)

  const linkGoogle = (principale: boolean) => (
    <a
      href={link ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={link ? undefined : true}
      data-testid="promemoria-link-calendar"
      onClick={(ev) => {
        if (!link) {
          ev.preventDefault()
          setErroreCampo(sbagliato)
          return
        }
        toast.info(t.aperto)
        setAperto(false)
      }}
      className={cn(
        principale
          ? cn(buttonVariants({ variant: 'default' }), 'h-11 w-full gap-1.5')
          : 'inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground',
      )}
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      {principale ? t.apri : t.oppure}
    </a>
  )

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={t.nomeBottone(nomeLead)}
            className="h-11 shrink-0 gap-1.5 px-3"
            data-testid="promemoria-calendar"
          />
        }
      >
        <BellPlus className="size-4" aria-hidden="true" />
        {t.bottone}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{t.titoloFoglio(nomeLead)}</SheetTitle>
          <SheetDescription>{diretto ? t.descrizioneDiretto : t.descrizioneModello}</SheetDescription>
        </SheetHeader>

        <form onSubmit={invia} noValidate className="space-y-4 px-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t.quando}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {scorciatoiePromemoria(oggi).map(({ chiave, valore }) => (
                <Button
                  key={chiave}
                  type="button"
                  variant="outline"
                  aria-pressed={evento.data === valore}
                  className={cn(OPZIONE, evento.data === valore && OPZIONE_SCELTA)}
                  onClick={() => cambia('data', valore)}
                >
                  {t.scorciatoie[chiave]}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-[3fr_2fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-data`} className="sr-only">
                  {t.giorno}
                </Label>
                <Input
                  id={`${id}-data`}
                  type="date"
                  min={oggi}
                  max={aggiungiGiorni(oggi, GIORNI_AVANTI_PROMEMORIA)}
                  className="num h-11"
                  value={evento.data}
                  onChange={(ev) => cambia('data', ev.currentTarget.value)}
                  aria-invalid={erroreCampo === 'giorno' ? true : undefined}
                  aria-describedby={erroreCampo === 'giorno' || erroreCampo === 'ora' ? idErroreCampo : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-ora`} className="sr-only">
                  {t.ora}
                </Label>
                <Input
                  id={`${id}-ora`}
                  type="time"
                  step={300}
                  className="num h-11"
                  value={evento.ora}
                  onChange={(ev) => cambia('ora', ev.currentTarget.value)}
                  aria-invalid={erroreCampo === 'ora' ? true : undefined}
                  aria-describedby={erroreCampo === 'giorno' || erroreCampo === 'ora' ? idErroreCampo : undefined}
                />
              </div>
            </div>
            <ErroreCampo
              id={idErroreCampo}
              messaggio={erroreCampo === 'giorno' || erroreCampo === 'ora' ? t.errori[erroreCampo] : undefined}
            />
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-titolo`}>{t.titolo}</Label>
            <Input
              id={`${id}-titolo`}
              className="h-11"
              maxLength={MASSIMO_TITOLO}
              value={evento.titolo}
              onChange={(ev) => cambia('titolo', ev.currentTarget.value)}
              aria-invalid={erroreCampo === 'titolo' ? true : undefined}
              aria-describedby={erroreCampo === 'titolo' ? `${id}-errore-titolo` : undefined}
            />
            <ErroreCampo id={`${id}-errore-titolo`} messaggio={erroreCampo === 'titolo' ? t.errori.titolo : undefined} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nota`}>{t.nota}</Label>
            <Textarea
              id={`${id}-nota`}
              rows={5}
              maxLength={MASSIMO_DESCRIZIONE}
              value={evento.descrizione}
              onChange={(ev) => cambia('descrizione', ev.currentTarget.value)}
              aria-describedby={`${id}-nota-aiuto`}
              data-testid="promemoria-nota"
            />
            <p id={`${id}-nota-aiuto`} className="text-xs text-muted-foreground">
              {t.notaAiuto}
            </p>
          </div>

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="promemoria-errore">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t.errori[errore]}
            </p>
          ) : null}

          {diretto && !ripiego ? (
            <>
              <Button type="submit" className="h-11 w-full" disabled={inCorso} data-testid="promemoria-salva">
                {inCorso ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <BellPlus className="size-4" aria-hidden="true" />
                )}
                {t.salva}
              </Button>
              <div className="text-center">{linkGoogle(false)}</div>
            </>
          ) : (
            linkGoogle(true)
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}
