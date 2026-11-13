'use client'

import { CalendarDays, CircleCheck, Hourglass, ListChecks, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { ListaBlocchi } from '@/components/percorso/blocchi'
import { PassoBenvenuto, PassoRegole } from '@/components/percorso/passi'
import { TeamCliente } from '@/components/percorso/team-cliente'
import { Timeline } from '@/components/percorso/timeline'
import { Button } from '@/components/ui/button'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { nomeGiorno, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import type { NodoPercorso, PassoPercorso, Percorso } from '@/lib/percorso/letture'
import { etichettaNodo } from '@/lib/percorso/nodi'
import { fraseCose, fraseCoseInAttesa } from '@/lib/percorso/stima'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

/** The step the panel shows: the first of the client available or in progress, in the order of the flow. */
function passoDaFare(passi: readonly PassoPercorso[]): PassoPercorso | null {
  return passi.find((p) => p.attore === 'cliente' && (p.stato === 'disponibile' || p.stato === 'in_corso')) ?? null
}

function giornoDi(istante: string | null): string | null {
  return istante ? formatData(oggiRoma(new Date(istante))) : null
}

/**
 * The top of the page: the greeting and the estimate from the SQL, with the one gold of
 * the screen on the days (glow, still). «Ci siamo quasi» when the day is past.
 */
function Intestazione({ percorso, inAttesa }: { percorso: Percorso; inAttesa: boolean }) {
  const stima = percorso.stima
  // waiting for the team, the panel says there is nothing to do now: the top never says «things to do»
  const cose = stima ? (inAttesa ? fraseCoseInAttesa(stima.cose_da_fare) : fraseCose(stima.cose_da_fare)) : null
  const quasi = !stima || stima.quasi || stima.giorni <= 0
  return (
    <header className="space-y-3 pt-4 sm:pt-8">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{T.marchio}</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{T.saluto(percorso.nome)}</h1>
      {stima && stima.base !== 'iniziato' ? (
        <div className="space-y-2" data-testid="stima">
          {quasi ? (
            <p className="text-lg">
              <span className="num glow-oro font-semibold text-gold">{T.quasi}</span>{' '}
              <span className="text-muted-foreground">{T.quasiSotto}</span>
            </p>
          ) : (
            <p className="text-lg leading-snug">
              {T.giorniPrima}{' '}
              <span className="num glow-oro text-3xl font-semibold whitespace-nowrap text-gold sm:text-4xl">
                {stima.giorni === 1 ? T.giorniUno : T.giorniTanti(stima.giorni)}
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
function Riepilogo({ nodo, passi, nome }: { nodo: NodoPercorso; passi: readonly PassoPercorso[]; nome: string }) {
  return (
    <div className="space-y-6">
      {passi.map((p) => (
        <section key={p.chiave} className="space-y-4" data-testid={`riepilogo-${p.chiave}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-heading text-lg font-semibold tracking-tight">{p.titolo}</h3>
            {giornoDi(p.completatoIl) ? (
              <p className="flex items-center gap-1.5 text-sm text-status-ok">
                <CircleCheck className="size-4" aria-hidden="true" />
                {T.fattoIl(giornoDi(p.completatoIl)!)}
              </p>
            ) : null}
          </div>
          {p.blocchi && p.blocchi.length > 0 ? <ListaBlocchi blocchi={p.blocchi} nome={nome} modo="rileggi" titoloPasso={p.titolo} /> : null}
        </section>
      ))}
      {passi.length === 0 && giornoDi(nodo.completatoIl) ? (
        <p className="text-sm text-status-ok">{T.fattoIl(giornoDi(nodo.completatoIl)!)}</p>
      ) : null}
    </div>
  )
}

/**
 * The whole page of the client (release B1a): the estimate, the timeline of the 7 stages
 * and one panel only, in liquid glass: the step to do, or the waiting, or a completed
 * stage tapped to read it again. Every change of what the panel shows moves the focus to
 * its title. The data come from percorso_cliente() (the server component); a step done
 * redraws the page (revalidatePath).
 */
export function VistaPercorso({ percorso }: { percorso: Percorso }) {
  const daFare = passoDaFare(percorso.passi)
  const nodoAttuale = percorso.nodi.find((n) => n.stato === 'attuale') ?? null
  const [riletto, setRiletto] = useState<string | null>(null)
  const titolo = useRef<HTMLHeadingElement | null>(null)

  // a completed stage open only while it is still completed
  const nodoRiletto = riletto ? (percorso.nodi.find((n) => n.chiave === riletto && n.stato === 'completato') ?? null) : null
  const chiaveVista = nodoRiletto ? `nodo:${nodoRiletto.chiave}` : daFare ? `passo:${daFare.chiave}` : 'attesa'

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

  let kicker = ''
  let intestazione = ''
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
    corpo =
      daFare.chiave === 'benvenuto' ? (
        <PassoBenvenuto key={daFare.chiave} passo={daFare} nome={percorso.nome} team={percorso.team} />
      ) : daFare.chiave === 'regole' ? (
        <PassoRegole key={daFare.chiave} passo={daFare} nome={percorso.nome} consensi={percorso.consensi} />
      ) : (
        // a step this release does not serve yet: its content, no action (the database would refuse it)
        <div className="space-y-4">
          {daFare.blocchi ? <ListaBlocchi blocchi={daFare.blocchi} nome={percorso.nome} modo="rileggi" /> : null}
          <p className="text-sm text-muted-foreground">{T.passoNonServito}</p>
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
        {completati.length > 0 ? (
          <nav aria-label={T.rileggi} className="space-y-2">
            <p className="text-sm font-medium">{T.rileggi}</p>
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
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <Intestazione percorso={percorso} inAttesa={percorso.inAttesa} />

      <Timeline
        nodi={percorso.nodi}
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
