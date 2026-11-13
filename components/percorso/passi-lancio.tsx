'use client'

import {
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Rocket,
  Send,
  TriangleAlert,
  Video,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { avanzaPasso } from '@/app/(cliente)/percorso/actions'
import { BloccoCliente, ListaBlocchi } from '@/components/percorso/blocchi'
import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { AzionePasso, Spunta } from '@/components/percorso/passi'
import { PlayerYoutube } from '@/components/percorso/player-youtube'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nomeGiorno, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { testoDaCopiare, videoDaVedere, type BloccoPercorso, type BloccoVoce } from '@/lib/percorso/blocchi'
import type { AttesaTeam, CallCliente, CommunityCliente, ConsegnaCliente, PassoPercorso } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T, TESTI_PASSI as P } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'
import type { AvanzaPasso } from '@/lib/validation/percorso'

/*
 * The steps of release B2, as the client sees them: the booking of the onboarding call, the
 * community, the goal on Coach Plus, the test week, the programme the coach delivered; the
 * call card, the waiting for the team, the page after the launch. One primary action per
 * screen, with the right verb; an error of the database said in words above the button.
 * The database decides again every time (percorso_avanza, video_progresso).
 */

/** «giovedì 19/11/2026 alle 18:00». */
export function quandoInParole(giorno: string, ora: string): string {
  return P.quando(`${nomeGiorno(giorno)} ${formatData(giorno)}`, ora)
}

function giornoDi(istante: string | null): string | null {
  return istante ? formatData(oggiRoma(new Date(istante))) : null
}

/** An external link as a big button: 44 px, the icon of a new tab. */
function LinkEsterno({
  href,
  children,
  primario = false,
  icona,
  testId,
}: {
  href: string
  children: React.ReactNode
  primario?: boolean
  icona?: React.ReactNode
  testId?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-testid={testId}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none',
        primario
          ? 'glow-primario h-12 w-full bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90 sm:w-auto sm:min-w-64'
          : 'border border-border bg-card hover:bg-accent',
      )}
    >
      {icona}
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLink className="size-4 shrink-0 opacity-80" aria-hidden="true" />
    </a>
  )
}

/** The server's error above a button, in words. */
function Errore({ testo }: { testo: string | null }) {
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

/** One write of the client outside the one primary action (the username, an item ticked). */
function useInvio() {
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  function invia(invio: AvanzaPasso, dopo?: () => void) {
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await avanzaPasso(invio)
        if (!esito.ok) {
          setErrore(esito.errore)
          return
        }
        dopo?.()
      } catch {
        setErrore(T.errore)
      }
    })
  }
  return { errore, inCorso, invia }
}

// ---------------------------------------------------------------------------
// The onboarding call
// ---------------------------------------------------------------------------

/**
 * The onboarding call (or a checkpoint): day and hour, whether the coach confirmed it, and
 * «Entra nella call» with the Meet link once confirmed.
 */
export function CardCall({
  call,
  titolo = P.call.titolo,
  checkpoint = false,
}: {
  call: CallCliente
  titolo?: string
  /** A checkpoint is set by the coach: no confirmation to wait for, the link comes from him. */
  checkpoint?: boolean
}) {
  const confermata = call.stato === 'prenotata'
  return (
    <section
      aria-label={titolo}
      className="space-y-3 rounded-xl border border-border bg-card/70 p-4"
      data-testid="card-call"
      data-stato={call.stato}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-rosso-testo">
          {confermata ? <CalendarCheck className="size-5" aria-hidden="true" /> : <CalendarClock className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{titolo}</p>
          <p className="num text-lg leading-snug font-semibold" data-testid="quando-call">
            {quandoInParole(call.giorno, call.ora)}
          </p>
          {checkpoint ? null : (
            <p
              className={cn(
                'flex items-center gap-1.5 text-sm',
                confermata || call.stato === 'svolta' ? 'text-status-ok' : 'text-status-warning',
              )}
            >
              {confermata || call.stato === 'svolta' ? (
                <CircleCheck className="size-4" aria-hidden="true" />
              ) : (
                <CalendarClock className="size-4" aria-hidden="true" />
              )}
              {call.stato === 'svolta' ? P.call.svolta : confermata ? P.call.confermata : P.call.daConfermare}
            </p>
          )}
        </div>
      </div>
      {call.stato !== 'svolta' ? (
        call.meetUrl ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{P.call.suMeet(call.durataMinuti)}</p>
            <LinkEsterno href={call.meetUrl} icona={<Video className="size-4" aria-hidden="true" />} testId="entra-call">
              {P.call.entra}
            </LinkEsterno>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{checkpoint ? P.call.linkCheckpoint : P.call.linkInArrivo}</p>
        )
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 4: the booking
// ---------------------------------------------------------------------------

/**
 * «Prenota la call»: the coach's calendar in a new tab, then the day and the hour the client
 * chose, «Ho prenotato». The coach confirms with the Meet link (the waiting panel says it).
 */
export function PassoPrenotazione({
  passo,
  nome,
  linkPrenotazione,
}: {
  passo: PassoPercorso
  nome: string
  linkPrenotazione: string | null
}) {
  const id = useId()
  const [giorno, setGiorno] = useState('')
  const [ora, setOra] = useState('')
  const oggi = oggiRoma()
  const pronto = /^\d{4}-\d{2}-\d{2}$/.test(giorno) && /^\d{2}:\d{2}$/.test(ora)

  return (
    <div className="space-y-6">
      {passo.blocchi && passo.blocchi.length > 0 ? (
        <ListaBlocchi blocchi={passo.blocchi} nome={nome} modo="passo" titoloPasso={passo.titolo} />
      ) : null}

      <ol className="space-y-5">
        <li className="space-y-3">
          <p className="flex items-start gap-3 font-medium">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm text-rosso-testo">1</span>
            <span className="pt-0.5">{P.prenotazione.scegli}</span>
          </p>
          <div className="pl-10">
            {linkPrenotazione ? (
              <LinkEsterno href={linkPrenotazione} icona={<CalendarClock className="size-4" aria-hidden="true" />} testId="apri-calendario">
                {P.prenotazione.apriCalendario}
              </LinkEsterno>
            ) : (
              <p className="text-sm text-muted-foreground">{P.prenotazione.senzaCalendario}</p>
            )}
          </div>
        </li>
        <li className="space-y-3">
          <p className="flex items-start gap-3 font-medium">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm text-rosso-testo">2</span>
            <span className="pt-0.5">{P.prenotazione.scrivi}</span>
          </p>
          <div className="grid gap-4 pl-10 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-giorno`}>{P.prenotazione.giorno}</Label>
              <Input
                id={`${id}-giorno`}
                type="date"
                min={oggi}
                value={giorno}
                onChange={(e) => setGiorno(e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-ora`}>{P.prenotazione.ora}</Label>
              <Input id={`${id}-ora`} type="time" step={300} value={ora} onChange={(e) => setOra(e.target.value)} className="h-11 text-base" />
            </div>
          </div>
        </li>
      </ol>

      <AzionePasso
        etichetta={P.prenotazione.hoPrenotato}
        pronto={pronto}
        perche={P.prenotazione.serveGiornoOra}
        invio={{ passo: 'prenotazione', azione: 'prenotato', dati: { giorno, ora } }}
        toastFatto={P.prenotazione.inviata}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 6: the community
// ---------------------------------------------------------------------------

function TrePassi({ fatti }: { fatti: number }) {
  return (
    <ol aria-label={P.community.tre} className="grid gap-2 sm:grid-cols-3" data-testid="community-passi">
      {P.community.passi.map((testo, i) => {
        const fatto = i < fatti
        const attuale = i === fatti
        return (
          <li
            key={testo}
            aria-current={attuale ? 'step' : undefined}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border p-3 text-sm',
              fatto ? 'border-status-ok/40 bg-status-ok/5' : attuale ? 'border-primary/60 bg-primary/10' : 'border-border bg-muted/30 text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'num flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                fatto ? 'bg-status-ok/20 text-status-ok' : attuale ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {fatto ? <CircleCheck className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className="min-w-0 leading-snug">
              {testo}
              {fatto ? <span className="sr-only">, {P.community.fatto}</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * «Entra nella community e presentati», three moments: the Telegram username, the request to
 * join («Entra nella community», then «Ho inviato la richiesta»), the presentation with the
 * template of the CMS to copy, then «Mi sono presentato».
 */
export function PassoCommunity({
  passo,
  nome,
  community,
  linkCommunity,
  call,
}: {
  passo: PassoPercorso
  nome: string
  community: CommunityCliente | null
  linkCommunity: string | null
  call: CallCliente | null
}) {
  const blocchi = passo.blocchi ?? []
  const modello = blocchi.find((b) => b.tipo === 'domande') ?? null
  const altri = blocchi.filter((b) => b.tipo !== 'domande')
  const username = community?.username ?? null
  const richiesta = community?.richiestaInviataIl ?? null
  const [cambiaUsername, setCambiaUsername] = useState(false)
  const fase = !username || cambiaUsername ? 0 : !richiesta ? 1 : 2

  return (
    <div className="space-y-6">
      {call ? <CardCall call={call} /> : null}
      {altri.length > 0 ? <ListaBlocchi blocchi={altri} nome={nome} modo="passo" titoloPasso={passo.titolo} /> : null}
      <TrePassi fatti={fase} />

      {fase === 0 ? (
        <Username iniziale={username ?? ''} onFatto={() => setCambiaUsername(false)} />
      ) : (
        <div
          className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 py-1 pr-1 pl-3 text-sm text-muted-foreground"
          data-testid="username-telegram"
        >
          <p className="min-w-0 break-words">
            {P.community.username}: <span className="font-medium text-foreground">@{username}</span>
          </p>
          <Button type="button" variant="ghost" className="h-11 shrink-0 px-3" onClick={() => setCambiaUsername(true)}>
            {P.community.cambia}
          </Button>
        </div>
      )}

      {fase === 1 ? (
        <div className="space-y-4">
          {linkCommunity ? (
            <LinkEsterno href={linkCommunity} icona={<Send className="size-4" aria-hidden="true" />} testId="entra-community">
              {P.community.entra}
            </LinkEsterno>
          ) : (
            <p className="text-sm text-muted-foreground">{P.community.senzaLink}</p>
          )}
          <AzionePasso
            etichetta={P.community.hoInviato}
            pronto
            perche=""
            invio={{ passo: 'community', azione: 'richiesta_inviata' }}
            toastFatto={P.community.richiestaSegnata}
          />
        </div>
      ) : null}

      {fase === 2 ? (
        <div className="space-y-4">
          {giornoDi(richiesta) ? (
            <p className="flex items-center gap-1.5 text-sm text-status-ok">
              <CircleCheck className="size-4" aria-hidden="true" />
              {P.community.richiestaIl(giornoDi(richiesta)!)}
            </p>
          ) : null}
          {modello?.corpo ? <ModelloPresentazione corpo={modello.corpo} titolo={modello.titolo} nome={nome} /> : null}
          <AzionePasso etichetta={P.community.presentato} pronto perche="" invio={{ passo: 'community', azione: 'presentato' }} />
        </div>
      ) : null}
    </div>
  )
}

function Username({ iniziale, onFatto }: { iniziale: string; onFatto: () => void }) {
  const id = useId()
  const [valore, setValore] = useState(iniziale)
  const { errore, inCorso, invia } = useInvio()
  const pronto = valore.trim().replace(/^@/, '').length > 0

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pronto || inCorso) return
        invia({ passo: 'community', azione: 'username', dati: { username: valore.trim() } }, () => {
          toast.success(P.community.usernameSalvato)
          onFatto()
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${id}-username`}>{P.community.username}</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden="true">
            @
          </span>
          <Input
            id={`${id}-username`}
            value={valore}
            onChange={(e) => setValore(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            className="h-11 text-base"
            aria-describedby={`${id}-aiuto`}
            aria-invalid={errore ? true : undefined}
          />
        </div>
        <p id={`${id}-aiuto`} className="text-sm text-muted-foreground">
          {P.community.usernameAiuto}
        </p>
      </div>
      <div className="space-y-3 border-t border-border/70 pt-5">
        <Errore testo={errore} />
        <Button
          type="submit"
          size="lg"
          className="glow-primario h-12 w-full gap-2 text-base sm:w-auto sm:min-w-64"
          aria-disabled={!pronto || inCorso ? true : undefined}
          aria-describedby={!pronto ? `${id}-serve` : undefined}
          data-testid="azione-passo"
        >
          {inCorso ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {inCorso ? T.inCorso : P.community.salvaUsername}
        </Button>
        {!pronto ? (
          <p id={`${id}-serve`} className="text-sm text-muted-foreground">
            {P.community.serveUsername}
          </p>
        ) : null}
      </div>
    </form>
  )
}

/** The presentation template of the CMS, as text to copy and paste on Telegram. */
function ModelloPresentazione({ corpo, titolo, nome }: { corpo: string; titolo: string | null; nome: string }) {
  const [copiata, setCopiata] = useState(false)
  async function copia() {
    try {
      await navigator.clipboard.writeText(testoDaCopiare(corpo, nome))
      setCopiata(true)
      toast.success(P.community.copiata)
      window.setTimeout(() => setCopiata(false), 2500)
    } catch {
      toast.error(P.community.nonCopiata)
    }
  }
  return (
    <section aria-labelledby="titolo-presentazione" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4" data-testid="presentazione">
      <div className="space-y-1">
        <h3 id="titolo-presentazione" className="font-heading text-base font-semibold tracking-tight">
          {titolo ?? P.community.presentazione}
        </h3>
        <p className="text-sm text-muted-foreground">{P.community.presentazioneSotto}</p>
      </div>
      <div className="rounded-lg bg-card p-3">
        <MarkdownCliente testo={corpo.replaceAll('[il tuo nome]', nome || '[il tuo nome]')} nome={nome} className="text-sm" />
      </div>
      <Button type="button" variant="outline" className="h-11 gap-2" onClick={copia}>
        {copiata ? <CircleCheck className="size-4 text-status-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copiata ? P.community.copiata : P.community.copia}
      </Button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Steps 10 and 11: the goal and the test week
// ---------------------------------------------------------------------------

/** «Il tuo obiettivo su Coach Plus»: the words of the CMS and its button, then «Ho visto». */
export function PassoObiettivo({ passo, nome }: { passo: PassoPercorso; nome: string }) {
  const blocchi = passo.blocchi ?? []
  const mancanti = videoDaVedere(blocchi)
  return (
    <div className="space-y-6">
      <ListaBlocchi blocchi={blocchi} nome={nome} modo="passo" titoloPasso={passo.titolo} />
      <AzionePasso
        etichetta={P.obiettivo.hoVisto}
        pronto={mancanti.length === 0}
        perche={T.serveIlVideo}
        invio={{ passo: 'obiettivo', azione: 'visto' }}
      />
    </div>
  )
}

/**
 * The test week: the items of the CMS as checkboxes, ticked one at a time (each tick is saved
 * by the database and never comes back). All ticked: the coach checks (the waiting panel).
 */
export function PassoTest({ passo, nome }: { passo: PassoPercorso; nome: string }) {
  const blocchi = passo.blocchi ?? []
  const voci = blocchi.filter((b): b is BloccoVoce => b.tipo === 'voce')
  const altri: BloccoPercorso[] = blocchi.filter((b) => b.tipo !== 'voce')
  const [inviate, setInviate] = useState<ReadonlySet<string>>(new Set())
  // the last tick sends the week to the coach: a question first, so a wrong tap while scrolling sends nothing
  const [ultima, setUltima] = useState<BloccoVoce | null>(null)
  const siInvia = useRef<HTMLButtonElement | null>(null)
  // the question appears where the tick was: the focus goes to its answer
  useEffect(() => {
    if (ultima) siInvia.current?.focus()
  }, [ultima])
  const { errore, inCorso, invia } = useInvio()
  const fatte = voci.filter((v) => v.spuntata || inviate.has(v.id)).length

  function manda(voce: BloccoVoce) {
    setInviate((prima) => new Set(prima).add(voce.id))
    invia({ passo: 'test', azione: 'spunta', dati: { voce: voce.id } })
  }

  function spunta(voce: BloccoVoce) {
    if (voce.spuntata || inviate.has(voce.id)) return
    if (fatte === voci.length - 1) {
      setUltima(voce)
      return
    }
    manda(voce)
  }

  function nonAncora() {
    const voce = ultima
    setUltima(null)
    if (voce) document.getElementById(`voce-${voce.id}`)?.focus()
  }

  return (
    <div className="space-y-6">
      {altri.length > 0 ? <ListaBlocchi blocchi={altri.filter((b) => b.tipo !== 'avviso')} nome={nome} modo="passo" titoloPasso={passo.titolo} /> : null}
      <fieldset className="space-y-3" data-testid="voci-test" aria-busy={inCorso || undefined}>
        <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-2">
          <span className="font-heading text-base font-semibold tracking-tight">{P.test.titolo}</span>
          <span className="num text-sm text-muted-foreground" aria-live="polite">
            {P.test.fatte(fatte, voci.length)}
          </span>
        </legend>
        <p className="mb-3 text-sm text-muted-foreground">{P.test.sotto}</p>
        {voci.map((v) => {
          const fatta = v.spuntata || inviate.has(v.id)
          return (
            <div key={v.id} data-voce={v.id} data-spuntata={fatta ? 'true' : 'false'}>
              {/* the same element before and after the tick: the focus never falls on <body> */}
              <Spunta
                id={`voce-${v.id}`}
                titolo={v.titolo}
                spuntata={ultima?.id === v.id}
                fatta={fatta}
                etichettaFatta={P.test.fatto}
                onCambia={(s) => (s ? spunta(v) : ultima?.id === v.id ? nonAncora() : undefined)}
              >
                {v.corpo ? <MarkdownCliente testo={v.corpo} nome={nome} className="text-sm text-muted-foreground" /> : null}
              </Spunta>
            </div>
          )
        })}
        {ultima ? (
          <div
            role="group"
            aria-labelledby="test-conferma-titolo"
            className="space-y-3 rounded-xl border border-primary/50 bg-primary/10 p-4"
            data-testid="test-conferma"
          >
            <p id="test-conferma-titolo" className="font-medium">
              {P.test.conferma}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                ref={siInvia}
                className="glow-primario h-11"
                disabled={inCorso}
                onClick={() => {
                  const voce = ultima
                  setUltima(null)
                  manda(voce)
                }}
              >
                {P.test.invia}
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={nonAncora}>
                {P.test.nonAncora}
              </Button>
            </div>
          </div>
        ) : null}
      </fieldset>
      <Errore testo={errore} />
      {altri
        .filter((b) => b.tipo === 'avviso')
        .map((b) => (
          <BloccoCliente key={b.id} blocco={b} nome={nome} modo="passo" />
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 12: the programme
// ---------------------------------------------------------------------------

/** The materials of the coach: the videos with the player, the PDFs and the links. */
export function ListaConsegne({
  consegne,
  registra,
  onVisto,
}: {
  consegne: readonly ConsegnaCliente[]
  registra: boolean
  onVisto?: (id: string) => void
}) {
  if (consegne.length === 0) return <p className="text-sm text-muted-foreground">{P.programma.nessunMateriale}</p>
  return (
    <ul className="space-y-5" data-testid="consegne">
      {consegne.map((c) => (
        <li key={c.id} data-consegna={c.id} data-tipo={c.tipo}>
          {c.tipo === 'video' && c.youtubeId ? (
            <section className="space-y-3">
              <h3 className="flex flex-wrap items-center gap-2 font-heading text-base font-semibold tracking-tight">
                {c.titolo}
                {c.obbligatoria ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-rosso-testo">{P.programma.daVedere}</span>
                ) : null}
              </h3>
              <PlayerYoutube
                consegnaId={c.id}
                youtubeId={c.youtubeId}
                titolo={c.titolo}
                percentualeIniziale={c.video?.percentuale ?? 0}
                vistoIniziale={c.video?.visto ?? false}
                registra={registra}
                onVisto={() => onVisto?.(c.id)}
              />
            </section>
          ) : c.url ? (
            <LinkEsterno
              href={c.url}
              icona={
                c.tipo === 'pdf' ? <FileText className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />
              }
            >
              {c.titolo}
              <span className="sr-only">, {c.tipo === 'pdf' ? P.programma.apriPdf : P.programma.apriLink}</span>
            </LinkEsterno>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * «Il tuo programma»: the coach delivered it; the client watches the compulsory videos (blocks
 * and deliveries) at least to 90%, then «Ho visto tutto» and the path starts.
 */
export function PassoProgramma({ passo, nome, consegne }: { passo: PassoPercorso; nome: string; consegne: readonly ConsegnaCliente[] }) {
  const blocchi = passo.blocchi ?? []
  const [vistiOra, setVistiOra] = useState<ReadonlySet<string>>(new Set())
  const segna = (id: string) => setVistiOra((prima) => new Set(prima).add(id))
  const mancanti =
    videoDaVedere(blocchi).filter((v) => !vistiOra.has(v.id)).length +
    consegne.filter((c) => c.tipo === 'video' && c.obbligatoria && !c.video?.visto && !vistiOra.has(c.id)).length

  return (
    <div className="space-y-6">
      <ListaBlocchi blocchi={blocchi} nome={nome} modo="passo" titoloPasso={passo.titolo} onVideoVisto={segna} />
      <section aria-labelledby="titolo-materiali" className="space-y-4">
        <h3 id="titolo-materiali" className="font-heading text-lg font-semibold tracking-tight">
          {P.programma.materiali}
        </h3>
        <ListaConsegne consegne={consegne} registra onVisto={segna} />
      </section>
      <AzionePasso
        etichetta={P.programma.hoVistoTutto}
        pronto={mancanti === 0}
        perche={P.programma.serveVideo(mancanti)}
        invio={{ passo: 'programma', azione: 'completa' }}
        icona={<Rocket className="size-5" aria-hidden="true" />}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The waiting for the team and the page after the launch
// ---------------------------------------------------------------------------

function iniziali(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Who of the team is working for the client now: first name, photo and role. */
export function ChiLavora({ chi }: { chi: NonNullable<AttesaTeam['chi']> }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3" data-testid="chi-lavora">
      <Avatar className="size-12">
        {chi.fotoUrl ? <AvatarImage src={chi.fotoUrl} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className="text-sm font-semibold">{iniziali(chi.nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{chi.nome}</p>
        <p className="text-sm text-muted-foreground">{chi.ruolo}</p>
      </div>
    </div>
  )
}

/**
 * The page after the launch: the next checkpoint with day and hour (and the Meet link once
 * there), the quick links of the CMS (Coach Plus, Yazio), the community and the private group.
 */
export function DopoLancio({
  blocchi,
  nome,
  checkpoint,
  linkCommunity,
  gruppoPrivatoUrl,
}: {
  blocchi: readonly BloccoPercorso[]
  nome: string
  checkpoint: CallCliente | null
  linkCommunity: string | null
  gruppoPrivatoUrl: string | null
}) {
  const testi = blocchi.filter((b) => b.tipo !== 'pulsante')
  const pulsanti = blocchi.filter((b) => b.tipo === 'pulsante')
  const link: { href: string; titolo: string; icona: React.ReactNode }[] = [
    ...pulsanti.map((b) => ({ href: b.tipo === 'pulsante' ? b.url : '', titolo: b.titolo ?? '', icona: <Link2 className="size-4" aria-hidden="true" /> })),
    ...(linkCommunity ? [{ href: linkCommunity, titolo: P.lancio.community, icona: <Send className="size-4" aria-hidden="true" /> }] : []),
    ...(gruppoPrivatoUrl ? [{ href: gruppoPrivatoUrl, titolo: P.lancio.gruppoPrivato, icona: <Send className="size-4" aria-hidden="true" /> }] : []),
  ].filter((l) => l.href)

  return (
    <div className="space-y-6" data-testid="dopo-lancio">
      {testi.length > 0 ? <ListaBlocchi blocchi={testi} nome={nome} modo="rileggi" titoloPasso={P.lancio.titolo} /> : null}
      {checkpoint ? (
        <CardCall call={checkpoint} titolo={P.lancio.checkpoint} checkpoint />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden="true" />
          {P.lancio.nessunCheckpoint}
        </p>
      )}
      {link.length > 0 ? (
        <nav aria-labelledby="titolo-link-rapidi" className="space-y-3">
          <h3 id="titolo-link-rapidi" className="font-heading text-base font-semibold tracking-tight">
            {P.lancio.link}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {link.map((l) => (
              <li key={`${l.titolo}-${l.href}`}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="text-muted-foreground">{l.icona}</span>
                    <span className="min-w-0 break-words">{l.titolo}</span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}
