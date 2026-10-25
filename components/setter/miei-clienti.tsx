import { ChevronDown, TriangleAlert, Users } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { MostraTutte } from '@/components/setter/mostra-tutte'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formato, type Formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { MIEI_NUMERI } from '@/lib/i18n/testi/miei-numeri'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type RigaSql = Database['public']['Functions']['mie_vendite_setter']['Returns'][number]
/** Commissions are null until something matures (or when none is due): the generated type does not say so. */
type Riga = Omit<RigaSql, 'provvigione' | 'provvigione_vendita'> & {
  provvigione: number | null
  provvigione_vendita: number | null
}

type Testi = (typeof MIEI_NUMERI)['it']['clienti']

/**
 * "A te" of a sale, in words: what matured, nothing yet (it comes as the
 * client pays), or none due at all. A bare dash meant both the last two.
 */
function aTe(v: Riga, t: Testi, f: Formato): { valore: string; nota: string | null; importo: boolean } {
  if (v.provvigione_vendita !== null) return { valore: f.formatEuro(v.provvigione_vendita), nota: null, importo: true }
  if (v.provvigione_prevista) return { valore: f.formatEuro(0), nota: t.maturaQuandoPaga, importo: true }
  // why no commission is due on a sale: the setter's rule does not cover its type
  return { valore: t.nonPrevista, nota: t.motivo[v.tipo], importo: false }
}

/** The same, for one instalment. */
function aTeRata(r: Riga, t: Testi, f: Formato): string {
  if (r.provvigione !== null) return t.aTeRata(f.formatEuro(r.provvigione))
  const daPagare = r.stato === 'prevista' || r.stato === 'fallita'
  return r.provvigione_prevista && daPagare ? t.aTeMatura : t.aTeNonPrevista
}

/** How an instalment stands, in words: the state never rides on colour alone. */
function statoRata(r: Riga, t: Testi, f: Formato): { testo: string; ritardo: boolean } {
  if (r.stato === 'incassata') return { testo: t.pagataIl(f.formatData(r.incassato_il)), ritardo: false }
  if (r.stato === 'rimborsata') return { testo: t.rimborsataIl(f.formatData(r.incassato_il)), ritardo: false }
  if (r.stato === 'fallita') return { testo: t.fallita, ritardo: false }
  if (r.in_ritardo) return { testo: t.inRitardo(f.formatData(r.scadenza)), ritardo: true }
  return { testo: t.scade(f.formatData(r.scadenza)), ritardo: false }
}

/** Sales shown before "Mostra tutte": the page stays short on the phone. */
const PRIME_VENDITE = 5

/**
 * "I tuoi clienti": the sales where this setter brought the client, what they
 * paid and what each cash-in gives him (mie_vendite_setter, filtered on the
 * caller). Every amount and total comes from SQL; here rows are only grouped
 * and ordered: sales with a late instalment first, then the newest.
 */
export function MieiClienti({ righe, lingua = 'it' }: { righe: Riga[]; lingua?: Lingua }) {
  const t = MIEI_NUMERI[lingua].clienti
  const f = formato(lingua)
  const tipi = ETICHETTE[lingua].tipoVendita
  const perVendita = new Map<string, Riga[]>()
  for (const r of righe) perVendita.set(r.sale_id, [...(perVendita.get(r.sale_id) ?? []), r])
  const tutte = [...perVendita.values()]
  // every late one stays in view, the others fill up to PRIME_VENDITE
  const inRitardo = tutte.filter((rate) => rate[0].rate_in_ritardo > 0)
  const altre = tutte.filter((rate) => rate[0].rate_in_ritardo === 0)
  const ordinate = [...inRitardo, ...altre]
  const quante = Math.max(PRIME_VENDITE, inRitardo.length)
  const elementi = ordinate.map((rate) => <Vendita key={rate[0].sale_id} rate={rate} t={t} f={f} tipi={tipi} />)

  return (
    <section aria-labelledby="titolo-miei-clienti" className="space-y-3" data-testid="miei-clienti">
      <div>
        {/* the commissions card links here: clear of the phone's top bar */}
        <h2 id="titolo-miei-clienti" className="scroll-mt-24 text-sm font-medium">
          {t.titolo}
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="nota-a-te">
          {t.nota}
        </p>
      </div>

      {tutte.length === 0 ? (
        <StatoVuoto
          Icona={Users}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
          azione={<LinkBottone href="/calls/new">{t.fissaCall}</LinkBottone>}
        />
      ) : (
        <MostraTutte
          className="space-y-3"
          primi={elementi.slice(0, quante)}
          altri={elementi.slice(quante)}
          totale={ordinate.length}
          lingua={lingua}
        />
      )}
    </section>
  )
}

/** One sale: revenue, what was paid, what it gives him, and its instalments. */
function Vendita({ rate, t, f, tipi }: { rate: Riga[]; t: Testi; f: Formato; tipi: Record<Riga['tipo'], string> }) {
  const v = rate[0]
  const provvigione = aTe(v, t, f)
  return (
    <li aria-label={v.cliente} className="rounded-xl bg-card p-4" data-testid="vendita">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{v.cliente}</p>
          <p className="text-xs text-muted-foreground">
            {v.prodotto} · {tipi[v.tipo]} · {t.vendutaIl}{' '}
            <span className="num">{f.formatData(v.data_vendita)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-sm font-semibold">{f.formatEuro(v.valore_contratto)}</p>
          <p className="text-xs text-muted-foreground">{t.revenue}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t.pagato}</dt>
          <dd className="num text-sm font-medium">{f.formatEuro(v.incassato_vendita)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.ratePagate}</dt>
          <dd className="num text-sm font-medium">{t.di(v.rate_incassate, v.numero_rate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.aTe}</dt>
          <dd data-testid="a-te">
            <span className={cn('block text-sm font-medium', provvigione.importo && 'num')}>
              {provvigione.valore}
            </span>
            {provvigione.nota ? (
              <span className="block text-xs text-muted-foreground">{provvigione.nota}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      {v.rate_in_ritardo > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-status-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t.rateInRitardo(v.rate_in_ritardo)}
        </p>
      ) : null}

      <details className="group mt-1 -mb-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          {t.leRate}
        </summary>
        <ul className="divide-y divide-border">
          {rate.map((r, i) => {
            const stato = statoRata(r, t, f)
            return (
              // a refund repeats the number of the instalment it gives back
              <li key={`${r.numero_rata}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">{t.rata(r.numero_rata)}</span>
                  <span
                    className={
                      stato.ritardo
                        ? 'num flex items-center gap-1 text-xs text-status-warning'
                        : 'num block text-xs text-muted-foreground'
                    }
                  >
                    {stato.ritardo ? <TriangleAlert className="size-3 shrink-0" aria-hidden="true" /> : null}
                    {stato.testo}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block">{f.formatEuro(r.importo_incassato ?? r.importo_previsto)}</span>
                  <span className="num block text-xs text-muted-foreground">{aTeRata(r, t, f)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </details>
    </li>
  )
}
