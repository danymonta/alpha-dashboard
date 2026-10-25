import { TriangleAlert, Wallet } from 'lucide-react'
import Link from 'next/link'

import { RataAzioni } from '@/app/(app)/sales/[id]/rata-azioni'
import { StrisciaScorrevole } from '@/components/pagina/striscia-scorrevole'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { BottoneWhatsApp } from '@/components/pagamento/whatsapp'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { INCASSI } from '@/lib/i18n/testi/incassi'
import type { TipoVendita } from '@/lib/validation/vendita'
import { linkWhatsApp, messaggioRata } from '@/lib/whatsapp'
import { hrefPeriodo, leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const VISTE = {
  ritardo: true,
  prossime: true,
  previste: true,
  incassate: true,
} as const
type Vista = keyof typeof VISTE

export default async function IncassiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const parametri = await searchParams
  const richiesta = Array.isArray(parametri.vista) ? parametri.vista[0] : parametri.vista
  const vista: Vista = richiesta && richiesta in VISTE ? (richiesta as Vista) : 'ritardo'
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const t = INCASSI[lingua]
  const { formatData, formatEuro, formatMese } = formato(lingua)
  /**
   * What kind of sale an instalment belongs to: the row says it before the number.
   * Same words as the client's history: the first path, whenever it was signed.
   */
  const TIPO_RATA: Record<TipoVendita, string> = t.tipoRata
  // only the "incassate" view is bound to a period
  const periodo = leggiPeriodo(parametri, oggi, lingua)
  const etichettaVista = (v: Vista) =>
    v === 'incassate' ? (periodo.mese ? t.viste.incassate : t.incassatePeriodo) : t.viste[v]
  const tra30 = aggiungiGiorni(oggi, 30)
  const supabase = await createClient()

  const base = () =>
    supabase
      .from('v_rate')
      .select(
        // the sale's type and its number of instalments: "Rinnovo · Rata 2 di 6"
        'payment_id, sale_id, client_id, cliente, tipo, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, metodo, stato, giorni_ritardo, vendita:sales(numero_rate)',
        { count: 'exact' },
      )

  const filtra = (q: ReturnType<typeof base>, v: Vista) => {
    if (v === 'ritardo') return q.eq('in_ritardo', true).order('scadenza')
    if (v === 'prossime') return q.eq('stato', 'prevista').gte('scadenza', oggi).lte('scadenza', tra30).order('scadenza')
    if (v === 'previste') return q.eq('stato', 'prevista').order('scadenza')
    return q.in('stato', ['incassata', 'rimborsata']).gte('incassato_il', periodo.da).lte('incassato_il', periodo.a).order('incassato_il', { ascending: false })
  }

  const [righe, fasce, previsione, ...conteggi] = await Promise.all([
    filtra(base(), vista).limit(300),
    supabase.rpc('da_incassare'),
    supabase.rpc('previsione_cassa', { p_mesi: 3 }),
    ...(Object.keys(VISTE) as Vista[]).map((v) =>
      filtra(
        supabase.from('v_rate').select('payment_id', { count: 'exact', head: true }) as unknown as ReturnType<typeof base>,
        v,
      ),
    ),
  ])
  if (righe.error || fasce.error || previsione.error) throw new Error(t.errore)

  // the client's phone for the WhatsApp reminder (only on instalments still due)
  const idClienti = [...new Set(righe.data.filter((r) => r.stato === 'prevista').map((r) => r.client_id).filter(Boolean))]
  const { data: contatti } = idClienti.length
    ? await supabase.from('clients').select('id, telefono').in('id', idClienti as string[])
    : { data: [] as { id: string; telefono: string | null }[] }
  const telefono = new Map((contatti ?? []).map((c) => [c.id, c.telefono]))

  const perFascia = Object.fromEntries((fasce.data ?? []).map((f) => [f.fascia, f]))
  const nVista = Object.fromEntries((Object.keys(VISTE) as Vista[]).map((v, i) => [v, conteggi[i].count ?? 0]))

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={
          <>
            {t.descrizionePrima}
            {t.segna} {t.descrizioneDopo}{' '}
            <Link href="/sales" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              {t.vendite}
            </Link>
            .
          </>
        }
      />

      {/* phone: one card (the late amount is said once, at the top); desktop: two cards */}
      <div className="divide-y divide-border rounded-xl bg-card md:space-y-5 md:divide-y-0 md:rounded-none md:bg-transparent">
        <dl className="grid grid-cols-3 gap-3 p-4 md:rounded-xl md:bg-card" data-testid="riepilogo-da-incassare">
          <div>
            <dt className="flex items-center gap-1 text-xs text-status-warning">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              {t.inRitardo}
            </dt>
            <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.in_ritardo?.totale, { compatto: true })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.prossimi30}</dt>
            <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.prossimi_30?.totale, { compatto: true })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.oltre}</dt>
            <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.oltre?.totale, { compatto: true })}</dd>
          </div>
        </dl>

        <section aria-labelledby="titolo-previsione" className="p-4 md:rounded-xl md:bg-card" data-testid="previsione-cassa" data-tour="previsione-cassa">
          <h2 id="titolo-previsione" className="text-sm font-medium">
            {t.previsione}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {t.previsioneDescrizione}
          </p>
          <dl className="grid grid-cols-3 gap-3">
            {(previsione.data ?? []).map((m, i) => (
              <div key={m.mese}>
                <dt className="text-xs text-muted-foreground">{formatMese(m.mese)}</dt>
                <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(Number(m.previsto) + (i === 0 ? Number(m.incassato) : 0), { compatto: true })}</dd>
                {i === 0 ? (
                  <>
                    {/* one short line each: no ragged wrap in a 100px column */}
                    <dd className="num text-xs text-muted-foreground">
                      {formatEuro(m.incassato, { compatto: true })} <span className="max-md:hidden">{t.gia}</span>
                      {t.entrati}
                    </dd>
                    <dd className="num text-xs text-muted-foreground">{t.inArrivo(formatEuro(m.previsto, { compatto: true }))}</dd>
                  </>
                ) : (
                  <dd className="num text-xs text-muted-foreground">
                    {t.nRate(m.rate_previste)}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {previsione.data?.[0] && Number(previsione.data[0].in_ritardo) > 0 ? (
            // phone: the same amount is already at the top of this card
            <p className="mt-3 hidden items-center gap-1.5 text-xs text-status-warning md:flex">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              <span className="num">
                {t.inPiu(formatEuro(previsione.data[0].in_ritardo, { compatto: true }), previsione.data[0].rate_in_ritardo)}
              </span>
            </p>
          ) : null}
        </section>
      </div>

      {/* phone: one row that scrolls on its own, never the page, with the chosen view in sight */}
      <nav aria-label={t.vistePagina} className="max-md:-mx-4">
        <StrisciaScorrevole attivo={vista} className="flex gap-2 max-md:px-4 md:flex-wrap md:overflow-visible">
        {(Object.keys(VISTE) as Vista[]).map((v) => (
          <LinkRiga
            key={v}
            href={
              v === 'ritardo'
                ? '/payments'
                : v === 'incassate'
                  ? hrefPeriodo('/payments', periodo, { vista: v })
                  : `/payments?vista=${v}`
            }
            aria-current={v === vista ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pillola border px-3 text-sm whitespace-nowrap',
              v === vista
                ? 'border-selezione bg-selezione text-selezione-foreground'
                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {etichettaVista(v)}
            <span className="num text-xs opacity-80">{nVista[v]}</span>
          </LinkRiga>
        ))}
        </StrisciaScorrevole>
      </nav>

      {vista === 'incassate' ? (
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/payments" parametri={{ vista: 'incassate' }} />
      ) : null}

      {righe.data.length === 0 ? (
        <StatoVuoto
          Icona={Wallet}
          titolo={
            vista === 'ritardo'
              ? t.nessunRitardo
              : vista === 'incassate'
                ? t.nessunIncasso(periodo.frase)
                : t.nessunaVista
          }
          descrizione={vista === 'ritardo' ? t.inPari : t.cambiaVista}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-rate">
          {righe.data.map((r) => (
            <li
              key={r.payment_id}
              aria-label={t.rataDi(r.cliente ?? '', r.numero_rata)}
              className="px-3 py-2 md:flex md:items-center md:gap-3"
            >
              <div className="flex min-h-11 items-center gap-3 md:flex-1">
                <div className="min-w-0 flex-1">
                  <LinkRiga href={`/sales/${r.sale_id}`} className="flex items-center gap-1.5 text-sm font-medium hover:underline">
                    <span className="truncate">{r.cliente}</span>
                    <IndicatoreLink />
                  </LinkRiga>
                  {/* each part carries its dot; the row starts one dot to the left and the
                      wrapper clips it, so no line ever starts or ends with a lone "·" */}
                  <div className="overflow-hidden">
                    <p className="-ml-5 flex flex-wrap items-center text-xs text-muted-foreground *:before:inline-block *:before:w-5 *:before:text-center *:before:content-['·']">
                      {r.tipo ? <span>{TIPO_RATA[r.tipo]}</span> : null}
                      <span className="num">{t.rata(r.numero_rata, r.vendita?.numero_rate ?? null)}</span>
                      <span className="num">
                        {r.stato === 'prevista' || r.stato === 'fallita'
                          ? t.scadeIl(formatData(r.scadenza))
                          : t.incassataIl(formatData(r.incassato_il))}
                      </span>
                      {r.giorni_ritardo ? <span className="text-status-warning">{t.giorniRitardo(r.giorni_ritardo)}</span> : null}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-medium">{formatEuro(r.importo_incassato ?? r.importo_previsto)}</p>
                  <StatoRata stato={r.stato!} scadenza={r.scadenza!} oggi={oggi} className="text-xs" lingua={lingua} />
                </div>
              </div>
              {/* fixed width from md up: amounts line up whatever the actions */}
              <div className="flex items-center justify-end gap-2 md:w-64 md:shrink-0">
                {r.stato === 'prevista' ? (
                  <BottoneWhatsApp
                    compatto
                    etichetta={t.whatsappRata(r.cliente ?? '', r.numero_rata!)}
                    href={linkWhatsApp(
                      r.client_id ? telefono.get(r.client_id) : null,
                      messaggioRata({
                        nome: r.cliente,
                        numero_rata: r.numero_rata!,
                        importo: Number(r.importo_previsto),
                        scadenza: r.scadenza!,
                        oggi,
                      }),
                    )}
                  />
                ) : null}
                {r.stato !== 'rimborsata' ? (
                  <RataAzioni
                    rata={{
                      id: r.payment_id!,
                      numero_rata: r.numero_rata!,
                      scadenza: r.scadenza!,
                      importo_previsto: r.importo_previsto!,
                      stato: r.stato!,
                      importo_incassato: r.importo_incassato,
                      incassato_il: r.incassato_il,
                      metodo: r.metodo,
                    }}
                    admin
                    oggi={oggi}
                    // filled button only where it is urgent: the late view
                    principale={vista === 'ritardo'}
                    // phone: "Segna incassata" takes the rest of the row
                    className="max-md:flex-1"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
