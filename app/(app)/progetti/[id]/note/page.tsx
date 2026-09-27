import { NotebookPen } from 'lucide-react'

import { EliminaNota, ModificaNota, NoteLive, NuovaNota } from '@/components/pm/note/note-client'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { formatOra, oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { intestazioneGiorno, perGiorno } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The most recent notes; older ones stay in the database. */
const LIMITE = 300

/**
 * Notes of the project, grouped by day: a shared diary of decisions and
 * what happened. Every member writes; the author (or the admin) edits.
 */
export default async function NoteProgettoPage({ params }: { params: Promise<{ id: string }> }) {
  const profilo = await requireProfilo()
  const { id } = await params
  // the layout shows "Progetto non trovato"
  if (!UUID.test(id)) return null

  const oggi = oggiRoma()
  const supabase = await createClient()
  const { data: note, error } = await supabase
    .from('pm_note')
    .select('id, data, testo, created_at, updated_at, autore_id, autore:profiles!pm_note_autore_id_fkey(nome)')
    .eq('progetto_id', id)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIMITE)
  if (error) throw new Error('Impossibile caricare le note')

  const adminPm = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) === 'admin'

  return (
    <div className="space-y-6">
      <NoteLive progettoId={id} />
      <NuovaNota progettoId={id} oggi={oggi} />

      {note.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <NotebookPen className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Ancora nessuna nota</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Scrivi qui sopra cosa è successo oggi: una decisione, un feedback, una cosa da ricordare. Il team la ritrova
            sotto la sua data.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {perGiorno(note).map(({ data, righe }) => (
            <section key={data} aria-labelledby={`note-${data}`} data-testid={`note-${data}`} className="space-y-2">
              <h2 id={`note-${data}`} className="px-1 text-sm font-medium first-letter:uppercase">
                {intestazioneGiorno(data, oggi)}
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {righe.map((n) => {
                  const mia = n.autore_id === profilo.id
                  const modificata = new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 60_000
                  return (
                    <li key={n.id} className="flex gap-2 py-3 pr-1 pl-4" data-testid="nota">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{mia ? 'Tu' : (n.autore?.nome ?? 'Collaboratore')}</span>
                          {' · '}
                          <span className="num">{formatOra(n.created_at)}</span>
                          {modificata ? ' · modificata' : ''}
                        </p>
                        <p className="text-sm break-words whitespace-pre-line">{n.testo}</p>
                      </div>
                      {mia || adminPm ? (
                        <div className="flex shrink-0 items-start">
                          <ModificaNota nota={{ id: n.id, data: n.data, testo: n.testo }} />
                          <EliminaNota id={n.id} />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {note.length === LIMITE ? (
            <p className="text-center text-xs text-muted-foreground">Sono mostrate le {LIMITE} note più recenti.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
