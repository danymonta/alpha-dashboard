import { cookies } from 'next/headers'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ElencoMieiTask } from '@/components/pm/miei-task/elenco-miei-task'
import { SceltaVistaTask } from '@/components/pm/miei-task/scelta-vista-task'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { BACHECA_TASK, MIEI_TASK } from '@/lib/i18n/testi/task'
import {
  COMPLETATI_MAX,
  COMPLETATI_RECENTI,
  COOKIE_VISTA_TASK,
  mostraTuttiICompletati,
  vistaTaskIniziale,
  type MioTask,
  type MioTaskCompletato,
} from '@/lib/miei-task'
import { nomiAssegnatari, type Priorita, type StatoTask } from '@/lib/progetti'
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
export default async function MieiTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ completati?: string; vista?: string }>
}) {
  const profilo = await requireProfilo()
  const lingua = await getLingua()
  const testi = MIEI_TASK[lingua]
  const parametri = await searchParams
  const tutti = mostraTuttiICompletati(parametri.completati)
  // the board (1.75.0) unless the address or this browser says the list
  const vista = vistaTaskIniziale(parametri.vista, (await cookies()).get(COOKIE_VISTA_TASK)?.value)
  const supabase = await createClient()
  const oggi = oggiRoma()

  const [{ data: righe, error }, { data: chiusi, count, error: errChiusi }, { data: mieiProgetti }] = await Promise.all([
    supabase
      .from('v_pm_task')
      .select('id, titolo, stato, priorita, scadenza, in_ritardo, progetto_id, assegnatari, created_at')
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
    // «Aggiungi un task» on the board: a task lives in a project I am a member of
    supabase.from('pm_membri').select('progetto_id').eq('profile_id', profilo.id),
  ])
  if (error || errChiusi) throw new Error(testi.errore)

  const idMiei = (mieiProgetti ?? []).map((m) => m.progetto_id)
  const idProgetti = [
    ...new Set(
      [...(righe ?? []), ...(chiusi ?? [])]
        .map((t) => t.progetto_id)
        .filter((id): id is string => Boolean(id))
        .concat(idMiei),
    ),
  ]
  const idAltri = [...new Set((righe ?? []).flatMap((t) => t.assegnatari ?? []).filter((id) => id !== profilo.id))]
  const [{ data: progetti }, { data: persone }] = await Promise.all([
    idProgetti.length
      ? supabase.from('v_pm_progetti').select('id, nome, stato').in('id', idProgetti)
      : Promise.resolve({ data: [] as { id: string | null; nome: string | null; stato: string | null }[] }),
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
    priorita: (t.priorita ?? 'media') as Priorita,
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

  const insiemeMiei = new Set(idMiei)
  const progettiPerAggiungere = (progetti ?? [])
    .filter((p) => p.id && insiemeMiei.has(p.id) && p.stato === 'attivo')
    .map((p) => ({ id: p.id!, nome: p.nome ?? testi.progetto }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

  return (
    <div className={vista === 'bacheca' ? undefined : 'max-w-3xl'}>
      <IntestazionePagina
        titolo={testi.titolo}
        descrizione={vista === 'bacheca' ? BACHECA_TASK[lingua].descrizione : testi.descrizione}
        azione={<SceltaVistaTask vista={vista} completati={tutti ? 'tutti' : undefined} />}
      />
      <ElencoMieiTask
        vista={vista}
        progetti={progettiPerAggiungere}
        aperti={aperti}
        completati={completati}
        totaleCompletati={count ?? completati.length}
        tutti={tutti}
        oggi={oggi}
      />
    </div>
  )
}
