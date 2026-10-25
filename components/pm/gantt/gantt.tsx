'use client'

import { CalendarOff, CheckCircle2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { useFormato, useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Formato } from '@/lib/format'
import {
  geometria,
  intervalloGantt,
  larghezzaAsse,
  organizzaGantt,
  tacche,
  xOggi,
  type Forma,
  type ListaGantt,
  type RigaGantt,
  type ScalaGantt,
  type TaskGantt,
} from '@/lib/gantt'
import { GANTT } from '@/lib/i18n/testi/gantt'
import { elencoNomiIn } from '@/lib/i18n/testi/task'
import { type StatoTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

export type ListaVista = ListaGantt & {
  task_totali: number
  task_completati: number
  /** Ratio from v_pm_tasklist; null without tasks. */
  avanzamento: number | null
}

export type TaskVista = TaskGantt & {
  stato: StatoTask
  /** From v_pm_task: open and past due, Europe/Rome. */
  in_ritardo: boolean
  /** Names of the people it is assigned to, by name; empty when nobody. */
  assegnatari: string[]
}

type Riga = RigaGantt<ListaVista, TaskVista>
type Parole = (typeof GANTT)['it']

/** Row height: the 44px touch target of each mark. */
const RIGA = 44
/** A mark is never narrower than this to the finger, whatever its drawn width. */
const MIN_TOCCO = 24

// below sm a week scale shows barely two weeks: the month scale is the default there
const STRETTO = '(max-width: 639.98px)'

function iscriviti(avvisa: () => void) {
  const mq = window.matchMedia(STRETTO)
  mq.addEventListener('change', avvisa)
  return () => mq.removeEventListener('change', avvisa)
}

function useStretto() {
  return useSyncExternalStore(
    iscriviti,
    () => window.matchMedia(STRETTO).matches,
    () => false,
  )
}

function testoDate(forma: Forma, t: Parole, formatData: Formato['formatData']): string {
  if (forma.forma === 'barra') {
    return forma.inizio === forma.fine
      ? t.il(formatData(forma.inizio))
      : t.dalAl(formatData(forma.inizio), formatData(forma.fine))
  }
  if (forma.forma === 'rombo') {
    return forma.quale === 'scadenza' ? t.scadenza(formatData(forma.data)) : t.inizioSenzaScadenza(formatData(forma.data))
  }
  return t.senzaDate
}

/** The dates of a mark in the page's language. */
function useTestoDate(): (forma: Forma) => string {
  const t = useTesti(GANTT)
  const { formatData } = useFormato()
  return (forma) => testoDate(forma, t, formatData)
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

function StatoTaskEtichetta({ task }: { task: TaskVista }) {
  const t = useTesti(GANTT)
  return (
    <span className="inline-flex items-center gap-1">
      {task.stato === 'completato' ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {t.statiTask[task.stato]}
      {task.in_ritardo ? (
        <span className="inline-flex items-center gap-1">
          {' · '}
          <TriangleAlert className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
          {t.inRitardo}
        </span>
      ) : null}
    </span>
  )
}

/** Name of a row in the fixed column: icons, never colour alone. */
function NomeRiga({ riga }: { riga: Riga }) {
  const t = useTesti(GANTT)
  if (riga.tipo === 'gruppo') {
    return (
      <span className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {riga.nome === GANTT.it.senzaLista ? t.senzaLista : riga.nome}
      </span>
    )
  }
  if (riga.tipo === 'lista') {
    return <span className="line-clamp-2 min-w-0 leading-tight font-medium break-words hyphens-auto">{riga.lista.nome}</span>
  }
  const { task } = riga
  return (
    <>
      <span
        className={cn(
          'line-clamp-2 min-w-0 leading-tight break-words hyphens-auto',
          task.stato === 'completato' && 'text-muted-foreground',
        )}
      >
        {task.titolo}
      </span>
      {task.stato === 'completato' ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" aria-label={t.completata} role="img" />
      ) : null}
      {task.in_ritardo ? (
        <TriangleAlert className="size-3.5 shrink-0 text-status-warning" aria-label={t.inRitardoMaiuscolo} role="img" />
      ) : null}
    </>
  )
}

function Dettaglio({ termine, children }: { termine: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{termine}</dt>
      <dd>{children}</dd>
    </>
  )
}

/** Tooltip of a mark: opens on hover and on tap (a popover, so touch works). */
function ContenutoTooltip({ riga, nomeLista }: { riga: Exclude<Riga, { tipo: 'gruppo' }>; nomeLista: string | null }) {
  const t = useTesti(GANTT)
  const lingua = useLingua()
  const { formatPercentuale } = useFormato()
  const testoDate = useTestoDate()
  if (riga.tipo === 'lista') {
    const { lista } = riga
    return (
      <>
        <div>
          <p className="font-medium">{lista.nome}</p>
          <p className="text-xs text-muted-foreground">{t.lista}</p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <Dettaglio termine={t.date}>
            {testoDate(riga.forma)}
            {riga.derivata ? <span className="block text-muted-foreground">{t.ricavate}</span> : null}
          </Dettaglio>
          <Dettaglio termine={t.avanzamento}>
            <span className="num">
              {t.completate(lista.task_completati, lista.task_totali)}
              {lista.avanzamento !== null ? ` (${formatPercentuale(lista.avanzamento)})` : ''}
            </span>
          </Dettaglio>
        </dl>
      </>
    )
  }

  const { task } = riga
  return (
    <>
      <div>
        <p className="font-medium">{task.titolo}</p>
        <p className="text-xs text-muted-foreground">{nomeLista ? t.attivitaDi(nomeLista) : t.attivita}</p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <Dettaglio termine={t.date}>{testoDate(riga.forma)}</Dettaglio>
        <Dettaglio termine={t.stato}>
          <StatoTaskEtichetta task={task} />
        </Dettaglio>
        <Dettaglio termine={t.assegnataA}>
          {task.assegnatari.length > 0 ? elencoNomiIn(task.assegnatari, lingua) : t.nessuno}
        </Dettaglio>
      </dl>
    </>
  )
}

function Segno({
  riga,
  intervallo,
  scala,
  nomeLista,
}: {
  riga: Exclude<Riga, { tipo: 'gruppo' }>
  intervallo: { da: string; a: string }
  scala: ScalaGantt
  nomeLista: string | null
}) {
  const t = useTesti(GANTT)
  const testoDate = useTestoDate()
  const g = geometria(riga.forma, intervallo, scala)
  if (g.forma === 'nessuna') return null

  const lista = riga.tipo === 'lista'
  const completata = riga.tipo === 'task' && riga.task.stato === 'completato'
  const inRitardo = riga.tipo === 'task' && riga.task.in_ritardo
  const titolo = lista ? riga.lista.nome : riga.task.titolo
  const statoTesto =
    riga.tipo === 'task' ? `, ${t.statiTask[riga.task.stato].toLowerCase()}${inRitardo ? t.virgolaInRitardo : ''}` : ''

  // the hit area is centred on the mark and at least MIN_TOCCO wide
  const larghezzaSegno = g.forma === 'barra' ? g.larghezza : 12
  const centro = g.forma === 'barra' ? g.x + g.larghezza / 2 : g.x
  const larghezzaTocco = Math.max(MIN_TOCCO, larghezzaSegno)
  const fineSegno = g.forma === 'barra' ? g.x + g.larghezza : g.x + 6

  return (
    <>
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={120}
          aria-label={`${titolo}: ${testoDate(riga.forma)}${statoTesto}`}
          data-testid={lista ? 'gantt-lista' : g.forma === 'barra' ? 'gantt-barra' : 'gantt-rombo'}
          render={
            <button
              type="button"
              className="absolute top-0 flex h-11 items-center justify-center rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              style={{ left: centro - larghezzaTocco / 2, width: larghezzaTocco }}
            />
          }
        >
          {g.forma === 'barra' ? (
            <span
              aria-hidden="true"
              className={cn(
                'block',
                lista
                  ? riga.derivata
                    ? 'h-2 rounded-[3px] border border-dashed border-gantt-lista'
                    : 'h-2 rounded-[3px] bg-gantt-lista'
                  : 'h-3 rounded-[4px] bg-gantt-task',
                completata && 'opacity-40',
              )}
              style={{ width: g.larghezza }}
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn('block size-3 rotate-45 rounded-[2px]', lista ? 'bg-gantt-lista' : 'bg-gantt-task', completata && 'opacity-40')}
            />
          )}
        </PopoverTrigger>
        <PopoverContent side="top" className="w-72">
          <ContenutoTooltip riga={riga} nomeLista={nomeLista} />
        </PopoverContent>
      </Popover>
      {completata || inRitardo ? (
        <span aria-hidden="true" className="pointer-events-none absolute top-0 flex h-11 items-center" style={{ left: fineSegno + 4 }}>
          {completata ? (
            <CheckCircle2 className="size-3.5 text-muted-foreground" />
          ) : (
            <TriangleAlert className="size-3.5 text-status-warning" />
          )}
        </span>
      ) : null}
    </>
  )
}

function Legenda() {
  const t = useTesti(GANTT)
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={t.legenda}>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-5 rounded-[3px] bg-gantt-lista" />
        {t.lista}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-5 rounded-[4px] bg-gantt-task" />
        {t.attivita}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="mx-1 size-2.5 rotate-45 rounded-[2px] bg-gantt-task" />
        {t.soloUnaData}
      </li>
      <li className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t.completata}
      </li>
      <li className="flex items-center gap-1.5">
        <TriangleAlert className="size-3.5 text-status-warning" aria-hidden="true" />
        {t.inRitardoMaiuscolo}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 border-l border-dashed border-foreground" />
        {t.oggi}
      </li>
    </ul>
  )
}

function Grafico({
  righe,
  oggi,
  scala,
  nomiListe,
}: {
  righe: Riga[]
  oggi: string
  scala: ScalaGantt
  nomiListe: ReadonlyMap<string, string>
}) {
  const t = useTesti(GANTT)
  const lingua = useLingua()
  const { formatData } = useFormato()
  const scorrimento = useRef<HTMLDivElement>(null)
  const forme = righe.flatMap((r) => (r.tipo === 'gruppo' ? [] : [r.forma]))
  const intervallo = intervalloGantt(forme, oggi, scala)
  const larghezza = larghezzaAsse(intervallo, scala)
  const listaTacche = tacche(intervallo, scala, lingua)
  const xDiOggi = xOggi(oggi, intervallo, scala)
  // left edge of the first late mark: it must be in sight when the chart opens
  const xRitardi = righe.flatMap((r) => {
    if (r.tipo !== 'task' || !r.task.in_ritardo) return []
    const g = geometria(r.forma, intervallo, scala)
    return g.forma === 'barra' ? [g.x] : g.forma === 'rombo' ? [g.x - 6] : []
  })
  const xPrimoInRitardo = xRitardi.length > 0 ? Math.min(...xRitardi) : Number.POSITIVE_INFINITY
  // how far the axis is scrolled: a tick label cut by the left edge is hidden
  const [scorso, setScorso] = useState(0)
  // ...and the period it named is repeated on the edge, unless the next tick is close
  const taccaSulBordo = listaTacche.filter((t) => t.x < scorso - 1).at(-1)
  const prossimaTacca = listaTacche.find((t) => t.x >= scorso - 1)
  const etichettaBordo = taccaSulBordo && (!prossimaTacca || prossimaTacca.x - scorso > 48) ? taccaSulBordo.etichetta : null

  // open on today, a quarter of the view before it, unless something late comes earlier
  useEffect(() => {
    const el = scorrimento.current
    if (el) el.scrollLeft = Math.max(0, Math.min(xDiOggi - el.clientWidth / 4, xPrimoInRitardo - 8))
  }, [xDiOggi, xPrimoInRitardo])

  return (
    <div
      role="figure"
      aria-label={t.grafico(formatData(intervallo.da), formatData(intervallo.a))}
      className="flex overflow-hidden rounded-xl border border-border bg-card"
      data-testid="gantt-grafico"
    >
      {/* fixed column of names: narrow on a phone, the axis needs the room */}
      <div className="w-28 shrink-0 border-r border-border sm:w-56">
        <div className="flex h-12 items-center border-b border-border px-2 text-xs text-muted-foreground sm:px-3">{t.attivita}</div>
        {righe.map((riga, i) => (
          <div
            key={riga.tipo === 'lista' ? `l-${riga.lista.id}` : riga.tipo === 'task' ? `t-${riga.task.id}` : `g-${i}`}
            className={cn(
              'flex h-11 min-w-0 items-center gap-1 border-b border-border/60 px-2 text-xs last:border-b-0 sm:gap-1.5 sm:px-3 sm:text-sm',
              riga.tipo === 'task' && riga.livello === 1 && 'pl-4 sm:pl-7',
            )}
          >
            <NomeRiga riga={riga} />
          </div>
        ))}
      </div>

      {/* the time axis: the only thing that scrolls sideways */}
      <div
        ref={scorrimento}
        onScroll={(e) => setScorso(e.currentTarget.scrollLeft)}
        className="min-w-0 flex-1 overflow-x-auto focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        tabIndex={0}
        aria-label={t.scorri}
      >
        {/* never narrower than the card: a short axis leaves no empty band on the right */}
        <div className="relative min-w-full" style={{ width: larghezza }}>
          <div className="relative h-12 border-b border-border" aria-hidden="true">
            {listaTacche.map((tacca) => (
              <span
                key={tacca.data}
                className={cn(
                  'num absolute top-1.5 pl-1.5 text-xs whitespace-nowrap text-muted-foreground',
                  // cut by the left edge of the scroll: no half labels
                  tacca.x < scorso - 1 && 'invisible',
                )}
                style={{ left: tacca.x }}
              >
                {tacca.etichetta}
              </span>
            ))}
            {etichettaBordo ? (
              <span className="num absolute top-1.5 pl-1.5 text-xs whitespace-nowrap text-muted-foreground" style={{ left: scorso }}>
                {etichettaBordo}
              </span>
            ) : null}
            <span
              className="absolute bottom-1 -translate-x-1/2 rounded-sm bg-background px-1.5 text-xs leading-5 font-medium text-foreground"
              style={{ left: xDiOggi }}
            >
              {t.oggi}
            </span>
          </div>

          <div className="relative" style={{ height: righe.length * RIGA }}>
            {/* recessive grid, one line per tick */}
            {listaTacche.map((tacca) => (
              <span key={tacca.data} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: tacca.x }} />
            ))}
            {righe.map((riga, i) => (
              <div
                key={riga.tipo === 'lista' ? `l-${riga.lista.id}` : riga.tipo === 'task' ? `t-${riga.task.id}` : `g-${i}`}
                className="absolute inset-x-0 h-11 border-b border-border/60 last:border-b-0"
                style={{ top: i * RIGA }}
              >
                {riga.tipo === 'gruppo' ? null : (
                  <Segno
                    riga={riga}
                    intervallo={intervallo}
                    scala={scala}
                    nomeLista={riga.tipo === 'task' ? (nomiListe.get(riga.task.tasklist_id ?? '') ?? null) : null}
                  />
                )}
              </div>
            ))}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/70"
              style={{ left: xDiOggi }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Tabella({
  righe,
  senzaDate,
  nomiListe,
}: {
  righe: Riga[]
  senzaDate: TaskVista[]
  nomiListe: ReadonlyMap<string, string>
}) {
  type Voce =
    | { tipo: 'gruppo'; nome: string }
    | { tipo: 'lista'; lista: ListaVista; forma: Forma; derivata: boolean }
    | { tipo: 'task'; task: TaskVista; forma: Forma; livello: 0 | 1 }
  const t = useTesti(GANTT)
  const lingua = useLingua()
  const { formatData } = useFormato()
  const testoDate = useTestoDate()
  const voci: Voce[] = [
    ...righe,
    ...(senzaDate.length > 0 ? [{ tipo: 'gruppo' as const, nome: t.senzaDate }] : []),
    ...senzaDate.map((task) => ({ tipo: 'task' as const, task, forma: { forma: 'nessuna' } as Forma, livello: 0 as const })),
  ]

  function inizio(forma: Forma) {
    if (forma.forma === 'barra') return formatData(forma.inizio)
    if (forma.forma === 'rombo' && forma.quale === 'inizio') return formatData(forma.data)
    return '–'
  }
  function fine(forma: Forma) {
    if (forma.forma === 'barra') return formatData(forma.fine)
    if (forma.forma === 'rombo' && forma.quale === 'scadenza') return formatData(forma.data)
    return '–'
  }

  return (
    <div data-testid="gantt-tabella">
      {/* from 768px: a real table */}
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">{t.didascalia}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 text-left font-normal">{t.attivita}</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">{t.colonnaLista}</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">{t.inizio}</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">{t.fineOScadenza}</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">{t.stato}</th>
            <th scope="col" className="py-2 text-left font-normal">{t.assegnataA}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {voci.map((v, i) =>
            v.tipo === 'gruppo' ? (
              <tr key={`g-${i}`}>
                <th scope="rowgroup" colSpan={6} className="pt-4 pb-1 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {v.nome === GANTT.it.senzaLista ? t.senzaLista : v.nome}
                </th>
              </tr>
            ) : v.tipo === 'lista' ? (
              <tr key={`l-${v.lista.id}`} className="bg-muted/40">
                <th scope="row" className="py-2 pr-3 pl-2 text-left font-medium">{v.lista.nome}</th>
                <td className="py-2 pr-3 text-muted-foreground">{t.lista}</td>
                <td className="num py-2 pr-3 text-right">{inizio(v.forma)}</td>
                <td className="num py-2 pr-3 text-right">{fine(v.forma)}</td>
                <td className="num py-2 pr-3" colSpan={2}>
                  {t.completate(v.lista.task_completati, v.lista.task_totali)}
                </td>
              </tr>
            ) : (
              <tr key={`t-${v.task.id}`}>
                <th scope="row" className={cn('py-2 pr-3 text-left font-normal', v.livello === 1 ? 'pl-7' : 'pl-2')}>
                  {v.task.titolo}
                </th>
                <td className="py-2 pr-3 text-muted-foreground">{nomiListe.get(v.task.tasklist_id ?? '') ?? '–'}</td>
                <td className="num py-2 pr-3 text-right">{inizio(v.forma)}</td>
                <td className="num py-2 pr-3 text-right">{fine(v.forma)}</td>
                <td className="py-2 pr-3">
                  <StatoTaskEtichetta task={v.task} />
                </td>
                <td className="py-2">{v.task.assegnatari.length > 0 ? elencoNomiIn(v.task.assegnatari, lingua) : '–'}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {/* below 768px: one card per row */}
      <ul className="space-y-2 md:hidden">
        {voci.map((v, i) =>
          v.tipo === 'gruppo' ? (
            <li key={`g-${i}`} className="px-1 pt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {v.nome === GANTT.it.senzaLista ? t.senzaLista : v.nome}
            </li>
          ) : (
            <li key={v.tipo === 'lista' ? `l-${v.lista.id}` : `t-${v.task.id}`} className="rounded-xl bg-card px-3 py-2.5">
              <p className={cn('text-sm', v.tipo === 'lista' ? 'font-medium' : '', v.tipo === 'task' && v.livello === 1 && 'pl-4')}>
                {v.tipo === 'lista' ? v.lista.nome : v.task.titolo}
              </p>
              <p className="num mt-0.5 text-xs text-muted-foreground">{testoDate(v.forma)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {v.tipo === 'lista' ? (
                  <>
                    {t.lista} · {t.completate(v.lista.task_completati, v.lista.task_totali)}
                  </>
                ) : (
                  <>
                    <StatoTaskEtichetta task={v.task} />
                    {v.task.assegnatari.length > 0 ? ` · ${elencoNomiIn(v.task.assegnatari, lingua)}` : ''}
                  </>
                )}
              </p>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

/**
 * Gantt of a project: lists (milestones) and tasks on one time axis, today's
 * line, week or month scale, and the same data as a table. Colours follow the
 * entity (list, task), states are icons plus words, never colour alone.
 */
export function GanttProgetto({ liste, task, oggi }: { liste: ListaVista[]; task: TaskVista[]; oggi: string }) {
  const t = useTesti(GANTT)
  const [vista, setVista] = useState<'grafico' | 'tabella'>('grafico')
  const stretto = useStretto()
  // until the reader picks one: months on a phone, weeks elsewhere
  const [sceltaScala, setScala] = useState<ScalaGantt | null>(null)
  const scala = sceltaScala ?? (stretto ? 'mesi' : 'settimane')
  const { righe, senzaDate } = organizzaGantt(liste, task)
  const nomiListe = new Map(liste.map((l) => [l.id, l.nome]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmenti
          etichetta={t.vista}
          valore={vista}
          onCambia={setVista}
          opzioni={[
            { valore: 'grafico', etichetta: t.viste.grafico },
            { valore: 'tabella', etichetta: t.viste.tabella },
          ]}
        />
        {vista === 'grafico' && righe.length > 0 ? (
          <Segmenti
            etichetta={t.scala}
            valore={scala}
            onCambia={setScala}
            opzioni={[
              { valore: 'settimane', etichetta: t.scale.settimane },
              { valore: 'mesi', etichetta: t.scale.mesi },
            ]}
          />
        ) : null}
      </div>

      {vista === 'tabella' ? (
        <Tabella righe={righe} senzaDate={senzaDate} nomiListe={nomiListe} />
      ) : (
        <>
          {righe.length > 0 ? (
            <>
              <Legenda />
              <Grafico righe={righe} oggi={oggi} scala={scala} nomiListe={nomiListe} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <CalendarOff className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{t.nessunaData}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{t.nessunaDataDescrizione}</p>
            </div>
          )}

          {senzaDate.length > 0 ? (
            <section aria-labelledby="gantt-senza-date" className="space-y-2" data-testid="gantt-senza-date">
              <h2 id="gantt-senza-date" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.senzaDateN(senzaDate.length)}
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {senzaDate.map((st) => (
                  <li key={st.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      {st.titolo}
                      {st.tasklist_id && nomiListe.get(st.tasklist_id) ? (
                        <span className="text-muted-foreground"> · {nomiListe.get(st.tasklist_id)}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <StatoTaskEtichetta task={st} />
                    </span>
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
