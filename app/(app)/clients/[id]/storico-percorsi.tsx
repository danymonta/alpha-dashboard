import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleStop,
  FileText,
  Flag,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { RataAzioni } from '@/app/(app)/sales/[id]/rata-azioni'
import { ContrattoVendita } from '@/components/cliente/contratto-vendita'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { fineDopoMesi } from '@/lib/date'
import { formato } from '@/lib/format'
import type { ConfigPicker } from '@/lib/google/picker'
import type { Lingua } from '@/lib/i18n/lingua'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type Enums = Database['public']['Enums']

export type RataPercorso = {
  id: string
  numero_rata: number
  scadenza: string
  importo_previsto: number
  stato: Enums['payment_status']
  incassato_il: string | null
  importo_incassato: number | null
  metodo: Enums['payment_method'] | null
}

/** One sale of the client seen as a period of the path: the old ones stay, that is the history. */
export type Percorso = {
  id: string
  tipo: Enums['sale_type']
  prodotto: string
  /** Catalogue duration: tells an early end ("Interrotto") from the natural one. */
  durata_mesi: number | null
  data_vendita: string
  data_inizio: string
  data_fine: string
  created_at: string
  valore_contratto: number
  /** The link to the signed contract on Drive (admin only, this history is the admin's). */
  contratto_url: string | null
  rate: RataPercorso[]
  /** Money from v_vendite (summed in SQL): only formatted here. */
  incassato: number | null
  da_incassare: number | null
  in_ritardo: number | null
  rate_incassate: number | null
  rate_totali: number | null
}

type StatoPercorso = 'da_iniziare' | 'in_corso' | 'concluso' | 'interrotto'

const ASPETTO: Record<StatoPercorso, { Icona: LucideIcon; tono: string }> = {
  da_iniziare: { Icona: CalendarClock, tono: 'text-muted-foreground' },
  in_corso: { Icona: CircleCheck, tono: 'text-status-ok' },
  concluso: { Icona: Flag, tono: 'text-muted-foreground' },
  interrotto: { Icona: CircleStop, tono: 'text-status-warning' },
}

/** Oldest first: the order in which the periods happened. */
function inOrdineDiTempo(a: Percorso, b: Percorso) {
  return (
    a.data_inizio.localeCompare(b.data_inizio) ||
    a.data_vendita.localeCompare(b.data_vendita) ||
    a.created_at.localeCompare(b.created_at)
  )
}

/**
 * State from the dates only. "Interrotto": a catalogue path that ended before
 * its duration ("Interrompi il percorso" moves data_fine back). A custom path
 * has no duration to compare with, so it can only be "Concluso".
 */
function statoPercorso(p: Percorso, oggi: string): StatoPercorso {
  if (p.data_inizio > oggi) return 'da_iniziare'
  if (p.data_fine >= oggi) return 'in_corso'
  const finePrevista = p.durata_mesi ? fineDopoMesi(p.data_inizio, p.durata_mesi) : null
  return finePrevista && p.data_fine < finePrevista ? 'interrotto' : 'concluso'
}

/** "Primo percorso", "Rinnovo 1", "Rinnovo 2", "Upsell": counted in time order. */
function etichettePercorsi(percorsi: Percorso[], lingua: Lingua): Map<string, string> {
  const t = CLIENTI[lingua]
  const conta: Record<Enums['sale_type'], number> = { nuovo: 0, rinnovo: 0, upsell: 0 }
  const upsell = percorsi.filter((p) => p.tipo === 'upsell').length
  const etichette = new Map<string, string>()
  for (const p of [...percorsi].sort(inOrdineDiTempo)) {
    const n = ++conta[p.tipo]
    etichette.set(
      p.id,
      p.tipo === 'rinnovo'
        ? t.rinnovoN(n)
        : p.tipo === 'upsell'
          ? upsell > 1
            ? t.upsellN(n)
            : t.upsell
          : n === 1
            ? t.primoPercorso
            : t.nuovoPercorso,
    )
  }
  return etichette
}

const daIncassare = (r: RataPercorso) => r.stato === 'prevista' || r.stato === 'fallita'

function BadgeStato({ stato, lingua }: { stato: StatoPercorso; lingua: Lingua }) {
  const { Icona, tono } = ASPETTO[stato]
  const etichetta = CLIENTI[lingua].statoPercorso[stato]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-sm', tono)} data-testid="stato-percorso">
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {etichetta}
    </span>
  )
}

function Cifra({ etichetta, valore, lingua }: { etichetta: string; valore: number | null; lingua: Lingua }) {
  const { formatEuro } = formato(lingua)
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="num text-sm font-medium">{formatEuro(valore)}</dd>
    </div>
  )
}

function CardPercorso({
  percorso: p,
  etichetta,
  oggi,
  principale,
  cliente,
  picker,
  solaLettura,
  lingua,
}: {
  percorso: Percorso
  etichetta: string
  oggi: string
  principale: string | undefined
  cliente: string
  picker: ConfigPicker | null
  solaLettura: boolean
  lingua: Lingua
}) {
  const t = CLIENTI[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const stato = statoPercorso(p, oggi)
  // the current path, or one with something still to collect, opens on its instalments;
  // a finished and paid one stays folded
  const aperto = stato === 'in_corso' || stato === 'da_iniziare' || p.rate.some(daIncassare)

  return (
    <li aria-label={etichetta} data-testid="percorso" className="overflow-hidden rounded-xl bg-card">
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold">{etichetta}</h3>
            <p className="truncate text-sm text-muted-foreground">{p.prodotto}</p>
            <p className="num text-xs text-muted-foreground" data-testid="periodo">
              {t.dalAl(formatData(p.data_inizio), formatData(p.data_fine))}
            </p>
          </div>
          <BadgeStato stato={stato} lingua={lingua} />
        </div>

        <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3">
          <Cifra etichetta={t.contratto} valore={p.valore_contratto} lingua={lingua} />
          <Cifra etichetta={t.incassatoCifra} valore={p.incassato} lingua={lingua} />
          <Cifra etichetta={t.daIncassare} valore={p.da_incassare} lingua={lingua} />
        </dl>

        {Number(p.in_ritardo) > 0 ? (
          <p className="flex items-center gap-2 text-sm text-status-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span className="num">{t.inRitardoImporto(formatEuro(p.in_ritardo))}</span>
          </p>
        ) : null}
      </div>

      {/* each path and each renewal has its own contract (21/10/2026) */}
      <div className="flex min-h-11 items-center justify-between gap-2 border-t border-border pr-1.5 pl-3">
        <span className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t.contrattoDrive}
        </span>
        <ContrattoVendita
          saleId={p.id}
          cliente={cliente}
          percorso={etichetta}
          url={p.contratto_url}
          picker={picker}
          variante="cella"
          solaLettura={solaLettura}
        />
      </div>

      {p.rate.length > 0 ? (
        <details open={aperto} className="group border-t border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
            <span>
              {t.rate}{' '}
              <span className="num text-muted-foreground">{t.incassate(p.rate_incassate ?? 0, p.rate_totali ?? 0)}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {p.rate.map((rata) => (
              <li
                key={rata.id}
                aria-label={t.rataEtichetta(etichetta, rata.numero_rata, rata.stato === 'rimborsata')}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 md:flex-nowrap"
              >
                <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                  <span className="num w-8 shrink-0 text-sm text-muted-foreground">{rata.numero_rata}ª</span>
                  <div className="min-w-0 flex-1">
                    <p className="num text-sm">{formatData(daIncassare(rata) ? rata.scadenza : rata.incassato_il)}</p>
                    <StatoRata stato={rata.stato} scadenza={rata.scadenza} oggi={oggi} className="text-xs" lingua={lingua} />
                  </div>
                  <span className="num text-right text-sm font-medium">
                    {formatEuro(rata.importo_incassato ?? rata.importo_previsto)}
                  </span>
                </div>
                {/* phone: "Segna incassata" gets its own full row, a paid one keeps its menu inline;
                    fixed width from md up, so amounts line up whatever the actions */}
                <div className={cn('md:w-52 md:shrink-0', daIncassare(rata) ? 'basis-full md:basis-auto' : 'shrink-0')}>
                  {rata.stato !== 'rimborsata' && !solaLettura ? (
                    <RataAzioni rata={rata} admin oggi={oggi} principale={rata.id === principale} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Link
        href={`/sales/${p.id}`}
        className="flex min-h-11 items-center justify-between gap-2 border-t border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span>
          {solaLettura ? t.apriVendita : t.apriVenditaModifica}
          <span className="sr-only"> ({etichetta})</span>
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  )
}

/**
 * "Storico percorsi": one card per sale, newest on top. A renewal is a new
 * sale, so the previous period keeps its dates, contract and instalments below
 * it. Unpaid instalments are cashed here with the same one tap as the sale page.
 */
export function StoricoPercorsi({
  percorsi,
  oggi,
  cliente,
  picker = null,
  solaLettura = false,
  lingua = 'it',
}: {
  percorsi: Percorso[]
  oggi: string
  /** The client's name: the contract's sheet and buttons say whose it is. */
  cliente: string
  picker?: ConfigPicker | null
  /** The business coach (22/10/2026): instalments and contracts to read, nothing to tap. */
  solaLettura?: boolean
  lingua?: Lingua
}) {
  const etichette = etichettePercorsi(percorsi, lingua)
  const dalPiuRecente = [...percorsi].sort((a, b) => inOrdineDiTempo(b, a))
  // filled button only on the instalment due first across the whole history
  const principale = percorsi
    .flatMap((p) => p.rate.filter(daIncassare))
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza))[0]?.id

  return (
    <ol className="space-y-3" data-testid="storico-percorsi">
      {dalPiuRecente.map((p) => (
        <CardPercorso
          key={p.id}
          percorso={p}
          etichetta={etichette.get(p.id) ?? CLIENTI[lingua].percorsoGenerico}
          oggi={oggi}
          principale={principale}
          cliente={cliente}
          picker={picker}
          solaLettura={solaLettura}
          lingua={lingua}
        />
      ))}
    </ol>
  )
}
