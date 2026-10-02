import { ListChecks, SearchX, UserRoundCheck } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { AttivoModello, EliminaVoce, ModelloForm, VoceForm } from '@/components/pm/impostazioni/modelli-client'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireLivelloPm } from '@/lib/auth/pm'
import { ETICHETTA_RUOLO } from '@/lib/auth/roles'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function quando(inizio: number | null, durata: number | null): string {
  if (inizio === null || durata === null) return 'Senza date: aperta per tutto il progetto'
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
    supabase.from('pm_modelli').select('id, nome, descrizione, reparto_id, attivo, per_nuovi_clienti').eq('id', id).maybeSingle(),
    supabase.from('pm_reparti').select('id, nome, progetti_con_cliente').eq('attivo', true).order('ordine'),
    supabase
      .from('pm_modelli_voci')
      .select('id, tasklist, titolo, descrizione, ordine, inizio_giorni, durata_giorni, per_ruolo')
      .eq('modello_id', id)
      .order('ordine')
      .order('created_at'),
  ])
  if (modello.error || reparti.error || voci.error) throw new Error('Impossibile caricare il modello')
  if (!modello.data) return nonTrovato

  const m = modello.data
  // lists in the order of their first activity, as pm_crea_progetto creates them;
  // the activities without a list after them, as the project shows them
  const liste: { nome: string | null; voci: typeof voci.data }[] = []
  for (const v of voci.data) {
    const lista = liste.find((l) => l.nome === v.tasklist)
    if (lista) lista.voci.push(v)
    else liste.push({ nome: v.tasklist, voci: [v] })
  }
  liste.sort((a, b) => Number(a.nome === null) - Number(b.nome === null))
  const nomiListe = liste.flatMap((l) => (l.nome ? [l.nome] : []))
  const ordineSuccessivo = Math.max(0, ...voci.data.map((v) => v.ordine)) + 1
  const repartoScelto = reparti.data.find((r) => r.id === m.reparto_id)
  const reparto = repartoScelto?.nome
  const perClienti = repartoScelto?.progetti_con_cliente ?? false
  // a new activity is dated like the others; an empty template starts dated
  const conDatePredefinite = voci.data.length === 0 || voci.data.some((v) => v.inizio_giorni !== null)

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
            <AttivoModello id={m.id} nome={m.nome} attivo={m.attivo} perNuoviClienti={m.per_nuovi_clienti} />
            <ModelloForm modello={m} reparti={reparti.data} />
          </div>
        }
      />

      <section aria-labelledby="titolo-voci" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-voci" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Attività ({voci.data.length})
          </h2>
          <VoceForm
            modelloId={m.id}
            liste={nomiListe}
            ordineSuccessivo={ordineSuccessivo}
            conDatePredefinite={conDatePredefinite}
            perClienti={perClienti}
          />
        </div>
        {m.per_nuovi_clienti ? (
          <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-sm" data-testid="modello-nuovi-clienti">
            <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              Ogni cliente che paga la prima rata ha un progetto con queste attività. Cambiarle vale per i prossimi
              clienti: i progetti già aperti restano come sono. Il modello resta attivo finché è quello dei nuovi
              clienti.
            </span>
          </p>
        ) : null}
        <p className="px-1 text-sm text-muted-foreground">
          Il giorno 0 è l’inizio del progetto. Ogni lista nasce con le date dalla sua prima all’ultima attività; un’attività
          senza date resta aperta per tutto il progetto.
        </p>

        {liste.length === 0 ? (
          <StatoVuoto
            Icona={ListChecks}
            titolo="Nessuna attività nel modello"
            descrizione="Aggiungi la prima: un progetto creato da questo modello partirà con queste attività già datate."
          />
        ) : (
          liste.map((l) => (
            <div key={l.nome ?? 'senza-lista'} className="space-y-1">
              {/* without lists at all, no heading: the activities are the template */}
              {l.nome || liste.length > 1 ? (
                <h3 className="px-1 text-sm font-medium">{l.nome ?? 'Fuori dalle liste'}</h3>
              ) : null}
              <ul
                className="divide-y divide-border rounded-xl bg-card"
                aria-label={l.nome ? `Attività di ${l.nome}` : 'Attività fuori dalle liste'}
              >
                {l.voci.map((v) => (
                  <li key={v.id} aria-label={v.titolo} className="flex items-center gap-2 py-1 pr-1 pl-3">
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-sm">{v.titolo}</p>
                      <p className="num text-xs text-muted-foreground">
                        {quando(v.inizio_giorni, v.durata_giorni)}
                        {v.per_ruolo ? ` · ${ETICHETTA_RUOLO[v.per_ruolo]}` : ''}
                      </p>
                    </div>
                    <VoceForm
                      modelloId={m.id}
                      voce={v}
                      liste={nomiListe}
                      ordineSuccessivo={ordineSuccessivo}
                      perClienti={perClienti}
                    />
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
