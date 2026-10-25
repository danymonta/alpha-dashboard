'use client'

import { ChevronDown, Info, ListChecks, SearchX, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useId, useState, type ReactNode } from 'react'

import { AggiuntaRapida } from '@/components/pm/attivita/aggiunta-rapida'
import { ContestoAttivita, type ListaVista, type Persona, type TaskVista } from '@/components/pm/attivita/contesto'
import { MenuLista } from '@/components/pm/attivita/lista-form'
import { RigaTask } from '@/components/pm/attivita/riga-task'
import { BarraAvanzamento } from '@/components/pm/stato-progetto'
import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { useFormato, useTesti } from '@/components/i18n/lingua-provider'
import type { Formato } from '@/lib/format'
import { ATTIVITA } from '@/lib/i18n/testi/attivita'
import {
  alberoTask,
  filtroAttivo,
  linkTask,
  posizioneNelAlbero,
  type FiltroStatoTask,
  type NodoTask,
} from '@/lib/progetti'
import { cn } from '@/lib/utils'

function periodo(
  inizio: string | null,
  fine: string | null,
  t: (typeof ATTIVITA)['it'],
  formatData: Formato['formatData'],
): string | null {
  if (inizio && fine) return `${formatData(inizio)} → ${formatData(fine)}`
  if (inizio) return t.dal(formatData(inizio))
  if (fine) return t.entroIl(formatData(fine))
  return null
}

/**
 * The "Attività" tab: lists (milestones) as sections, tasks with their
 * sub-tasks, a quick add line in every list. Filters live in the URL; the
 * tree is built here, the numbers come from the SQL views.
 */
export function AttivitaProgetto({
  progettoId,
  io,
  gestisce,
  liste,
  tasks,
  membri,
  filtro,
}: {
  progettoId: string
  io: string
  gestisce: boolean
  liste: ListaVista[]
  tasks: TaskVista[]
  membri: Persona[]
  filtro: { stato: FiltroStatoTask; soloMiei: boolean }
}) {
  // ?task (05/10/2026: I miei task, the timeline, Alfire): one of this project's
  // tasks, read through RLS like the others, opens by itself; anything else is
  // a task gone or not mine to read. Read from the address as it is now, so a
  // closed sheet (?task dropped) and the same link tapped again both follow
  const t = useTesti(ATTIVITA)
  const richiesto = useSearchParams().get('task')
  const taskDaAprire = richiesto !== null && tasks.some((t) => t.id === richiesto) ? richiesto : null

  // the row the link brought me to stays marked for the visit, also once its
  // sheet is closed; a new link moves the mark
  const [evidenziato, setEvidenziato] = useState(taskDaAprire)
  const [linkVisto, setLinkVisto] = useState(taskDaAprire)
  if (linkVisto !== taskDaAprire) {
    setLinkVisto(taskDaAprire)
    if (taskDaAprire) setEvidenziato(taskDaAprire)
  }
  // "not there" only for a task this visit never found: one deleted from its
  // own sheet may leave the list a moment before ?task leaves the address
  const taskMancante = richiesto !== null && taskDaAprire === null && richiesto !== evidenziato

  // the address drops ?task without a round trip: a reload, or a Realtime
  // refresh, does not open the sheet again
  const scordaLink = useCallback(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('task')) return
    url.searchParams.delete('task')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const albero = alberoTask(tasks, { ...filtro, io })
  const conFiltro = filtroAttivo(filtro)
  const senzaLista = albero.get('') ?? []
  const listeVisibili = conFiltro ? liste.filter((l) => (albero.get(l.id)?.length ?? 0) > 0) : liste
  const mostraSenzaLista = senzaLista.length > 0 || (!conFiltro && liste.length === 0)
  // where the asked task is: its list opens, and its "Completati" group
  const posizione = taskDaAprire ? posizioneNelAlbero(albero, taskDaAprire) : null
  const nascostoDaiFiltri = taskDaAprire !== null && posizione === null ? taskDaAprire : null
  const valore = {
    progettoId,
    io,
    gestisce,
    membri,
    liste: liste.map((l) => ({ id: l.id, nome: l.nome })),
    tasks,
    daAprire: posizione ? taskDaAprire : null,
    evidenziato,
    scordaLink,
  }

  // without filters, and with the asked task when the filters hide it: one
  // "Togli i filtri" on the page, always this one
  const senzaFiltri = nascostoDaiFiltri ? linkTask(progettoId, nascostoDaiFiltri) : `/progetti/${progettoId}/attivita`
  const vuotoConFiltri = conFiltro && listeVisibili.length === 0 && senzaLista.length === 0

  const avvisi = (
    <>
      {taskMancante ? (
        <AvvisoLink testo={t.taskMancante} onChiudi={scordaLink} />
      ) : null}
      {nascostoDaiFiltri ? (
        <AvvisoLink
          testo={t.taskNascosto}
          azione={
            // the empty state below has the button already
            vuotoConFiltri ? undefined : (
              <LinkBottone href={senzaFiltri} variant="outline">
                {t.togliFiltri}
              </LinkBottone>
            )
          }
        />
      ) : null}
    </>
  )

  if (vuotoConFiltri) {
    return (
      <div className="space-y-4">
        {avvisi}
        <StatoVuoto
          Icona={SearchX}
          titolo={t.vuotoFiltri}
          descrizione={filtro.soloMiei ? t.vuotoFiltriMiei : t.vuotoFiltriTutti}
          azione={
            <LinkBottone href={senzaFiltri} variant="outline">
              {t.togliFiltri}
            </LinkBottone>
          }
        />
      </div>
    )
  }

  return (
    <ContestoAttivita valore={valore}>
      <div className="space-y-4">
        {avvisi}
        {listeVisibili.map((l, i) => (
          <SezioneLista
            key={l.id}
            progettoId={progettoId}
            lista={l}
            nodi={albero.get(l.id) ?? []}
            gestisce={gestisce}
            prima={i === 0}
            ultima={i === listeVisibili.length - 1}
            ordinabile={!conFiltro}
            nodoDaAprire={posizione?.lista === l.id ? posizione.nodo : null}
          />
        ))}

        {mostraSenzaLista ? (
          <section aria-labelledby="lista-senza" className="rounded-xl bg-card" data-testid="lista">
            <header className="border-b border-border p-3">
              <h2 id="lista-senza" className="text-sm font-medium">
                {liste.length === 0 ? t.task : t.senzaLista}
              </h2>
            </header>
            {senzaLista.length === 0 ? (
              <div className="p-3">
                <StatoVuoto
                  Icona={ListChecks}
                  titolo={t.vuoto}
                  descrizione={gestisce ? t.vuotoGestisce : t.vuotoAltri}
                />
              </div>
            ) : (
              <ElencoTask nodi={senzaLista} completatoDaAprire={posizione?.lista === '' ? posizione.nodo : null} />
            )}
            <div className="border-t border-border p-3">
              <AggiuntaRapida progettoId={progettoId} etichetta={t.nuovoSenzaLista} />
            </div>
          </section>
        ) : null}
      </div>
    </ContestoAttivita>
  )
}

/** A short note above the lists about the task the link asked for. */
function AvvisoLink({ testo, azione, onChiudi }: { testo: string; azione?: ReactNode; onChiudi?: () => void }) {
  const t = useTesti(ATTIVITA)
  return (
    <div
      role="status"
      data-testid="avviso-task-link"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card py-1.5 pr-1.5 pl-3 text-sm"
    >
      <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-48 py-1.5">{testo}</p>
      {azione}
      {onChiudi ? (
        <button
          type="button"
          onClick={onChiudi}
          aria-label={t.chiudiAvviso}
          className="flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/** A 44px disclosure button: chevron pointing down when open, right when closed. */
function Freccia({ aperta }: { aperta: boolean }) {
  return (
    <ChevronDown
      className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !aperta && '-rotate-90')}
      aria-hidden="true"
    />
  )
}

/**
 * The tasks of a list. Open ones first; the completed ones wait in a
 * "Completati (n)" group, closed, unless there is nothing else to show.
 */
function ElencoTask({
  nodi,
  completatoDaAprire = null,
}: {
  nodi: NodoTask<TaskVista>[]
  /** The row of the task the link asked for: when it is a completed one, the group opens. */
  completatoDaAprire?: NodoTask<TaskVista> | null
}) {
  const t = useTesti(ATTIVITA)
  const idGruppo = useId()
  const daAprire = completatoDaAprire?.task.stato === 'completato' ? completatoDaAprire.task.id : null
  const [completatiAperti, setCompletatiAperti] = useState(daAprire !== null)
  const [visto, setVisto] = useState(daAprire)
  if (visto !== daAprire) {
    setVisto(daAprire)
    if (daAprire) setCompletatiAperti(true)
  }
  const aperti = nodi.filter((n) => n.task.stato !== 'completato')
  const completati = nodi.filter((n) => n.task.stato === 'completato')

  if (aperti.length === 0 || completati.length === 0) {
    return (
      <ul className="divide-y divide-border">
        {nodi.map((n) => (
          <RigaTask key={n.task.id} task={n.task} figli={n.figli} />
        ))}
      </ul>
    )
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {aperti.map((n) => (
          <RigaTask key={n.task.id} task={n.task} figli={n.figli} />
        ))}
      </ul>
      <div className="border-t border-border">
        <button
          type="button"
          aria-expanded={completatiAperti}
          aria-controls={idGruppo}
          onClick={() => setCompletatiAperti((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Freccia aperta={completatiAperti} />
          <span className="num">{t.completati(completati.length)}</span>
        </button>
        <ul id={idGruppo} hidden={!completatiAperti} className="divide-y divide-border border-t border-border">
          {completati.map((n) => (
            <RigaTask key={n.task.id} task={n.task} figli={n.figli} />
          ))}
        </ul>
      </div>
    </>
  )
}

function SezioneLista({
  progettoId,
  lista,
  nodi,
  gestisce,
  prima,
  ultima,
  ordinabile,
  nodoDaAprire,
}: {
  progettoId: string
  lista: ListaVista
  nodi: NodoTask<TaskVista>[]
  gestisce: boolean
  prima: boolean
  ultima: boolean
  ordinabile: boolean
  /** The row of the task the link asked for, when it is in this list: the list opens, even a finished one. */
  nodoDaAprire: NodoTask<TaskVista> | null
}) {
  const t = useTesti(ATTIVITA)
  const formato = useFormato()
  const conTaskDaAprire = nodoDaAprire !== null
  const date = periodo(lista.data_inizio, lista.data_fine, t, formato.formatData)
  // a finished list starts closed (not while filtering: the reader is looking for something)
  const finita = lista.task_totali > 0 && lista.task_completati === lista.task_totali
  const [aperta, setAperta] = useState(conTaskDaAprire || !(finita && ordinabile))
  const [visto, setVisto] = useState(conTaskDaAprire)
  if (visto !== conTaskDaAprire) {
    setVisto(conTaskDaAprire)
    if (conTaskDaAprire) setAperta(true)
  }
  const idContenuto = `contenuto-lista-${lista.id}`
  return (
    <section aria-labelledby={`lista-${lista.id}`} className="rounded-xl bg-card" data-testid="lista">
      <header className={cn('flex items-start gap-2 p-3 pt-1 pr-1', aperta && 'border-b border-border')}>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 id={`lista-${lista.id}`} className="text-sm font-medium break-words">
              <button
                type="button"
                aria-expanded={aperta}
                aria-controls={idContenuto}
                onClick={() => setAperta((v) => !v)}
                className="-ml-1 flex min-h-11 w-full items-center gap-1.5 rounded-sm pl-1 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Freccia aperta={aperta} />
                <span className="min-w-0 break-words">{lista.nome}</span>
              </button>
            </h2>
            {date ? <p className="num -mt-1.5 pl-5.5 text-xs text-muted-foreground">{date}</p> : null}
            {lista.descrizione ? (
              <p lang="it" className="pl-5.5 text-xs text-muted-foreground">
                {lista.descrizione}
              </p>
            ) : null}
          </div>
          <BarraAvanzamento
            completati={lista.task_completati}
            totali={lista.task_totali}
            avanzamento={lista.avanzamento}
            inRitardo={lista.task_in_ritardo}
            className="max-w-xs pl-5.5"
            lingua={formato.lingua}
          />
        </div>
        {gestisce ? (
          <MenuLista progettoId={progettoId} lista={lista} prima={!ordinabile || prima} ultima={!ordinabile || ultima} />
        ) : null}
      </header>
      <div id={idContenuto} hidden={!aperta}>
        {nodi.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t.nessunoInLista}</p>
        ) : (
          <ElencoTask nodi={nodi} completatoDaAprire={nodoDaAprire} />
        )}
        <div className="border-t border-border p-3">
          <AggiuntaRapida progettoId={progettoId} tasklistId={lista.id} etichetta={t.nuovoIn(lista.nome)} />
        </div>
      </div>
    </section>
  )
}
