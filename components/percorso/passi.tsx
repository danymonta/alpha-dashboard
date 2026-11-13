'use client'

import { ArrowRight, ClipboardList, LoaderCircle, Lock, ShieldCheck, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { useBackendPercorso } from '@/components/percorso/backend-percorso'
import { ListaBlocchi } from '@/components/percorso/blocchi'
import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { TeamCliente } from '@/components/percorso/team-cliente'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { ordineBenvenuto, videoDaVedere, type BloccoPercorso, type BloccoRegola } from '@/lib/percorso/blocchi'
import { CONSENSO_SALUTE } from '@/lib/percorso/consensi'
import type { ConsensoCliente, PassoPercorso, PersonaTeam } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T, TESTI_QUESTIONARIO } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'
import type { AvanzaPasso } from '@/lib/validation/percorso'

/** A version of a consent's text is a day («2026-11-12»): said as a date, else as it is. */
export function versioneInParole(versione: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(versione) ? formatData(versione) : versione
}

/** The one primary action of a step, with what keeps it off said under it and the server's error above it. */
export function AzionePasso({
  etichetta,
  pronto,
  perche,
  invio,
  toastFatto = T.passoCompletato,
  bordo = true,
  icona,
}: {
  etichetta: string
  pronto: boolean
  /** Why the button is off: never off without saying it. */
  perche: string
  invio: AvanzaPasso
  /** The short toast once done; null: none (the page says it). */
  toastFatto?: string | null
  /** The line above the action (off when the action sits inside a card). */
  bordo?: boolean
  icona?: React.ReactNode
}) {
  const { avanzaPasso } = useBackendPercorso()
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function vai() {
    // off (aria-disabled, so the button stays reachable with Tab and says why): nothing happens
    if (!pronto || inCorso) return
    setErrore(null)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof avanzaPasso>>
      try {
        esito = await avanzaPasso(invio)
      } catch {
        setErrore(T.errore)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      if (toastFatto) toast.success(toastFatto)
    })
  }

  return (
    <div className={cn('space-y-3', bordo && 'border-t border-border/70 pt-5')}>
      {errore ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
      {/* why it waits, right above it and in the text's colour: the button alone never looks ready */}
      {!pronto ? (
        <p id="perche-fermo" className="flex items-start gap-2 text-sm text-foreground" data-testid="perche-fermo">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {perche}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        variant={pronto ? 'default' : 'secondary'}
        className={cn(
          'h-12 w-full gap-2 text-base sm:w-auto sm:min-w-64',
          pronto ? 'glow-primario' : 'cursor-not-allowed text-muted-foreground shadow-none',
        )}
        aria-disabled={!pronto || inCorso ? true : undefined}
        aria-describedby={!pronto ? 'perche-fermo' : undefined}
        onClick={vai}
        data-testid="azione-passo"
      >
        {inCorso ? (
          <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        {!inCorso && icona ? icona : null}
        {inCorso ? T.inCorso : etichetta}
        {!inCorso && !icona && pronto ? <ArrowRight className="size-5" aria-hidden="true" /> : null}
      </Button>
    </div>
  )
}

/**
 * Step 1, «Benvenuto»: the welcome of the CMS, the video (to see at 90% when compulsory),
 * the team with photos and roles, then «Ho guardato il video». The database checks the
 * video again (percorso_avanza).
 */
export function PassoBenvenuto({ passo, nome, team }: { passo: PassoPercorso; nome: string; team: readonly PersonaTeam[] }) {
  const blocchi = passo.blocchi ?? []
  const [vistiOra, setVistiOra] = useState<ReadonlySet<string>>(new Set())
  const mancanti = videoDaVedere(blocchi).filter((v) => !vistiOra.has(v.id))
  const conVideo = blocchi.some((b) => b.tipo === 'video')

  // the team before the video, so the one action sits right under the player (ordineBenvenuto)
  const { testi, video } = ordineBenvenuto(blocchi)

  return (
    <div className="space-y-6">
      <ListaBlocchi blocchi={testi} nome={nome} modo="passo" titoloPasso={passo.titolo} />
      <TeamCliente team={team} />
      <ListaBlocchi
        blocchi={video}
        nome={nome}
        modo="passo"
        titoloPasso={passo.titolo}
        onVideoVisto={(id) => setVistiOra((prima) => new Set(prima).add(id))}
      />
      <AzionePasso
        etichetta={conVideo ? T.hoGuardato : T.vadoAvanti}
        pronto={mancanti.length === 0}
        perche={T.serveIlVideo}
        invio={{ passo: 'benvenuto', azione: 'completa' }}
      />
    </div>
  )
}

/** A big checkbox: the whole row is the target, 44 px at least. */
export function Spunta({
  id,
  spuntata,
  onCambia,
  titolo,
  fatta = false,
  etichettaFatta,
  children,
}: {
  id: string
  spuntata: boolean
  onCambia: (v: boolean) => void
  titolo: string
  /** Saved for good (the test week): the same element, ticked and read-only, so the focus stays on it. */
  fatta?: boolean
  /** What a reader of the screen hears after the title of a done tick («Fatto»). */
  etichettaFatta?: string
  children?: React.ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-11 items-start gap-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none',
        fatta
          ? 'border-status-ok/40 bg-status-ok/5'
          : spuntata
            ? 'cursor-pointer border-primary/60 bg-primary/10'
            : 'cursor-pointer border-border bg-card/60 hover:bg-accent/60',
      )}
    >
      <Checkbox
        id={id}
        checked={spuntata || fatta}
        readOnly={fatta}
        aria-disabled={fatta || undefined}
        onCheckedChange={(v) => {
          if (!fatta) onCambia(v === true)
        }}
        className={cn('mt-0.5 size-5', fatta && 'data-checked:border-status-ok data-checked:bg-status-ok')}
      />
      <span className="min-w-0 space-y-1">
        <span className="block font-medium">
          {titolo}
          {fatta && etichettaFatta ? <span className="sr-only">, {etichettaFatta}</span> : null}
        </span>
        {children}
      </span>
    </label>
  )
}

/**
 * Step 2, «Le regole del percorso»: one tick for each rule, then the consent on the data
 * about health with its whole text (never a link) and its version. «Accetto e vado
 * avanti» only with everything ticked; the database checks again (all the rules, the
 * version in force).
 */
export function PassoRegole({
  passo,
  nome,
  consensi,
}: {
  passo: PassoPercorso
  nome: string
  consensi: readonly ConsensoCliente[]
}) {
  const blocchi = passo.blocchi ?? []
  const regole = blocchi.filter((b): b is BloccoRegola => b.tipo === 'regola')
  const altri: BloccoPercorso[] = blocchi.filter((b) => b.tipo !== 'regola')
  const salute = consensi.find((c) => c.tipo === 'salute')
  const versione = salute?.versioneInVigore ?? CONSENSO_SALUTE.versione
  // the text shown is the one the client accepts: never a version the database has and the page does not
  const allineato = CONSENSO_SALUTE.versione === versione
  const giaDato = salute?.versione === versione && salute.datoIl ? salute.datoIl : null

  const [spuntate, setSpuntate] = useState<ReadonlySet<string>>(new Set())
  const [consenso, setConsenso] = useState(giaDato !== null)
  const mancanti = regole.filter((r) => !spuntate.has(r.id)).length + (consenso && allineato ? 0 : 1)

  return (
    <div className="space-y-6">
      <ListaBlocchi blocchi={altri} nome={nome} modo="passo" titoloPasso={passo.titolo} />

      {regole.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="mb-3 font-heading text-base font-semibold tracking-tight">{T.regoleTitolo}</legend>
          {regole.map((r) => (
            <Spunta
              key={r.id}
              id={`regola-${r.id}`}
              titolo={r.titolo}
              spuntata={spuntate.has(r.id)}
              onCambia={(v) =>
                setSpuntate((prima) => {
                  const dopo = new Set(prima)
                  if (v) dopo.add(r.id)
                  else dopo.delete(r.id)
                  return dopo
                })
              }
            >
              {r.corpo ? <MarkdownCliente testo={r.corpo} nome={nome} className="text-sm text-muted-foreground" /> : null}
            </Spunta>
          ))}
        </fieldset>
      ) : null}

      <section aria-labelledby="consenso-titolo" className="space-y-3" data-testid="consenso-salute">
        <h3 id="consenso-titolo" className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-status-ok" aria-hidden="true" />
          {T.consensoTitolo}
        </h3>
        {allineato ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            <p className="font-medium">{CONSENSO_SALUTE.titolo}</p>
            <p className="text-foreground/90">{CONSENSO_SALUTE.testo}</p>
            <p className="num text-xs text-muted-foreground">{T.consensoVersione(versioneInParole(versione))}</p>
          </div>
        ) : null}
        {!allineato ? (
          <p role="status" className="text-sm text-status-warning">
            {T.consensoInAggiornamento}
          </p>
        ) : giaDato ? (
          <p className="text-sm text-muted-foreground">{T.consensoGiaDato(formatData(oggiRoma(new Date(giaDato))))}</p>
        ) : (
          <Spunta id="consenso-salute-spunta" titolo={T.consensoAccetto} spuntata={consenso} onCambia={setConsenso} />
        )}
      </section>

      <AzionePasso
        etichetta={T.accettoEVado}
        pronto={mancanti === 0}
        perche={T.mancanoSpunte(mancanti)}
        invio={{ passo: 'regole', azione: 'accetta', dati: { regole: regole.map((r) => r.id), consenso_salute: versione } }}
      />
    </div>
  )
}

/**
 * Step 3, «Il questionario» (release B1b): the words of the CMS (what it is for, no photos of
 * the body here), then the one action: the questionnaire on its own page, where it is saved
 * by itself. «Riprendi» once the client has started it.
 */
export function PassoQuestionario({ passo, nome }: { passo: PassoPercorso; nome: string }) {
  const { indirizzi } = useBackendPercorso()
  const iniziato = passo.stato === 'in_corso'
  return (
    <div className="space-y-6">
      {passo.blocchi && passo.blocchi.length > 0 ? (
        <ListaBlocchi blocchi={passo.blocchi} nome={nome} modo="passo" titoloPasso={passo.titolo} />
      ) : null}
      <div className="space-y-3 border-t border-border/70 pt-5">
        <Link
          href={indirizzi.questionario}
          className="glow-primario inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-auto sm:min-w-64 motion-reduce:transition-none"
          data-testid="azione-passo"
        >
          <ClipboardList className="size-5" aria-hidden="true" />
          {iniziato ? TESTI_QUESTIONARIO.riprendi : TESTI_QUESTIONARIO.compila}
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
        <p className="text-sm text-muted-foreground">{TESTI_QUESTIONARIO.durata}</p>
      </div>
    </div>
  )
}
