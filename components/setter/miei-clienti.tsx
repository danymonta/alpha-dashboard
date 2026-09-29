import { ChevronDown, TriangleAlert, Users } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { MostraTutte } from '@/components/setter/mostra-tutte'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData, formatEuro } from '@/lib/format'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

type RigaSql = Database['public']['Functions']['mie_vendite_setter']['Returns'][number]
/** Commissions are null until something matures (or when none is due): the generated type does not say so. */
type Riga = Omit<RigaSql, 'provvigione' | 'provvigione_vendita'> & {
  provvigione: number | null
  provvigione_vendita: number | null
}

/** Why no commission is due on a sale: the setter's rule does not cover its type. */
const MOTIVO_NON_PREVISTA: Record<Riga['tipo'], string> = {
  nuovo: 'nessuna regola',
  rinnovo: '(rinnovo)',
  upsell: '(upsell)',
}

/**
 * "A te" of a sale, in words: what matured, nothing yet (it comes as the
 * client pays), or none due at all. A bare dash meant both the last two.
 */
function aTe(v: Riga): { valore: string; nota: string | null; importo: boolean } {
  if (v.provvigione_vendita !== null) return { valore: formatEuro(v.provvigione_vendita), nota: null, importo: true }
  if (v.provvigione_prevista) return { valore: formatEuro(0), nota: 'matura quando paga', importo: true }
  return { valore: 'Non prevista', nota: MOTIVO_NON_PREVISTA[v.tipo], importo: false }
}

/** The same, for one instalment. */
function aTeRata(r: Riga): string {
  if (r.provvigione !== null) return `a te ${formatEuro(r.provvigione)}`
  const daPagare = r.stato === 'prevista' || r.stato === 'fallita'
  return r.provvigione_prevista && daPagare ? 'a te: matura quando paga' : 'a te: non prevista'
}

/** How an instalment stands, in words: the state never rides on colour alone. */
function statoRata(r: Riga): { testo: string; ritardo: boolean } {
  if (r.stato === 'incassata') return { testo: `pagata il ${formatData(r.incassato_il)}`, ritardo: false }
  if (r.stato === 'rimborsata') return { testo: `rimborsata il ${formatData(r.incassato_il)}`, ritardo: false }
  if (r.stato === 'fallita') return { testo: 'pagamento non andato a buon fine', ritardo: false }
  if (r.in_ritardo) return { testo: `in ritardo, scadeva il ${formatData(r.scadenza)}`, ritardo: true }
  return { testo: `scade il ${formatData(r.scadenza)}`, ritardo: false }
}

/** Sales shown before "Mostra tutte": the page stays short on the phone. */
const PRIME_VENDITE = 5

/**
 * "I tuoi clienti": the sales where this setter brought the client, what they
 * paid and what each cash-in gives him (mie_vendite_setter, filtered on the
 * caller). Every amount and total comes from SQL; here rows are only grouped
 * and ordered: sales with a late instalment first, then the newest.
 */
export function MieiClienti({ righe }: { righe: Riga[] }) {
  const perVendita = new Map<string, Riga[]>()
  for (const r of righe) perVendita.set(r.sale_id, [...(perVendita.get(r.sale_id) ?? []), r])
  const tutte = [...perVendita.values()]
  // every late one stays in view, the others fill up to PRIME_VENDITE
  const inRitardo = tutte.filter((rate) => rate[0].rate_in_ritardo > 0)
  const altre = tutte.filter((rate) => rate[0].rate_in_ritardo === 0)
  const ordinate = [...inRitardo, ...altre]
  const quante = Math.max(PRIME_VENDITE, inRitardo.length)
  const elementi = ordinate.map((rate) => <Vendita key={rate[0].sale_id} rate={rate} />)

  return (
    <section aria-labelledby="titolo-miei-clienti" className="space-y-3" data-testid="miei-clienti">
      <div>
        {/* the commissions card links here: clear of the phone's top bar */}
        <h2 id="titolo-miei-clienti" className="scroll-mt-24 text-sm font-medium">
          I tuoi clienti
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="nota-a-te">
          Le vendite dove sei il setter, di solito i clienti nuovi che hai portato tu: quanto vale il contratto, quanto hanno
          pagato e quanto ti matura. La provvigione matura quando il cliente paga, anche sulle rate dei mesi dopo, secondo la
          tua regola provvigionale. «Non prevista» vuol dire che la tua regola non copre quel tipo di vendita (per esempio un
          rinnovo): se ti sembra un errore, chiedi all’admin.
        </p>
      </div>

      {tutte.length === 0 ? (
        <StatoVuoto
          Icona={Users}
          titolo="Nessun cliente ancora"
          descrizione="Quando un lead che hai portato tu diventa cliente, qui vedi i suoi pagamenti e la tua provvigione."
          azione={<LinkBottone href="/calls/new">Fissa una call</LinkBottone>}
        />
      ) : (
        <MostraTutte
          className="space-y-3"
          primi={elementi.slice(0, quante)}
          altri={elementi.slice(quante)}
          totale={ordinate.length}
        />
      )}
    </section>
  )
}

/** One sale: revenue, what was paid, what it gives him, and its instalments. */
function Vendita({ rate }: { rate: Riga[] }) {
  const v = rate[0]
  const provvigione = aTe(v)
  return (
    <li aria-label={v.cliente} className="rounded-xl bg-card p-4" data-testid="vendita">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{v.cliente}</p>
          <p className="text-xs text-muted-foreground">
            {v.prodotto} · {ETICHETTA_TIPO_VENDITA[v.tipo]} · venduta il{' '}
            <span className="num">{formatData(v.data_vendita)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-sm font-semibold">{formatEuro(v.valore_contratto)}</p>
          <p className="text-xs text-muted-foreground">revenue</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Pagato</dt>
          <dd className="num text-sm font-medium">{formatEuro(v.incassato_vendita)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Rate pagate</dt>
          <dd className="num text-sm font-medium">
            {v.rate_incassate} di {v.numero_rate}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">A te</dt>
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
          {v.rate_in_ritardo === 1 ? '1 rata in ritardo' : `${v.rate_in_ritardo} rate in ritardo`}
        </p>
      ) : null}

      <details className="group mt-1 -mb-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          Le rate
        </summary>
        <ul className="divide-y divide-border">
          {rate.map((r, i) => {
            const stato = statoRata(r)
            return (
              // a refund repeats the number of the instalment it gives back
              <li key={`${r.numero_rata}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">Rata {r.numero_rata}</span>
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
                  <span className="num block">{formatEuro(r.importo_incassato ?? r.importo_previsto)}</span>
                  <span className="num block text-xs text-muted-foreground">{aTeRata(r)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </details>
    </li>
  )
}
