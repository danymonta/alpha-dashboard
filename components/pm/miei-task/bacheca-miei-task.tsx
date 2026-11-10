'use client'

import {
  CalendarDays,
  ChevronsDown,
  ChevronsUp,
  CircleCheck,
  Ellipsis,
  Equal,
  ExternalLink,
  Plus,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useId, useState, type DragEvent } from 'react'

import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { NuovoMioTask, type ProgettoMio } from '@/components/pm/miei-task/nuovo-mio-task'
import { AvviaTimer } from '@/components/pm/tempo/avvia-timer'
import { LinkRiga } from '@/components/shell/link-riga'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BACHECA_TASK, MIEI_TASK } from '@/lib/i18n/testi/task'
import { GRUPPI, scadenzaDellaColonna, type ChiaveGruppo, type GruppoMieiTask, type MioTask } from '@/lib/miei-task'
import { linkTask, type Priorita } from '@/lib/progetti'
import { cn } from '@/lib/utils'
import { PRIORITA } from '@/lib/validation/progetti'

/** What a card can change from the board: its due date, its priority. */
export type Ritocco = { scadenza?: string | null; priorita?: Priorita }

const ICONA_PRIORITA: Record<Priorita, LucideIcon> = { alta: ChevronsUp, media: Equal, bassa: ChevronsDown }

/** The coloured bar on the card's left edge and the tag's colour: never the colour alone. */
const BARRA_PRIORITA: Record<Priorita, string> = {
  alta: 'border-l-priorita-alta',
  media: 'border-l-priorita-media',
  bassa: 'border-l-priorita-bassa/40',
}
const TESTO_PRIORITA: Record<Priorita, string> = {
  alta: 'text-priorita-alta font-medium',
  media: 'text-priorita-media',
  bassa: 'text-muted-foreground',
}

/** The column's accent: overdue and today stand out, the rest stays quiet. */
const TONO_COLONNA: Partial<Record<ChiaveGruppo, string>> = {
  ritardo: 'text-status-warning',
  oggi: 'text-foreground',
}

const TIPO_DRAG = 'application/x-alpha-task'

type Props = {
  colonne: GruppoMieiTask[]
  oggi: string
  progetti: ProgettoMio[]
  onCompleta: (task: MioTask) => void
  onRiapri: (task: MioTask) => void
  onRitocca: (task: MioTask, ritocco: Ritocco, colonna: ChiaveGruppo | null) => void
  onAggiunto: (titolo: string, colonna: ChiaveGruppo) => void
}

/**
 * The board of I miei task (1.75.0, Dany, 10/11/2026: «stile Trello»): five
 * columns by due date, every card coloured by its priority with the high ones
 * on top. A card is dragged onto another column to change its due date (with
 * a mouse); the three dots do the same with a keyboard or a finger, and set
 * the priority. Each column adds a task with its due date already written.
 * The columns scroll sideways inside their own frame, never the page.
 */
export function BachecaMieiTask({ colonne, oggi, progetti, onCompleta, onRiapri, onRitocca, onAggiunto }: Props) {
  const lingua = useLingua()
  const t = BACHECA_TASK[lingua]
  const g = MIEI_TASK[lingua].gruppi
  const [trascinato, setTrascinato] = useState<MioTask | null>(null)
  const [sopra, setSopra] = useState<ChiaveGruppo | null>(null)
  const [nuovoIn, setNuovoIn] = useState<ChiaveGruppo | null>(null)
  const [foglioAperto, setFoglioAperto] = useState(false)

  function apriNuovo(chiave: ChiaveGruppo) {
    setNuovoIn(chiave)
    setFoglioAperto(true)
  }

  function rilascia(e: DragEvent, chiave: ChiaveGruppo) {
    e.preventDefault()
    setSopra(null)
    const task = trascinato
    setTrascinato(null)
    if (!task) return
    const scadenza = scadenzaDellaColonna(chiave, oggi)
    if (scadenza === undefined || scadenza === task.scadenza) return
    onRitocca(task, { scadenza }, chiave)
  }

  const colonnaNuovo = nuovoIn ?? 'oggi'
  const scadenzaNuovo = scadenzaDellaColonna(colonnaNuovo, oggi) ?? ''

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t.suggerimento}</p>
      <div
        className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
        data-testid="bacheca-miei-task"
        // the frame scrolls, the page does not
        tabIndex={-1}
      >
        <div className="flex snap-x snap-mandatory gap-3 sm:snap-none">
          {colonne.map((c) => {
            const destinazione = scadenzaDellaColonna(c.chiave, oggi) !== undefined
            const evidenziata = trascinato !== null && destinazione && sopra === c.chiave
            return (
              <section
                key={c.chiave}
                aria-labelledby={`colonna-${c.chiave}`}
                data-testid={`colonna-${c.chiave}`}
                onDragOver={(e) => {
                  if (!destinazione || !trascinato) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (sopra !== c.chiave) setSopra(c.chiave)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSopra((s) => (s === c.chiave ? null : s))
                }}
                onDrop={(e) => rilascia(e, c.chiave)}
                className={cn(
                  'flex w-[17.5rem] shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/30 transition-colors',
                  evidenziata && 'border-primary bg-primary/5',
                )}
              >
                <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <h2
                    id={`colonna-${c.chiave}`}
                    className={cn('flex items-center gap-1.5 text-sm font-semibold', TONO_COLONNA[c.chiave])}
                  >
                    {c.chiave === 'ritardo' ? <TriangleAlert className="size-4" aria-hidden="true" /> : null}
                    {g[c.chiave]}
                  </h2>
                  <span className="num rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground" aria-label={t.conteggio(c.daFare)}>
                    {c.daFare}
                  </span>
                </header>

                <ul className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
                  {c.righe.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      {evidenziata ? t.rilascia : t.vuota}
                    </li>
                  ) : (
                    c.righe.map((r) => (
                      <CartaTask
                        key={r.task.id}
                        task={r.task}
                        completatoAdesso={r.completatoAdesso}
                        oggi={oggi}
                        trascinato={trascinato?.id === r.task.id}
                        onInizioTrascina={() => setTrascinato(r.task)}
                        onFineTrascina={() => {
                          setTrascinato(null)
                          setSopra(null)
                        }}
                        onCompleta={() => onCompleta(r.task)}
                        onRiapri={() => onRiapri(r.task)}
                        onRitocca={(ritocco, colonna) => onRitocca(r.task, ritocco, colonna)}
                      />
                    ))
                  )}
                </ul>

                {destinazione ? (
                  <div className="px-2 pb-2">
                    <button
                      type="button"
                      onClick={() => apriNuovo(c.chiave)}
                      aria-label={t.aggiungiIn(g[c.chiave])}
                      className="inline-flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t.aggiungi}
                    </button>
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      </div>

      <NuovoMioTask
        aperto={foglioAperto}
        onAperto={setFoglioAperto}
        progetti={progetti}
        scadenza={scadenzaNuovo}
        colonna={g[colonnaNuovo]}
        onAggiunto={(titolo) => onAggiunto(titolo, colonnaNuovo)}
      />
    </div>
  )
}

type PropsCarta = {
  task: MioTask
  completatoAdesso: boolean
  oggi: string
  trascinato: boolean
  onInizioTrascina: () => void
  onFineTrascina: () => void
  onCompleta: () => void
  onRiapri: () => void
  onRitocca: (ritocco: Ritocco, colonna: ChiaveGruppo | null) => void
}

/** One card: tick, title (opens the task in its project), project, priority, due date, timer, menu. */
function CartaTask({
  task,
  completatoAdesso,
  oggi,
  trascinato,
  onInizioTrascina,
  onFineTrascina,
  onCompleta,
  onRiapri,
  onRitocca,
}: PropsCarta) {
  const lingua = useLingua()
  const t = BACHECA_TASK[lingua]
  const tm = MIEI_TASK[lingua]
  const { formatData } = useFormato()
  const Icona = ICONA_PRIORITA[task.priorita]
  const inRitardo = task.scadenza !== null && task.scadenza < oggi
  const ePerOggi = task.scadenza === oggi

  return (
    <li
      draggable={!completatoAdesso}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(TIPO_DRAG, task.id)
        onInizioTrascina()
      }}
      onDragEnd={onFineTrascina}
      aria-label={task.titolo}
      data-testid="mio-task"
      data-tour="mio-task"
      data-mio-task={task.id}
      data-priorita={task.priorita}
      data-completato={completatoAdesso ? 'adesso' : undefined}
      className={cn(
        'rounded-lg border border-l-4 border-border bg-card shadow-xs transition-opacity',
        BARRA_PRIORITA[task.priorita],
        !completatoAdesso && 'cursor-grab active:cursor-grabbing',
        trascinato && 'opacity-50',
        completatoAdesso && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-0.5 pr-1">
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox
            checked={completatoAdesso}
            className="size-5"
            onCheckedChange={(v) => (v ? onCompleta() : onRiapri())}
            aria-label={completatoAdesso ? tm.riapriTask(task.titolo) : tm.completa(task.titolo)}
          />
        </label>
        <div className="min-w-0 flex-1 py-2.5">
          <LinkRiga
            href={linkTask(task.progetto_id, task.id)}
            draggable={false}
            className={cn(
              'block rounded-sm text-sm leading-snug font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              completatoAdesso && 'text-muted-foreground line-through',
            )}
          >
            {task.titolo}
          </LinkRiga>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.progetto}</p>
        </div>
        {completatoAdesso ? null : <MenuCarta task={task} oggi={oggi} onRitocca={onRitocca} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-xs">
        {completatoAdesso ? (
          <span className="inline-flex items-center gap-1 font-medium text-status-ok">
            <CircleCheck className="size-3.5" aria-hidden="true" />
            {tm.completatoAdesso}
          </span>
        ) : (
          <>
            <span className={cn('inline-flex items-center gap-1', TESTO_PRIORITA[task.priorita])}>
              <Icona className="size-3.5" aria-hidden="true" />
              {t.prioritaDi(t.priorita[task.priorita])}
            </span>
            {task.scadenza ? (
              <span
                className={cn(
                  'num inline-flex items-center gap-1',
                  inRitardo ? 'text-status-warning' : ePerOggi ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {inRitardo ? (
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                ) : (
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                )}
                {inRitardo ? tm.inRitardo(formatData(task.scadenza)) : tm.scadenza(formatData(task.scadenza))}
              </span>
            ) : null}
            {task.con.length > 0 ? <span className="text-muted-foreground">{tm.con(task.con)}</span> : null}
          </>
        )}
        {completatoAdesso ? null : (
          <span className="ml-auto">
            <AvviaTimer progettoId={task.progetto_id} taskId={task.id} titolo={task.titolo} lingua={lingua} />
          </span>
        )}
      </div>
    </li>
  )
}

/** The three dots: open the task, its priority, move it to a column, pick a date. */
function MenuCarta({
  task,
  oggi,
  onRitocca,
}: {
  task: MioTask
  oggi: string
  onRitocca: (ritocco: Ritocco, colonna: ChiaveGruppo | null) => void
}) {
  const lingua = useLingua()
  const t = BACHECA_TASK[lingua]
  const g = MIEI_TASK[lingua].gruppi
  const id = useId()
  const [dataAperta, setDataAperta] = useState(false)
  const [data, setData] = useState(task.scadenza ?? '')

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={t.altreAzioni(task.titolo)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-accent"
            />
          }
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem className="min-h-11 px-3" render={<Link href={linkTask(task.progetto_id, task.id)} />}>
            <ExternalLink className="size-4" aria-hidden="true" />
            {t.voceApri}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t.vocePriorita}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={task.priorita}
              aria-label={t.vocePriorita}
              onValueChange={(valore) => {
                const p = PRIORITA.find((x) => x === valore)
                if (p && p !== task.priorita) onRitocca({ priorita: p }, null)
              }}
            >
              {PRIORITA.map((p) => {
                const Icona = ICONA_PRIORITA[p]
                return (
                  <DropdownMenuRadioItem key={p} value={p} closeOnClick className="min-h-11 px-3">
                    <span className={cn('inline-flex items-center gap-1.5', TESTO_PRIORITA[p])}>
                      <Icona className="size-4" aria-hidden="true" />
                      {t.priorita[p]}
                    </span>
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t.voceSposta}</DropdownMenuLabel>
            {GRUPPI.map(({ chiave }) => {
              const scadenza = scadenzaDellaColonna(chiave, oggi)
              if (scadenza === undefined) return null
              return (
                <DropdownMenuItem
                  key={chiave}
                  className="min-h-11 px-3"
                  disabled={scadenza === task.scadenza}
                  onClick={() => onRitocca({ scadenza }, chiave)}
                >
                  {g[chiave]}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuItem
              className="min-h-11 px-3"
              onClick={() => {
                setData(task.scadenza ?? '')
                setDataAperta(true)
              }}
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {t.voceData}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dataAperta} onOpenChange={setDataAperta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.data.titolo}</DialogTitle>
            <DialogDescription>{t.data.descrizione(task.titolo)}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const scadenza = data || null
              setDataAperta(false)
              if (scadenza !== task.scadenza) onRitocca({ scadenza }, null)
            }}
          >
            <Label htmlFor={`${id}-data`} className="sr-only">
              {t.data.titolo}
            </Label>
            <Input id={`${id}-data`} type="date" className="num h-11" value={data} onChange={(e) => setData(e.target.value)} />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="submit" className="h-11 flex-1">
                {t.data.salva}
              </Button>
              {task.scadenza ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => {
                    setDataAperta(false)
                    onRitocca({ scadenza: null }, 'senza')
                  }}
                >
                  {t.data.togli}
                </Button>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
