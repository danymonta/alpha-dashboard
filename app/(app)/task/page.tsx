import { ListChecks } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { RigaMioTask, type MioTask } from '@/components/pm/miei-task/riga-mio-task'
import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireProfilo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import type { StatoTask } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Gruppo = { chiave: string; titolo: string; task: MioTask[] }

/**
 * "I miei task": what is assigned to me in every project, by when it is due.
 * The daily page of whoever works on projects: tick it off, jump to the
 * project, start the timer. Tasks nobody assigned stay in their project.
 */
export default async function MieiTaskPage() {
  const profilo = await requireProfilo()
  const supabase = await createClient()
  const oggi = oggiRoma()

  const { data: righe, error } = await supabase
    .from('v_pm_task')
    .select('id, titolo, stato, scadenza, in_ritardo, progetto_id')
    .eq('assegnatario_id', profilo.id)
    .neq('stato', 'completato')
    .order('scadenza', { nullsFirst: false })
    .order('created_at')
    .limit(200)
  if (error) throw new Error('Impossibile caricare i tuoi task')

  const idProgetti = [...new Set((righe ?? []).map((t) => t.progetto_id).filter((id): id is string => Boolean(id)))]
  const { data: progetti } = idProgetti.length
    ? await supabase.from('v_pm_progetti').select('id, nome').in('id', idProgetti)
    : { data: [] as { id: string | null; nome: string | null }[] }
  const nomi = new Map((progetti ?? []).map((p) => [p.id, p.nome ?? 'Progetto']))

  const task: MioTask[] = (righe ?? []).map((t) => ({
    id: t.id!,
    titolo: t.titolo ?? '',
    stato: t.stato as StatoTask,
    scadenza: t.scadenza,
    in_ritardo: Boolean(t.in_ritardo),
    progetto_id: t.progetto_id!,
    progetto: nomi.get(t.progetto_id) ?? 'Progetto',
  }))

  const fraSette = aggiungiGiorni(oggi, 7)
  const gruppi: Gruppo[] = [
    { chiave: 'ritardo', titolo: 'In ritardo', task: task.filter((t) => t.scadenza && t.scadenza < oggi) },
    { chiave: 'oggi', titolo: 'Oggi', task: task.filter((t) => t.scadenza === oggi) },
    {
      chiave: 'settimana',
      titolo: 'Prossimi 7 giorni',
      task: task.filter((t) => t.scadenza && t.scadenza > oggi && t.scadenza <= fraSette),
    },
    { chiave: 'dopo', titolo: 'Più avanti', task: task.filter((t) => t.scadenza && t.scadenza > fraSette) },
    { chiave: 'senza', titolo: 'Senza scadenza', task: task.filter((t) => !t.scadenza) },
  ].filter((g) => g.task.length > 0)

  return (
    <div className="max-w-3xl">
      <IntestazionePagina
        titolo="I miei task"
        descrizione="Quello che ti è stato assegnato in tutti i progetti. Spunta quando è fatto, tocca la sveglia per contare il tempo."
      />
      {task.length === 0 ? (
        <StatoVuoto
          Icona={ListChecks}
          titolo="Nessun task assegnato a te"
          descrizione="Quando qualcuno ti assegna un task in un progetto, lo trovi qui con la sua scadenza."
          azione={<LinkBottone href="/progetti">Vai ai progetti</LinkBottone>}
        />
      ) : (
        <div className="space-y-5">
          {gruppi.map((g) => (
            <section key={g.chiave} aria-labelledby={`gruppo-${g.chiave}`} data-testid={`gruppo-${g.chiave}`}>
              <h2
                id={`gruppo-${g.chiave}`}
                className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {g.titolo} <span className="num">({g.task.length})</span>
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {g.task.map((t) => (
                  <RigaMioTask key={t.id} task={t} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
