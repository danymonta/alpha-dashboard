import { ChevronRight, FolderKanban, LayoutTemplate, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { AttivoModello, ModelloForm } from '@/components/pm/impostazioni/modelli-client'
import { AttivoReparto, RepartoForm, SpostaReparto } from '@/components/pm/impostazioni/reparti-client'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { Badge } from '@/components/ui/badge'
import { requireLivelloPm } from '@/lib/auth/pm'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI_PROGETTI } from '@/lib/i18n/testi/impostazioni-progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Departments and templates of the Projects area: PM admin only. */
export default async function ImpostazioniProgettiPage() {
  const { profilo } = await requireLivelloPm(['admin'])
  const t = IMPOSTAZIONI_PROGETTI[await getLingua()]
  const supabase = await createClient()

  const [reparti, modelli] = await Promise.all([
    supabase
      .from('pm_reparti')
      .select('id, nome, descrizione, attivo, progetti_con_cliente, progetti:pm_progetti(count)')
      .order('ordine')
      .order('nome'),
    supabase
      .from('pm_modelli')
      .select('id, nome, descrizione, attivo, reparto_id, per_nuovi_clienti, voci:pm_modelli_voci(count)')
      .order('attivo', { ascending: false })
      .order('nome'),
  ])
  if (reparti.error || modelli.error) throw new Error(t.errore)

  const nomeReparto = new Map(reparti.data.map((r) => [r.id, r.nome]))
  const opzioniReparto = reparti.data
    .filter((r) => r.attivo)
    .map((r) => ({ id: r.id, nome: r.nome, progetti_con_cliente: r.progetti_con_cliente }))
  // every paying client gets a project (02/10/2026): without the template it opens with no tasks
  const repartiAttivi = new Set(reparti.data.filter((r) => r.attivo).map((r) => r.id))
  const senzaModelloClienti =
    reparti.data.some((r) => r.attivo && r.progetti_con_cliente) &&
    !modelli.data.some((m) => m.per_nuovi_clienti && m.attivo && m.reparto_id && repartiAttivi.has(m.reparto_id))

  return (
    <div className="max-w-3xl space-y-8">
      <IntestazionePagina
        indietro={
          profilo.ruolo === 'admin'
            ? { href: '/settings', etichetta: t.impostazioni }
            : { href: '/progetti', etichetta: t.progetti }
        }
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      <section aria-labelledby="titolo-reparti" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-reparti" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.reparti(reparti.data.length)}
          </h2>
          <RepartoForm />
        </div>
        {reparti.data.length === 0 ? (
          <StatoVuoto
            Icona={FolderKanban}
            titolo={t.nessunReparto}
            descrizione={t.nessunRepartoDescrizione}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="reparti">
            {reparti.data.map((r, i) => {
              const progetti = r.progetti[0]?.count ?? 0
              return (
                <li key={r.id} aria-label={r.nome} className="flex flex-wrap items-center gap-x-2 py-2 pr-1 pl-3">
                  {/* mobile: name on its own row, controls on the row below */}
                  <div className="min-w-0 basis-full md:basis-0 md:flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      {r.nome}
                      {r.progetti_con_cliente ? <Badge variant="outline">{t.perClienti}</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="num">{t.progettiConto(progetti)}</span>
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
                      progetti_con_cliente: r.progetti_con_cliente,
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
            {t.modelli(modelli.data.length)}
          </h2>
          <ModelloForm reparti={opzioniReparto} />
        </div>
        {senzaModelloClienti ? (
          <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-sm" data-testid="senza-modello-clienti">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span>{t.senzaModelloClienti}</span>
          </p>
        ) : null}
        {modelli.data.length === 0 ? (
          <StatoVuoto
            Icona={LayoutTemplate}
            titolo={t.nessunModello}
            descrizione={t.nessunModelloDescrizione}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="modelli">
            {modelli.data.map((m) => {
              const voci = m.voci[0]?.count ?? 0
              return (
                <li key={m.id} className="flex items-center gap-2 px-3 py-1">
                  <Link
                    href={`/settings/progetti/modelli/${m.id}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        {m.nome}
                        {m.per_nuovi_clienti ? <Badge variant="outline">{t.perNuoviClienti}</Badge> : null}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {m.reparto_id ? (nomeReparto.get(m.reparto_id) ?? t.reparto) : t.tuttiReparti} ·{' '}
                        <span className="num">{t.attivitaConto(voci)}</span>
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  <AttivoModello id={m.id} nome={m.nome} attivo={m.attivo} perNuoviClienti={m.per_nuovi_clienti} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
