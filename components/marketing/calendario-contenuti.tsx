'use client'

import { CalendarDays, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { BadgeStatus, classeNome } from '@/components/marketing/badge-status'
import { NuovoContenuto } from '@/components/marketing/nuovo-contenuto'
import { ListaCard, linkContenuto, type RigaContenuto } from '@/components/marketing/tabella-contenuti'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { Button } from '@/components/ui/button'
import { fineMese, nomeGiorno, primoDelMeseISO } from '@/lib/date'
import { formatMese, formatNumero } from '@/lib/format'
import { VISIBILI_PER_GIORNO, grigliaMese, perGiorno } from '@/lib/marketing/calendario'
import { ETICHETTA_STATUS } from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'

const GIORNI_SETTIMANA = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const
const NOMI_GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const

/** "lunedì 06/10". */
function giornoLungo(iso: string): string {
  return `${nomeGiorno(iso)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** "6": the day of the month, no leading zero. */
function numeroGiorno(iso: string): string {
  return String(Number(iso.slice(8, 10)))
}

function contenuti(n: number): string {
  return n === 1 ? '1 contenuto' : `${n} contenuti`
}

/**
 * The "Calendario" view, a month Monday to Sunday (also the months ahead: it is
 * the plan). From 672px of section (container query) a 7-column grid with up
 * to 3 contents a day, "+N" for the rest and a "+" that creates a content on
 * that day; below, a mini month (a dot under the days with contents, a tap
 * goes to the day) and the agenda of the days with contents. At the bottom
 * the contents without a Post Date.
 */
export function CalendarioContenuti({
  mese,
  oggi,
  righe,
  senzaData,
  totaleSenzaData,
  limiteSenzaData,
  parametri,
  filtrato,
  hrefTogliFiltri,
  hrefTabella,
}: {
  /** 'YYYY-MM-01' */
  mese: string
  oggi: string
  /** The contents of the grid's days (Monday before the 1st to Sunday after the end), with the filters. */
  righe: readonly RigaContenuto[]
  senzaData: readonly RigaContenuto[]
  totaleSenzaData: number
  limiteSenzaData: number
  /** The filters and ?vista, kept by the month selector. */
  parametri: Record<string, string | undefined>
  filtrato: boolean
  hrefTogliFiltri: string
  /** The table with the same filters: where the undated contents beyond the limit are. */
  hrefTabella: string
}) {
  // one "Nuovo contenuto" sheet for every day of the grid
  const [nuovoPer, setNuovoPer] = useState<string | null>(null)
  const [aperto, setAperto] = useState(false)
  const [espansi, setEspansi] = useState<ReadonlySet<string>>(new Set())

  const settimane = grigliaMese(mese, oggi)
  const { perData } = perGiorno(righe)
  const fine = fineMese(mese)
  const delMese = [...perData.keys()].filter((d) => d >= mese && d <= fine).sort()
  const meseVuoto = delMese.length === 0

  function nuovo(data: string) {
    setNuovoPer(data)
    setAperto(true)
  }

  function espandi(data: string) {
    setEspansi((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(data)) dopo.delete(data)
      else dopo.add(data)
      return dopo
    })
  }

  // the empty month's button: today if the month is this one, otherwise its first day
  const giornoProposto = primoDelMeseISO(oggi) === mese ? oggi : mese

  return (
    <div className="space-y-4">
      <SelettoreMese mese={mese} meseCorrente={primoDelMeseISO(oggi)} futuro percorso="/marketing/contenuti" parametri={parametri} />

      {meseVuoto ? (
        <StatoVuoto
          Icona={CalendarDays}
          titolo={`Niente in calendario a ${formatMese(mese)}`}
          descrizione={
            filtrato
              ? 'Con questi filtri non c’è niente in questo mese: toglili o cambia mese.'
              : 'Aggiungi un contenuto con la sua Post Date.'
          }
          azione={
            filtrato ? (
              <LinkBottone href={hrefTogliFiltri} variant="outline" scroll={false}>
                Togli i filtri
              </LinkBottone>
            ) : (
              <Button type="button" className="h-11" onClick={() => nuovo(giornoProposto)}>
                <Plus className="size-4" aria-hidden="true" />
                Nuovo contenuto
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* from 672px of section: the month grid */}
          <div className="hidden overflow-hidden rounded-xl border border-border @2xl:block">
            <table className="w-full table-fixed border-collapse text-xs">
              <caption className="sr-only">Contenuti di {formatMese(mese)}, per giorno</caption>
              <thead>
                <tr className="bg-card">
                  {GIORNI_SETTIMANA.map((g, i) => (
                    <th key={g} scope="col" className="py-2 text-center font-normal text-muted-foreground">
                      <abbr title={NOMI_GIORNI[i]} className="no-underline">
                        {g}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settimane.map((settimana) => (
                  <tr key={settimana[0].data}>
                    {settimana.map((g) => {
                      const delGiorno = perData.get(g.data) ?? []
                      const tutti = espansi.has(g.data)
                      const visibili = tutti ? delGiorno : delGiorno.slice(0, VISIBILI_PER_GIORNO)
                      const altri = delGiorno.length - VISIBILI_PER_GIORNO
                      return (
                        <td
                          key={g.data}
                          className={cn(
                            'group h-32 border-t border-l border-border p-1 align-top first:border-l-0',
                            !g.delMese && 'bg-background/60',
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span
                              aria-current={g.oggi ? 'date' : undefined}
                              className={cn(
                                'num mt-1 ml-1 inline-flex size-6 items-center justify-center rounded-full text-xs',
                                g.oggi
                                  ? 'bg-primary font-semibold text-primary-foreground'
                                  : g.delMese
                                    ? 'text-foreground'
                                    : 'text-muted-foreground/70',
                              )}
                            >
                              {numeroGiorno(g.data)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Nuovo contenuto per ${giornoLungo(g.data)}`}
                              title={`Nuovo contenuto per ${giornoLungo(g.data)}`}
                              onClick={() => nuovo(g.data)}
                              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:opacity-100"
                            >
                              <Plus className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                          {visibili.length > 0 ? (
                            <ul className={cn('-mt-2 space-y-0.5', !g.delMese && 'opacity-70')}>
                              {visibili.map((r) => (
                                <li key={r.id}>
                                  <Link
                                    href={linkContenuto(r.id)}
                                    aria-label={`${r.nome}, ${ETICHETTA_STATUS[r.stato]}`}
                                    title={r.nome}
                                    className="flex min-h-7 items-start gap-1 rounded-md bg-card px-1.5 py-1 leading-tight hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
                                  >
                                    <BadgeStatus stato={r.stato} soloIcona className="mt-px" />
                                    <span className={cn('line-clamp-2 min-w-0 break-words', classeNome(r.stato))}>{r.nome}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {altri > 0 ? (
                            // the name starts with the words on screen (WCAG 2.5.3): "+2 altri contenuti di …"
                            <button
                              type="button"
                              aria-expanded={tutti}
                              onClick={() => espandi(g.data)}
                              className="mt-0.5 inline-flex min-h-7 items-center rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
                            >
                              {tutti ? 'Mostra meno' : `+${altri}`}
                              <span className="sr-only">
                                {tutti
                                  ? ` contenuti di ${giornoLungo(g.data)}`
                                  : ` ${altri === 1 ? 'altro contenuto' : 'altri contenuti'} di ${giornoLungo(g.data)}`}
                              </span>
                            </button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* below 672px of section: the mini month, then the agenda */}
          <div className="space-y-5 @2xl:hidden">
            <table className="mx-auto table-fixed border-collapse">
              <caption className="sr-only">{formatMese(mese)}: i giorni con un punto hanno contenuti</caption>
              <thead>
                <tr>
                  {GIORNI_SETTIMANA.map((g, i) => (
                    <th key={g} scope="col" className="w-11 pb-1 text-center text-xs font-normal text-muted-foreground">
                      <abbr title={NOMI_GIORNI[i]} className="no-underline">
                        {g}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settimane.map((settimana) => (
                  <tr key={settimana[0].data}>
                    {settimana.map((g) => {
                      const n = g.delMese ? (perData.get(g.data)?.length ?? 0) : 0
                      const classi = cn(
                        'relative mx-auto flex size-11 flex-col items-center justify-center rounded-lg text-sm',
                        g.oggi && 'ring-1 ring-primary font-semibold',
                        !g.delMese && 'text-muted-foreground/50',
                      )
                      const contenutoCella = (
                        <>
                          <span className="num">{numeroGiorno(g.data)}</span>
                          {n > 0 ? (
                            <span aria-hidden="true" className="absolute bottom-1.5 size-1.5 rounded-full bg-foreground" />
                          ) : null}
                        </>
                      )
                      return (
                        <td key={g.data} className="p-0 text-center">
                          {n > 0 ? (
                            <a
                              href={`#giorno-${g.data}`}
                              aria-label={`${giornoLungo(g.data)}, ${contenuti(n)}`}
                              aria-current={g.oggi ? 'date' : undefined}
                              className={cn(classi, 'hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none')}
                            >
                              {contenutoCella}
                            </a>
                          ) : (
                            <span aria-current={g.oggi ? 'date' : undefined} className={classi}>
                              {contenutoCella}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-5">
              {delMese.map((data) => (
                <section key={data} aria-labelledby={`giorno-${data}`} className="space-y-2">
                  <h3 id={`giorno-${data}`} className="scroll-mt-20 text-sm font-medium">
                    {data === oggi ? `Oggi, ${giornoLungo(data)}` : giornoLungo(data).replace(/^./, (c) => c.toUpperCase())}
                  </h3>
                  <ListaCard righe={perData.get(data) ?? []} conData={false} />
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      {totaleSenzaData > 0 ? (
        <section aria-labelledby="senza-data" className="space-y-2 pt-2">
          <h2 id="senza-data" className="text-sm font-medium">
            Senza data <span className="num text-muted-foreground">({formatNumero(totaleSenzaData)})</span>
          </h2>
          <ListaCard righe={senzaData} />
          {totaleSenzaData > limiteSenzaData ? (
            <p className="text-sm text-muted-foreground">
              E altri {formatNumero(totaleSenzaData - senzaData.length)}:{' '}
              <Link href={hrefTabella} className="font-medium text-foreground underline underline-offset-4">
                usa la Tabella
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <NuovoContenuto
        senzaTrigger
        aperto={aperto}
        onApertoChange={setAperto}
        postDate={nuovoPer}
      />
    </div>
  )
}
