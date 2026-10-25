import { CalendarDays, ChevronDown } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formato, type Formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIEI_NUMERI } from '@/lib/i18n/testi/miei-numeri'
import { LEGENDA_SETTING, type VoceLegenda } from '@/lib/metriche/legenda'
import { legende } from '@/lib/metriche/legenda-en'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type RigaSql = Database['public']['Functions']['giornate_setter']['Returns'][number]
/** The total row has data = null (grouping sets): the generated type does not say so. */
type Riga = Omit<RigaSql, 'data'> & { data: string | null }

type Colonna = {
  campo: Exclude<keyof RigaSql, 'data'>
  /** short header of the desktop table, like the Excel: never repeated within a table */
  breve: string
  /** the legend entry: label of the mobile card and header title, and definition */
  voce: VoceLegenda
  euro?: boolean
  /** DM totali: the sum of the three before it, a little stronger */
  forte?: boolean
}

type Brevi = (typeof MIEI_NUMERI)['it']['giornate']['brevi']

/** The columns of the two sources, in the page's language (the Italian ones are those of always). */
function colonne(lingua: Lingua) {
  const { setting: S, closer: C, setter: M } = legende(lingua)
  const b: Brevi = MIEI_NUMERI[lingua].giornate.brevi
  // Source 1, the setter's daily report (what he writes in "Oggi"). The calls he
  // books are discovery calls; strategy_prenotate is history (colonneReport).
  const report: Colonna[] = [
    { campo: 'dm_outbound', breve: b.dm_outbound, voce: S.dm_outbound },
    { campo: 'dm_inbound', breve: b.dm_inbound, voce: S.dm_inbound },
    { campo: 'follow_up', breve: b.follow_up, voce: S.follow_up },
    { campo: 'dm_totali', breve: b.dm_totali, voce: S.dm_totali, forte: true },
    { campo: 'conversazioni', breve: b.conversazioni, voce: S.conversazioni },
    { campo: 'call_proposte', breve: b.call_proposte, voce: S.call_proposte },
    { campo: 'discovery_prenotate', breve: b.discovery_prenotate, voce: S.discovery_prenotate },
  ]
  // Source 2, the calls he booked as the app recorded them: bookings by booking
  // day, the closer's results by call day, cash and revenue only of his clients.
  // Names shared with the report say "(closer)" (LEGENDA_SETTER).
  const call: Colonna[] = [
    { campo: 'prenotate_inbound', breve: b.prenotate_inbound, voce: S.prenotate_inbound },
    { campo: 'prenotate_outbound', breve: b.prenotate_outbound, voce: S.prenotate_outbound },
    { campo: 'closer_call', breve: b.closer_call, voce: C.call },
    { campo: 'closer_qualificate', breve: b.closer_qualificate, voce: M.closer_qualificate },
    { campo: 'closer_no_show', breve: b.closer_no_show, voce: C.no_show },
    { campo: 'closer_follow_up', breve: b.closer_follow_up, voce: M.closer_follow_up },
    { campo: 'closer_cancellate', breve: b.closer_cancellate, voce: C.cancellate },
    { campo: 'closer_chiuse', breve: b.closer_chiuse, voce: C.chiuse },
    { campo: 'cash', breve: b.cash, voce: M.cash_miei_clienti, euro: true },
    { campo: 'revenue', breve: b.revenue, voce: M.revenue_miei_clienti, euro: true },
  ]
  const strategy: Colonna = { campo: 'strategy_prenotate', breve: b.strategy_prenotate, voce: S.strategy_storico }
  /** The one line of a closed day on the phone: two numbers of the report, three of the calls. */
  const riassuntoReport: Colonna[] = [
    { campo: 'dm_totali', breve: b.dm, voce: S.dm_totali },
    { campo: 'discovery_prenotate', breve: b.prenotate, voce: S.discovery_prenotate },
  ]
  const riassuntoCall: Colonna[] = [
    { campo: 'closer_call', breve: b.closer_call, voce: C.call },
    { campo: 'closer_chiuse', breve: b.closer_chiuse, voce: C.chiuse },
    { campo: 'cash', breve: b.cash, voce: M.cash_miei_clienti, euro: true },
  ]
  return { report, call, strategy, riassuntoReport, riassuntoCall }
}

type Colonne = ReturnType<typeof colonne>

// old reports may hold strategy calls: a column of history, shown only when the period has any
export const VOCE_STRATEGY_STORICO: VoceLegenda = LEGENDA_SETTING.strategy_storico

/** The report's columns; the strategy one only in a period whose total has some. */
function colonneReport(c: Colonne, conStrategy: boolean): Colonna[] {
  if (!conStrategy) return c.report
  const dopo = c.report.findIndex((x) => x.campo === 'discovery_prenotate') + 1
  return [...c.report.slice(0, dopo), c.strategy, ...c.report.slice(dopo)]
}

/** What the tables show, for the page's "Cosa significa ogni numero". */
export function vociGiornate(lingua: Lingua) {
  const c = colonne(lingua)
  return { report: c.report.map((x) => x.voce), call: c.call.map((x) => x.voce), strategy: c.strategy.voce }
}

/** What the tables show, in Italian. */
export const VOCI_GIORNATE = vociGiornate('it')

/** Amounts always with two decimals, on the phone too: a list is not a tile. */
function valore(r: Riga, c: Colonna, f: Formato): string {
  return c.euro ? f.formatEuro(r[c.campo]) : f.formatNumero(r[c.campo])
}

function zero(r: Riga, c: Colonna): boolean {
  return Number(r[c.campo]) === 0
}

/** Zeros recede, so the days where something happened stand out. */
function classeValore(r: Riga, c: Colonna): string {
  return cn('num', c.forte && 'font-semibold', zero(r, c) && 'text-muted-foreground')
}

/** The DM totali column sits on a faint band, like the sum under a column. */
const FASCIA_FORTE = 'bg-muted/60'

type Testi = (typeof MIEI_NUMERI)['it']['giornate']

/* ---------- phone: one closed line per day ---------- */

/** Label and value rows of one source; a day card leaves out what is zero. */
function Blocco({
  titolo,
  nota,
  colonne,
  riga,
  senzaZeri = false,
  t,
  f,
}: {
  titolo: string
  nota?: string
  colonne: Colonna[]
  riga: Riga
  senzaZeri?: boolean
  t: Testi
  f: Formato
}) {
  const visibili = senzaZeri ? colonne.filter((c) => !zero(riga, c)) : colonne
  return (
    <div>
      <div className="mb-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</p>
        {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
      </div>
      {visibili.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">{t.tuttoZero}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6">
          {visibili.map((c) => (
            <div key={c.campo} className="flex items-baseline justify-between gap-2 py-1">
              <dt className={cn('text-xs', c.forte ? 'font-medium text-foreground' : 'text-muted-foreground')}>{c.voce.etichetta}</dt>
              <dd className={cn(classeValore(riga, c), 'text-right text-sm')}>{valore(riga, c, f)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

const CHEVRON = 'size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180'
const SOMMARIO =
  'cursor-pointer list-none rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden'
/**
 * Day, two report columns, three call columns, chevron: shared by the header
 * and every line. Cash is wide enough for "9.999,99 €" (two decimals, like every list).
 */
const GRIGLIA = 'grid grid-cols-[4.75rem_repeat(4,minmax(0,1fr))_4.75rem_1rem] items-center gap-x-1'

function CellaRiassunto({ riga, c, separa = false, f }: { riga: Riga; c: Colonna; separa?: boolean; f: Formato }) {
  return (
    <span className={cn(classeValore(riga, c), 'text-right text-sm whitespace-nowrap', separa && 'border-l border-border')}>
      <span className="sr-only">{c.voce.etichetta}: </span>
      {valore(riga, c, f)}
    </span>
  )
}

function Giornata({ riga, report, col, t, f }: { riga: Riga; report: Colonna[]; col: Colonne; t: Testi; f: Formato }) {
  const giorno = f.formatData(riga.data)
  return (
    <li aria-label={giorno} data-testid="giornata">
      <details className="group rounded-xl bg-card">
        <summary className={cn(SOMMARIO, GRIGLIA, 'min-h-11 px-3 py-2')}>
          <span className="num text-sm font-medium">{giorno}</span>
          {col.riassuntoReport.map((c) => (
            <CellaRiassunto key={c.campo} riga={riga} c={c} f={f} />
          ))}
          {col.riassuntoCall.map((c, i) => (
            <CellaRiassunto key={c.campo} riga={riga} c={c} separa={i === 0} f={f} />
          ))}
          <ChevronDown className={CHEVRON} aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-4 pt-1 pb-4">
          <Blocco titolo={t.titoloReport} colonne={report} riga={riga} senzaZeri t={t} f={f} />
          <Blocco titolo={t.titoloCall} colonne={col.call} riga={riga} senzaZeri t={t} f={f} />
        </div>
      </details>
    </li>
  )
}

function GiornateTelefono({
  giorni,
  totale,
  report,
  col,
  t,
  f,
}: {
  giorni: Riga[]
  totale: Riga | undefined
  report: Colonna[]
  col: Colonne
  t: Testi
  f: Formato
}) {
  return (
    <div className="space-y-3 md:hidden">
      {totale ? (
        <details open className="group rounded-xl bg-card ring-1 ring-border" data-testid="giornata-totale">
          <summary className={cn(SOMMARIO, 'flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-semibold')}>
            {t.totalePeriodo}
            <ChevronDown className={CHEVRON} aria-hidden="true" />
          </summary>
          <div className="space-y-3 px-4 pt-1 pb-4">
            <Blocco titolo={t.titoloReport} colonne={report} riga={totale} t={t} f={f} />
            <Blocco titolo={t.titoloCall} nota={t.descrizioneCall} colonne={col.call} riga={totale} t={t} f={f} />
          </div>
        </details>
      ) : null}

      <div>
        {/* the header of the lines below: every line also says it to screen readers */}
        <div aria-hidden="true" className="px-3 pb-1 text-[11px] text-muted-foreground">
          <div className={GRIGLIA}>
            <span className="col-span-2 col-start-2 text-center font-medium">{t.dalReport}</span>
            <span className="col-span-3 col-start-4 border-l border-border text-center font-medium">{t.dalleCall}</span>
          </div>
          <div className={GRIGLIA}>
            <span>{t.giorno}</span>
            {col.riassuntoReport.map((c) => (
              <span key={c.campo} className="text-right">
                {c.breve}
              </span>
            ))}
            {col.riassuntoCall.map((c, i) => (
              <span key={c.campo} className={cn('text-right', i === 0 && 'border-l border-border')}>
                {c.breve}
              </span>
            ))}
          </div>
        </div>
        <ul className="space-y-2" aria-label={t.giorniPeriodo}>
          {giorni.map((r) => (
            <Giornata key={r.data} riga={r} report={report} col={col} t={t} f={f} />
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ---------- desktop: one table per source ---------- */

function Celle({ riga, colonne, f }: { riga: Riga; colonne: Colonna[]; f: Formato }) {
  return colonne.map((c) => (
    <td key={c.campo} className={cn(classeValore(riga, c), 'px-1.5 py-2 text-right whitespace-nowrap last:pr-3', c.forte && FASCIA_FORTE)}>
      {valore(riga, c, f)}
    </td>
  ))
}

function Tabella({
  id,
  titolo,
  descrizione,
  vuoto,
  colonne,
  giorni,
  totale,
  t,
  f,
}: {
  id: string
  titolo: string
  descrizione: string
  vuoto: string
  colonne: Colonna[]
  giorni: Riga[]
  totale: Riga | undefined
  t: Testi
  f: Formato
}) {
  // a day where every number of this source is zero adds nothing here
  const righe = giorni.filter((r) => colonne.some((c) => !zero(r, c)))
  const idTitolo = `titolo-${id}`

  return (
    <div className="space-y-2" data-testid={id}>
      <div>
        <h3 id={idTitolo} className="text-sm font-medium">
          {titolo}
        </h3>
        <p className="text-xs text-muted-foreground">{descrizione}</p>
      </div>
      {righe.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">{vuoto}</p>
      ) : (
        // fits the page at 1440; on a tablet it scrolls inside, never the page
        <div
          className="overflow-x-auto rounded-xl bg-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          tabIndex={0}
          role="region"
          aria-labelledby={idTitolo}
        >
          <table className="w-full text-sm" aria-labelledby={idTitolo}>
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-10 bg-card px-3 pt-2.5 pb-2 text-left align-bottom font-normal">
                  {t.giorno}
                </th>
                {/* short headers like the Excel; the title says the full name */}
                {colonne.map((c) => (
                  <th
                    key={c.campo}
                    scope="col"
                    title={c.voce.etichetta}
                    className={cn(
                      'px-1.5 pt-2.5 pb-2 text-right align-bottom last:pr-3',
                      c.forte ? cn('font-medium text-foreground', FASCIA_FORTE) : 'font-normal',
                    )}
                  >
                    {c.breve}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {righe.map((r) => (
                <tr key={r.data} data-testid="giornata">
                  <th scope="row" className="num sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal whitespace-nowrap">
                    {f.formatData(r.data)}
                  </th>
                  <Celle riga={r} colonne={colonne} f={f} />
                </tr>
              ))}
            </tbody>
            {totale ? (
              <tfoot className="border-t border-border font-semibold">
                <tr data-testid="giornata-totale">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left whitespace-nowrap">
                    {t.totale}
                  </th>
                  <Celle riga={totale} colonne={colonne} f={f} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * "Giorno per giorno": the setter's report and the calls he booked, day by
 * day, like the two halves of Dany's Excel (giornate_setter, filtered on the
 * caller). The two sources never share a table. Every number and the total
 * row come from SQL; here rows are only shown or left out.
 */
export function MieGiornate({ righe, lingua = 'it' }: { righe: Riga[]; lingua?: Lingua }) {
  const t = MIEI_NUMERI[lingua].giornate
  const f = formato(lingua)
  const col = colonne(lingua)
  const totale = righe.find((r) => r.data === null)
  const giorni = righe.filter((r) => r.data !== null)
  const report = colonneReport(col, Number(totale?.strategy_prenotate ?? 0) > 0)

  return (
    <section aria-labelledby="titolo-mie-giornate" className="space-y-3" data-testid="mie-giornate">
      <div>
        <h2 id="titolo-mie-giornate" className="text-sm font-medium">
          {t.titolo}
        </h2>
        <p className="text-xs text-muted-foreground">{t.descrizione}</p>
      </div>

      {giorni.length === 0 ? (
        <StatoVuoto
          Icona={CalendarDays}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
          azione={<LinkBottone href="/today">{t.compilaOggi}</LinkBottone>}
        />
      ) : (
        <>
          <GiornateTelefono giorni={giorni} totale={totale} report={report} col={col} t={t} f={f} />

          <div className="hidden space-y-5 md:block">
            <Tabella
              id="tabella-report"
              titolo={t.titoloReport}
              descrizione={t.descrizioneReport}
              vuoto={t.vuotoReport}
              colonne={report}
              giorni={giorni}
              totale={totale}
              t={t}
              f={f}
            />
            <Tabella
              id="tabella-call"
              titolo={t.titoloCall}
              descrizione={t.descrizioneCall}
              vuoto={t.vuotoCall}
              colonne={col.call}
              giorni={giorni}
              totale={totale}
              t={t}
              f={f}
            />
          </div>
        </>
      )}
    </section>
  )
}
