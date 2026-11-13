'use client'

import { CalendarDays, CircleCheck, Hourglass, ListChecks, Rocket, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { AnimazioniDopoIlDisegno } from '@/components/percorso/animazioni/carica'
import { ListaBlocchi } from '@/components/percorso/blocchi'
import { PassoBenvenuto, PassoQuestionario, PassoRegole } from '@/components/percorso/passi'
import {
  CardCall,
  ChiLavora,
  DopoLancio,
  ListaConsegne,
  PassoCommunity,
  PassoObiettivo,
  PassoPrenotazione,
  PassoProgramma,
  PassoTest,
} from '@/components/percorso/passi-lancio'
import { TeamCliente } from '@/components/percorso/team-cliente'
import { Timeline } from '@/components/percorso/timeline'
import { Button } from '@/components/ui/button'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { nomeGiorno, oggiRoma } from '@/lib/date'
import { frazioneNodo } from '@/lib/percorso/animazioni'
import { formatData } from '@/lib/format'
import type { ConsegnaCliente, NodoPercorso, PassoPercorso, Percorso } from '@/lib/percorso/letture'
import { etichettaNodo, primoPassoDelCliente } from '@/lib/percorso/nodi'
import { fraseCose, fraseCoseInAttesa } from '@/lib/percorso/stima'
import { TESTI_PERCORSO as T, TESTI_PASSI as P } from '@/lib/percorso/testi'

function giornoDi(istante: string | null): string | null {
  return istante ? formatData(oggiRoma(new Date(istante))) : null
}

/**
 * The top of the page: the greeting and the estimate from the SQL, with the one gold of
 * the screen on the days (glow, still). «Ci siamo quasi» when the day is past.
 */
function Intestazione({ percorso, inAttesa }: { percorso: Percorso; inAttesa: boolean }) {
  // after the launch the panel says it (its title is the one gold of the screen)
  const stima = percorso.lanciato ? null : percorso.stima
  // waiting for the team, the panel says there is nothing to do now: the top never says «things to do»
  const cose = stima ? (inAttesa ? fraseCoseInAttesa(stima.cose_da_fare) : fraseCose(stima.cose_da_fare)) : null
  // the programme delivered: the start is the moment the client has watched it
  const quasi = !stima || stima.quasi || stima.giorni <= 0 || stima.base === 'iniziato'
  return (
    <header className="space-y-3 pt-4 sm:pt-8">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{T.marchio}</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{T.saluto(percorso.nome)}</h1>
      {stima ? (
        <div className="space-y-2" data-testid="stima">
          {quasi ? (
            <p className="text-lg">
              <span className="num glow-oro font-semibold text-gold">{T.quasi}</span>{' '}
              <span className="text-muted-foreground">{T.quasiSotto}</span>
            </p>
          ) : (
            <p className="text-lg leading-snug">
              {T.giorniPrima}{' '}
              {/* the one number that moves: it rolls when the estimate changes (./animazioni) */}
              <span className="num glow-oro text-3xl font-semibold whitespace-nowrap text-gold sm:text-4xl">
                <span data-anim="giorni">{stima.giorni}</span> {T.parolaGiorni(stima.giorni)}
              </span>{' '}
              {T.giorniDopo}
            </p>
          )}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {cose ? (
              <li className="flex items-center gap-1.5">
                <ListChecks className="size-4" aria-hidden="true" />
                {cose}
              </li>
            ) : null}
            {stima.data && !quasi ? (
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden="true" />
                {T.inizioStimato(`${nomeGiorno(stima.data)} ${formatData(stima.data)}`)}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </header>
  )
}

/** A completed stage read again: its steps, when they were done, their content without counting anything. */
function Riepilogo({
  nodo,
  passi,
  nome,
  consegne,
}: {
  nodo: NodoPercorso
  passi: readonly PassoPercorso[]
  nome: string
  consegne: readonly ConsegnaCliente[]
}) {
  return (
    <div className="space-y-6">
      {passi.map((p) => (
        <section key={p.chiave} className="space-y-4" data-testid={`riepilogo-${p.chiave}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {/* one step only: the title of the panel already says it */}
            {passi.length > 1 ? <h3 className="font-heading text-lg font-semibold tracking-tight">{p.titolo}</h3> : null}
            {giornoDi(p.completatoIl) ? (
              <p className="flex items-center gap-1.5 text-sm text-status-ok">
                <CircleCheck className="size-4" aria-hidden="true" />
                {T.fattoIl(giornoDi(p.completatoIl)!)}
              </p>
            ) : null}
          </div>
          {p.chiave === 'questionario' ? (
            // the introduction asks to answer: once sent, a fixed line says where the answers went
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{T.riepilogoQuestionario}</p>
          ) : (
            <>
              {p.blocchi && p.blocchi.length > 0 ? (
                <ListaBlocchi blocchi={p.blocchi} nome={nome} modo="rileggi" titoloPasso={p.titolo} />
              ) : null}
              {p.chiave === 'programma' && consegne.length > 0 ? <ListaConsegne consegne={consegne} registra={false} /> : null}
            </>
          )}
        </section>
      ))}
      {passi.length === 0 && giornoDi(nodo.completatoIl) ? (
        <p className="text-sm text-status-ok">{T.fattoIl(giornoDi(nodo.completatoIl)!)}</p>
      ) : null}
    </div>
  )
}

/**
 * The whole page of the client (release B1a, with the steps of B2): the estimate, the timeline
 * of the 7 stages and one panel only, in liquid glass: the step to do, or the waiting for the
 * team («Tocca a noi», who and what), or the page after the launch, or a completed stage
 * tapped to read it again. Every change of what the panel shows moves the focus to
 * its title. The data come from percorso_cliente() (the server component); a step done
 * redraws the page (revalidatePath).
 */
export function VistaPercorso({ percorso }: { percorso: Percorso }) {
  const daFare = primoPassoDelCliente(percorso.passi)
  const nodoAttuale = percorso.nodi.find((n) => n.stato === 'attuale') ?? null
  const [riletto, setRiletto] = useState<string | null>(null)
  const titolo = useRef<HTMLHeadingElement | null>(null)
  const radice = useRef<HTMLDivElement | null>(null)

  // a completed stage open only while it is still completed
  const nodoRiletto = riletto ? (percorso.nodi.find((n) => n.chiave === riletto && n.stato === 'completato') ?? null) : null
  const chiaveVista = nodoRiletto
    ? `nodo:${nodoRiletto.chiave}`
    : daFare
      ? `passo:${daFare.chiave}`
      : percorso.lanciato
        ? 'lancio'
        : percorso.attesaTeam
          ? `attesa:${percorso.attesaTeam.passo}`
          : 'attesa'

  const primaVolta = useRef(true)
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false
      return
    }
    titolo.current?.focus()
  }, [chiaveVista])

  const completati = percorso.nodi.filter((n) => n.stato === 'completato')
  const indiceNodo = (chiave: string) => percorso.nodi.findIndex((n) => n.chiave === chiave) + 1
  const totaleNodi = percorso.nodi.length
  // the onboarding call, until it is done: the client sees it from the booking on
  const passoCall = percorso.passi.find((p) => p.chiave === 'call') ?? null
  const callAperta = percorso.call && passoCall?.stato !== 'fatto' ? percorso.call : null

  const rileggi = (etichetta: string) =>
    completati.length > 0 ? (
      <nav aria-label={etichetta} className="space-y-2">
        <p className="text-sm font-medium">{etichetta}</p>
        <ul className="flex flex-wrap gap-2">
          {completati.map((n) => (
            <li key={n.chiave}>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setRiletto(n.chiave)}>
                <CircleCheck className="size-4 text-status-ok" aria-hidden="true" />
                {etichettaNodo(n.chiave, 'lunga')}
              </Button>
            </li>
          ))}
        </ul>
      </nav>
    ) : null

  let kicker = ''
  let intestazione: React.ReactNode = ''
  let corpo: React.ReactNode = null

  if (nodoRiletto) {
    kicker = `${T.nodoCompletato} · ${T.tappa(indiceNodo(nodoRiletto.chiave), totaleNodi)}`
    intestazione = etichettaNodo(nodoRiletto.chiave, 'lunga')
    corpo = (
      <>
        <Riepilogo
          nodo={nodoRiletto}
          passi={percorso.passi.filter((p) => p.nodo === nodoRiletto.chiave && p.stato === 'fatto')}
          nome={percorso.nome}
          consegne={percorso.consegne}
        />
        <div className="border-t border-border/70 pt-5">
          <Button type="button" variant="outline" className="h-11" onClick={() => setRiletto(null)}>
            {daFare ? T.tornaAlPasso : T.tornaInAttesa}
          </Button>
        </div>
      </>
    )
  } else if (daFare) {
    const nodo = etichettaNodo(daFare.nodo)
    const tappa = T.tappa(indiceNodo(daFare.nodo), totaleNodi)
    kicker = nodo === daFare.titolo ? tappa : `${tappa} · ${nodo}`
    intestazione = daFare.titolo
    const nome = percorso.nome
    corpo =
      daFare.chiave === 'benvenuto' ? (
        <PassoBenvenuto key={daFare.chiave} passo={daFare} nome={nome} team={percorso.team} />
      ) : daFare.chiave === 'regole' ? (
        <PassoRegole key={daFare.chiave} passo={daFare} nome={nome} consensi={percorso.consensi} />
      ) : daFare.chiave === 'questionario' ? (
        <PassoQuestionario key={daFare.chiave} passo={daFare} nome={nome} />
      ) : daFare.chiave === 'prenotazione' ? (
        <PassoPrenotazione key={daFare.chiave} passo={daFare} nome={nome} linkPrenotazione={percorso.linkPrenotazione} />
      ) : daFare.chiave === 'community' ? (
        <PassoCommunity
          key={daFare.chiave}
          passo={daFare}
          nome={nome}
          community={percorso.community}
          linkCommunity={percorso.linkCommunity}
          call={callAperta}
        />
      ) : daFare.chiave === 'obiettivo' ? (
        <PassoObiettivo key={daFare.chiave} passo={daFare} nome={nome} />
      ) : daFare.chiave === 'test' ? (
        <PassoTest key={daFare.chiave} passo={daFare} nome={nome} />
      ) : daFare.chiave === 'programma' ? (
        <PassoProgramma key={daFare.chiave} passo={daFare} nome={nome} consegne={percorso.consegne} />
      ) : (
        // a step of a later flow: its content, no action (the database would refuse it)
        <div className="space-y-4">
          {daFare.blocchi ? <ListaBlocchi blocchi={daFare.blocchi} nome={nome} modo="rileggi" /> : null}
          <p className="text-sm text-muted-foreground">{T.passoNonServito}</p>
        </div>
      )
  } else if (percorso.lanciato) {
    kicker = `${P.lancio.kicker} · ${T.tappa(totaleNodi, totaleNodi)}`
    intestazione = (
      <span className="inline-flex items-center gap-2.5">
        <Rocket className="size-6 shrink-0 text-gold" aria-hidden="true" />
        <span className="glow-oro text-gold">{P.lancio.titolo}</span>
      </span>
    )
    corpo = (
      <div className="space-y-6">
        <DopoLancio
          blocchi={percorso.dopoLancio}
          nome={percorso.nome}
          checkpoint={percorso.checkpoint}
          linkCommunity={percorso.linkCommunity}
          gruppoPrivatoUrl={percorso.gruppoPrivatoUrl}
        />
        {rileggi(P.lancio.rileggi)}
      </div>
    )
  } else if (percorso.attesaTeam) {
    // «Tocca a noi»: who of the team is working, what that person is doing, what the client can read again
    const attesa = percorso.attesaTeam
    // the call is confirmed: the next thing is the client's, to be there; never «Tocca a noi» and «we write»
    const appuntamento = attesa.passo === 'call' && callAperta?.stato === 'prenotata' ? callAperta : null
    kicker = appuntamento ? P.attesa.appuntamento : P.attesa.kicker
    intestazione = attesa.cosa
    corpo = (
      <div className="space-y-6" data-testid="pannello-attesa" data-passo={attesa.passo}>
        {attesa.chi ? <ChiLavora chi={attesa.chi} /> : null}
        {callAperta && (attesa.passo === 'prenotazione' || attesa.passo === 'call') ? <CardCall call={callAperta} /> : null}
        {attesa.passo === 'call' && passoCall?.blocchi && passoCall.blocchi.length > 0 ? (
          <ListaBlocchi blocchi={passoCall.blocchi} nome={percorso.nome} modo="rileggi" titoloPasso={P.call.titolo} />
        ) : null}
        <p className="flex items-start gap-3 text-[0.95rem] leading-relaxed text-foreground/90">
          {appuntamento ? (
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Hourglass className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          {appuntamento
            ? P.attesa.ciVediamo(`${nomeGiorno(appuntamento.giorno)} ${formatData(appuntamento.giorno)}`, appuntamento.ora)
            : P.attesa.sotto}
        </p>
        {rileggi(T.rileggi)}
      </div>
    )
  } else {
    kicker = T.attesaTitolo
    intestazione = T.attesa
    corpo = (
      <div className="space-y-6" data-testid="pannello-attesa">
        <p className="flex items-start gap-3 text-[0.95rem] leading-relaxed text-foreground/90">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {T.attesaSotto}
        </p>
        <TeamCliente team={percorso.team} />
        {rileggi(T.rileggi)}
      </div>
    )
  }

  const frazioni = percorso.nodi.map((n) => frazioneNodo(n, percorso.passi))
  const stima = percorso.lanciato ? null : percorso.stima
  const giorni = stima && !stima.quasi && stima.giorni > 0 && stima.base !== 'iniziato' ? stima.giorni : null

  return (
    <div ref={radice} className="space-y-6 sm:space-y-8">
      <AnimazioniDopoIlDisegno
        radice={radice}
        nodi={percorso.nodi}
        frazioni={frazioni}
        giorni={giorni}
        chiaveVista={chiaveVista}
        lanciato={percorso.lanciato}
      />
      <Intestazione percorso={percorso} inAttesa={percorso.inAttesa} />

      <Timeline
        nodi={percorso.nodi}
        frazioni={frazioni}
        selezionato={nodoRiletto?.chiave ?? nodoAttuale?.chiave ?? null}
        onSeleziona={(chiave) => {
          const nodo = percorso.nodi.find((n) => n.chiave === chiave)
          setRiletto(nodo?.stato === 'completato' ? chiave : null)
        }}
      />

      <VetroLiquido
        as="section"
        raggio={20}
        sfocatura={10}
        aria-labelledby="titolo-pannello"
        className="vetro space-y-6 rounded-[20px] p-5 sm:p-8"
        data-testid="pannello-passo"
        data-vista={chiaveVista}
      >
        <div data-anim="contenuto-pannello" className="space-y-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{kicker}</p>
          <h2
            id="titolo-pannello"
            ref={titolo}
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none"
          >
            {intestazione}
          </h2>
        </div>
        {corpo}
        </div>
      </VetroLiquido>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
        <Link
          href="/percorso/consensi"
          className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          {T.iTuoiConsensi}
        </Link>
      </footer>
    </div>
  )
}
