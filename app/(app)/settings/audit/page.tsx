import { ChevronRight, History } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import {
  ETICHETTA_TABELLA,
  collegamentoVoce,
  etichettaTabella,
  differenze,
  raggruppaVoci,
  sintesi,
  titoloVoce,
  venditaDellaVoce,
} from '@/lib/audit'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tabella?: string }> }) {
  await requireRuolo(['admin'])
  const { tabella } = await searchParams
  const lingua = await getLingua()
  const T = IMPOSTAZIONI[lingua]
  const t = T.registro
  const { formatData } = formato(lingua)
  const filtro = tabella && tabella in ETICHETTA_TABELLA ? tabella : null
  const supabase = await createClient()

  let query = supabase
    .from('audit_log')
    .select('id, tabella, record_id, azione, dati_prima, dati_dopo, created_at, utente:profiles!audit_log_utente_id_fkey(nome)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filtro) query = query.eq('tabella', filtro)

  const { data: voci, error } = await query
  if (error) throw new Error(t.errore)

  // who the sale was for: the audit row only has ids. A deleted sale has no name.
  const idVendite = [...new Set(voci.map(venditaDellaVoce).filter((id): id is string => id !== null))]
  const { data: vendite, error: erroreVendite } = idVendite.length
    ? await supabase.from('sales').select('id, cliente:clients(nome, cognome)').in('id', idVendite)
    : { data: [], error: null }
  if (erroreVendite) throw new Error(t.errore)
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
        titolo={T.sezioni.audit[0]}
        descrizione={t.descrizione}
        indietro={{ href: '/settings', etichetta: T.titolo }}
      />

      <nav aria-label={t.filtra} className="flex flex-wrap gap-2">
        {[null, ...Object.keys(ETICHETTA_TABELLA)].map((tab) => (
          <Link
            key={tab ?? 'tutto'}
            href={tab ? `/settings/audit?tabella=${tab}` : '/settings/audit'}
            aria-current={tab === filtro ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-pillola border px-3 text-sm',
              tab === filtro
                ? 'border-selezione bg-selezione text-selezione-foreground'
                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {tab ? etichettaTabella(tab, lingua) : t.tutto}
          </Link>
        ))}
      </nav>

      {voci.length === 0 ? (
        <StatoVuoto
          Icona={History}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
        />
      ) : (
        <div className="space-y-5" data-testid="registro">
          {perGiorno.map(({ giorno, gruppi }) => (
            <section key={giorno} aria-labelledby={`giorno-${giorno}`} className="space-y-2">
              <h2 id={`giorno-${giorno}`} className="num px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {giorno === oggi ? t.oggi(formatData(giorno)) : giorno === ieri ? t.ieri(formatData(giorno)) : formatData(giorno)}
              </h2>
              <ul className="divide-y divide-border rounded-xl bg-card">
                {gruppi.map((gruppo) => {
                  const v = gruppo[0]
                  const piano = gruppo.length > 1
                  const dati = v.azione === 'delete' ? v.dati_prima : v.dati_dopo
                  const vendita = venditaDellaVoce(v)
                  const cliente = vendita ? clienteDi.get(vendita) : null
                  // a sale deleted later has nothing left to open
                  const link = vendita && !clienteDi.has(vendita) ? null : collegamentoVoce(v, lingua)
                  const cambi = differenze(v.dati_prima, v.dati_dopo, lingua)
                  const riassunto = sintesi(v.tabella, dati, lingua)
                  const titolo = piano
                    ? t.piano(v.azione === 'insert', gruppo.length)
                    : titoloVoce(v.tabella, v.azione, lingua)

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
                            aria-label={cliente ? t.apriDi(link.etichetta, cliente) : link.etichetta}
                            className="-my-3 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            {t.apri}
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
                        {formatOra(v.created_at)} · {v.utente?.nome ?? t.sistema}
                      </p>

                      {v.azione !== 'update' && (piano || cambi.length > 0) ? (
                        <details className="group text-sm">
                          <summary className="-mb-2 inline-flex min-h-11 cursor-pointer items-center gap-1 text-muted-foreground select-none hover:text-foreground">
                            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                            {piano ? t.leRate : t.tuttiCampi}
                          </summary>
                          <ul className="space-y-0.5 pt-2 pb-1 pl-5">
                            {piano
                              ? gruppo.map((r) => (
                                  <li key={r.id} className="num text-muted-foreground">
                                    {sintesi(r.tabella, r.azione === 'delete' ? r.dati_prima : r.dati_dopo, lingua)}
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
