import { ChevronRight, FolderKanban, LayoutTemplate } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { AttivoModello, ModelloForm } from '@/components/pm/impostazioni/modelli-client'
import { AttivoReparto, RepartoForm, SpostaReparto } from '@/components/pm/impostazioni/reparti-client'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireLivelloPm } from '@/lib/auth/pm'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Departments and templates of the Projects area: PM admin only. */
export default async function ImpostazioniProgettiPage() {
  const { profilo } = await requireLivelloPm(['admin'])
  const supabase = await createClient()

  const [reparti, modelli] = await Promise.all([
    supabase
      .from('pm_reparti')
      .select('id, nome, descrizione, attivo, progetti:pm_progetti(count)')
      .order('ordine')
      .order('nome'),
    supabase
      .from('pm_modelli')
      .select('id, nome, descrizione, attivo, reparto_id, voci:pm_modelli_voci(count)')
      .order('attivo', { ascending: false })
      .order('nome'),
  ])
  if (reparti.error || modelli.error) throw new Error('Impossibile caricare reparti e modelli')

  const nomeReparto = new Map(reparti.data.map((r) => [r.id, r.nome]))
  const opzioniReparto = reparti.data.filter((r) => r.attivo).map((r) => ({ id: r.id, nome: r.nome }))

  return (
    <div className="max-w-3xl space-y-8">
      <IntestazionePagina
        indietro={
          profilo.ruolo === 'admin'
            ? { href: '/settings', etichetta: 'Impostazioni' }
            : { href: '/progetti', etichetta: 'Progetti' }
        }
        titolo="Progetti"
        descrizione="I reparti che dividono i progetti e i modelli con cui un progetto nasce già organizzato."
      />

      <section aria-labelledby="titolo-reparti" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-reparti" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reparti ({reparti.data.length})
          </h2>
          <RepartoForm />
        </div>
        {reparti.data.length === 0 ? (
          <StatoVuoto
            Icona={FolderKanban}
            titolo="Nessun reparto"
            descrizione="Crea il primo reparto, ad esempio «Fitness Coaching»: i progetti si dividono per reparto."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="reparti">
            {reparti.data.map((r, i) => {
              const progetti = r.progetti[0]?.count ?? 0
              return (
                <li key={r.id} aria-label={r.nome} className="flex flex-wrap items-center gap-x-2 py-2 pr-1 pl-3">
                  {/* mobile: name on its own row, controls on the row below */}
                  <div className="min-w-0 basis-full md:basis-0 md:flex-1">
                    <p className="text-sm font-medium">{r.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="num">{progetti === 1 ? '1 progetto' : `${progetti} progetti`}</span>
                      {r.descrizione ? ` · ${r.descrizione}` : ''}
                    </p>
                  </div>
                  <SpostaReparto id={r.id} nome={r.nome} prima={i === 0} ultima={i === reparti.data.length - 1} />
                  <span className="mr-auto md:mr-0">
                    <AttivoReparto id={r.id} nome={r.nome} attivo={r.attivo} />
                  </span>
                  <RepartoForm
                    reparto={{
                      id: r.id,
                      nome: r.nome,
                      descrizione: r.descrizione,
                      progetti,
                      modelli: modelli.data.filter((m) => m.reparto_id === r.id).length,
                    }}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="titolo-modelli" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-modelli" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Modelli ({modelli.data.length})
          </h2>
          <ModelloForm reparti={opzioniReparto} />
        </div>
        {modelli.data.length === 0 ? (
          <StatoVuoto
            Icona={LayoutTemplate}
            titolo="Nessun modello"
            descrizione="Un modello apre un progetto con liste e attività già datate, come il percorso di un cliente."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="modelli">
            {modelli.data.map((m) => {
              const voci = m.voci[0]?.count ?? 0
              return (
                <li key={m.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                  <Link
                    href={`/settings/progetti/modelli/${m.id}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{m.nome}</span>
                      <span className="block text-sm text-muted-foreground">
                        {m.reparto_id ? (nomeReparto.get(m.reparto_id) ?? 'Reparto') : 'Tutti i reparti'} ·{' '}
                        <span className="num">{voci === 1 ? '1 attività' : `${voci} attività`}</span>
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  <AttivoModello id={m.id} nome={m.nome} attivo={m.attivo} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
