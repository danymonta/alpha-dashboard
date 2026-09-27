'use client'

import { CalendarOff, CheckCircle2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatData, formatPercentuale } from '@/lib/format'
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
import { ETICHETTA_STATO_TASK, type StatoTask } from '@/lib/progetti'
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
  assegnatario: string | null
}

type Riga = RigaGantt<ListaVista, TaskVista>

/** Row height: the 44px touch target of each mark. */
const RIGA = 44
/** A mark is never narrower than this to the finger, whatever its drawn width. */
const MIN_TOCCO = 24

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
  return (
    <span className="inline-flex items-center gap-1">
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

/** Name of a row in the fixed column: icons, never colour alone. */
function NomeRiga({ riga }: { riga: Riga }) {
  if (riga.tipo === 'gruppo') {
    return <span className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{riga.nome}</span>
  }
  if (riga.tipo === 'lista') {
    return <span className="line-clamp-2 min-w-0 leading-tight font-medium sm:line-clamp-1">{riga.lista.nome}</span>
  }
  const { task } = riga
  return (
    <>
      <span
        className={cn('line-clamp-2 min-w-0 leading-tight sm:line-clamp-1', task.stato === 'completato' && 'text-muted-foreground')}
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
  if (riga.tipo === 'lista') {
    const { lista } = riga
    return (
      <>
        <div>
          <p className="font-medium">{lista.nome}</p>
          <p className="text-xs text-muted-foreground">Lista (milestone)</p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <Dettaglio termine="Date">
            {testoDate(riga.forma)}
            {riga.derivata ? <span className="block text-muted-foreground">ricavate dalle sue attività</span> : null}
          </Dettaglio>
          <Dettaglio termine="Avanzamento">
            <span className="num">
              {lista.task_completati} di {lista.task_totali} completate
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
        <p className="text-xs text-muted-foreground">{nomeLista ? `Attività · ${nomeLista}` : 'Attività'}</p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <Dettaglio termine="Date">{testoDate(riga.forma)}</Dettaglio>
        <Dettaglio termine="Stato">
          <StatoTaskEtichetta task={task} />
        </Dettaglio>
        <Dettaglio termine="Assegnata a">{task.assegnatario ?? 'Nessuno'}</Dettaglio>
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
  const g = geometria(riga.forma, intervallo, scala)
  if (g.forma === 'nessuna') return null

  const lista = riga.tipo === 'lista'
  const completata = riga.tipo === 'task' && riga.task.stato === 'completato'
  const inRitardo = riga.tipo === 'task' && riga.task.in_ritardo
  const titolo = lista ? riga.lista.nome : riga.task.titolo
  const statoTesto = riga.tipo === 'task' ? `, ${ETICHETTA_STATO_TASK[riga.task.stato].toLowerCase()}${inRitardo ? ', in ritardo' : ''}` : ''

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
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-5 rounded-[3px] bg-gantt-lista" />
        Lista (milestone)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-5 rounded-[4px] bg-gantt-task" />
        Attività
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="mx-1 size-2.5 rotate-45 rounded-[2px] bg-gantt-task" />
        Solo una data
      </li>
      <li className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        Completata
      </li>
      <li className="flex items-center gap-1.5">
        <TriangleAlert className="size-3.5 text-status-warning" aria-hidden="true" />
        In ritardo
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 border-l border-dashed border-foreground" />
        Oggi
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
  const scorrimento = useRef<HTMLDivElement>(null)
  const forme = righe.flatMap((r) => (r.tipo === 'gruppo' ? [] : [r.forma]))
  const intervallo = intervalloGantt(forme, oggi, scala)
  const larghezza = larghezzaAsse(intervallo, scala)
  const listaTacche = tacche(intervallo, scala)
  const xDiOggi = xOggi(oggi, intervallo, scala)

  // open on today: a third of the view before it, the rest ahead
  useEffect(() => {
    const el = scorrimento.current
    if (el) el.scrollLeft = Math.max(0, xDiOggi - el.clientWidth / 3)
  }, [xDiOggi])

  return (
    <div
      role="figure"
      aria-label={`Gantt del progetto, dal ${formatData(intervallo.da)} al ${formatData(intervallo.a)}`}
      className="flex overflow-hidden rounded-xl border border-border bg-card"
      data-testid="gantt-grafico"
    >
      {/* fixed column of names */}
      <div className="w-36 shrink-0 border-r border-border sm:w-56">
        <div className="flex h-12 items-center border-b border-border px-3 text-xs text-muted-foreground">Attività</div>
        {righe.map((riga, i) => (
          <div
            key={riga.tipo === 'lista' ? `l-${riga.lista.id}` : riga.tipo === 'task' ? `t-${riga.task.id}` : `g-${i}`}
            className={cn(
              'flex h-11 min-w-0 items-center gap-1.5 border-b border-border/60 px-3 text-sm last:border-b-0',
              riga.tipo === 'task' && riga.livello === 1 && 'pl-7',
            )}
          >
            <NomeRiga riga={riga} />
          </div>
        ))}
      </div>

      {/* the time axis: the only thing that scrolls sideways */}
      <div
        ref={scorrimento}
        className="min-w-0 flex-1 overflow-x-auto focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        tabIndex={0}
        aria-label="Linea del tempo: scorri in orizzontale"
      >
        {/* never narrower than the card: a short axis leaves no empty band on the right */}
        <div className="relative min-w-full" style={{ width: larghezza }}>
          <div className="relative h-12 border-b border-border" aria-hidden="true">
            {listaTacche.map((t) => (
              <span
                key={t.data}
                className="num absolute top-1.5 pl-1.5 text-xs whitespace-nowrap text-muted-foreground"
                style={{ left: t.x }}
              >
                {t.etichetta}
              </span>
            ))}
            <span
              className="absolute bottom-1 -translate-x-1/2 rounded-sm bg-background px-1.5 text-xs leading-5 font-medium text-foreground"
              style={{ left: xDiOggi }}
            >
              Oggi
            </span>
          </div>

          <div className="relative" style={{ height: righe.length * RIGA }}>
            {/* recessive grid, one line per tick */}
            {listaTacche.map((t) => (
              <span key={t.data} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: t.x }} />
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
  const voci: Voce[] = [
    ...righe,
    ...(senzaDate.length > 0 ? [{ tipo: 'gruppo' as const, nome: 'Senza date' }] : []),
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
        <caption className="sr-only">Liste e attività del progetto con le loro date</caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 text-left font-normal">Attività</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">Lista</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Inizio</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Fine o scadenza</th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">Stato</th>
            <th scope="col" className="py-2 text-left font-normal">Assegnata a</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {voci.map((v, i) =>
            v.tipo === 'gruppo' ? (
              <tr key={`g-${i}`}>
                <th scope="rowgroup" colSpan={6} className="pt-4 pb-1 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {v.nome}
                </th>
              </tr>
            ) : v.tipo === 'lista' ? (
              <tr key={`l-${v.lista.id}`} className="bg-muted/40">
                <th scope="row" className="py-2 pr-3 pl-2 text-left font-medium">{v.lista.nome}</th>
                <td className="py-2 pr-3 text-muted-foreground">Lista (milestone)</td>
                <td className="num py-2 pr-3 text-right">{inizio(v.forma)}</td>
                <td className="num py-2 pr-3 text-right">{fine(v.forma)}</td>
                <td className="num py-2 pr-3" colSpan={2}>
                  {v.lista.task_completati} di {v.lista.task_totali} completate
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
                <td className="py-2">{v.task.assegnatario ?? '–'}</td>
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
              {v.nome}
            </li>
          ) : (
            <li key={v.tipo === 'lista' ? `l-${v.lista.id}` : `t-${v.task.id}`} className="rounded-xl bg-card px-3 py-2.5">
              <p className={cn('text-sm', v.tipo === 'lista' ? 'font-medium' : '', v.tipo === 'task' && v.livello === 1 && 'pl-4')}>
                {v.tipo === 'lista' ? v.lista.nome : v.task.titolo}
              </p>
              <p className="num mt-0.5 text-xs text-muted-foreground">{testoDate(v.forma)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {v.tipo === 'lista' ? (
                  <>Lista (milestone) · {v.lista.task_completati} di {v.lista.task_totali} completate</>
                ) : (
                  <>
                    <StatoTaskEtichetta task={v.task} />
                    {v.task.assegnatario ? ` · ${v.task.assegnatario}` : ''}
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
  const [vista, setVista] = useState<'grafico' | 'tabella'>('grafico')
  const [scala, setScala] = useState<ScalaGantt>('settimane')
  const { righe, senzaDate } = organizzaGantt(liste, task)
  const nomiListe = new Map(liste.map((l) => [l.id, l.nome]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmenti
          etichetta="Vista"
          valore={vista}
          onCambia={setVista}
          opzioni={[
            { valore: 'grafico', etichetta: 'Grafico' },
            { valore: 'tabella', etichetta: 'Tabella' },
          ]}
        />
        {vista === 'grafico' && righe.length > 0 ? (
          <Segmenti
            etichetta="Scala"
            valore={scala}
            onCambia={setScala}
            opzioni={[
              { valore: 'settimane', etichetta: 'Settimane' },
              { valore: 'mesi', etichetta: 'Mesi' },
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
              <p className="text-sm font-medium">Nessuna attività ha delle date</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Dai un inizio o una scadenza alle attività per vederle sulla linea del tempo.
              </p>
            </div>
          )}

          {senzaDate.length > 0 ? (
            <section aria-labelledby="gantt-senza-date" className="space-y-2" data-testid="gantt-senza-date">
              <h2 id="gantt-senza-date" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Senza date ({senzaDate.length})
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {senzaDate.map((t) => (
                  <li key={t.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      {t.titolo}
                      {t.tasklist_id && nomiListe.get(t.tasklist_id) ? (
                        <span className="text-muted-foreground"> · {nomiListe.get(t.tasklist_id)}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <StatoTaskEtichetta task={t} />
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
