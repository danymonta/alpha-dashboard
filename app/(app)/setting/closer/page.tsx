import { ChevronDown, ClipboardCheck, Phone } from 'lucide-react'

import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { DaRegistrare, caricaCallDaRegistrare } from '@/app/(app)/setting/closer/da-registrare'
import { DalleRegistrazioni, leggiPer } from '@/app/(app)/setting/closer/dalle-registrazioni'
import { LinkBottone } from '@/components/link-bottone'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { EtichettaConNota } from '@/components/metriche/nota'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { FiltroSelect } from '@/components/pm/filtri'
import { LinkRiga } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato, type Formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { CLOSER } from '@/lib/i18n/testi/closer'
import type { VoceLegenda } from '@/lib/metriche/legenda'
import { legende } from '@/lib/metriche/legenda-en'
import { leggiPeriodo } from '@/lib/periodo'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Giornata = {
  call: number
  qualificate: number
  no_show: number
  follow_up: number
  cancellate: number
  chiuse: number
  cash: number
  revenue: number
}

type Colonna = { campo: keyof Giornata; etichetta: string; euro?: true }

// Dany's Excel, CLOSER half, in its order: counts first, then the money.
// Every column's full name and definition come from lib/metriche/legenda.
function colonne(lingua: Lingua): readonly Colonna[] {
  const c = CLOSER[lingua].colonne
  return [
    // "Svolte": the tile above says "Call svolte", the column is the same number
    { campo: 'call', etichetta: c.call },
    { campo: 'qualificate', etichetta: c.qualificate },
    { campo: 'no_show', etichetta: c.no_show },
    // "(esito call)": not the setter's follow up in DM (the legend's label)
    { campo: 'follow_up', etichetta: legende(lingua).closer.follow_up.etichetta },
    { campo: 'cancellate', etichetta: c.cancellate },
    { campo: 'chiuse', etichetta: c.chiuse },
    { campo: 'cash', etichetta: c.cash, euro: true },
    { campo: 'revenue', etichetta: c.revenue, euro: true },
  ]
}

/** Header tooltip on a desktop: full name and definition. */
function titolo(campo: keyof Giornata, lingua: Lingua): string {
  const voce = legende(lingua).closer[campo]
  return `${voce.etichetta}: ${voce.spiegazione}`
}

// the page's numbers in reading order: the tiles, then the rest of the table
function legendaPagina(lingua: Lingua): VoceLegenda[] {
  const LEGENDA_CLOSER = legende(lingua).closer
  return [
  LEGENDA_CLOSER.cash,
  LEGENDA_CLOSER.revenue,
  LEGENDA_CLOSER.call,
  LEGENDA_CLOSER.qualificate,
  LEGENDA_CLOSER.no_show,
  LEGENDA_CLOSER.show_rate,
  LEGENDA_CLOSER.close_rate,
  LEGENDA_CLOSER.chiuse,
  LEGENDA_CLOSER.follow_up,
  LEGENDA_CLOSER.cancellate,
  ]
}

function valore(r: Giornata, colonna: Colonna, f: Formato): string {
  return colonna.euro ? f.formatEuro(r[colonna.campo]) : f.formatNumero(r[colonna.campo])
}

function zero(r: Giornata, colonna: Colonna): boolean {
  return Number(r[colonna.campo]) === 0
}

/** A zero stays readable but steps back: the days with activity stand out. */
function classeZero(r: Giornata, colonna: Colonna): string | undefined {
  return zero(r, colonna) ? 'text-muted-foreground' : undefined
}

/* ---------- phone: one closed line per day, like the setter's "Giorno per giorno" ---------- */

/** The line of a closed day: how many calls were held and closed, and the cash. */
const riassunto = (colonne: readonly Colonna[]) =>
  colonne.filter((c) => c.campo === 'call' || c.campo === 'chiuse' || c.campo === 'cash')

const CHEVRON = 'size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180'
const SOMMARIO =
  'cursor-pointer list-none rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden'
/** Day, held, closed, cash, chevron: shared by the header and every line. */
const GRIGLIA = 'grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_1rem] items-center gap-x-2'

/** Every column of a day as label and value, two by two; a day leaves out its zeros. */
function Dettaglio({ riga, senzaZeri = false, lingua }: { riga: Giornata; senzaZeri?: boolean; lingua: Lingua }) {
  const COLONNE = colonne(lingua)
  const LEGENDA_CLOSER = legende(lingua).closer
  const f = formato(lingua)
  const visibili = senzaZeri ? COLONNE.filter((c) => !zero(riga, c)) : COLONNE
  if (visibili.length === 0) return <p className="py-1 text-xs text-muted-foreground">{CLOSER[lingua].tuttoZero}</p>
  return (
    <dl className="grid grid-cols-2 gap-x-6">
      {visibili.map((c) => (
        <div key={c.campo} className="flex items-baseline justify-between gap-2 py-1">
          <dt className="text-xs text-muted-foreground">{LEGENDA_CLOSER[c.campo].etichetta}</dt>
          <dd className={cn('num text-right text-sm', classeZero(riga, c))}>{valore(riga, c, f)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** "Compila la giornata" of a day (today when none), for the closer shown. */
function hrefGiorno(data: string | null, closer: string | undefined): string {
  const parametri = new URLSearchParams()
  if (data) parametri.set('data', data)
  if (closer) parametri.set('closer', closer)
  const testo = parametri.toString()
  return testo ? `/setting/closer/giorno?${testo}` : '/setting/closer/giorno'
}

function GiornateTelefono({
  giorni,
  totale,
  closer,
  apriGiorno,
  lingua,
}: {
  giorni: (Giornata & { data: string })[]
  totale: Giornata
  closer: string | undefined
  /** Admin and closer open a day's page; the setter only reads the numbers. */
  apriGiorno: boolean
  lingua: Lingua
}) {
  const t = CLOSER[lingua]
  const f = formato(lingua)
  const RIASSUNTO = riassunto(colonne(lingua))
  const LEGENDA_CLOSER = legende(lingua).closer
  return (
    <div className="space-y-3 md:hidden" data-testid="giornate-closer-telefono">
      <details open className="group rounded-xl bg-card ring-1 ring-border" data-testid="giornata-totale">
        <summary className={cn(SOMMARIO, 'flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-semibold')}>
          {t.totalePeriodo}
          <ChevronDown className={CHEVRON} aria-hidden="true" />
        </summary>
        <div className="px-4 pt-1 pb-4">
          <Dettaglio riga={totale} lingua={lingua} />
        </div>
      </details>

      <div>
        {/* the header of the lines below: every line also says it to screen readers */}
        <div aria-hidden="true" className={cn(GRIGLIA, 'px-3 pb-1 text-[11px] text-muted-foreground')}>
          <span>{t.giorno}</span>
          {RIASSUNTO.map((c) => (
            <span key={c.campo} className="text-right">
              {c.etichetta}
            </span>
          ))}
        </div>
        <ul className="space-y-2" aria-label={t.giorniPeriodo}>
          {giorni.map((r) => {
            const giorno = f.formatData(r.data)
            return (
              <li key={r.data} aria-label={giorno} data-testid="giornata">
                <details className="group rounded-xl bg-card">
                  <summary className={cn(SOMMARIO, GRIGLIA, 'min-h-11 px-3 py-2')}>
                    <span className="num text-sm font-medium">{giorno}</span>
                    {RIASSUNTO.map((c) => (
                      <span key={c.campo} className={cn('num text-right text-sm whitespace-nowrap', classeZero(r, c))}>
                        <span className="sr-only">{LEGENDA_CLOSER[c.campo].etichetta}: </span>
                        {valore(r, c, f)}
                      </span>
                    ))}
                    <ChevronDown className={CHEVRON} aria-hidden="true" />
                  </summary>
                  <div className="space-y-2 px-4 pt-1 pb-4">
                    <Dettaglio riga={r} senzaZeri lingua={lingua} />
                    {apriGiorno ? (
                      <LinkBottone href={hrefGiorno(r.data, closer)} variant="outline" className="w-full">
                        {t.apriGiornata}
                      </LinkBottone>
                    ) : null}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default async function CloserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // the setter too, read only (Dany, 07/10/2026: "il setter può accedere alla tab
  // closer", every setter's calls and the money too, as aggregate numbers by day)
  const profilo = await requireRuolo(['admin', 'closer', 'setter'])
  const ruolo = profilo.ruolo === 'admin' ? 'admin' : profilo.ruolo === 'setter' ? 'setter' : 'closer'
  const admin = ruolo === 'admin'
  const setter = ruolo === 'setter'
  const oggi = oggiRoma()
  const parametri = await searchParams
  const lingua = await getLingua()
  const t = CLOSER[lingua]
  // the page's description, from the side of who reads it (the admin on another closer: no calls to record on top)
  const DESCRIZIONE = t.descrizione
  const { formatData, formatEuro, formatNumero, formatPercentuale } = formato(lingua)
  const f = formato(lingua)
  const COLONNE = colonne(lingua)
  const LEGENDA_CLOSER = legende(lingua).closer
  const periodo = leggiPeriodo(parametri, oggi, lingua)
  const supabase = await createClient()

  // who closes: the closers, and the admin who closes too (Dany, 28/09/2026);
  // the setter picks among them like the admin (the team's directory is readable)
  let closers: { id: string; nome: string }[] = []
  if (admin || setter) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('attivo', true)
      .in('ruolo', ['closer', 'admin'])
      .order('nome')
    if (error) throw new Error(t.errore)
    closers = data
  }
  const richiesto = Array.isArray(parametri.closer) ? parametri.closer[0] : parametri.closer
  const closer = isUuid(richiesto) && closers.some((c) => c.id === richiesto) ? richiesto : undefined

  // whoever records outcomes gets his own calls to record on top: the closer
  // always, the admin on his own day or on every closer's, never on another's
  const registraEsiti = ruolo === 'closer' || (admin && (closer === undefined || closer === profilo.id))

  // a closer always gets his own days, whatever is passed (giornate_closer)
  const [giornate, esiti] = await Promise.all([
    supabase.rpc('giornate_closer', {
      p_da: periodo.da,
      p_a: periodo.a,
      ...(closer ? { p_closer: closer } : {}),
    }),
    registraEsiti ? caricaCallDaRegistrare(profilo.id) : Promise.resolve(null),
  ])
  if (giornate.error) throw new Error(t.erroreGiornate)

  const righe = giornate.data ?? []
  const totale = righe.find((r) => r.data === null)
  const giorni = righe.filter((r) => r.data !== null)
  // a sale closed from the calls on top comes back here, on the same period and closer
  const qui = `/setting/closer?${new URLSearchParams({ ...periodo.parametri, ...(closer ? { closer } : {}) }).toString()}`

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={ruolo === 'closer' ? t.titoloCloser : t.titolo}
        descrizione={DESCRIZIONE[admin && !registraEsiti ? 'adminAltroCloser' : ruolo]}
        azione={
          // the day is filled from its calls: one outcome per call, no counters.
          // The setter reads the numbers: the day's page stays the closer's and the admin's
          setter ? undefined : (
            <LinkBottone href={hrefGiorno(null, closer)} data-testid="compila-giornata">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {t.compila}
            </LinkBottone>
          )
        }
      />

      {esiti ? (
        <DaRegistrare
          {...esiti}
          admin={admin}
          closers={admin ? closers : []}
          hrefGiornata={hrefGiorno(null, undefined)}
          tornaA={qui}
          lingua={lingua}
        />
      ) : null}

      {/* 390px: the closer filter gets its own full-width row, never a truncated name */}
      <div className="grid gap-2 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/setting/closer" parametri={{ closer }} />
        {closers.length > 1 ? (
          <FiltroSelect
            id="filtro-closer"
            etichetta={t.filtro}
            nome="closer"
            valore={closer ?? ''}
            predefinito=""
            opzioni={[
              { valore: '', etichetta: t.tutti },
              ...closers.map((c) => ({ valore: c.id, etichetta: c.nome })),
            ]}
            parametri={{ ...periodo.parametri, closer }}
          />
        ) : null}
      </div>

      {giorni.length === 0 || !totale ? (
        <StatoVuoto
          Icona={Phone}
          titolo={t.vuoto}
          descrizione={setter ? t.vuotoSetter(periodo.frase) : t.vuotoAltri(periodo.frase)}
          azione={
            setter ? (
              <LinkBottone href="/my-numbers" variant="outline">
                {t.vaiMieiNumeri}
              </LinkBottone>
            ) : (
              <LinkBottone href={hrefGiorno(null, closer)}>{t.compila}</LinkBottone>
            )
          }
        />
      ) : (
        <>
          <section aria-label={t.totali(periodo.frase)} className="space-y-3" data-testid="kpi-closer">
            <div className="grid gap-3 sm:grid-cols-2">
              <VetroLiquido raggio={12} sfocatura={12} piega={0.3} className="rounded-xl p-4 md:p-5">
                <p className="text-sm text-muted-foreground">
                  <EtichettaConNota voce={LEGENDA_CLOSER.cash} />
                </p>
                {/* the one gold number of the screen */}
                <p className="num glow-oro mt-1 text-4xl font-semibold tracking-tight text-gold md:text-5xl">
                  {formatEuro(totale.cash)}
                </p>
                {/* the closer's cash (20260929130000): first instalment of the new sales, on the sale day, refunds apart */}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.cashNota(periodo.frase)}
                </p>
              </VetroLiquido>
              <div className="rounded-xl bg-card p-4 md:p-5">
                <p className="text-sm text-muted-foreground">
                  <EtichettaConNota voce={LEGENDA_CLOSER.revenue} />
                </p>
                <p className="num mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {formatEuro(totale.revenue)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{t.revenueNota(periodo.frase)}</p>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-3 gap-y-4 rounded-xl bg-card p-4 md:grid-cols-6">
              {(
                [
                  [LEGENDA_CLOSER.call, formatNumero(totale.call)],
                  [LEGENDA_CLOSER.qualificate, formatNumero(totale.qualificate)],
                  [LEGENDA_CLOSER.no_show, formatNumero(totale.no_show)],
                  [LEGENDA_CLOSER.show_rate, formatPercentuale(totale.show_rate)],
                  [LEGENDA_CLOSER.close_rate, formatPercentuale(totale.close_rate)],
                  [LEGENDA_CLOSER.chiuse, formatNumero(totale.chiuse)],
                ] as const
              ).map(([voce, testo]) => (
                <div key={voce.etichetta} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    <EtichettaConNota voce={voce} />
                  </dt>
                  <dd className="num text-xl font-semibold md:text-2xl">{testo}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-2" aria-labelledby="giorno-per-giorno">
            <h2
              id="giorno-per-giorno"
              className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {t.giornoPerGiorno(giorni.length)}
            </h2>

            <GiornateTelefono giorni={giorni} totale={totale} closer={closer} apriGiorno={!setter} lingua={lingua} />

            <div className="hidden overflow-x-auto rounded-xl bg-card md:block">
              <table className="w-full text-sm" data-testid="giornate-closer">
                <caption className="sr-only">{t.caption(periodo.frase)}</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2.5 text-left font-normal">{t.giorno}</th>
                    {COLONNE.map((c) => (
                      <th key={c.campo} scope="col" title={titolo(c.campo, lingua)} className="px-3 py-2.5 text-right font-normal">
                        {c.etichetta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {giorni.map((r) => (
                    <tr key={r.data}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {setter ? (
                          <span className="num">{formatData(r.data)}</span>
                        ) : (
                          // one per day: prefetched only on intent
                          <LinkRiga
                            href={hrefGiorno(r.data, closer)}
                            aria-label={t.apriGiornataDi(formatData(r.data))}
                            className="num rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {formatData(r.data)}
                          </LinkRiga>
                        )}
                      </th>
                      {COLONNE.map((c) => (
                        <td key={c.campo} className={cn('num px-3 py-2 text-right', classeZero(r, c))}>
                          {valore(r, c, f)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <th scope="row" className="px-3 py-2.5 text-left">{t.totale}</th>
                    {COLONNE.map((c) => (
                      <td key={c.campo} className="num px-3 py-2.5 text-right">
                        {valore(totale, c, f)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="px-1 text-xs text-muted-foreground">
              {setter ? t.notaSetter : t.notaAltri}
            </p>
          </section>

          {/* 1.37.0: the recorded calls, for the admin and the closer; the setter reads the page without it */}
          {setter ? null : (
            <DalleRegistrazioni
              periodo={periodo}
              closer={closer}
              per={leggiPer(parametri.per)}
              admin={admin}
              proprie={ruolo === 'closer' || (admin && (closer === profilo.id))}
              parametri={{ ...periodo.parametri, closer }}
            />
          )}

          <LegendaSezione voci={legendaPagina(lingua)} />
        </>
      )}
    </div>
  )
}
