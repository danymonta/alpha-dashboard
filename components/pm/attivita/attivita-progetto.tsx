'use client'

import { ChevronDown, ListChecks, SearchX } from 'lucide-react'
import { useId, useState } from 'react'

import { AggiuntaRapida } from '@/components/pm/attivita/aggiunta-rapida'
import { ContestoAttivita, type ListaVista, type Persona, type TaskVista } from '@/components/pm/attivita/contesto'
import { MenuLista } from '@/components/pm/attivita/lista-form'
import { RigaTask } from '@/components/pm/attivita/riga-task'
import { BarraAvanzamento } from '@/components/pm/stato-progetto'
import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData } from '@/lib/format'
import { alberoTask, filtroAttivo, type FiltroStatoTask, type NodoTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

function periodo(inizio: string | null, fine: string | null): string | null {
  if (inizio && fine) return `${formatData(inizio)} → ${formatData(fine)}`
  if (inizio) return `dal ${formatData(inizio)}`
  if (fine) return `entro il ${formatData(fine)}`
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
  const albero = alberoTask(tasks, { ...filtro, io })
  const conFiltro = filtroAttivo(filtro)
  const senzaLista = albero.get('') ?? []
  const listeVisibili = conFiltro ? liste.filter((l) => (albero.get(l.id)?.length ?? 0) > 0) : liste
  const mostraSenzaLista = senzaLista.length > 0 || (!conFiltro && liste.length === 0)
  const valore = {
    progettoId,
    io,
    gestisce,
    membri,
    liste: liste.map((l) => ({ id: l.id, nome: l.nome })),
    tasks,
  }

  if (conFiltro && listeVisibili.length === 0 && senzaLista.length === 0) {
    return (
      <StatoVuoto
        Icona={SearchX}
        titolo="Nessun task con questi filtri"
        descrizione={filtro.soloMiei ? 'Non hai task assegnati in questo stato.' : 'Nessun task in questo stato.'}
        azione={
          <LinkBottone href={`/progetti/${progettoId}`} variant="outline">
            Togli i filtri
          </LinkBottone>
        }
      />
    )
  }

  return (
    <ContestoAttivita valore={valore}>
      <div className="space-y-4">
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
          />
        ))}

        {mostraSenzaLista ? (
          <section aria-labelledby="lista-senza" className="rounded-xl bg-card" data-testid="lista">
            <header className="border-b border-border p-3">
              <h2 id="lista-senza" className="text-sm font-medium">
                {liste.length === 0 ? 'Task' : 'Senza lista'}
              </h2>
            </header>
            {senzaLista.length === 0 ? (
              <div className="p-3">
                <StatoVuoto
                  Icona={ListChecks}
                  titolo="Ancora nessun task"
                  descrizione={
                    gestisce
                      ? 'Scrivi il primo qui sotto, oppure crea una lista per dividere il lavoro in fasi.'
                      : 'Scrivi il primo qui sotto.'
                  }
                />
              </div>
            ) : (
              <ElencoTask nodi={senzaLista} />
            )}
            <div className="border-t border-border p-3">
              <AggiuntaRapida progettoId={progettoId} etichetta="Nuovo task senza lista" />
            </div>
          </section>
        ) : null}
      </div>
    </ContestoAttivita>
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
function ElencoTask({ nodi }: { nodi: NodoTask<TaskVista>[] }) {
  const idGruppo = useId()
  const [completatiAperti, setCompletatiAperti] = useState(false)
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
          <span className="num">Completati ({completati.length})</span>
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
}: {
  progettoId: string
  lista: ListaVista
  nodi: NodoTask<TaskVista>[]
  gestisce: boolean
  prima: boolean
  ultima: boolean
  ordinabile: boolean
}) {
  const date = periodo(lista.data_inizio, lista.data_fine)
  // a finished list starts closed (not while filtering: the reader is looking for something)
  const finita = lista.task_totali > 0 && lista.task_completati === lista.task_totali
  const [aperta, setAperta] = useState(!(finita && ordinabile))
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
            {lista.descrizione ? <p className="pl-5.5 text-xs text-muted-foreground">{lista.descrizione}</p> : null}
          </div>
          <BarraAvanzamento
            completati={lista.task_completati}
            totali={lista.task_totali}
            avanzamento={lista.avanzamento}
            inRitardo={lista.task_in_ritardo}
            className="max-w-xs pl-5.5"
          />
        </div>
        {gestisce ? (
          <MenuLista progettoId={progettoId} lista={lista} prima={!ordinabile || prima} ultima={!ordinabile || ultima} />
        ) : null}
      </header>
      <div id={idContenuto} hidden={!aperta}>
        {nodi.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Nessun task in questa lista.</p>
        ) : (
          <ElencoTask nodi={nodi} />
        )}
        <div className="border-t border-border p-3">
          <AggiuntaRapida progettoId={progettoId} tasklistId={lista.id} etichetta={`Nuovo task in ${lista.nome}`} />
        </div>
      </div>
    </section>
  )
}
