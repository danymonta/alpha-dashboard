import { SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SchedeProgetto } from '@/components/pm/schede-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireProfilo } from '@/lib/auth/session'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ETICHETTA_STATO = {
  attivo: 'Attivo',
  in_pausa: 'In pausa',
  completato: 'Completato',
  archiviato: 'Archiviato',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Header and tabs of one project. RLS decides who sees it: members, and the admin. */
export default async function LayoutProgetto({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  await requireProfilo()
  const { id } = await params
  const supabase = await createClient()

  const { data: progetto } = UUID.test(id)
    ? await supabase
        .from('pm_progetti')
        .select('id, nome, stato, data_inizio, data_fine, reparto:pm_reparti(nome)')
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

  const periodo =
    progetto.data_inizio || progetto.data_fine
      ? `${formatData(progetto.data_inizio)} → ${progetto.data_fine ? formatData(progetto.data_fine) : 'in corso'}`
      : null

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={progetto.nome}
        descrizione={[progetto.reparto?.nome, ETICHETTA_STATO[progetto.stato], periodo].filter(Boolean).join(' · ')}
        indietro={{ href: '/progetti', etichetta: 'Progetti' }}
      />
      <SchedeProgetto id={progetto.id} />
      {children}
    </div>
  )
}
