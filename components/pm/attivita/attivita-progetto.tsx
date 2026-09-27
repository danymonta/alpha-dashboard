'use client'

import { ListChecks, SearchX } from 'lucide-react'

import { AggiuntaRapida } from '@/components/pm/attivita/aggiunta-rapida'
import { ContestoAttivita, type ListaVista, type Persona, type TaskVista } from '@/components/pm/attivita/contesto'
import { MenuLista } from '@/components/pm/attivita/lista-form'
import { RigaTask } from '@/components/pm/attivita/riga-task'
import { BarraAvanzamento, InRitardo } from '@/components/pm/stato-progetto'
import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData } from '@/lib/format'
import { alberoTask, filtroAttivo, type FiltroStatoTask, type NodoTask } from '@/lib/progetti'

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

function ElencoTask({ nodi }: { nodi: NodoTask<TaskVista>[] }) {
  return (
    <ul className="divide-y divide-border">
      {nodi.map((n) => (
        <RigaTask key={n.task.id} task={n.task} figli={n.figli} />
      ))}
    </ul>
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
  return (
    <section aria-labelledby={`lista-${lista.id}`} className="rounded-xl bg-card" data-testid="lista">
      <header className="flex items-start gap-2 border-b border-border p-3 pr-1">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 id={`lista-${lista.id}`} className="text-sm font-medium break-words">
              {lista.nome}
            </h2>
            {date ? <p className="num text-xs text-muted-foreground">{date}</p> : null}
            {lista.descrizione ? <p className="text-xs text-muted-foreground">{lista.descrizione}</p> : null}
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <BarraAvanzamento
              completati={lista.task_completati}
              totali={lista.task_totali}
              avanzamento={lista.avanzamento}
              className="w-full max-w-xs"
            />
            {lista.task_in_ritardo > 0 ? (
              <InRitardo
                className="text-xs"
                testo={lista.task_in_ritardo === 1 ? '1 in ritardo' : `${lista.task_in_ritardo} in ritardo`}
              />
            ) : null}
          </div>
        </div>
        {gestisce ? (
          <MenuLista progettoId={progettoId} lista={lista} prima={!ordinabile || prima} ultima={!ordinabile || ultima} />
        ) : null}
      </header>
      {nodi.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Nessun task in questa lista.</p>
      ) : (
        <ElencoTask nodi={nodi} />
      )}
      <div className="border-t border-border p-3">
        <AggiuntaRapida progettoId={progettoId} tasklistId={lista.id} etichetta={`Nuovo task in ${lista.nome}`} />
      </div>
    </section>
  )
}
