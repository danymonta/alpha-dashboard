import { ChevronRight, History } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import {
  ETICHETTA_TABELLA,
  collegamentoVoce,
  differenze,
  raggruppaVoci,
  sintesi,
  titoloVoce,
  venditaDellaVoce,
} from '@/lib/audit'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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

  // who the sale was for: the audit row only has ids. A deleted sale has no name.
  const idVendite = [...new Set(voci.map(venditaDellaVoce).filter((id): id is string => id !== null))]
  const { data: vendite, error: erroreVendite } = idVendite.length
    ? await supabase.from('sales').select('id, cliente:clients(nome, cognome)').in('id', idVendite)
    : { data: [], error: null }
  if (erroreVendite) throw new Error('Impossibile caricare il registro')
  const clienteDi = new Map(
    vendite.map((s) => [s.id, s.cliente ? `${s.cliente.nome} ${s.cliente.cognome ?? ''}`.trim() : null]),
  )

  const oggi = oggiRoma()
  const ieri = aggiungiGiorni(oggi, -1)
  const perGiorno: { giorno: string; gruppi: (typeof voci)[number][][] }[] = []
  for (const gruppo of raggruppaVoci(voci)) {
    const giorno = oggiRoma(new Date(gruppo[0].created_at))
    const ultimo = perGiorno.at(-1)
    if (ultimo?.giorno === giorno) ultimo.gruppi.push(gruppo)
    else perGiorno.push({ giorno, gruppi: [gruppo] })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Registro modifiche"
        descrizione="Chi ha cambiato un importo, un ruolo o una regola, e quando. Le ultime 100 voci."
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
      />

      <nav aria-label="Filtra per tipo" className="flex flex-wrap gap-2">
        {[null, ...Object.keys(ETICHETTA_TABELLA)].map((t) => (
          <Link
            key={t ?? 'tutto'}
            href={t ? `/settings/audit?tabella=${t}` : '/settings/audit'}
            aria-current={t === filtro ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-lg border px-3 text-sm',
              t === filtro
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {t ? ETICHETTA_TABELLA[t] : 'Tutto'}
          </Link>
        ))}
      </nav>

      {voci.length === 0 ? (
        <StatoVuoto
          Icona={History}
          titolo="Nessuna modifica registrata"
          descrizione="Le modifiche a vendite, rate, costi, provvigioni e utenti compaiono qui."
        />
      ) : (
        <div className="space-y-5" data-testid="registro">
          {perGiorno.map(({ giorno, gruppi }) => (
            <section key={giorno} aria-labelledby={`giorno-${giorno}`} className="space-y-2">
              <h2 id={`giorno-${giorno}`} className="num px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {giorno === oggi ? `Oggi · ${formatData(giorno)}` : giorno === ieri ? `Ieri · ${formatData(giorno)}` : formatData(giorno)}
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {gruppi.map((gruppo) => {
                  const v = gruppo[0]
                  const piano = gruppo.length > 1
                  const dati = v.azione === 'delete' ? v.dati_prima : v.dati_dopo
                  const vendita = venditaDellaVoce(v)
                  const cliente = vendita ? clienteDi.get(vendita) : null
                  // a sale deleted later has nothing left to open
                  const link = vendita && !clienteDi.has(vendita) ? null : collegamentoVoce(v)
                  const cambi = differenze(v.dati_prima, v.dati_dopo)
                  const riassunto = sintesi(v.tabella, dati)
                  const titolo = piano
                    ? `Piano rate ${v.azione === 'insert' ? 'creato' : 'eliminato'} · ${gruppo.length} rate`
                    : titoloVoce(v.tabella, v.azione)

                  return (
                    <li key={v.id} className="space-y-1 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm">
                          <span className="font-medium">{titolo}</span>
                          {cliente ? <span className="text-muted-foreground"> · {cliente}</span> : null}
                        </p>
                        {link ? (
                          <Link
                            href={link.href}
                            aria-label={cliente ? `${link.etichetta} di ${cliente}` : link.etichetta}
                            className="-my-3 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            Apri
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>

                      {v.azione === 'update' ? (
                        <ul className="space-y-0.5 text-sm">
                          {riassunto ? <li className="num text-muted-foreground">{riassunto}</li> : null}
                          {cambi.map((c) => (
                            <li key={c.campo} className="text-muted-foreground">
                              {c.campo}:{' '}
                              <span className="num line-through decoration-muted-foreground/60">{c.prima}</span>
                              {' → '}
                              <span className="num text-foreground">{c.dopo}</span>
                            </li>
                          ))}
                        </ul>
                      ) : piano ? null : (
                        <p className="num text-sm text-foreground">{riassunto}</p>
                      )}

                      <p className="num text-xs text-muted-foreground">
                        {formatOra(v.created_at)} · {v.utente?.nome ?? 'sistema'}
                      </p>

                      {v.azione !== 'update' && (piano || cambi.length > 0) ? (
                        <details className="group text-sm">
                          <summary className="-mb-2 inline-flex min-h-11 cursor-pointer items-center gap-1 text-muted-foreground select-none hover:text-foreground">
                            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                            {piano ? 'Le rate' : 'Tutti i campi'}
                          </summary>
                          <ul className="space-y-0.5 pt-2 pb-1 pl-5">
                            {piano
                              ? gruppo.map((r) => (
                                  <li key={r.id} className="num text-muted-foreground">
                                    {sintesi(r.tabella, r.azione === 'delete' ? r.dati_prima : r.dati_dopo)}
                                  </li>
                                ))
                              : cambi.map((c) => (
                                  <li key={c.campo} className="text-muted-foreground">
                                    {c.campo}:{' '}
                                    <span className="num text-foreground">{v.azione === 'delete' ? c.prima : c.dopo}</span>
                                  </li>
                                ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
