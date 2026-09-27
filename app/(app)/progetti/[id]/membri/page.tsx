import { Crown, Users } from 'lucide-react'

import { AggiungiMembro, TogliMembro } from '@/components/pm/membri/membri-client'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ETICHETTA_LIVELLO_PM, ETICHETTA_RUOLO, livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { iniziali, isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** "Membri" tab: who is in the project; who manages it adds and removes people. */
export default async function MembriPage({ params }: { params: Promise<{ id: string }> }) {
  const profilo = await requireProfilo()
  const { id } = await params
  if (!isUuid(id)) return null
  const supabase = await createClient()

  const [progetto, gestisce, membri] = await Promise.all([
    supabase.from('pm_progetti').select('id, responsabile_id').eq('id', id).maybeSingle(),
    supabase.rpc('pm_puo_gestire', { p_progetto: id }),
    supabase
      .from('pm_membri')
      .select('profile_id, profilo:profiles!pm_membri_profile_id_fkey(id, nome, ruolo, livello_pm, attivo)')
      .eq('progetto_id', id)
      .order('created_at'),
  ])
  if (progetto.error || gestisce.error || membri.error) throw new Error('Impossibile caricare i membri')
  if (!progetto.data) return null

  const responsabileId = progetto.data.responsabile_id
  const persone = membri.data.flatMap((m) => (m.profilo ? [m.profilo] : []))
  const { data: attivi, error } = gestisce.data
    ? await supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true).order('nome')
    : { data: [], error: null }
  if (error) throw new Error('Impossibile caricare le persone')
  const dentro = new Set(persone.map((p) => p.id))
  const aggiungibili = attivi
    .filter((p) => !dentro.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome, ruolo: ETICHETTA_RUOLO[p.ruolo] }))

  return (
    <div className="max-w-3xl space-y-4">
      {gestisce.data ? <AggiungiMembro progettoId={id} persone={aggiungibili} /> : null}

      <section aria-labelledby="titolo-membri" className="space-y-2">
        <h2 id="titolo-membri" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Membri ({persone.length})
        </h2>
        {persone.length === 0 ? (
          <StatoVuoto
            Icona={Users}
            titolo="Nessun membro"
            descrizione={
              gestisce.data
                ? 'Aggiungi le persone che lavorano al progetto: vedranno le liste e i loro task.'
                : 'Chi gestisce il progetto aggiunge le persone.'
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="membri-progetto">
            {persone.map((p) => {
              const responsabile = p.id === responsabileId
              return (
                <li key={p.id} aria-label={p.nome} className="flex items-center gap-3 py-2 pr-1 pl-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
                  >
                    {iniziali(p.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                      <span className="truncate">{p.nome}</span>
                      {p.id === profilo.id ? <span className="font-normal text-muted-foreground">sei tu</span> : null}
                      {responsabile ? (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Crown className="size-3.5" aria-hidden="true" />
                          Responsabile
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ETICHETTA_RUOLO[p.ruolo]} · Progetti: {ETICHETTA_LIVELLO_PM[livelloPmEffettivo(p.ruolo, p.livello_pm)]}
                      {p.attivo ? '' : ' · account disattivato'}
                    </p>
                  </div>
                  {gestisce.data && p.id !== profilo.id ? (
                    <TogliMembro progettoId={id} profileId={p.id} nome={p.nome} />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        <p className="px-1 text-xs text-muted-foreground">
          Manager: gestisce liste, task e persone del progetto. Employee: aggiunge task e lavora quelli assegnati a lui.
        </p>
      </section>
    </div>
  )
}
