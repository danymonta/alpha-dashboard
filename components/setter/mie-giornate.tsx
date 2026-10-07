import { CalendarDays, ChevronDown } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData, formatEuro, formatNumero } from '@/lib/format'
import { LEGENDA_CLOSER, LEGENDA_SETTER, LEGENDA_SETTING, type VoceLegenda } from '@/lib/metriche/legenda'
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

const S = LEGENDA_SETTING
const C = LEGENDA_CLOSER
const M = LEGENDA_SETTER

// Source 1, the setter's daily report (what he writes in "Oggi"). The calls he
// books are discovery calls; strategy_prenotate is history (colonneReport).
const REPORT: Colonna[] = [
  { campo: 'dm_outbound', breve: 'DM out', voce: S.dm_outbound },
  { campo: 'dm_inbound', breve: 'DM in', voce: S.dm_inbound },
  { campo: 'follow_up', breve: 'Follow up', voce: S.follow_up },
  { campo: 'dm_totali', breve: 'DM totali', voce: S.dm_totali, forte: true },
  { campo: 'conversazioni', breve: 'Conv.', voce: S.conversazioni },
  { campo: 'call_proposte', breve: 'Call proposte', voce: S.call_proposte },
  { campo: 'discovery_prenotate', breve: 'Disc. prenotate', voce: S.discovery_prenotate },
]

// Source 2, the calls he booked as the app recorded them: bookings by booking
// day, the closer's results by call day, cash and revenue only of his clients.
// Names shared with the report say "(closer)" (LEGENDA_SETTER).
const CALL: Colonna[] = [
  { campo: 'prenotate_inbound', breve: 'Da inbound', voce: S.prenotate_inbound },
  { campo: 'prenotate_outbound', breve: 'Da outbound', voce: S.prenotate_outbound },
  { campo: 'closer_call', breve: 'Svolte', voce: C.call },
  { campo: 'closer_qualificate', breve: 'Qualif. closer', voce: M.closer_qualificate },
  { campo: 'closer_no_show', breve: 'No show', voce: C.no_show },
  { campo: 'closer_follow_up', breve: 'Follow up closer', voce: M.closer_follow_up },
  { campo: 'closer_cancellate', breve: 'Cancellate', voce: C.cancellate },
  { campo: 'closer_chiuse', breve: 'Chiuse', voce: C.chiuse },
  { campo: 'cash', breve: 'Cash', voce: M.cash_miei_clienti, euro: true },
  { campo: 'revenue', breve: 'Revenue', voce: M.revenue_miei_clienti, euro: true },
]

// old reports may hold strategy calls: a column of history, shown only when the period has any
export const VOCE_STRATEGY_STORICO: VoceLegenda = LEGENDA_SETTING.strategy_storico

const STRATEGY: Colonna = { campo: 'strategy_prenotate', breve: 'Strategy (storico)', voce: VOCE_STRATEGY_STORICO }

/** The report's columns; the strategy one only in a period whose total has some. */
function colonneReport(conStrategy: boolean): Colonna[] {
  if (!conStrategy) return REPORT
  const dopo = REPORT.findIndex((c) => c.campo === 'discovery_prenotate') + 1
  return [...REPORT.slice(0, dopo), STRATEGY, ...REPORT.slice(dopo)]
}

/** The one line of a closed day on the phone: two numbers of the report, three of the calls. */
const RIASSUNTO_REPORT: Colonna[] = [
  { campo: 'dm_totali', breve: 'DM', voce: S.dm_totali },
  { campo: 'discovery_prenotate', breve: 'Prenot.', voce: S.discovery_prenotate },
]
const RIASSUNTO_CALL: Colonna[] = [
  { campo: 'closer_call', breve: 'Svolte', voce: C.call },
  { campo: 'closer_chiuse', breve: 'Chiuse', voce: C.chiuse },
  { campo: 'cash', breve: 'Cash', voce: M.cash_miei_clienti, euro: true },
]

/** What the tables show, for the page's "Cosa significa ogni numero". */
export const VOCI_GIORNATE = {
  report: REPORT.map((c) => c.voce),
  call: CALL.map((c) => c.voce),
}

const TITOLO_REPORT = 'Il tuo report'
const TITOLO_CALL = 'Le call col tuo nome'
const DESCRIZIONE_CALL =
  'Quelle che hai fissato e le loro call di follow-up, che fissa il closer. Da inbound e da outbound per giorno di prenotazione (solo quelle che hai fissato tu), le altre per giorno della call; cash e revenue per giorno della vendita, solo dei clienti nuovi che hai portato tu (prima rata e contratto).'

/** Amounts always with two decimals, on the phone too: a list is not a tile. */
function valore(r: Riga, c: Colonna): string {
  return c.euro ? formatEuro(r[c.campo]) : formatNumero(r[c.campo])
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

/* ---------- phone: one closed line per day ---------- */

/** Label and value rows of one source; a day card leaves out what is zero. */
function Blocco({
  titolo,
  nota,
  colonne,
  riga,
  senzaZeri = false,
}: {
  titolo: string
  nota?: string
  colonne: Colonna[]
  riga: Riga
  senzaZeri?: boolean
}) {
  const visibili = senzaZeri ? colonne.filter((c) => !zero(riga, c)) : colonne
  return (
    <div>
      <div className="mb-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</p>
        {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
      </div>
      {visibili.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">Tutto a zero</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6">
          {visibili.map((c) => (
            <div key={c.campo} className="flex items-baseline justify-between gap-2 py-1">
              <dt className={cn('text-xs', c.forte ? 'font-medium text-foreground' : 'text-muted-foreground')}>{c.voce.etichetta}</dt>
              <dd className={cn(classeValore(riga, c), 'text-right text-sm')}>{valore(riga, c)}</dd>
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

function CellaRiassunto({ riga, c, separa = false }: { riga: Riga; c: Colonna; separa?: boolean }) {
  return (
    <span className={cn(classeValore(riga, c), 'text-right text-sm whitespace-nowrap', separa && 'border-l border-border')}>
      <span className="sr-only">{c.voce.etichetta}: </span>
      {valore(riga, c)}
    </span>
  )
}

function Giornata({ riga, report }: { riga: Riga; report: Colonna[] }) {
  const giorno = formatData(riga.data)
  return (
    <li aria-label={giorno} data-testid="giornata">
      <details className="group rounded-xl bg-card">
        <summary className={cn(SOMMARIO, GRIGLIA, 'min-h-11 px-3 py-2')}>
          <span className="num text-sm font-medium">{giorno}</span>
          {RIASSUNTO_REPORT.map((c) => (
            <CellaRiassunto key={c.campo} riga={riga} c={c} />
          ))}
          {RIASSUNTO_CALL.map((c, i) => (
            <CellaRiassunto key={c.campo} riga={riga} c={c} separa={i === 0} />
          ))}
          <ChevronDown className={CHEVRON} aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-4 pt-1 pb-4">
          <Blocco titolo={TITOLO_REPORT} colonne={report} riga={riga} senzaZeri />
          <Blocco titolo={TITOLO_CALL} colonne={CALL} riga={riga} senzaZeri />
        </div>
      </details>
    </li>
  )
}

function GiornateTelefono({ giorni, totale, report }: { giorni: Riga[]; totale: Riga | undefined; report: Colonna[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {totale ? (
        <details open className="group rounded-xl bg-card ring-1 ring-border" data-testid="giornata-totale">
          <summary className={cn(SOMMARIO, 'flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-semibold')}>
            Totale del periodo
            <ChevronDown className={CHEVRON} aria-hidden="true" />
          </summary>
          <div className="space-y-3 px-4 pt-1 pb-4">
            <Blocco titolo={TITOLO_REPORT} colonne={report} riga={totale} />
            <Blocco titolo={TITOLO_CALL} nota={DESCRIZIONE_CALL} colonne={CALL} riga={totale} />
          </div>
        </details>
      ) : null}

      <div>
        {/* the header of the lines below: every line also says it to screen readers */}
        <div aria-hidden="true" className="px-3 pb-1 text-[11px] text-muted-foreground">
          <div className={GRIGLIA}>
            <span className="col-span-2 col-start-2 text-center font-medium">Dal report</span>
            <span className="col-span-3 col-start-4 border-l border-border text-center font-medium">Dalle call</span>
          </div>
          <div className={GRIGLIA}>
            <span>Giorno</span>
            {RIASSUNTO_REPORT.map((c) => (
              <span key={c.campo} className="text-right">
                {c.breve}
              </span>
            ))}
            {RIASSUNTO_CALL.map((c, i) => (
              <span key={c.campo} className={cn('text-right', i === 0 && 'border-l border-border')}>
                {c.breve}
              </span>
            ))}
          </div>
        </div>
        <ul className="space-y-2" aria-label="Giorni del periodo">
          {giorni.map((r) => (
            <Giornata key={r.data} riga={r} report={report} />
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ---------- desktop: one table per source ---------- */

function Celle({ riga, colonne }: { riga: Riga; colonne: Colonna[] }) {
  return colonne.map((c) => (
    <td key={c.campo} className={cn(classeValore(riga, c), 'px-1.5 py-2 text-right whitespace-nowrap last:pr-3', c.forte && FASCIA_FORTE)}>
      {valore(riga, c)}
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
}: {
  id: string
  titolo: string
  descrizione: string
  vuoto: string
  colonne: Colonna[]
  giorni: Riga[]
  totale: Riga | undefined
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
                  Giorno
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
                    {formatData(r.data)}
                  </th>
                  <Celle riga={r} colonne={colonne} />
                </tr>
              ))}
            </tbody>
            {totale ? (
              <tfoot className="border-t border-border font-semibold">
                <tr data-testid="giornata-totale">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left whitespace-nowrap">
                    Totale
                  </th>
                  <Celle riga={totale} colonne={colonne} />
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
export function MieGiornate({ righe }: { righe: Riga[] }) {
  const totale = righe.find((r) => r.data === null)
  const giorni = righe.filter((r) => r.data !== null)
  const report = colonneReport(Number(totale?.strategy_prenotate ?? 0) > 0)

  return (
    <section aria-labelledby="titolo-mie-giornate" className="space-y-3" data-testid="mie-giornate">
      <div>
        <h2 id="titolo-mie-giornate" className="text-sm font-medium">
          Giorno per giorno
        </h2>
        <p className="text-xs text-muted-foreground">
          Il tuo report e le call col tuo nome (quelle che hai fissato e le loro call di follow-up), un giorno alla volta. Compaiono solo i giorni con almeno un numero.
        </p>
      </div>

      {giorni.length === 0 ? (
        <StatoVuoto
          Icona={CalendarDays}
          titolo="Nessuna giornata in questo periodo"
          descrizione="Quando compili il report del giorno o una tua call viene svolta, qui trovi la giornata accanto ai risultati del closer."
          azione={<LinkBottone href="/today">Compila oggi</LinkBottone>}
        />
      ) : (
        <>
          <GiornateTelefono giorni={giorni} totale={totale} report={report} />

          <div className="hidden space-y-5 md:block">
            <Tabella
              id="tabella-report"
              titolo={TITOLO_REPORT}
              descrizione="I numeri che scrivi ogni giorno in «Oggi»."
              vuoto="Nessun numero nel report in questo periodo."
              colonne={report}
              giorni={giorni}
              totale={totale}
            />
            <Tabella
              id="tabella-call"
              titolo={TITOLO_CALL}
              descrizione={DESCRIZIONE_CALL}
              vuoto="Nessuna call col tuo nome in questo periodo."
              colonne={CALL}
              giorni={giorni}
              totale={totale}
            />
          </div>
        </>
      )}
    </section>
  )
}
