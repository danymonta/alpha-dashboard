import { CalendarClock, History, RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { BottoneWhatsApp } from '@/components/pagamento/whatsapp'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, fineMese, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData, formatEuro, formatMese, formatPercentuale } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { linkWhatsApp, messaggioRinnovo } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const FINESTRE = [30, 60] as const

type Cliente = {
  client_id: string | null
  nome: string | null
  cognome: string | null
  data_fine_ultima: string | null
  valore_firmato: number | null
}

function giorniTra(da: string, a: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000)
}

/**
 * "Rinnovi": who ends soon and who ended not long ago, each with "Registra
 * rinnovo" and a WhatsApp message ready. The renewal rate of the month comes
 * from metriche_periodo (CLAUDE.md section 9).
 */
export default async function RinnoviPage({ searchParams }: { searchParams: Promise<{ entro?: string }> }) {
  await requireRuolo(['admin'])
  const { entro } = await searchParams
  const giorni = FINESTRE.includes(Number(entro) as (typeof FINESTRE)[number]) ? Number(entro) : 30
  const oggi = oggiRoma()
  const primo = primoDelMeseISO(oggi)
  const supabase = await createClient()

  const [inScadenza, scaduti, metriche] = await Promise.all([
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima, valore_firmato')
      .in('stato', ['attivo', 'in_scadenza'])
      .gte('data_fine_ultima', oggi)
      .lte('data_fine_ultima', aggiungiGiorni(oggi, giorni))
      .order('data_fine_ultima'),
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima, valore_firmato')
      .eq('stato', 'scaduto')
      .order('data_fine_ultima', { ascending: false }),
    supabase.rpc('metriche_periodo', { p_da: primo, p_a: fineMese(primo) }).single(),
  ])
  if (inScadenza.error || scaduti.error || metriche.error) throw new Error('Impossibile caricare i rinnovi')

  const ids = [...inScadenza.data, ...scaduti.data].map((c) => c.client_id).filter((id): id is string => Boolean(id))
  const { data: contatti } = ids.length
    ? await supabase.from('clients').select('id, telefono').in('id', ids)
    : { data: [] as { id: string; telefono: string | null }[] }
  const telefono = new Map((contatti ?? []).map((c) => [c.id, c.telefono]))
  const m = metriche.data

  const riga = (c: Cliente, scaduto: boolean) => {
    const nome = [c.nome, c.cognome].filter(Boolean).join(' ')
    const mancano = c.data_fine_ultima ? giorniTra(oggi, c.data_fine_ultima) : null
    return (
      <li key={c.client_id} aria-label={nome} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-48">
          <Link href={`/clients/${c.client_id}`} className="block truncate text-sm font-medium hover:underline">
            {nome}
          </Link>
          <p className={cn('flex items-center gap-1 text-xs', scaduto ? 'text-status-warning' : 'text-muted-foreground')}>
            {scaduto ? <History className="size-3.5" aria-hidden="true" /> : <CalendarClock className="size-3.5" aria-hidden="true" />}
            <span className="num">
              {scaduto
                ? `finito il ${formatData(c.data_fine_ultima)}, ${-(mancano ?? 0)} giorni fa`
                : mancano === 0
                  ? 'finisce oggi'
                  : `finisce il ${formatData(c.data_fine_ultima)}, tra ${mancano} ${mancano === 1 ? 'giorno' : 'giorni'}`}
            </span>
          </p>
        </div>
        <span className="num text-sm text-muted-foreground" title="Valore firmato in totale">
          {formatEuro(c.valore_firmato, { compatto: true })}
        </span>
        <div className="flex items-center gap-2">
          <BottoneWhatsApp
            compatto
            etichetta={`Scrivi a ${nome} su WhatsApp per il rinnovo`}
            href={linkWhatsApp(
              c.client_id ? telefono.get(c.client_id) : null,
              messaggioRinnovo({ nome, data_fine: c.data_fine_ultima!, oggi }),
            )}
          />
          <LinkBottone href={`/sales/new?cliente=${c.client_id}&tipo=rinnovo`} variant="outline">
            <RefreshCw className="size-4" aria-hidden="true" />
            Registra rinnovo
          </LinkBottone>
        </div>
      </li>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo="Rinnovi"
        descrizione="Chi finisce il percorso a breve e chi l’ha finito da poco: scrivigli e registra il rinnovo con un tocco."
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-card p-4 sm:grid-cols-3" data-testid="tasso-rinnovo">
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Tasso di rinnovo di {formatMese(primo)}</dt>
          <dd className="num text-2xl font-semibold text-gold">{formatPercentuale(m.tasso_rinnovo)}</dd>
          <dd className="num text-xs text-muted-foreground">
            {m.rinnovati} rinnovati su {m.in_scadenza} in scadenza nel mese
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">In scadenza entro {giorni} giorni</dt>
          <dd className="num text-2xl font-semibold">{inScadenza.data.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Da recuperare</dt>
          <dd className="num text-2xl font-semibold">{scaduti.data.length}</dd>
          <dd className="text-xs text-muted-foreground">finiti da meno di 90 giorni</dd>
        </div>
      </dl>

      <section aria-labelledby="titolo-scadenza" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-scadenza" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            In scadenza
          </h2>
          <nav aria-label="Finestra" className="flex gap-2">
            {FINESTRE.map((f) => (
              <Link
                key={f}
                href={f === 30 ? '/rinnovi' : `/rinnovi?entro=${f}`}
                aria-current={f === giorni ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-lg border px-3 text-sm',
                  f === giorni
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {f} giorni
              </Link>
            ))}
          </nav>
        </div>
        {inScadenza.data.length === 0 ? (
          <StatoVuoto
            Icona={CalendarClock}
            titolo={`Nessuno finisce nei prossimi ${giorni} giorni`}
            descrizione={giorni === 30 ? 'Guarda più avanti: passa a 60 giorni.' : 'Nessun percorso in chiusura a breve.'}
            azione={giorni === 30 ? <LinkBottone href="/rinnovi?entro=60" variant="outline">Vedi 60 giorni</LinkBottone> : undefined}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-in-scadenza">
            {inScadenza.data.map((c) => riga(c, false))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titolo-recuperare" className="space-y-2">
        <h2 id="titolo-recuperare" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Da recuperare
        </h2>
        {scaduti.data.length === 0 ? (
          <p className="rounded-xl bg-card px-3 py-4 text-sm text-muted-foreground">
            Nessun cliente scaduto negli ultimi 90 giorni senza rinnovo.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-da-recuperare">
            {scaduti.data.map((c) => riga(c, true))}
          </ul>
        )}
      </section>
    </div>
  )
}
