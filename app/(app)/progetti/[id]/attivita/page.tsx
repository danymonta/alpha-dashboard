import { AggiornamentoTaskLive } from '@/components/pm/attivita/aggiornamento-live'
import { AttivitaProgetto } from '@/components/pm/attivita/attivita-progetto'
import type { ListaVista, TaskVista } from '@/components/pm/attivita/contesto'
import { NuovaLista } from '@/components/pm/attivita/lista-form'
import { FiltroInterruttore, FiltroSelect } from '@/components/pm/filtri'
import { requireProfilo } from '@/lib/auth/session'
import { FILTRI_STATO_TASK, isUuid, parseFiltroStatoTask } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * "Attività" tab: lists, tasks and sub-tasks of one project. ?task=<id>
 * (05/10/2026: "I miei task", the timeline, Alfire) opens that task's sheet
 * (AttivitaProgetto reads it); a task that is gone, or not visible to this
 * person, leaves a short message.
 */
export default async function AttivitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stato?: string; miei?: string }>
}) {
  const profilo = await requireProfilo()
  const { id } = await params
  // the layout already says "not found": nothing to add here
  if (!isUuid(id)) return null
  const parametri = await searchParams
  const filtro = { stato: parseFiltroStatoTask(parametri.stato), soloMiei: parametri.miei === '1' }
  const supabase = await createClient()

  const [progetto, gestisce, liste, tasks, membri] = await Promise.all([
    supabase.from('pm_progetti').select('id').eq('id', id).maybeSingle(),
    supabase.rpc('pm_puo_gestire', { p_progetto: id }),
    supabase
      .from('v_pm_tasklist')
      .select('id, nome, descrizione, data_inizio, data_fine, task_totali, task_completati, task_in_ritardo, avanzamento')
      .eq('progetto_id', id)
      .order('ordine')
      .order('created_at'),
    supabase
      .from('v_pm_task')
      .select(
        'id, progetto_id, tasklist_id, parent_id, titolo, descrizione, stato, priorita, assegnatari, data_inizio, scadenza, stima_minuti, created_by, in_ritardo, sotto_task_totali, sotto_task_completati',
      )
      .eq('progetto_id', id)
      .order('ordine')
      .order('created_at'),
    supabase
      .from('pm_membri')
      .select('profilo:profiles!pm_membri_profile_id_fkey(id, nome)')
      .eq('progetto_id', id),
  ])
  if (progetto.error || gestisce.error || liste.error || tasks.error || membri.error) {
    throw new Error('Impossibile caricare le attività del progetto')
  }
  if (!progetto.data) return null

  // views expose every column as nullable: the rows themselves are complete
  const righeListe = liste.data as ListaVista[]
  const righeTask = tasks.data as TaskVista[]
  const persone = membri.data
    .flatMap((m) => (m.profilo ? [m.profilo] : []))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const parametriCorrenti = { stato: parametri.stato, miei: filtro.soloMiei ? '1' : undefined }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* 390px: the two filters share the row, "Nuova lista" goes below */}
        <div
          className="grid basis-full grid-cols-2 items-end gap-2 sm:flex sm:flex-1 sm:basis-auto sm:flex-wrap"
          role="search"
          aria-label="Filtra i task"
        >
          <FiltroInterruttore
            nome="miei"
            attivo={filtro.soloMiei}
            etichetta="I miei task"
            parametri={parametriCorrenti}
            className="justify-center sm:justify-start"
          />
          <FiltroSelect
            id="filtro-stato-task"
            etichetta="Stato"
            nome="stato"
            valore={filtro.stato}
            predefinito="tutti"
            opzioni={Object.entries(FILTRI_STATO_TASK).map(([valore, etichetta]) => ({ valore, etichetta }))}
            parametri={parametriCorrenti}
          />
        </div>
        {gestisce.data ? <NuovaLista progettoId={id} /> : null}
      </div>

      <AttivitaProgetto
        progettoId={id}
        io={profilo.id}
        gestisce={!!gestisce.data}
        liste={righeListe}
        tasks={righeTask}
        membri={persone}
        filtro={filtro}
      />
      <AggiornamentoTaskLive progettoId={id} />
    </div>
  )
}
