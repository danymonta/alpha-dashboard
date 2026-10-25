import { ListTodo } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { GanttProgetto, type ListaVista, type TaskVista } from '@/components/pm/gantt/gantt'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { GANTT } from '@/lib/i18n/testi/gantt'
import { nomiAssegnatari } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Gantt tab: lists and tasks the viewer can see (RLS), with progress and "late" from the SQL views. */
export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfilo()
  const { id } = await params
  // the layout shows "Progetto non trovato"
  if (!UUID.test(id)) return null

  const t = GANTT[await getLingua()]
  const supabase = await createClient()
  const [liste, task] = await Promise.all([
    supabase
      .from('v_pm_tasklist')
      .select('id, nome, ordine, data_inizio, data_fine, task_totali, task_completati, avanzamento')
      .eq('progetto_id', id)
      .order('ordine'),
    supabase
      .from('v_pm_task')
      .select('id, titolo, tasklist_id, parent_id, ordine, data_inizio, scadenza, stato, in_ritardo, assegnatari')
      .eq('progetto_id', id)
      .order('ordine'),
  ])
  if (liste.error || task.error) throw new Error(t.errore)

  const idAssegnatari = [...new Set(task.data.flatMap((t) => t.assegnatari ?? []))]
  const { data: persone, error: errorePersone } =
    idAssegnatari.length > 0
      ? await supabase.from('profiles').select('id, nome').in('id', idAssegnatari)
      : { data: [], error: null }
  if (errorePersone) throw new Error(t.errore)
  const nomi = new Map(persone.map((p) => [p.id, p.nome]))

  // the views expose nullable columns: every row here comes from a real list or task
  const datiListe: ListaVista[] = liste.data.map((l) => ({
    id: l.id!,
    nome: l.nome ?? '',
    ordine: l.ordine ?? 0,
    data_inizio: l.data_inizio,
    data_fine: l.data_fine,
    task_totali: l.task_totali ?? 0,
    task_completati: l.task_completati ?? 0,
    avanzamento: l.avanzamento,
  }))
  const datiTask: TaskVista[] = task.data.map((t) => ({
    id: t.id!,
    titolo: t.titolo ?? '',
    tasklist_id: t.tasklist_id,
    parent_id: t.parent_id,
    ordine: t.ordine ?? 0,
    data_inizio: t.data_inizio,
    scadenza: t.scadenza,
    stato: t.stato ?? 'da_fare',
    in_ritardo: t.in_ritardo ?? false,
    assegnatari: nomiAssegnatari(t.assegnatari, nomi),
  }))

  if (datiListe.length === 0 && datiTask.length === 0) {
    return (
      <StatoVuoto
        Icona={ListTodo}
        titolo={t.vuoto}
        descrizione={t.vuotoDescrizione}
        azione={<LinkBottone href={`/progetti/${id}/attivita`}>{t.vaiAttivita}</LinkBottone>}
      />
    )
  }

  return <GanttProgetto liste={datiListe} task={datiTask} oggi={oggiRoma()} />
}
