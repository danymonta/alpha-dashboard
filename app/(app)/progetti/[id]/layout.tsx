import { SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ModificaProgetto } from '@/components/pm/progetto/modifica-progetto'
import { SchedeProgetto } from '@/components/pm/schede-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { formatData } from '@/lib/format'
import { ETICHETTA_STATO_PROGETTO, isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Header and tabs of one project. RLS decides who sees it: members, and the admin. */
export default async function LayoutProgetto({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const profilo = await requireProfilo()
  const { id } = await params
  const supabase = await createClient()

  const { data: progetto } = isUuid(id)
    ? await supabase
        .from('pm_progetti')
        .select(
          'id, nome, descrizione, stato, data_inizio, data_fine, responsabile_id, client_id, reparto:pm_reparti(nome), responsabile:profiles!pm_progetti_responsabile_id_fkey(nome)',
        )
        .eq('id', id)
        .maybeSingle()
    : { data: null }

  if (!progetto) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo="Progetto" indietro={{ href: '/progetti', etichetta: 'Progetti' }} />
        <StatoVuoto
          Icona={SearchX}
          titolo="Progetto non trovato"
          descrizione="Il progetto non esiste o non fai parte del suo team."
          azione={<LinkBottone href="/progetti" variant="outline">Torna ai progetti</LinkBottone>}
        />
      </div>
    )
  }

  const adminApp = profilo.ruolo === 'admin'
  const adminPm = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) === 'admin'
  const [gestisce, membri, cliente, clienti] = await Promise.all([
    supabase.rpc('pm_puo_gestire', { p_progetto: progetto.id }),
    supabase
      .from('pm_membri')
      .select('profilo:profiles!pm_membri_profile_id_fkey(id, nome)')
      .eq('progetto_id', progetto.id),
    // RLS on clients: whoever may not see this client gets nothing back
    progetto.client_id
      ? supabase.from('clients').select('nome, cognome').eq('id', progetto.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    adminApp
      ? supabase.from('clients').select('id, nome, cognome').order('nome').order('cognome')
      : Promise.resolve({ data: [], error: null }),
  ])

  const persone = (membri.data ?? [])
    .flatMap((m) => (m.profilo ? [m.profilo] : []))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const nomeCliente = cliente.data ? [cliente.data.nome, cliente.data.cognome].filter(Boolean).join(' ') : null
  const periodo =
    progetto.data_inizio || progetto.data_fine
      ? `${formatData(progetto.data_inizio)} → ${progetto.data_fine ? formatData(progetto.data_fine) : 'in corso'}`
      : null

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={progetto.nome}
        descrizione={[
          progetto.reparto?.nome,
          ETICHETTA_STATO_PROGETTO[progetto.stato],
          periodo,
          progetto.responsabile ? `Responsabile: ${progetto.responsabile.nome}` : null,
          nomeCliente ? `Cliente: ${nomeCliente}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        indietro={{ href: '/progetti', etichetta: 'Progetti' }}
        azione={
          gestisce.data ? (
            <ModificaProgetto
              progetto={{
                id: progetto.id,
                nome: progetto.nome,
                descrizione: progetto.descrizione,
                stato: progetto.stato,
                data_inizio: progetto.data_inizio,
                data_fine: progetto.data_fine,
                responsabile_id: progetto.responsabile_id,
                client_id: progetto.client_id,
              }}
              membri={persone}
              clienti={
                adminApp
                  ? (clienti.data ?? []).map((c) => ({ id: c.id, etichetta: [c.nome, c.cognome].filter(Boolean).join(' ') }))
                  : null
              }
              eliminabile={adminPm}
            />
          ) : null
        }
      />
      <SchedeProgetto id={progetto.id} />
      {children}
    </div>
  )
}
