import { ListChecks, SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { AttivoModello, EliminaVoce, ModelloForm, VoceForm } from '@/components/pm/impostazioni/modelli-client'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireLivelloPm } from '@/lib/auth/pm'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function quando(inizio: number, durata: number): string {
  const da = inizio === 0 ? 'dal giorno di inizio' : `dal giorno ${inizio}`
  return `${da}, ${durata === 1 ? '1 giorno' : `${durata} giorni`}`
}

/** One template: its activities grouped by list, in the order a new project gets them. */
export default async function ModelloPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLivelloPm(['admin'])
  const { id } = await params
  const supabase = await createClient()

  const nonTrovato = (
    <div className="max-w-3xl">
      <IntestazionePagina titolo="Modello" indietro={{ href: '/settings/progetti', etichetta: 'Progetti' }} />
      <StatoVuoto
        Icona={SearchX}
        titolo="Modello non trovato"
        descrizione="Il modello non esiste più."
        azione={<LinkBottone href="/settings/progetti" variant="outline">Torna ai modelli</LinkBottone>}
      />
    </div>
  )
  if (!isUuid(id)) return nonTrovato

  const [modello, reparti, voci] = await Promise.all([
    supabase.from('pm_modelli').select('id, nome, descrizione, reparto_id, attivo').eq('id', id).maybeSingle(),
    supabase.from('pm_reparti').select('id, nome').eq('attivo', true).order('ordine'),
    supabase
      .from('pm_modelli_voci')
      .select('id, tasklist, titolo, descrizione, ordine, inizio_giorni, durata_giorni')
      .eq('modello_id', id)
      .order('ordine')
      .order('created_at'),
  ])
  if (modello.error || reparti.error || voci.error) throw new Error('Impossibile caricare il modello')
  if (!modello.data) return nonTrovato

  const m = modello.data
  // lists in the order of their first activity, as pm_crea_progetto creates them
  const liste: { nome: string; voci: typeof voci.data }[] = []
  for (const v of voci.data) {
    const lista = liste.find((l) => l.nome === v.tasklist)
    if (lista) lista.voci.push(v)
    else liste.push({ nome: v.tasklist, voci: [v] })
  }
  const nomiListe = liste.map((l) => l.nome)
  const ordineSuccessivo = (voci.data.at(-1)?.ordine ?? 0) + 1
  const reparto = reparti.data.find((r) => r.id === m.reparto_id)?.nome

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings/progetti', etichetta: 'Progetti' }}
        titolo={m.nome}
        descrizione={[m.reparto_id ? (reparto ?? 'Reparto disattivato') : 'Tutti i reparti', m.descrizione]
          .filter(Boolean)
          .join(' · ')}
        azione={
          <div className="flex flex-wrap items-center gap-2">
            <AttivoModello id={m.id} nome={m.nome} attivo={m.attivo} />
            <ModelloForm modello={m} reparti={reparti.data} />
          </div>
        }
      />

      <section aria-labelledby="titolo-voci" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-voci" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Attività ({voci.data.length})
          </h2>
          <VoceForm modelloId={m.id} liste={nomiListe} ordineSuccessivo={ordineSuccessivo} />
        </div>
        <p className="px-1 text-sm text-muted-foreground">
          Il giorno 0 è l’inizio del progetto. Ogni lista nasce con le date dalla sua prima all’ultima attività.
        </p>

        {liste.length === 0 ? (
          <StatoVuoto
            Icona={ListChecks}
            titolo="Nessuna attività nel modello"
            descrizione="Aggiungi la prima: un progetto creato da questo modello partirà con queste attività già datate."
          />
        ) : (
          liste.map((l) => (
            <div key={l.nome} className="space-y-1">
              <h3 className="px-1 text-sm font-medium">{l.nome}</h3>
              <ul className="divide-y divide-border rounded-xl bg-card" aria-label={`Attività di ${l.nome}`}>
                {l.voci.map((v) => (
                  <li key={v.id} aria-label={v.titolo} className="flex items-center gap-2 py-1 pr-1 pl-3">
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-sm">{v.titolo}</p>
                      <p className="num text-xs text-muted-foreground">
                        {quando(v.inizio_giorni, v.durata_giorni)}
                      </p>
                    </div>
                    <VoceForm modelloId={m.id} voce={v} liste={nomiListe} ordineSuccessivo={ordineSuccessivo} />
                    <EliminaVoce id={v.id} titolo={v.titolo} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
