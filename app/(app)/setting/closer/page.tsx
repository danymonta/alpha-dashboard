import { ChevronDown, ClipboardCheck, Phone } from 'lucide-react'

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
import { solaLettura } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatNumero, formatPercentuale } from '@/lib/format'
import { LEGENDA_CLOSER, type VoceLegenda } from '@/lib/metriche/legenda'
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

// Dany's Excel, CLOSER half, in its order: counts first, then the money.
// Every column's full name and definition come from lib/metriche/legenda.
const COLONNE: readonly { campo: keyof Giornata; etichetta: string; euro?: true }[] = [
  // "Svolte": the tile above says "Call svolte", the column is the same number
  { campo: 'call', etichetta: 'Svolte' },
  { campo: 'qualificate', etichetta: 'Qualificate' },
  { campo: 'no_show', etichetta: 'No show' },
  // "(esito call)": not the setter's follow up in DM (the legend's label)
  { campo: 'follow_up', etichetta: LEGENDA_CLOSER.follow_up.etichetta },
  { campo: 'cancellate', etichetta: 'Cancellate' },
  { campo: 'chiuse', etichetta: 'Chiuse' },
  { campo: 'cash', etichetta: 'Cash', euro: true },
  { campo: 'revenue', etichetta: 'Revenue', euro: true },
]

/** Header tooltip on a desktop: full name and definition. */
function titolo(campo: keyof Giornata): string {
  const voce = LEGENDA_CLOSER[campo]
  return `${voce.etichetta}: ${voce.spiegazione}`
}

// the page's numbers in reading order: the tiles, then the rest of the table
const LEGENDA_PAGINA: VoceLegenda[] = [
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

function valore(r: Giornata, colonna: (typeof COLONNE)[number]): string {
  return colonna.euro ? formatEuro(r[colonna.campo]) : formatNumero(r[colonna.campo])
}

function zero(r: Giornata, colonna: (typeof COLONNE)[number]): boolean {
  return Number(r[colonna.campo]) === 0
}

/** A zero stays readable but steps back: the days with activity stand out. */
function classeZero(r: Giornata, colonna: (typeof COLONNE)[number]): string | undefined {
  return zero(r, colonna) ? 'text-muted-foreground' : undefined
}

/* ---------- phone: one closed line per day, like the setter's "Giorno per giorno" ---------- */

/** The line of a closed day: how many calls were held and closed, and the cash. */
const RIASSUNTO = COLONNE.filter((c) => c.campo === 'call' || c.campo === 'chiuse' || c.campo === 'cash')

const CHEVRON = 'size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180'
const SOMMARIO =
  'cursor-pointer list-none rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden'
/** Day, held, closed, cash, chevron: shared by the header and every line. */
const GRIGLIA = 'grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_1rem] items-center gap-x-2'

/** Every column of a day as label and value, two by two; a day leaves out its zeros. */
function Dettaglio({ riga, senzaZeri = false }: { riga: Giornata; senzaZeri?: boolean }) {
  const visibili = senzaZeri ? COLONNE.filter((c) => !zero(riga, c)) : COLONNE
  if (visibili.length === 0) return <p className="py-1 text-xs text-muted-foreground">Tutto a zero</p>
  return (
    <dl className="grid grid-cols-2 gap-x-6">
      {visibili.map((c) => (
        <div key={c.campo} className="flex items-baseline justify-between gap-2 py-1">
          <dt className="text-xs text-muted-foreground">{LEGENDA_CLOSER[c.campo].etichetta}</dt>
          <dd className={cn('num text-right text-sm', classeZero(riga, c))}>{valore(riga, c)}</dd>
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
}: {
  giorni: (Giornata & { data: string })[]
  totale: Giornata
  closer: string | undefined
  /** Admin and closer open a day's page; the setter only reads the numbers. */
  apriGiorno: boolean
}) {
  return (
    <div className="space-y-3 md:hidden" data-testid="giornate-closer-telefono">
      <details open className="group rounded-xl bg-card ring-1 ring-border" data-testid="giornata-totale">
        <summary className={cn(SOMMARIO, 'flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-semibold')}>
          Totale del periodo
          <ChevronDown className={CHEVRON} aria-hidden="true" />
        </summary>
        <div className="px-4 pt-1 pb-4">
          <Dettaglio riga={totale} />
        </div>
      </details>

      <div>
        {/* the header of the lines below: every line also says it to screen readers */}
        <div aria-hidden="true" className={cn(GRIGLIA, 'px-3 pb-1 text-[11px] text-muted-foreground')}>
          <span>Giorno</span>
          {RIASSUNTO.map((c) => (
            <span key={c.campo} className="text-right">
              {c.etichetta}
            </span>
          ))}
        </div>
        <ul className="space-y-2" aria-label="Giorni del periodo">
          {giorni.map((r) => {
            const giorno = formatData(r.data)
            return (
              <li key={r.data} aria-label={giorno} data-testid="giornata">
                <details className="group rounded-xl bg-card">
                  <summary className={cn(SOMMARIO, GRIGLIA, 'min-h-11 px-3 py-2')}>
                    <span className="num text-sm font-medium">{giorno}</span>
                    {RIASSUNTO.map((c) => (
                      <span key={c.campo} className={cn('num text-right text-sm whitespace-nowrap', classeZero(r, c))}>
                        <span className="sr-only">{LEGENDA_CLOSER[c.campo].etichetta}: </span>
                        {valore(r, c)}
                      </span>
                    ))}
                    <ChevronDown className={CHEVRON} aria-hidden="true" />
                  </summary>
                  <div className="space-y-2 px-4 pt-1 pb-4">
                    <Dettaglio riga={r} senzaZeri />
                    {apriGiorno ? (
                      <LinkBottone href={hrefGiorno(r.data, closer)} variant="outline" className="w-full">
                        Apri la giornata
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

/** The page's description, from the side of who reads it. */
const DESCRIZIONE = {
  admin:
    'Le tue call da registrare in cima, poi le call e le vendite del closer giorno per giorno: si calcolano dagli esiti delle call e dalle vendite registrate.',
  // the admin on another closer: no calls to record on top (they are that closer's)
  adminAltroCloser:
    'Le call e le vendite del closer scelto, giorno per giorno: si calcolano dagli esiti delle call e dalle vendite registrate.',
  closer:
    'Le tue call da registrare in cima, poi le tue call e le tue vendite giorno per giorno: si calcolano dagli esiti delle call e dalle vendite registrate.',
  setter:
    'Le call e le vendite del closer, di tutti i setter, giorno per giorno: si calcolano dagli esiti delle call e dalle vendite registrate.',
} as const

export default async function CloserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // the setter too, read only (Dany, 07/10/2026: "il setter può accedere alla tab
  // closer", every setter's calls and the money too, as aggregate numbers by day)
  // the business coach reads it like the setter's page (no day to fill, no calls to record) and
  // like the admin's (the recorded calls with cash and revenue): 22/10/2026
  const profilo = await requireRuolo(['admin', 'closer', 'setter', 'business_coach'])
  const leggeSolo = solaLettura(profilo.ruolo)
  const ruolo =
    profilo.ruolo === 'admin' ? 'admin' : profilo.ruolo === 'setter' || leggeSolo ? 'setter' : 'closer'
  const admin = ruolo === 'admin'
  const setter = ruolo === 'setter'
  const oggi = oggiRoma()
  const parametri = await searchParams
  const periodo = leggiPeriodo(parametri, oggi)
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
    if (error) throw new Error('Impossibile caricare i closer')
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
  if (giornate.error) throw new Error('Impossibile caricare le giornate del closer')

  const righe = giornate.data ?? []
  const totale = righe.find((r) => r.data === null)
  const giorni = righe.filter((r) => r.data !== null)
  // a sale closed from the calls on top comes back here, on the same period and closer
  const qui = `/setting/closer?${new URLSearchParams({ ...periodo.parametri, ...(closer ? { closer } : {}) }).toString()}`

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={ruolo === 'closer' ? 'I miei numeri' : 'Closer'}
        descrizione={DESCRIZIONE[admin && !registraEsiti ? 'adminAltroCloser' : ruolo]}
        azione={
          // the day is filled from its calls: one outcome per call, no counters.
          // The setter reads the numbers: the day's page stays the closer's and the admin's
          setter ? undefined : (
            <LinkBottone href={hrefGiorno(null, closer)} data-testid="compila-giornata">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Compila la giornata
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
        />
      ) : null}

      {/* 390px: the closer filter gets its own full-width row, never a truncated name */}
      <div className="grid gap-2 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/setting/closer" parametri={{ closer }} />
        {closers.length > 1 ? (
          <FiltroSelect
            id="filtro-closer"
            etichetta="Closer"
            nome="closer"
            valore={closer ?? ''}
            predefinito=""
            opzioni={[
              { valore: '', etichetta: 'Tutti i closer' },
              ...closers.map((c) => ({ valore: c.id, etichetta: c.nome })),
            ]}
            parametri={{ ...periodo.parametri, closer }}
          />
        ) : null}
      </div>

      {giorni.length === 0 || !totale ? (
        <StatoVuoto
          Icona={Phone}
          titolo="Nessuna call o vendita in questo periodo"
          descrizione={
            setter
              ? `I numeri compaiono quando il closer registra l’esito di una call o una vendita ${periodo.frase}.`
              : `I numeri compaiono quando si registra l’esito di una call o una vendita ${periodo.frase}.`
          }
          azione={
            leggeSolo ? undefined : setter ? (
              <LinkBottone href="/my-numbers" variant="outline">
                Vai ai miei numeri
              </LinkBottone>
            ) : (
              <LinkBottone href={hrefGiorno(null, closer)}>Compila la giornata</LinkBottone>
            )
          }
        />
      ) : (
        <>
          <section aria-label={`Totali ${periodo.frase}`} className="space-y-3" data-testid="kpi-closer">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-card p-4 md:p-5">
                <p className="text-sm text-muted-foreground">
                  <EtichettaConNota voce={LEGENDA_CLOSER.cash} />
                </p>
                {/* the one gold number of the screen */}
                <p className="num mt-1 text-4xl font-semibold tracking-tight text-gold md:text-5xl">
                  {formatEuro(totale.cash)}
                </p>
                {/* the closer's cash (20260929130000): first instalment of the new sales, on the sale day, refunds apart */}
                <p className="mt-2 text-xs text-muted-foreground">
                  Prima rata dei nuovi clienti chiusi {periodo.frase}, sul giorno della vendita
                </p>
              </div>
              <div className="rounded-xl bg-card p-4 md:p-5">
                <p className="text-sm text-muted-foreground">
                  <EtichettaConNota voce={LEGENDA_CLOSER.revenue} />
                </p>
                <p className="num mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {formatEuro(totale.revenue)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Contratti dei nuovi clienti firmati {periodo.frase}</p>
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
              Giorno per giorno ({giorni.length})
            </h2>

            <GiornateTelefono giorni={giorni} totale={totale} closer={closer} apriGiorno={!setter} />

            <div className="hidden overflow-x-auto rounded-xl bg-card md:block">
              <table className="w-full text-sm" data-testid="giornate-closer">
                <caption className="sr-only">Giornate del closer {periodo.frase}</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2.5 text-left font-normal">Giorno</th>
                    {COLONNE.map((c) => (
                      <th key={c.campo} scope="col" title={titolo(c.campo)} className="px-3 py-2.5 text-right font-normal">
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
                            aria-label={`${formatData(r.data)}: apri la giornata`}
                            className="num rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {formatData(r.data)}
                          </LinkRiga>
                        )}
                      </th>
                      {COLONNE.map((c) => (
                        <td key={c.campo} className={cn('num px-3 py-2 text-right', classeZero(r, c))}>
                          {valore(r, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <th scope="row" className="px-3 py-2.5 text-left">Totale</th>
                    {COLONNE.map((c) => (
                      <td key={c.campo} className="num px-3 py-2.5 text-right">
                        {valore(totale, c)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="px-1 text-xs text-muted-foreground">
              {setter ? (
                <>
                  Svolte, qualificate, no show, follow up, cancellate e chiuse vengono dall’esito che il closer registra su
                  ogni call, di tutti i setter; cash e revenue solo dai clienti nuovi (prima rata e contratto), mai rate
                  successive o rinnovi.
                </>
              ) : (
                <>
                  Svolte, qualificate, no show, follow up, cancellate e chiuse vengono dall’esito registrato su ogni call,
                  in «Le mie call» o in «Compila la giornata» (tocca un giorno per aprirla); cash e revenue solo dai
                  clienti nuovi (prima rata e contratto), mai rate successive o rinnovi.
                </>
              )}
            </p>
          </section>

          {/* 1.37.0: the recorded calls, for the admin and the closer; the setter reads the page without it */}
          {setter && !leggeSolo ? null : (
            <DalleRegistrazioni
              periodo={periodo}
              closer={closer}
              per={leggiPer(parametri.per)}
              admin={admin || leggeSolo}
              proprie={ruolo === 'closer' || (admin && (closer === profilo.id))}
              parametri={{ ...periodo.parametri, closer }}
            />
          )}

          <LegendaSezione voci={LEGENDA_PAGINA} />
        </>
      )}
    </div>
  )
}
