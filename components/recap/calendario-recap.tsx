'use client'

import {
  BadgeCheck,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Euro,
  MessageCircle,
  MessagesSquare,
  PhoneCall,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, useSyncExternalStore } from 'react'

import { useFormato, useTesti } from '@/components/i18n/lingua-provider'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Formato } from '@/lib/format'
import { RECAP } from '@/lib/i18n/testi/recap'
import {
  CHIAVI_EURO,
  DETTAGLIO_CLOSING,
  DETTAGLIO_SETTING,
  giornoVuoto,
  giorniVicini,
  livelloAttivita,
  settimaneDelMese,
  type ChiaveGiorno,
  type GiornoRecap,
} from '@/lib/recap/recap'
import { cn } from '@/lib/utils'

type Testi = (typeof RECAP)['it']

// the day sheet: from the bottom on a phone, from the side on a computer
const LARGO = '(min-width: 768px)'
function iscriviti(avvisa: () => void) {
  const mq = window.matchMedia(LARGO)
  mq.addEventListener('change', avvisa)
  return () => mq.removeEventListener('change', avvisa)
}
function useLargo() {
  return useSyncExternalStore(
    iscriviti,
    () => window.matchMedia(LARGO).matches,
    () => false,
  )
}

type Voce = { chiave: string; Icona: LucideIcon; testo: string; forte?: boolean }

/** The quantities written in a day: only the ones that are not zero (the detail says the zeros). */
function vociDelGiorno(g: GiornoRecap, t: Testi, f: Formato): Voce[] {
  const voci: Voce[] = []
  if (g.dm_totali > 0) voci.push({ chiave: 'dm', Icona: MessageCircle, testo: t.cellaDm(g.dm_totali, f.formatNumero(g.dm_totali)) })
  if (g.conversazioni > 0)
    voci.push({ chiave: 'conv', Icona: MessagesSquare, testo: t.cellaConv(g.conversazioni, f.formatNumero(g.conversazioni)) })
  if (g.call_prenotate > 0)
    voci.push({ chiave: 'pren', Icona: CalendarPlus, testo: t.cellaPrenotate(g.call_prenotate, f.formatNumero(g.call_prenotate)) })
  if (g.call_svolte > 0)
    voci.push({ chiave: 'svolte', Icona: PhoneCall, testo: t.cellaSvolte(g.call_svolte, f.formatNumero(g.call_svolte)) })
  if (g.chiuse > 0)
    voci.push({ chiave: 'chiuse', Icona: BadgeCheck, testo: t.cellaChiuse(g.chiuse, f.formatNumero(g.chiuse)), forte: true })
  if (g.cash !== 0) voci.push({ chiave: 'cash', Icona: Euro, testo: f.formatEuro(g.cash, { compatto: true }), forte: true })
  return voci
}

function Voci({ voci, conIcone }: { voci: Voce[]; conIcone: boolean }) {
  return (
    <>
      {voci.map((v) => (
        <span
          key={v.chiave}
          className={cn(
            'flex min-w-0 items-center gap-1 text-xs leading-4',
            v.forte ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {conIcone ? <v.Icona className="size-3 shrink-0" aria-hidden="true" /> : null}
          <span className="num truncate">{v.testo}</span>
        </span>
      ))}
    </>
  )
}

const OPACITA = ['', 'opacity-[0.05]', 'opacity-[0.1]', 'opacity-[0.17]'] as const

/**
 * The month of the sales recap as a calendar (1.59.0, Dany: «stile calendario dove si vede il
 * mese cosa è successo ogni giorno»): Monday to Sunday, each past day a button with its
 * quantities in words, a light background for how many DMs it had (never the only signal),
 * today marked in words, the future greyed. Under about 672 px of section the grid becomes an
 * agenda of the days with activity. A tap opens the day as a row of the sheet. Every number
 * comes from recap_mese(); here only the layout.
 */
export function CalendarioRecap({ giorni, oggi }: { giorni: GiornoRecap[]; oggi: string }) {
  const t = useTesti(RECAP)
  const f = useFormato()
  const largo = useLargo()
  const [aperto, setAperto] = useState<string | null>(null)

  const perGiorno = useMemo(() => new Map(giorni.map((g) => [g.giorno, g])), [giorni])
  const date = useMemo(() => giorni.map((g) => g.giorno), [giorni])
  const settimane = useMemo(() => settimaneDelMese(date), [date])
  const massimoDm = useMemo(() => Math.max(0, ...giorni.map((g) => g.dm_totali)), [giorni])
  const passati = giorni.filter((g) => g.giorno <= oggi)
  const attivi = passati.filter((g) => !giornoVuoto(g))
  const vuoti = passati.length - attivi.length

  const legenda: { Icona: LucideIcon; testo: string }[] = [
    { Icona: MessageCircle, testo: t.legendaDm },
    { Icona: MessagesSquare, testo: t.legendaConv },
    { Icona: CalendarPlus, testo: t.legendaPrenotate },
    { Icona: PhoneCall, testo: t.legendaSvolte },
    { Icona: BadgeCheck, testo: t.legendaChiuse },
    { Icona: Euro, testo: t.legendaCash },
  ]

  const scelto = aperto ? perGiorno.get(aperto) : undefined

  return (
    <section aria-labelledby="titolo-calendario" className="@container min-w-0 space-y-3 rounded-xl bg-card p-4" data-testid="recap-calendario">
      <div className="min-w-0">
        <h2 id="titolo-calendario" className="text-sm font-medium">
          {t.calendarioTitolo}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.calendarioDescrizione}</p>
      </div>

      <ul aria-label={t.legenda} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legenda.map(({ Icona, testo }) => (
          <li key={testo} className="flex items-center gap-1">
            <Icona className="size-3.5 shrink-0" aria-hidden="true" />
            {testo}
          </li>
        ))}
        <li className="hidden items-center gap-1.5 @2xl:flex">
          <span aria-hidden="true" className="inline-flex gap-0.5">
            {[1, 2, 3].map((l) => (
              <span key={l} className="relative size-3 overflow-hidden rounded-[3px] border border-border">
                <span className={cn('absolute inset-0 bg-primary', OPACITA[l])} />
              </span>
            ))}
          </span>
          {t.legendaColore}
        </li>
      </ul>

      {/* the grid: from about 672 px of section */}
      <div className="hidden @2xl:block">
        <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
          {t.giorniSettimana.map((g) => (
            <p key={g} className="px-1.5 text-xs font-medium text-muted-foreground">
              {g}
            </p>
          ))}
        </div>
        <div className="mt-1.5 space-y-1.5">
          {settimane.map((settimana, i) => (
            <div key={i} className="grid grid-cols-7 gap-1.5">
              {settimana.map((giorno, j) => {
                if (!giorno) return <div key={`vuoto-${j}`} aria-hidden="true" />
                const g = perGiorno.get(giorno)
                const numero = Number(giorno.slice(8, 10))
                if (!g || giorno > oggi) {
                  return (
                    <div
                      key={giorno}
                      className="min-h-28 rounded-lg border border-dashed border-border p-1.5 text-muted-foreground/60"
                    >
                      <span className="sr-only">
                        {t.dataLunga(giorno)}: {t.futuro}
                      </span>
                      <span aria-hidden="true" className="num text-xs">
                        {numero}
                      </span>
                    </div>
                  )
                }
                const voci = vociDelGiorno(g, t, f)
                const eOggi = giorno === oggi
                const livello = livelloAttivita(g.dm_totali, massimoDm)
                return (
                  <button
                    key={giorno}
                    type="button"
                    onClick={() => setAperto(giorno)}
                    data-testid="giorno-recap"
                    data-giorno={giorno}
                    className={cn(
                      'relative flex min-h-28 min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-lg border p-1.5 text-left transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      eOggi ? 'border-rosso-testo ring-1 ring-rosso-testo' : 'border-border',
                    )}
                  >
                    {livello > 0 ? (
                      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 bg-primary', OPACITA[livello])} />
                    ) : null}
                    <span className="sr-only">{t.dataLunga(giorno)}</span>
                    <span className="relative flex items-center justify-between gap-1">
                      <span aria-hidden="true" className="num text-xs font-medium text-foreground">
                        {numero}
                      </span>
                      {eOggi ? (
                        <span className="rounded bg-primary px-1 text-[11px] leading-4 font-medium text-primary-foreground">{t.oggi}</span>
                      ) : null}
                    </span>
                    <span className="relative flex min-w-0 flex-col gap-0.5">
                      {voci.length > 0 ? (
                        <Voci voci={voci} conIcone />
                      ) : (
                        <span className="text-xs text-muted-foreground/80">{t.nessunaAttivita}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* the agenda: on a phone, the days with activity, in the calendar's order */}
      <div className="@2xl:hidden">
        {attivi.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.agendaVuota}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="recap-agenda">
            {attivi.map((g) => {
              const eOggi = g.giorno === oggi
              return (
                <li key={g.giorno}>
                  <button
                    type="button"
                    onClick={() => setAperto(g.giorno)}
                    data-testid="giorno-recap"
                    data-giorno={g.giorno}
                    className="flex min-h-11 w-full items-start gap-3 py-2.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex w-20 shrink-0 flex-col">
                      <span className="sr-only">{t.dataLunga(g.giorno)}</span>
                      <span aria-hidden="true" className="num text-sm font-medium">
                        {t.dataCorta(g.giorno)}
                      </span>
                      {eOggi ? <span className="text-xs font-medium text-rosso-testo">{t.oggi}</span> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
                      <Voci voci={vociDelGiorno(g, t, f)} conIcone />
                    </span>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {vuoti > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t.giorniVuoti(vuoti)}</p> : null}
      </div>

      <Sheet open={scelto !== undefined} onOpenChange={(aperta) => (aperta ? null : setAperto(null))}>
        <SheetContent
          side={largo ? 'right' : 'bottom'}
          className={cn(
            'gap-0 overflow-y-auto',
            largo
              ? 'data-[side=right]:w-full data-[side=right]:sm:max-w-md'
              : 'max-h-[calc(100dvh-1rem)] rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]',
          )}
          data-testid="dettaglio-giorno"
        >
          {scelto ? (
            <DettaglioGiorno giorno={scelto} date={date} oggi={oggi} t={t} f={f} vai={setAperto} />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  )
}

function valoreVoce(chiave: ChiaveGiorno, g: GiornoRecap, f: Formato): string {
  return CHIAVI_EURO.has(chiave) ? f.formatEuro(g[chiave]) : f.formatNumero(g[chiave])
}

function Righe({ chiavi, g, t, f }: { chiavi: ChiaveGiorno[]; g: GiornoRecap; t: Testi; f: Formato }) {
  return (
    <dl className="divide-y divide-border">
      {chiavi.map((k) => {
        const totale = k === 'dm_totali'
        const parte = k === 'prenotate_inbound' || k === 'prenotate_outbound'
        return (
          <div key={k} className={cn('flex items-baseline justify-between gap-3 py-1.5', parte && 'pl-3')}>
            <dt className={cn('min-w-0 text-sm', totale ? 'font-medium text-foreground' : 'text-muted-foreground')}>{t.voci[k]}</dt>
            <dd className={cn('num shrink-0 text-right text-sm', totale || k === 'chiuse' ? 'font-semibold' : '', g[k] === 0 && 'text-muted-foreground')}>
              {valoreVoce(k, g, f)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** One day as a row of the Excel: the setting half, the closing half, the day's ratios. */
function DettaglioGiorno({
  giorno,
  date,
  oggi,
  t,
  f,
  vai,
}: {
  giorno: GiornoRecap
  date: string[]
  oggi: string
  t: Testi
  f: Formato
  vai: (giorno: string) => void
}) {
  const { prima, dopo } = giorniVicini(giorno.giorno, date, oggi)
  const freccia =
    'inline-flex h-11 items-center gap-1 rounded-lg border border-input px-3 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {t.dataLunga(giorno.giorno)}
          {giorno.giorno === oggi ? <span className="ml-2 text-sm font-medium text-rosso-testo">{t.oggi}</span> : null}
        </SheetTitle>
        <SheetDescription>{t.dettaglioDescrizione}</SheetDescription>
      </SheetHeader>
      <div className="flex items-center justify-between gap-2 px-4">
        <button
          type="button"
          className={freccia}
          aria-disabled={prima === null || undefined}
          onClick={() => (prima ? vai(prima) : null)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t.giornoPrima}
        </button>
        <button
          type="button"
          className={freccia}
          aria-disabled={dopo === null || undefined}
          onClick={() => (dopo ? vai(dopo) : null)}
        >
          {t.giornoDopo}
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-5 p-4">
        {giornoVuoto(giorno) ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{t.giornoSenzaAttivita}</p>
        ) : null}
        <section aria-labelledby="dettaglio-setting">
          <h3 id="dettaglio-setting" className="text-sm font-semibold">
            {t.sezioneSetting}
          </h3>
          <p className="mt-0.5 mb-1 text-xs text-muted-foreground">{t.sezioneSettingNota}</p>
          <Righe chiavi={DETTAGLIO_SETTING} g={giorno} t={t} f={f} />
        </section>
        <section aria-labelledby="dettaglio-closing">
          <h3 id="dettaglio-closing" className="text-sm font-semibold">
            {t.sezioneClosing}
          </h3>
          <p className="mt-0.5 mb-1 text-xs text-muted-foreground">{t.sezioneClosingNota}</p>
          <Righe chiavi={DETTAGLIO_CLOSING} g={giorno} t={t} f={f} />
        </section>
        <section aria-labelledby="dettaglio-rapporti">
          <h3 id="dettaglio-rapporti" className="text-sm font-semibold">
            {t.rapportiGiorno}
          </h3>
          <dl className="mt-1 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{t.showRateEtichetta}</dt>
              <dd className="num mt-0.5 text-lg font-semibold">{f.formatPercentuale(giorno.show_rate)}</dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{t.closeRateEtichetta}</dt>
              <dd className="num mt-0.5 text-lg font-semibold">{f.formatPercentuale(giorno.close_rate)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
