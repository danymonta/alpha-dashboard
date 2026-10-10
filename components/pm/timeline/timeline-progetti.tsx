'use client'

import { Archive, CalendarClock, CalendarOff, CheckCircle2, ChevronRight, CirclePause, TriangleAlert, UserRoundX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { SenzaCoach, StatoProgettoBadge } from '@/components/pm/stato-progetto'
import { LinkRiga } from '@/components/shell/link-riga'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatData, formatPercentuale } from '@/lib/format'
import { organizzaGantt, type Forma, type ListaGantt, type RigaGantt, type TaskGantt } from '@/lib/gantt'
import { ETICHETTA_STATO_PROGETTO, ETICHETTA_STATO_TASK, linkTask, type StatoProgetto, type StatoTask } from '@/lib/progetti'
import {
  GIORNI_IN_SCADENZA,
  dividiPerFine,
  fineProgetto,
  formaProgetto,
  geometriaTimeline,
  giornoCss,
  intervalloTimeline,
  larghezzaTimeline,
  senzaCoachDaSegnalare,
  taccheTimeline,
  testoFine,
  xOggiTimeline,
  type FineProgetto,
  type Intervallo,
  type ScalaTimeline,
} from '@/lib/progetti-timeline'
import { cn } from '@/lib/utils'

export type ListaTimeline = ListaGantt & { task_totali: number; task_completati: number }
export type TaskTimeline = TaskGantt & {
  stato: StatoTask
  /** From v_pm_task: open and past due, Europe/Rome. */
  in_ritardo: boolean
}

export type ProgettoTimeline = {
  id: string
  nome: string
  stato: StatoProgetto
  data_inizio: string | null
  data_fine: string | null
  /** A client's project (02/10/2026): its end is the end of the client's path. */
  per_cliente: boolean
  /** Only when the reader may see that client (RLS on clients decides). */
  cliente: string | null
  /** The coach's name, null without one. */
  coach: string | null
  task_totali: number
  task_completati: number
  /** Ratio from v_pm_progetti; null without tasks. */
  avanzamento: number | null
  /** v_pm_progetti.scaduto: active or paused, past its end. */
  scaduto: boolean
  /** Its lists and its tasks with a date: the rows under the project once opened. */
  liste: ListaTimeline[]
  task: TaskTimeline[]
}

export type RepartoTimeline = { id: string; nome: string; progetti: ProgettoTimeline[] }

type Figlio = RigaGantt<ListaTimeline, TaskTimeline>

type ProgettoSulGrafico = {
  progetto: ProgettoTimeline
  reparto: string
  forma: Forma
  fine: FineProgetto
  /** A client's path still running without a coach: a mark beside its end. */
  senzaCoach: boolean
  figli: Figlio[]
}

type Riga =
  /** `quanti`: all its projects, as in the list; `senzaFine` of them are listed apart. */
  | { tipo: 'reparto'; id: string; nome: string; quanti: number; senzaFine: number }
  | { tipo: 'progetto'; voce: ProgettoSulGrafico; aperto: boolean }
  | { tipo: 'figlio'; voce: ProgettoSulGrafico; figlio: Figlio; indice: number }

/** A mark is never narrower than this to the finger, whatever its drawn width. */
const MIN_TOCCO = 24
/** A bar is never drawn thinner than this: a one-day mark stays in sight by quarter. */
const MIN_BARRA = 4
/** Room after the furthest end: its date is written there, with the clock and "senza coach". */
const ARIA_DESTRA = 128
/** Rows of projects, lists and tasks: 44px inside, plus the 1px line under them. */
const ALTEZZA_RIGA = 'h-[45px]'

/**
 * A length on the axis: `giorni` days at the current scale, plus fixed
 * pixels. The width of a day is the CSS variable --g, set on the axis from
 * the visible width (giornoCss): nothing is measured, nothing re-renders
 * when the axis scrolls or the window is resized.
 */
function lung(giorni: number, piuPx = 0): string {
  return piuPx === 0 ? `calc(var(--g) * ${giorni})` : `calc(var(--g) * ${giorni} + ${piuPx}px)`
}

/** Recessive: paused, completed or archived projects stay on the chart, faded, with their state in words. */
function recessivo(stato: StatoProgetto) {
  return stato !== 'attivo'
}

function chiaveFiglio(progettoId: string, figlio: Figlio, indice: number) {
  if (figlio.tipo === 'lista') return `${progettoId}-l-${figlio.lista.id}`
  if (figlio.tipo === 'task') return `${progettoId}-t-${figlio.task.id}`
  return `${progettoId}-g-${indice}`
}

function chiaveRiga(riga: Riga) {
  if (riga.tipo === 'reparto') return `r-${riga.id}`
  if (riga.tipo === 'progetto') return `p-${riga.voce.progetto.id}`
  return chiaveFiglio(riga.voce.progetto.id, riga.figlio, riga.indice)
}

function testoDate(forma: Forma): string {
  if (forma.forma === 'barra') {
    return forma.inizio === forma.fine
      ? `Il ${formatData(forma.inizio)}`
      : `Dal ${formatData(forma.inizio)} al ${formatData(forma.fine)}`
  }
  if (forma.forma === 'rombo') {
    return forma.quale === 'scadenza' ? `Scadenza ${formatData(forma.data)}` : `Inizio ${formatData(forma.data)}, senza scadenza`
  }
  return 'Senza date'
}

const ICONA_CHIUSO = { completato: CheckCircle2, archiviato: Archive } as const

/**
 * The end of a project in a few words, under its name and in the table:
 * "tra 17 giorni" with a clock when it is within 30 days (icon and words,
 * never colour alone), "finito il …" for a client's path that is over,
 * "doveva finire il …" for any other project past its end, the state in
 * words for a paused, completed or archived one.
 */
function FineInParole({ voce, className }: { voce: Pick<ProgettoSulGrafico, 'progetto' | 'fine'>; className?: string }) {
  const { progetto, fine } = voce
  const base = cn('inline-flex min-w-0 max-w-full items-center gap-1 text-xs', className)

  if (fine.tipo === 'chiuso') {
    const Icona = ICONA_CHIUSO[progetto.stato as keyof typeof ICONA_CHIUSO] ?? CheckCircle2
    return (
      <span className={cn(base, 'text-muted-foreground')}>
        <Icona className={cn('size-3.5 shrink-0', progetto.stato === 'completato' && 'text-status-ok')} aria-hidden="true" />
        <span className="truncate">{ETICHETTA_STATO_PROGETTO[progetto.stato]}</span>
      </span>
    )
  }
  if (fine.tipo === 'senza_fine') {
    return <span className={cn(base, 'text-muted-foreground')}>Senza data di fine</span>
  }

  const testo = testoFine(fine, progetto.per_cliente)
  if (progetto.stato === 'in_pausa') {
    return (
      <span className={cn(base, 'text-muted-foreground')}>
        <CirclePause className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">In pausa · {testo}</span>
      </span>
    )
  }
  if (fine.tipo === 'in_scadenza') {
    return (
      <span className={cn(base, 'text-status-warning')} data-testid="in-scadenza">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{testo}</span>
      </span>
    )
  }
  if (fine.tipo === 'finito' && !progetto.per_cliente) {
    return (
      <span className={cn(base, 'text-status-warning')}>
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{testo}</span>
      </span>
    )
  }
  return (
    <span className={cn(base, 'text-muted-foreground')}>
      <span className="num truncate">{testo}</span>
    </span>
  )
}

function Segmenti<T extends string>({
  etichetta,
  valore,
  opzioni,
  onCambia,
}: {
  etichetta: string
  valore: T
  opzioni: readonly { valore: T; etichetta: string }[]
  onCambia: (valore: T) => void
}) {
  return (
    <div role="group" aria-label={etichetta} className="inline-flex rounded-lg border border-border p-0.5">
      {opzioni.map((o) => {
        const attivo = o.valore === valore
        return (
          <button
            key={o.valore}
            type="button"
            aria-pressed={attivo}
            onClick={() => onCambia(o.valore)}
            className={cn(
              'h-11 rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              attivo ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.etichetta}
          </button>
        )
      })}
    </div>
  )
}

function Dettaglio({ termine, children }: { termine: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{termine}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

function Avanzamento({ completati, totali, avanzamento }: { completati: number; totali: number; avanzamento: number | null }) {
  if (totali === 0) return <>Nessuna attività</>
  return (
    <span className="num">
      {completati} di {totali} completate{avanzamento !== null ? ` (${formatPercentuale(avanzamento)})` : ''}
    </span>
  )
}

function TooltipProgetto({ voce }: { voce: ProgettoSulGrafico }) {
  const { progetto: p } = voce
  return (
    <>
      <div>
        <p className="font-medium break-words">{p.nome}</p>
        <p className="text-xs text-muted-foreground">
          {voce.reparto}
          {p.per_cliente ? ' · percorso del cliente' : ''}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {p.cliente && p.cliente !== p.nome ? <Dettaglio termine="Cliente">{p.cliente}</Dettaglio> : null}
        {p.per_cliente || p.coach ? <Dettaglio termine="Coach">{p.coach ?? <SenzaCoach />}</Dettaglio> : null}
        <Dettaglio termine="Stato">
          <StatoProgettoBadge stato={p.stato} className="text-popover-foreground" />
        </Dettaglio>
        <Dettaglio termine="Inizio">
          <span className="num">{p.data_inizio ? formatData(p.data_inizio) : 'Senza data'}</span>
        </Dettaglio>
        <Dettaglio termine="Fine">
          <span className="num">{formatData(p.data_fine)}</span>
        </Dettaglio>
        {voce.fine.tipo !== 'chiuso' ? (
          <Dettaglio termine="Alla fine">
            <FineInParole voce={voce} />
          </Dettaglio>
        ) : null}
        <Dettaglio termine="Attività">
          <Avanzamento completati={p.task_completati} totali={p.task_totali} avanzamento={p.avanzamento} />
        </Dettaglio>
      </dl>
      <LinkBottone href={`/progetti/${p.id}`} variant="outline" className="w-full">
        Apri il progetto
      </LinkBottone>
    </>
  )
}

function StatoTaskEtichetta({ task }: { task: TaskTimeline }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {task.stato === 'completato' ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {ETICHETTA_STATO_TASK[task.stato]}
      {task.in_ritardo ? (
        <span className="inline-flex items-center gap-1">
          {' · '}
          <TriangleAlert className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
          in ritardo
        </span>
      ) : null}
    </span>
  )
}

function TooltipFiglio({ figlio, progetto, nomeLista }: { figlio: Exclude<Figlio, { tipo: 'gruppo' }>; progetto: string; nomeLista: string | null }) {
  if (figlio.tipo === 'lista') {
    const { lista } = figlio
    return (
      <>
        <div>
          <p className="font-medium break-words">{lista.nome}</p>
          <p className="text-xs text-muted-foreground">Lista (milestone) · {progetto}</p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <Dettaglio termine="Date">
            {testoDate(figlio.forma)}
            {figlio.derivata ? <span className="block text-muted-foreground">ricavate dalle sue attività</span> : null}
          </Dettaglio>
          <Dettaglio termine="Avanzamento">
            <span className="num">
              {lista.task_completati} di {lista.task_totali} completate
            </span>
          </Dettaglio>
        </dl>
      </>
    )
  }
  const { task } = figlio
  return (
    <>
      <div>
        <p className="font-medium break-words">{task.titolo}</p>
        <p className="text-xs text-muted-foreground">
          {nomeLista ? `Attività · ${nomeLista}` : 'Attività'} · {progetto}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <Dettaglio termine="Date">{testoDate(figlio.forma)}</Dettaglio>
        <Dettaglio termine="Stato">
          <StatoTaskEtichetta task={task} />
        </Dettaglio>
      </dl>
    </>
  )
}

/**
 * One mark on the axis: a bar or a diamond, with a hit area at least
 * MIN_TOCCO wide and as tall as the row. Hover, focus or tap open the
 * tooltip (a popover, so touch works); the mark lifts while it is pointed
 * at or open. `dopo` sits right after the mark. Positions in days, drawn
 * with the axis' day width (lung).
 */
function Segno({
  forma,
  intervallo,
  etichetta,
  testId,
  classeBarra,
  classeRombo,
  contenuto,
  dopo,
}: {
  forma: Forma
  intervallo: Intervallo
  etichetta: string
  testId: string
  classeBarra: string
  classeRombo: string
  contenuto: ReactNode
  dopo?: ReactNode
}) {
  const g = geometriaTimeline(forma, intervallo, 1)
  if (g.forma === 'nessuna') return null

  const larghezzaSegno = g.forma === 'barra' ? `max(${MIN_BARRA}px, ${lung(g.larghezza)})` : '12px'
  const larghezzaTocco = `max(${MIN_TOCCO}px, ${larghezzaSegno})`
  const centro = g.forma === 'barra' ? `(${lung(g.x)} + ${larghezzaSegno} / 2)` : lung(g.x)
  const dopoIl = g.forma === 'barra' ? `calc(${lung(g.x)} + ${larghezzaSegno} + 6px)` : lung(g.x, 13)
  const solleva =
    'transition-[filter] group-hover:brightness-125 group-focus-visible:brightness-125 group-data-[popup-open]:brightness-125'

  return (
    <>
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={120}
          aria-label={etichetta}
          data-testid={testId}
          render={
            <button
              type="button"
              data-segno=""
              className="group absolute top-0 flex h-11 items-center justify-center rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              style={{ left: `calc(${centro} - ${larghezzaTocco} / 2)`, width: larghezzaTocco }}
            />
          }
        >
          {g.forma === 'barra' ? (
            <span
              aria-hidden="true"
              className={cn('block', classeBarra, solleva, g.tagliataPrima && 'rounded-l-none', g.tagliataDopo && 'rounded-r-none')}
              style={{ width: larghezzaSegno }}
            />
          ) : (
            <span aria-hidden="true" className={cn('block rotate-45 rounded-[2px]', classeRombo, solleva)} />
          )}
        </PopoverTrigger>
        <PopoverContent side="top" className="w-72">
          {contenuto}
        </PopoverContent>
      </Popover>
      {dopo ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 flex h-11 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground"
          style={{ left: dopoIl }}
        >
          {dopo}
        </span>
      ) : null}
    </>
  )
}

function SegnoProgetto({ voce, intervallo }: { voce: ProgettoSulGrafico; intervallo: Intervallo }) {
  const { progetto: p, fine } = voce
  const faded = recessivo(p.stato)
  const parole = fine.tipo === 'chiuso' ? ETICHETTA_STATO_PROGETTO[p.stato].toLowerCase() : testoFine(fine, p.per_cliente)
  const statoParole = p.stato === 'in_pausa' ? 'in pausa, ' : ''
  return (
    <Segno
      forma={voce.forma}
      intervallo={intervallo}
      etichetta={`${p.nome}: ${testoDate(voce.forma).toLowerCase()}, ${statoParole}${parole}${voce.senzaCoach ? ', senza coach' : ''}`}
      testId="timeline-barra"
      classeBarra={cn('h-3 rounded-[4px] bg-gantt-progetto', faded && 'opacity-40')}
      classeRombo={cn('size-3 bg-gantt-progetto', faded && 'opacity-40')}
      contenuto={<TooltipProgetto voce={voce} />}
      dopo={
        <>
          {fine.tipo === 'in_scadenza' && p.stato === 'attivo' ? (
            <CalendarClock className="size-3.5 text-status-warning" />
          ) : null}
          <span className="num">{formatData(p.data_fine)}</span>
          {/* icon here, words in the legend and in the bar's label */}
          {voce.senzaCoach ? <UserRoundX className="size-3.5 text-status-warning" data-testid="timeline-senza-coach" /> : null}
        </>
      }
    />
  )
}

function SegnoFiglio({
  voce,
  figlio,
  intervallo,
}: {
  voce: ProgettoSulGrafico
  figlio: Exclude<Figlio, { tipo: 'gruppo' }>
  intervallo: Intervallo
}) {
  const lista = figlio.tipo === 'lista'
  const completata = figlio.tipo === 'task' && figlio.task.stato === 'completato'
  const inRitardo = figlio.tipo === 'task' && figlio.task.in_ritardo
  const titolo = lista ? figlio.lista.nome : figlio.task.titolo
  const statoTesto =
    figlio.tipo === 'task' ? `, ${ETICHETTA_STATO_TASK[figlio.task.stato].toLowerCase()}${inRitardo ? ', in ritardo' : ''}` : ''
  const nomeLista =
    figlio.tipo === 'task' ? (voce.progetto.liste.find((l) => l.id === figlio.task.tasklist_id)?.nome ?? null) : null

  return (
    <Segno
      forma={figlio.forma}
      intervallo={intervallo}
      etichetta={`${titolo}: ${testoDate(figlio.forma).toLowerCase()}${statoTesto}`}
      testId={lista ? 'timeline-lista' : 'timeline-task'}
      classeBarra={cn(
        lista
          ? figlio.derivata
            ? 'h-2 rounded-[3px] border border-dashed border-gantt-lista'
            : 'h-2 rounded-[3px] bg-gantt-lista'
          : 'h-2.5 rounded-[3px] bg-gantt-task',
        completata && 'opacity-40',
      )}
      classeRombo={cn('size-2.5', lista ? 'bg-gantt-lista' : 'bg-gantt-task', completata && 'opacity-40')}
      contenuto={<TooltipFiglio figlio={figlio} progetto={voce.progetto.nome} nomeLista={nomeLista} />}
      dopo={
        completata ? (
          <CheckCircle2 className="size-3.5" />
        ) : inRitardo ? (
          <TriangleAlert className="size-3.5 text-status-warning" />
        ) : null
      }
    />
  )
}

/** Name of a child row (a list or a task of the opened project): icons, never colour alone. */
function NomeFiglio({ figlio }: { figlio: Figlio }) {
  if (figlio.tipo === 'gruppo') {
    return <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{figlio.nome}</span>
  }
  if (figlio.tipo === 'lista') {
    return <span className="line-clamp-2 min-w-0 text-xs leading-tight font-medium break-words">{figlio.lista.nome}</span>
  }
  const { task } = figlio
  return (
    <>
      <span
        className={cn('line-clamp-2 min-w-0 text-xs leading-tight break-words', task.stato === 'completato' && 'text-muted-foreground')}
      >
        {task.titolo}
      </span>
      {task.stato === 'completato' ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="Completata" role="img" />
      ) : null}
      {task.in_ritardo ? (
        <TriangleAlert className="size-3.5 shrink-0 text-status-warning" aria-label="In ritardo" role="img" />
      ) : null}
    </>
  )
}

function Legenda({ conFigli, conRecessivi, conSenzaCoach }: { conFigli: boolean; conRecessivi: boolean; conSenzaCoach: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-5 rounded-[4px] bg-gantt-progetto" />
        Progetto
      </li>
      {conRecessivi ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-[4px] bg-gantt-progetto opacity-40" />
          In pausa, completato o archiviato
        </li>
      ) : null}
      {/* lists and tasks only once a project is open: they are not on the chart before */}
      {conFigli ? (
        <>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-5 rounded-[3px] bg-gantt-lista" />
            Lista (milestone)
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-5 rounded-[3px] bg-gantt-task" />
            Attività
          </li>
        </>
      ) : null}
      <li className="flex items-center gap-1.5">
        <CalendarClock className="size-3.5 text-status-warning" aria-hidden="true" />
        Finisce entro {GIORNI_IN_SCADENZA} giorni
      </li>
      {conSenzaCoach ? (
        <li className="flex items-center gap-1.5">
          <UserRoundX className="size-3.5 text-status-warning" aria-hidden="true" />
          Percorso senza coach
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 border-l border-dashed border-foreground" />
        Oggi
      </li>
    </ul>
  )
}

/**
 * A scroll position that does not cut the name of a period in half: when the
 * left edge would fall where the name is sliding out (sticky), a little
 * earlier, so the whole name is in sight. Read from the page once, when the
 * chart opens or a project does: nothing runs while scrolling.
 */
function senzaEtichetteTagliate(el: HTMLElement, x: number): number {
  for (const etichetta of el.querySelectorAll<HTMLElement>('[data-etichetta-periodo]')) {
    const periodo = etichetta.parentElement
    if (!periodo) continue
    const fine = periodo.offsetLeft + periodo.offsetWidth
    const serve = etichetta.offsetWidth + 2
    if (x > fine - serve && x < fine) return Math.max(0, fine - serve)
  }
  return x
}

function Grafico({
  righe,
  forme,
  oggi,
  scala,
  onApri,
}: {
  righe: Riga[]
  /** Every mark that can be drawn, opened or not: the axis does not jump when a project opens. */
  forme: Forma[]
  oggi: string
  scala: ScalaTimeline
  onApri: (id: string) => void
}) {
  const scorrimento = useRef<HTMLDivElement>(null)
  const lineaOggi = useRef<HTMLSpanElement>(null)
  const intervallo = intervalloTimeline(forme, oggi, scala)
  const giorni = larghezzaTimeline(intervallo, 1)
  const listaTacche = taccheTimeline(intervallo, scala)
  const giornoOggi = xOggiTimeline(oggi, intervallo, 1)
  // the project just opened, to bring its lists and tasks in sight
  const [daMostrare, setDaMostrare] = useState<{ id: string } | null>(null)
  const asse = {
    '--g': giornoCss(scala, giorni, ARIA_DESTRA),
    width: lung(giorni, ARIA_DESTRA),
  } as CSSProperties

  // open on today, a quarter of the view before it (as the project's Gantt): what is
  // about to end is in sight. By quarter on a computer everything fits: nothing to scroll.
  useEffect(() => {
    const el = scorrimento.current
    const linea = lineaOggi.current
    if (el && linea) el.scrollLeft = senzaEtichetteTagliate(el, Math.max(0, linea.offsetLeft - el.clientWidth / 4))
  }, [scala, intervallo.da, intervallo.a])

  // a project opened while the view is elsewhere: its first list or task comes in sight
  useEffect(() => {
    const el = scorrimento.current
    if (!el || !daMostrare) return
    const segni = el.querySelectorAll<HTMLElement>(`[data-figlio-di="${daMostrare.id}"] [data-segno]`)
    if (segni.length === 0) return
    const primo = Math.min(...Array.from(segni, (s) => s.offsetLeft))
    if (primo < el.scrollLeft || primo > el.scrollLeft + el.clientWidth - MIN_TOCCO) {
      el.scrollLeft = senzaEtichetteTagliate(el, Math.max(0, primo - 16))
    }
  }, [daMostrare])

  return (
    <div
      role="figure"
      aria-label={`Timeline dei progetti, dal ${formatData(intervallo.da)} al ${formatData(intervallo.a)}`}
      className="flex overflow-hidden rounded-xl border border-border bg-card"
      data-testid="timeline-grafico"
    >
      {/* fixed column of names: narrow on a phone, the axis needs the room */}
      <div className="w-36 shrink-0 border-r border-border sm:w-64">
        {righe.map((riga) => {
          if (riga.tipo === 'reparto') {
            return (
              <div
                key={chiaveRiga(riga)}
                className="flex h-12 min-w-0 items-center border-b border-border px-2 sm:px-3"
                data-testid="timeline-reparto"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={cn(
                        'min-w-0 text-sm leading-tight font-medium break-words',
                        riga.senzaFine > 0 ? 'truncate' : 'line-clamp-2',
                      )}
                    >
                      {riga.nome}
                    </span>
                    <span className="num shrink-0 text-sm text-muted-foreground" data-testid="timeline-reparto-quanti">
                      {riga.quanti}
                    </span>
                  </span>
                  {/* the count is the list's: those without an end are below the chart */}
                  {riga.senzaFine > 0 ? (
                    <span className="num block truncate text-[11px] leading-tight text-muted-foreground">
                      {riga.senzaFine} senza data di fine
                    </span>
                  ) : null}
                </span>
              </div>
            )
          }
          if (riga.tipo === 'progetto') {
            const { progetto: p, figli } = riga.voce
            return (
              <div
                key={chiaveRiga(riga)}
                className={cn('flex min-w-0 items-center border-b border-border/60 pl-2 sm:pl-3', ALTEZZA_RIGA)}
                data-testid="timeline-progetto"
                data-progetto={p.id}
              >
                <LinkRiga
                  href={`/progetti/${p.id}`}
                  className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm pr-1 leading-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'truncate text-xs font-medium hover:underline sm:text-sm',
                      recessivo(p.stato) && 'text-muted-foreground',
                    )}
                  >
                    {p.nome}
                  </span>
                  <FineInParole voce={riga.voce} />
                </LinkRiga>
                {figli.length > 0 ? (
                  <button
                    type="button"
                    aria-expanded={riga.aperto}
                    aria-label={`Liste e attività di ${p.nome}`}
                    onClick={() => {
                      onApri(p.id)
                      if (!riga.aperto) setDaMostrare({ id: p.id })
                    }}
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronRight className={cn('size-4 transition-transform', riga.aperto && 'rotate-90')} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            )
          }
          const { figlio } = riga
          return (
            <div
              key={chiaveRiga(riga)}
              className={cn(
                'flex min-w-0 items-center gap-1 border-b border-border/60 bg-muted/30 pr-2 pl-5 sm:pr-3 sm:pl-8',
                ALTEZZA_RIGA,
                figlio.tipo === 'task' && figlio.livello === 1 && 'pl-7 sm:pl-12',
              )}
              data-testid="timeline-figlio"
            >
              {figlio.tipo === 'task' ? (
                // a task opens where it lives (05/10/2026): its project's Attività, its sheet open
                <LinkRiga
                  href={linkTask(riga.voce.progetto.id, figlio.task.id)}
                  className="flex min-w-0 flex-1 items-center gap-1 self-stretch rounded-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <NomeFiglio figlio={figlio} />
                </LinkRiga>
              ) : (
                <NomeFiglio figlio={figlio} />
              )}
            </div>
          )
        })}
      </div>

      {/* the time axis: the only thing that scrolls sideways; a size container, so a day's width follows the visible width */}
      <div
        ref={scorrimento}
        className="min-w-0 flex-1 overflow-x-auto focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        style={{ containerType: 'inline-size' }}
        tabIndex={0}
        aria-label="Linea del tempo: scorri in orizzontale"
        data-testid="timeline-asse"
      >
        {/* never narrower than the card: a short axis leaves no empty band on the right */}
        <div className="relative min-w-full" style={asse}>
          {/* recessive grid, one hairline per tick, through every row */}
          {listaTacche.map((t) => (
            <span key={t.data} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: lung(t.giorno) }} />
          ))}

          {righe.map((riga) => {
            if (riga.tipo === 'reparto') {
              // each department repeats the axis: further down the page the months are still in sight
              return (
                <div key={chiaveRiga(riga)} className="relative h-12 border-b border-border" aria-hidden="true">
                  {listaTacche.map((t) => (
                    // the period's name sticks to the left edge while the period is in view (CSS
                    // only, nothing on scroll); above the "Oggi" line, on the card's colour
                    <div key={t.data} className="absolute inset-y-0" style={{ left: lung(t.giorno), width: lung(t.durata) }}>
                      <span
                        data-etichetta-periodo=""
                        className="num sticky left-0 z-[1] mt-1.5 ml-px inline-block bg-card px-1 text-xs whitespace-nowrap text-muted-foreground"
                      >
                        {t.etichetta}
                      </span>
                    </div>
                  ))}
                  <span
                    className="absolute bottom-1 z-[1] -translate-x-1/2 rounded-sm bg-background px-1.5 text-xs leading-5 font-medium text-foreground"
                    style={{ left: lung(giornoOggi) }}
                  >
                    Oggi
                  </span>
                </div>
              )
            }
            if (riga.tipo === 'progetto') {
              return (
                <div
                  key={chiaveRiga(riga)}
                  className={cn('relative border-b border-border/60', ALTEZZA_RIGA)}
                  data-testid="timeline-riga-asse"
                  data-progetto={riga.voce.progetto.id}
                >
                  <SegnoProgetto voce={riga.voce} intervallo={intervallo} />
                </div>
              )
            }
            return (
              <div
                key={chiaveRiga(riga)}
                className={cn('relative border-b border-border/60 bg-muted/30', ALTEZZA_RIGA)}
                data-figlio-di={riga.voce.progetto.id}
              >
                {riga.figlio.tipo === 'gruppo' ? null : (
                  <SegnoFiglio voce={riga.voce} figlio={riga.figlio} intervallo={intervallo} />
                )}
              </div>
            )
          })}

          <span
            ref={lineaOggi}
            aria-hidden="true"
            data-testid="timeline-oggi"
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/70"
            style={{ left: lung(giornoOggi) }}
          />
        </div>
      </div>
    </div>
  )
}

function Coach({ progetto }: { progetto: ProgettoTimeline }) {
  if (progetto.coach) return <>{progetto.coach}</>
  if (progetto.per_cliente) return <SenzaCoach />
  return <span className="text-muted-foreground">–</span>
}

function StatoSeNonAttivo({ stato }: { stato: StatoProgetto }) {
  return stato === 'attivo' ? null : <StatoProgettoBadge stato={stato} className="mt-0.5" />
}

/** "Dal 05/07/2026 al 04/10/2026", "Fine 04/10/2026", "Dal 05/08/2026, senza data di fine", "Senza date". */
function periodo({ data_inizio, data_fine }: Pick<ProgettoTimeline, 'data_inizio' | 'data_fine'>): string {
  if (data_inizio && data_fine) return `Dal ${formatData(data_inizio)} al ${formatData(data_fine)}`
  if (data_fine) return `Fine ${formatData(data_fine)}`
  if (data_inizio) return `Dal ${formatData(data_inizio)}, senza data di fine`
  return 'Senza date'
}

/** The same projects as a table: the chart's twin, readable without hovering. */
function Tabella({ voci }: { voci: Pick<ProgettoSulGrafico, 'progetto' | 'reparto' | 'fine'>[] }) {
  return (
    <div data-testid="timeline-tabella">
      {/* from 768px: a real table */}
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Progetti con inizio, fine e giorni alla fine, per reparto</caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 text-left font-normal">Progetto</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">Reparto</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Inizio</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Fine</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">Giorni alla fine</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">Coach</th>
            <th scope="col" className="py-2 text-right font-normal">Avanzamento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {voci.map((v) => (
            <tr key={v.progetto.id}>
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <LinkRiga href={`/progetti/${v.progetto.id}`} className="font-medium hover:underline">
                  {v.progetto.nome}
                </LinkRiga>
                <StatoSeNonAttivo stato={v.progetto.stato} />
              </th>
              <td className="py-2 pr-3 text-muted-foreground">{v.reparto}</td>
              <td className="num py-2 pr-3 text-right">{formatData(v.progetto.data_inizio)}</td>
              <td className="num py-2 pr-3 text-right">{formatData(v.progetto.data_fine)}</td>
              <td className="py-2 pr-3">
                {v.fine.tipo === 'chiuso' ? <span className="text-muted-foreground">–</span> : <FineInParole voce={v} />}
              </td>
              <td className="py-2 pr-3">
                <Coach progetto={v.progetto} />
              </td>
              <td className="num py-2 text-right">
                {v.progetto.task_totali === 0
                  ? 'Nessun task'
                  : `${v.progetto.task_completati} di ${v.progetto.task_totali} · ${formatPercentuale(v.progetto.avanzamento)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* below 768px: one card per project */}
      <ul className="space-y-2 md:hidden">
        {voci.map((v) => (
          <li key={v.progetto.id}>
            <LinkRiga
              href={`/progetti/${v.progetto.id}`}
              className="block rounded-xl bg-card px-3 py-2.5 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-medium break-words">{v.progetto.nome}</span>
                <StatoSeNonAttivo stato={v.progetto.stato} />
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{v.reparto}</span>
              <span className="num mt-0.5 block text-xs text-muted-foreground">{periodo(v.progetto)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                {v.fine.tipo === 'chiuso' || v.fine.tipo === 'senza_fine' ? null : <FineInParole voce={v} />}
                {v.progetto.per_cliente || v.progetto.coach ? (
                  <span className="text-muted-foreground">
                    Coach: <Coach progetto={v.progetto} />
                  </span>
                ) : null}
                <span className="num text-muted-foreground">
                  {v.progetto.task_totali === 0
                    ? 'Nessun task'
                    : `${v.progetto.task_completati} di ${v.progetto.task_totali} task`}
                </span>
              </span>
            </LinkRiga>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Timeline of the projects (Dany, 05/10/2026): one bar per project from its
 * start to its end, one block per department, the soonest end first, the
 * "Oggi" line, the end in words beside each name ("tra 17 giorni", a clock
 * when it is within 30 days). A project opens on its dated lists and tasks
 * (the per-task view, thinner bars); projects without an end are listed
 * apart. Months or quarters; the same projects as a table. Project dates,
 * never people: nobody is compared or ranked.
 */
export function TimelineProgetti({ reparti, oggi }: { reparti: RepartoTimeline[]; oggi: string }) {
  const [vista, setVista] = useState<'grafico' | 'tabella'>('grafico')
  // quarters first: the whole picture fits the width on a computer; months to zoom in
  const [scala, setScala] = useState<ScalaTimeline>('trimestri')
  const [aperti, setAperti] = useState<ReadonlySet<string>>(() => new Set())

  const blocchi = useMemo(
    () =>
      reparti.map((r) => {
        const { sulGrafico, senzaFine } = dividiPerFine(r.progetti)
        return {
          reparto: r,
          sulGrafico: sulGrafico.map((p): ProgettoSulGrafico => {
            const fine = fineProgetto(p, oggi)
            return {
              progetto: p,
              reparto: r.nome,
              forma: formaProgetto(p),
              fine,
              senzaCoach: senzaCoachDaSegnalare(p, fine),
              figli: organizzaGantt(p.liste, p.task).righe,
            }
          }),
          senzaFine: senzaFine.map((p) => ({ progetto: p, reparto: r.nome, fine: fineProgetto(p, oggi) })),
        }
      }),
    [reparti, oggi],
  )

  const sulGrafico = blocchi.flatMap((b) => b.sulGrafico)
  const senzaFine = blocchi.flatMap((b) => b.senzaFine)
  const forme = sulGrafico.flatMap((v) => [v.forma, ...v.figli.flatMap((f) => (f.tipo === 'gruppo' ? [] : [f.forma]))])
  const conFigli = sulGrafico.some((v) => aperti.has(v.progetto.id) && v.figli.length > 0)
  const conRecessivi = sulGrafico.some((v) => recessivo(v.progetto.stato))
  const conSenzaCoach = sulGrafico.some((v) => v.senzaCoach)

  const righe: Riga[] = blocchi.flatMap((b) => {
    if (b.sulGrafico.length === 0) return []
    return [
      {
        tipo: 'reparto' as const,
        id: b.reparto.id,
        nome: b.reparto.nome,
        quanti: b.sulGrafico.length + b.senzaFine.length,
        senzaFine: b.senzaFine.length,
      },
      ...b.sulGrafico.flatMap((voce): Riga[] => {
        const aperto = aperti.has(voce.progetto.id)
        return [
          { tipo: 'progetto', voce, aperto },
          ...(aperto ? voce.figli.map((figlio, indice): Riga => ({ tipo: 'figlio', voce, figlio, indice })) : []),
        ]
      }),
    ]
  })

  function apri(id: string) {
    setAperti((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(id)) dopo.delete(id)
      else dopo.add(id)
      return dopo
    })
  }

  return (
    <div className="space-y-4" data-testid="timeline-progetti">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmenti
          etichetta="Vista della timeline"
          valore={vista}
          onCambia={setVista}
          opzioni={[
            { valore: 'grafico', etichetta: 'Grafico' },
            { valore: 'tabella', etichetta: 'Tabella' },
          ]}
        />
        {vista === 'grafico' && sulGrafico.length > 0 ? (
          <Segmenti
            etichetta="Scala"
            valore={scala}
            onCambia={setScala}
            opzioni={[
              { valore: 'mesi', etichetta: 'Mesi' },
              { valore: 'trimestri', etichetta: 'Trimestri' },
            ]}
          />
        ) : null}
      </div>

      {vista === 'tabella' ? (
        <Tabella voci={[...blocchi.flatMap((b) => [...b.sulGrafico, ...b.senzaFine])]} />
      ) : (
        <>
          {sulGrafico.length > 0 ? (
            <>
              <Legenda conFigli={conFigli} conRecessivi={conRecessivi} conSenzaCoach={conSenzaCoach} />
              <Grafico righe={righe} forme={forme} oggi={oggi} scala={scala} onApri={apri} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <CalendarOff className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Nessun progetto ha una data di fine</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Dai inizio e fine ai progetti, dalla loro scheda, per vederli sulla linea del tempo.
              </p>
            </div>
          )}

          {senzaFine.length > 0 ? (
            <section aria-labelledby="timeline-senza-fine" className="space-y-2" data-testid="timeline-senza-fine">
              <h2 id="timeline-senza-fine" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Senza data di fine ({senzaFine.length})
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {senzaFine.map(({ progetto: p, reparto }) => (
                  <li key={p.id}>
                    <LinkRiga
                      href={`/progetti/${p.id}`}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-xl px-3 py-2 text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 break-words">
                        {p.nome}
                        <span className="text-muted-foreground"> · {reparto}</span>
                      </span>
                      <StatoProgettoBadge stato={p.stato} />
                    </LinkRiga>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
