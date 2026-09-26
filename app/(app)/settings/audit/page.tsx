import { History } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ETICHETTA_TABELLA, differenze } from '@/lib/audit'
import { requireRuolo } from '@/lib/auth/session'
import { formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const AZIONE = { insert: 'creazione', update: 'modifica', delete: 'eliminazione' } as const

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tabella?: string }> }) {
  await requireRuolo(['admin'])
  const { tabella } = await searchParams
  const filtro = tabella && tabella in ETICHETTA_TABELLA ? tabella : null
  const supabase = await createClient()

  let query = supabase
    .from('audit_log')
    .select('id, tabella, record_id, azione, dati_prima, dati_dopo, created_at, utente:profiles!audit_log_utente_id_fkey(nome)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filtro) query = query.eq('tabella', filtro)

  const { data: voci, error } = await query
  if (error) throw new Error('Impossibile caricare il registro')

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Registro modifiche"
        descrizione="Chi ha cambiato un importo, un ruolo o una regola, e quando. Le ultime 100 voci."
      />

      <nav aria-label="Filtra per tipo" className="flex flex-wrap gap-2">
        {[null, ...Object.keys(ETICHETTA_TABELLA)].map((t) => (
          <Link
            key={t ?? 'tutto'}
            href={t ? `/settings/audit?tabella=${t}` : '/settings/audit'}
            aria-current={t === filtro ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-lg border px-3 text-sm',
              t === filtro ? 'border-primary bg-primary/15 text-foreground' : 'border-input text-muted-foreground hover:bg-accent',
            )}
          >
            {t ? ETICHETTA_TABELLA[t] : 'Tutto'}
          </Link>
        ))}
      </nav>

      {voci.length === 0 ? (
        <StatoVuoto Icona={History} titolo="Nessuna modifica registrata" descrizione="Le modifiche a vendite, rate, costi, provvigioni e utenti compaiono qui." />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="registro">
          {voci.map((v) => {
            const cambi = differenze(v.dati_prima, v.dati_dopo)
            const giorno = oggiRoma(new Date(v.created_at))
            return (
              <li key={v.id} className="space-y-1.5 px-3 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{ETICHETTA_TABELLA[v.tabella] ?? v.tabella}</span>
                    <span className="text-muted-foreground"> · {AZIONE[v.azione]}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground">
                    {formatData(giorno)} {formatOra(v.created_at)} · {v.utente?.nome ?? 'sistema'}
                  </span>
                </p>
                {cambi.length > 0 ? (
                  <ul className="space-y-0.5 text-sm">
                    {cambi.map((c) => (
                      <li key={c.campo} className="text-muted-foreground">
                        {c.campo}:{' '}
                        {v.azione === 'update' ? (
                          <>
                            <span className="num line-through decoration-muted-foreground/60">{c.prima}</span>
                            {' → '}
                            <span className="num text-foreground">{c.dopo}</span>
                          </>
                        ) : (
                          <span className="num text-foreground">{v.azione === 'delete' ? c.prima : c.dopo}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
