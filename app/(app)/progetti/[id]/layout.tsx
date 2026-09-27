import { ChevronLeft, SearchX } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ModificaProgetto } from '@/components/pm/progetto/modifica-progetto'
import { SchedeProgetto } from '@/components/pm/schede-progetto'
import { BarraAvanzamento } from '@/components/pm/stato-progetto'
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
  const [gestisce, avanzamento, membri, cliente, clienti] = await Promise.all([
    supabase.rpc('pm_puo_gestire', { p_progetto: progetto.id }),
    // progress and late tasks: computed by the view, only read here
    supabase
      .from('v_pm_progetti')
      .select('task_totali, task_completati, task_in_ritardo, avanzamento')
      .eq('id', progetto.id)
      .maybeSingle(),
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
  const meta = [progetto.reparto?.nome, ETICHETTA_STATO_PROGETTO[progetto.stato], periodo].filter(Boolean).join(' · ')
  // responsible and client only from 640px: on a phone the header stays short
  const chi = [
    progetto.responsabile ? `Responsabile: ${progetto.responsabile.nome}` : null,
    nomeCliente ? `Cliente: ${nomeCliente}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const numeri = avanzamento.data

  return (
    // one width for header, tabs and every tab's content: the right edge never jumps
    <div className="space-y-5">
      <header className="space-y-3">
        {/* ghost link: -ml-2 puts the chevron on the content edge, min-h-11 keeps the 44px target */}
        <Link
          href="/progetti"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Progetti
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-xl font-semibold break-words md:text-2xl">{progetto.nome}</h1>
            {meta ? <p className="num text-sm text-muted-foreground">{meta}</p> : null}
            {chi ? <p className="hidden text-sm text-muted-foreground sm:block">{chi}</p> : null}
          </div>
          {gestisce.data ? (
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
          ) : null}
        </div>
        {numeri ? (
          <BarraAvanzamento
            completati={numeri.task_completati ?? 0}
            totali={numeri.task_totali ?? 0}
            avanzamento={numeri.avanzamento}
            inRitardo={numeri.task_in_ritardo ?? 0}
            className="max-w-sm"
          />
        ) : null}
      </header>
      <SchedeProgetto id={progetto.id} />
      {children}
    </div>
  )
}
