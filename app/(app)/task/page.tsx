import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ElencoMieiTask } from '@/components/pm/miei-task/elenco-miei-task'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { MIEI_TASK } from '@/lib/i18n/testi/task'
import {
  COMPLETATI_MAX,
  COMPLETATI_RECENTI,
  mostraTuttiICompletati,
  type MioTask,
  type MioTaskCompletato,
} from '@/lib/miei-task'
import { nomiAssegnatari, type StatoTask } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * "I miei task": what is assigned to me in every project, by when it is due,
 * also when I share it with someone else (then the row says with whom), and
 * below what I closed, newest first. The daily page of whoever works on
 * projects: open it where it lives (05/10/2026), tick it off, jump to the
 * project, start the timer, reopen.
 * Tasks nobody assigned stay in their project. Only my own tasks: RLS and the
 * assignees decide, nobody sees anyone else's list (CLAUDE.md section 17).
 */
export default async function MieiTaskPage({ searchParams }: { searchParams: Promise<{ completati?: string }> }) {
  const profilo = await requireProfilo()
  const testi = MIEI_TASK[await getLingua()]
  const tutti = mostraTuttiICompletati((await searchParams).completati)
  const supabase = await createClient()
  const oggi = oggiRoma()

  const [{ data: righe, error }, { data: chiusi, count, error: errChiusi }] = await Promise.all([
    supabase
      .from('v_pm_task')
      .select('id, titolo, stato, scadenza, in_ritardo, progetto_id, assegnatari, created_at')
      // a task can have several people: mine when I am one of them
      .contains('assegnatari', [profilo.id])
      .neq('stato', 'completato')
      // the same order as lib/miei-task.ts, which puts back the tasks ticked on the page
      .order('scadenza', { nullsFirst: false })
      .order('created_at')
      .order('id')
      .limit(200),
    supabase
      .from('v_pm_task')
      // the count is the database's: "Completati (n)" and "Mostra tutti (n)"
      .select('id, titolo, scadenza, progetto_id, completato_il', { count: 'exact' })
      .contains('assegnatari', [profilo.id])
      .eq('stato', 'completato')
      .order('completato_il', { ascending: false, nullsFirst: false })
      .order('id')
      .limit(tutti ? COMPLETATI_MAX : COMPLETATI_RECENTI),
  ])
  if (error || errChiusi) throw new Error(testi.errore)

  const idProgetti = [
    ...new Set([...(righe ?? []), ...(chiusi ?? [])].map((t) => t.progetto_id).filter((id): id is string => Boolean(id))),
  ]
  const idAltri = [...new Set((righe ?? []).flatMap((t) => t.assegnatari ?? []).filter((id) => id !== profilo.id))]
  const [{ data: progetti }, { data: persone }] = await Promise.all([
    idProgetti.length
      ? supabase.from('v_pm_progetti').select('id, nome').in('id', idProgetti)
      : Promise.resolve({ data: [] as { id: string | null; nome: string | null }[] }),
    idAltri.length
      ? supabase.from('profiles').select('id, nome').in('id', idAltri)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const nomi = new Map((progetti ?? []).map((p) => [p.id, p.nome ?? testi.progetto]))
  const nomiPersone = new Map((persone ?? []).map((p) => [p.id, p.nome]))

  const aperti: MioTask[] = (righe ?? []).map((t) => ({
    id: t.id!,
    titolo: t.titolo ?? '',
    stato: t.stato as StatoTask,
    scadenza: t.scadenza,
    in_ritardo: Boolean(t.in_ritardo),
    progetto_id: t.progetto_id!,
    progetto: nomi.get(t.progetto_id) ?? testi.progetto,
    con: nomiAssegnatari(
      (t.assegnatari ?? []).filter((id) => id !== profilo.id),
      nomiPersone,
    ),
    creato_il: t.created_at ?? '',
  }))

  const completati: MioTaskCompletato[] = (chiusi ?? []).map((t) => ({
    id: t.id!,
    titolo: t.titolo ?? '',
    scadenza: t.scadenza,
    progetto_id: t.progetto_id!,
    progetto: nomi.get(t.progetto_id) ?? testi.progetto,
    completato_il: t.completato_il,
  }))

  return (
    <div className="max-w-3xl">
      <IntestazionePagina titolo={testi.titolo} descrizione={testi.descrizione} />
      <ElencoMieiTask
        aperti={aperti}
        completati={completati}
        totaleCompletati={count ?? completati.length}
        tutti={tutti}
        oggi={oggi}
      />
    </div>
  )
}
