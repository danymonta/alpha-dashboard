import { FolderKanban, Settings2 } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { FiltroInterruttore, FiltroSelect } from '@/components/pm/filtri'
import { CardProgetto } from '@/components/pm/progetto/card-progetto'
import { NuovoProgetto, type OpzioneCliente, type OpzioneModello } from '@/components/pm/progetto/nuovo-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import {
  FILTRI_STATO_PROGETTO,
  STATI_DEL_FILTRO,
  isUuid,
  parseFiltroStatoProgetto,
  puoCreareProgetti,
} from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** "Nessun progetto attivo", "Nessun progetto in pausa". */
const STATO_AL_SINGOLARE: Record<keyof typeof FILTRI_STATO_PROGETTO, string> = {
  attivi: ' attivo',
  in_pausa: ' in pausa',
  completati: ' completato',
  archiviati: ' archiviato',
  tutti: '',
}

const DESCRIZIONE = {
  admin: 'Tutti i progetti, divisi per reparto.',
  manager: 'I progetti di cui fai parte. Puoi aprirne di nuovi.',
  employee: 'I progetti di cui fai parte.',
} as const

export default async function ProgettiPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; reparto?: string; miei?: string }>
}) {
  const profilo = await requireProfilo()
  const livello = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)
  const creatore = puoCreareProgetti(livello)
  const adminApp = profilo.ruolo === 'admin'
  const parametri = await searchParams
  const filtroStato = parseFiltroStatoProgetto(parametri.stato)
  const repartoFiltro = isUuid(parametri.reparto) ? parametri.reparto : null
  // everybody else only sees the projects they are in: the filter would change nothing
  const soloMiei = livello === 'admin' && parametri.miei === '1'
  const supabase = await createClient()

  let query = supabase
    .from('v_pm_progetti')
    .select('id, reparto_id, nome, stato, data_fine, client_id, task_totali, task_completati, task_in_ritardo, avanzamento, scaduto')
    .order('nome')
  const stati = STATI_DEL_FILTRO[filtroStato]
  if (stati) query = query.in('stato', stati)
  if (repartoFiltro) query = query.eq('reparto_id', repartoFiltro)
  if (soloMiei) query = query.eq('sono_membro', true)

  const [reparti, progetti, modelli, persone, clienti] = await Promise.all([
    supabase.from('pm_reparti').select('id, nome, descrizione, attivo').order('ordine').order('nome'),
    query,
    creatore
      ? supabase.from('pm_modelli').select('id, nome, reparto_id, voci:pm_modelli_voci(count)').eq('attivo', true).order('nome')
      : Promise.resolve({ data: [], error: null }),
    creatore
      ? supabase.from('profiles').select('id, nome').eq('attivo', true).neq('id', profilo.id).order('nome')
      : Promise.resolve({ data: [], error: null }),
    adminApp
      ? supabase.from('clients').select('id, nome, cognome').order('nome').order('cognome')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (reparti.error || progetti.error || modelli.error || persone.error || clienti.error) {
    throw new Error('Impossibile caricare i progetti')
  }

  const ids = progetti.data.map((p) => p.id!)
  const idClienti = [...new Set(progetti.data.map((p) => p.client_id).filter((c): c is string => !!c))]
  const [membri, clientiCollegati] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('pm_membri')
          .select('progetto_id, profilo:profiles!pm_membri_profile_id_fkey(nome)')
          .in('progetto_id', ids)
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
    // RLS on clients: whoever may not see a client simply gets nothing back
    idClienti.length > 0
      ? supabase.from('clients').select('id, nome, cognome').in('id', idClienti)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (membri.error || clientiCollegati.error) throw new Error('Impossibile caricare i progetti')

  const nomiMembri = new Map<string, string[]>()
  for (const m of membri.data) {
    if (!m.profilo) continue
    nomiMembri.set(m.progetto_id, [...(nomiMembri.get(m.progetto_id) ?? []), m.profilo.nome])
  }
  const nomeCliente = new Map(clientiCollegati.data.map((c) => [c.id, [c.nome, c.cognome].filter(Boolean).join(' ')]))

  const repartiAttivi = reparti.data.filter((r) => r.attivo)
  const opzioniModello: OpzioneModello[] = modelli.data.map((m) => ({
    id: m.id,
    nome: m.nome,
    reparto_id: m.reparto_id,
    voci: m.voci[0]?.count ?? 0,
  }))
  const opzioniCliente: OpzioneCliente[] | null = adminApp
    ? clienti.data.map((c) => ({ id: c.id, etichetta: [c.nome, c.cognome].filter(Boolean).join(' ') }))
    : null
  const oggi = oggiRoma()

  // creators see every active department (with its empty state), everybody
  // else only the departments where they have something
  const sezioni = reparti.data
    .filter((r) => !repartoFiltro || r.id === repartoFiltro)
    .map((r) => ({ reparto: r, progetti: progetti.data.filter((p) => p.reparto_id === r.id) }))
    .filter((s) => s.progetti.length > 0 || (creatore && s.reparto.attivo))

  const statoParola = STATO_AL_SINGOLARE[filtroStato]
  // departments shown but none with a project: one empty state instead of four
  const tuttiVuoti = sezioni.length > 0 && sezioni.every((s) => s.progetti.length === 0)
  const propsNuovo = {
    reparti: repartiAttivi,
    modelli: opzioniModello,
    persone: persone.data,
    clienti: opzioniCliente,
    oggi,
  }
  const parametriCorrenti = {
    stato: parametri.stato,
    reparto: repartoFiltro ?? undefined,
    miei: soloMiei ? '1' : undefined,
  }

  return (
    <div className="max-w-6xl space-y-6">
      <IntestazionePagina
        titolo="Progetti"
        descrizione={DESCRIZIONE[livello]}
        azione={
          livello === 'admin' || creatore ? (
            <div className="flex flex-wrap gap-2">
              {livello === 'admin' ? (
                <LinkBottone href="/settings/progetti" variant="outline">
                  <Settings2 className="size-4" aria-hidden="true" />
                  Reparti e modelli
                </LinkBottone>
              ) : null}
              {/* the one primary action of the page: the department is chosen in the sheet */}
              {creatore && repartiAttivi.length > 0 ? <NuovoProgetto {...propsNuovo} /> : null}
            </div>
          ) : null
        }
      />

      {/* 390px: two selects side by side, the toggle on its own row */}
      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap" role="search" aria-label="Filtra i progetti">
        <FiltroSelect
          id="filtro-stato"
          etichetta="Stato"
          nome="stato"
          valore={filtroStato}
          predefinito="attivi"
          opzioni={Object.entries(FILTRI_STATO_PROGETTO).map(([valore, etichetta]) => ({ valore, etichetta }))}
          parametri={parametriCorrenti}
        />
        <FiltroSelect
          id="filtro-reparto"
          etichetta="Reparto"
          nome="reparto"
          valore={repartoFiltro ?? ''}
          predefinito=""
          opzioni={[
            { valore: '', etichetta: 'Tutti i reparti' },
            ...reparti.data.map((r) => ({ valore: r.id, etichetta: r.attivo ? r.nome : `${r.nome} (disattivato)` })),
          ]}
          parametri={parametriCorrenti}
        />
        {livello === 'admin' ? (
          <FiltroInterruttore
            nome="miei"
            attivo={soloMiei}
            etichetta="Solo i miei"
            parametri={parametriCorrenti}
            className="col-span-2 justify-self-start"
          />
        ) : null}
      </div>

      {tuttiVuoti ? (
        <StatoVuoto
          Icona={FolderKanban}
          titolo={`Nessun progetto${statoParola}`}
          descrizione={
            filtroStato !== 'tutti' || repartoFiltro
              ? 'Cambia i filtri per vedere gli altri progetti, o aprine uno nuovo.'
              : 'Apri il primo progetto con «Nuovo progetto»: il reparto lo scegli nel foglio.'
          }
          azione={
            filtroStato !== 'tutti' || repartoFiltro ? (
              <LinkBottone href="/progetti?stato=tutti" variant="outline">
                Mostra tutti i progetti
              </LinkBottone>
            ) : null
          }
        />
      ) : sezioni.length === 0 ? (
        <StatoVuoto
          Icona={FolderKanban}
          titolo={filtroStato === 'attivi' && !repartoFiltro ? 'Non fai ancora parte di un progetto' : `Nessun progetto${statoParola}`}
          descrizione={
            filtroStato === 'attivi' && !repartoFiltro
              ? 'Quando qualcuno ti aggiunge a un progetto, lo trovi qui con i tuoi task.'
              : 'Cambia i filtri per vedere gli altri progetti.'
          }
          azione={
            filtroStato !== 'tutti' || repartoFiltro ? (
              <LinkBottone href="/progetti?stato=tutti" variant="outline">
                Mostra tutti i progetti
              </LinkBottone>
            ) : null
          }
        />
      ) : (
        sezioni.map(({ reparto, progetti: elenco }) => (
          <section key={reparto.id} aria-labelledby={`reparto-${reparto.id}`} className="space-y-2">
            <div className="flex min-h-11 items-center justify-between gap-2">
              <h2 id={`reparto-${reparto.id}`} className="text-base font-medium">
                {reparto.nome}
                <span className="num ml-2 text-sm font-normal text-muted-foreground">{elenco.length}</span>
                {reparto.attivo ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">disattivato</span>}
              </h2>
              {creatore && reparto.attivo ? (
                <NuovoProgetto {...propsNuovo} repartoId={reparto.id} variante="icona" />
              ) : null}
            </div>

            {elenco.length === 0 ? (
              // one compact line: the dashed box is only for a page with nothing at all
              <div className="flex min-h-11 flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                <span>Nessun progetto{statoParola}.</span>
                {creatore && reparto.attivo ? (
                  <NuovoProgetto {...propsNuovo} repartoId={reparto.id} variante="link" />
                ) : null}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {elenco.map((p) => (
                  <li key={p.id}>
                    <CardProgetto
                      progetto={{
                        id: p.id!,
                        nome: p.nome!,
                        stato: p.stato!,
                        data_fine: p.data_fine,
                        task_totali: p.task_totali ?? 0,
                        task_completati: p.task_completati ?? 0,
                        task_in_ritardo: p.task_in_ritardo ?? 0,
                        avanzamento: p.avanzamento,
                        scaduto: p.scaduto ?? false,
                      }}
                      membri={nomiMembri.get(p.id!) ?? []}
                      cliente={p.client_id ? (nomeCliente.get(p.client_id) ?? null) : null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}
