'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useOptimistic, useState, useTransition, type DragEvent } from 'react'
import { toast } from 'sonner'

import { creaContenuto, modificaCampoContenuto, type EsitoCampo } from '@/app/(app)/marketing/contenuti/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LinkBottone } from '@/components/link-bottone'
import { classeNome } from '@/components/marketing/badge-status'
import { TOAST_NEL_PANNELLO, usePannello } from '@/components/marketing/contesto-pannello'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import { Pillola } from '@/components/marketing/pillola'
import { ListaCard, type RigaContenuto } from '@/components/marketing/tabella-contenuti'
import { PuntoStatus, TagStatus } from '@/components/marketing/tag-status'
import { IndicatoreLink } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { Button } from '@/components/ui/button'
import { aggiungiMesi, primoDelMeseISO } from '@/lib/date'
import { formato } from '@/lib/format'
import { CALENDARIO_CONTENUTI } from '@/lib/i18n/testi/calendario-contenuti'
import { CONTENUTO, traduciErroreContenuto } from '@/lib/i18n/testi/contenuto'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import {
  ORDINE_STATUS,
  VISIBILI_PER_GIORNO,
  conPostDate,
  giorniConContenuti,
  grigliaMese,
  perGiorno,
  puntiDelGiorno,
  statiContati,
} from '@/lib/marketing/calendario'
import { ETICHETTA_STATUS, type CanalePiano, type StatusContenuto } from '@/lib/marketing/etichette'
import { opzioneDaValore } from '@/lib/marketing/opzioni'
import { NOME_NUOVA_RIGA, hrefContenuto, messaggioCampo } from '@/lib/marketing/pannello'
import { campoContenutoSchema } from '@/lib/validation/contenuto'
import { cn } from '@/lib/utils'

const PERCORSO = '/marketing/contenuti'
/** The type of the data a dragged card carries: only our cards are dropped on a day. */
const TIPO_TRASCINATO = 'application/x-alpha-contenuto'

function indirizzo(parametri: Record<string, string | undefined>): string {
  const cerca = new URLSearchParams()
  for (const [chiave, v] of Object.entries(parametri)) if (v) cerca.set(chiave, v)
  const testo = cerca.toString()
  return testo ? `${PERCORSO}?${testo}` : PERCORSO
}

/** "6": the day of the month, no leading zero. */
function numeroGiorno(iso: string): string {
  return String(Number(iso.slice(8, 10)))
}

function trascinaNostro(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes(TIPO_TRASCINATO)
}

/**
 * The «Calendario» view of the Piano editoriale (1.69.0, Dany, 31/10/2026: «la
 * parte di visualizzazione a calendario per i reel così capisco meglio… come su
 * notion bella focus»; and «con un pallino colorato o direttamente il tag con lo
 * status… devo avere tutta la panoramica chiara»). A month Monday to Sunday,
 * also the months ahead: it is the plan. Above it the legend of the Status, with
 * the month's number of each, every entry a filter with one tap.
 *
 * From 672px of section (container query, never the screen) a 7-column grid:
 * every content a small card with its Name, its Status as a tag (Notion's
 * colour, the icon and the whole name) and its Reel Type; at most 3 a day, then
 * «+N»; a «+» on every day creates a content with that Post Date and opens it
 * in the panel. A card dragged onto another day changes its Post Date
 * (optimistic, over the date it showed, back by itself if the server refuses);
 * the panel's Post Date is the way without dragging, and the hint says so.
 * Below 672px the mini month (a dot of its Status's colour for each content of
 * the day, at most 3, then «+») and the agenda of the days with contents. At
 * the bottom the contents without a Post Date.
 */
export function CalendarioContenuti({
  mese,
  oggi,
  righe,
  senzaData,
  totaleSenzaData,
  limiteSenzaData,
  conteggiStatus,
  statoFiltrato,
  parametri,
  filtrato,
  hrefTogliFiltri,
  hrefTabella,
  canale,
}: {
  /** 'YYYY-MM-01' */
  mese: string
  oggi: string
  /** The contents of the grid's days (Monday before the 1st to Sunday after the end), with the filters. */
  righe: readonly RigaContenuto[]
  senzaData: readonly RigaContenuto[]
  totaleSenzaData: number
  limiteSenzaData: number
  /** How many contents of the month for each Status, the Status filter left out (counted in SQL). */
  conteggiStatus: Record<StatusContenuto, number>
  /** The one Status filtered, if any: its entry of the legend is on. */
  statoFiltrato: StatusContenuto | null
  /** Filters, tab and ?vista as in the address (without the month): kept by every link. */
  parametri: Record<string, string | undefined>
  filtrato: boolean
  hrefTogliFiltri: string
  /** The table with the same filters: where the undated contents beyond the limit are. */
  hrefTabella: string
  canale: CanalePiano
}) {
  const lingua = useLingua()
  const t = CALENDARIO_CONTENUTI[lingua]
  const f = formato(lingua)
  const router = useRouter()
  const pannello = usePannello()
  const { opzioni } = useOpzioni()
  const idAiuto = useId()

  const [espansi, setEspansi] = useState<ReadonlySet<string>>(new Set())
  const [trascinato, setTrascinato] = useState<string | null>(null)
  const [sopra, setSopra] = useState<string | null>(null)
  const [creando, setCreando] = useState<string | null>(null)
  const [, avvia] = useTransition()
  // the grid as it will be: a dragged card already on its new day while the server answers
  const [mostrate, sposta] = useOptimistic(righe, (attuali: readonly RigaContenuto[], m: { id: string; data: string }) =>
    conPostDate(attuali, m.id, m.data),
  )

  const settimane = grigliaMese(mese, oggi)
  const { perData } = perGiorno(mostrate)
  const delMese = giorniConContenuti(perData, mese)
  const meseVuoto = delMese.length === 0
  const etichettaMese = f.formatMese(mese)
  const meseCorrente = primoDelMeseISO(oggi)
  const giornoProposto = meseCorrente === mese ? oggi : mese
  const parametriMese = { ...parametri, mese: undefined }

  function hrefMese(primo: string) {
    return indirizzo({ ...parametriMese, mese: primo.slice(0, 7) })
  }

  /** The legend's entry: that Status only, or (on already) the filter off; the month stays. */
  function hrefStatus(stato: StatusContenuto) {
    const attivo = statoFiltrato === stato
    return indirizzo({ ...parametri, gruppo: undefined, stato: attivo ? undefined : stato, mese: mese.slice(0, 7) })
  }

  function espandi(data: string) {
    setEspansi((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(data)) dopo.delete(data)
      else dopo.add(data)
      return dopo
    })
  }

  function nomeReelType(valore: string | null): string | null {
    return opzioneDaValore(opzioni.reel_type, valore)?.nome ?? null
  }

  /** «+» on a day: a content with that Post Date, at once, open in the panel to write its Name (as Notion). */
  async function crea(data: string, da: HTMLElement) {
    if (creando) return
    setCreando(data)
    try {
      const tipo = canale === 'youtube' ? 'youtube' : 'reel'
      const esito = await creaContenuto({ tipo, nome: NOME_NUOVA_RIGA, stato: 'not_started', post_date: data })
      if (!esito.ok) {
        toast.error(traduciErroreContenuto(esito.errore, lingua))
        return
      }
      // the panel opens next: its toaster, never over the panel's X nor over the bottom bar
      toast.success(t.creato, pannello ? TOAST_NEL_PANNELLO : undefined)
      if (!pannello) {
        router.push(hrefContenuto(esito.id))
        return
      }
      const adesso = new Date().toISOString()
      pannello.apri(esito.id, {
        da,
        riga: {
          id: esito.id,
          tipo,
          nome: NOME_NUOVA_RIGA,
          reel_type: null,
          formato: null,
          inspiration: null,
          stato: 'not_started',
          post_date: data,
          audio: null,
          url: null,
          view_count: null,
          created_at: adesso,
          updated_at: esito.versione,
        },
      })
    } catch {
      toast.error(t.connessione)
    } finally {
      setCreando(null)
    }
  }

  /**
   * A card dropped on another day: its Post Date, with the same core as the
   * cells (modificaCampoContenuto over the date the card showed). The card is
   * on its new day at once; if the server refuses it goes back by itself and
   * the toast says why.
   */
  function spostaSu(id: string, data: string) {
    const riga = mostrate.find((r) => r.id === id)
    if (!riga || riga.post_date === data) return
    const prima = riga.post_date
    const letto = campoContenutoSchema.safeParse({ id, campo: 'post_date', valore: data, prima })
    if (!letto.success) {
      toast.error(traduciErroreContenuto(letto.error.issues[0]?.message ?? 'Dati non validi.', lingua))
      return
    }
    // the day it lands on shows all its contents: the card is never hidden behind «+N»
    setEspansi((s) => new Set(s).add(data))
    avvia(async () => {
      sposta({ id, data })
      let esito: EsitoCampo
      try {
        esito = await modificaCampoContenuto({ id, campo: 'post_date', valore: data, prima })
      } catch {
        toast.error(CONTENUTO[lingua].connessione)
        return
      }
      if (esito.ok) {
        pannello?.aggiornaCampo(id, 'post_date', esito.valore, esito.versione)
        toast.success(messaggioCampo('post_date', esito.valore, opzioni, lingua))
        return
      }
      if (esito.cambiato) pannello?.aggiornaCampo(id, 'post_date', esito.cambiato.valore, esito.cambiato.versione)
      if (esito.sparito) pannello?.segnaSparito(id)
      toast.error(traduciErroreContenuto(esito.errore, lingua))
    })
  }

  function suDragOver(e: DragEvent<HTMLTableCellElement>, data: string) {
    if (!trascinaNostro(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (sopra !== data) setSopra(data)
  }

  function suDragLeave(e: DragEvent<HTMLTableCellElement>, data: string) {
    const verso = e.relatedTarget as Node | null
    if (verso && e.currentTarget.contains(verso)) return
    if (sopra === data) setSopra(null)
  }

  function suDrop(e: DragEvent<HTMLTableCellElement>, data: string) {
    if (!trascinaNostro(e)) return
    e.preventDefault()
    const id = e.dataTransfer.getData(TIPO_TRASCINATO)
    setSopra(null)
    setTrascinato(null)
    if (id) spostaSu(id, data)
  }

  const classeNav =
    'inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

  return (
    <div className="space-y-4">
      {/* the month, as Notion's calendar: its name big, then ‹ Oggi › */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight first-letter:uppercase" aria-live="polite">
          {etichettaMese}
        </h3>
        <nav aria-label={t.scegliMese} className="-mr-1 flex items-center gap-1">
          <Link href={hrefMese(aggiungiMesi(mese, -1))} scroll={false} aria-label={t.mesePrecedente} className={classeNav}>
            <IndicatoreLink className="size-5" riposo={<ChevronLeft className="size-5" aria-hidden="true" />} />
          </Link>
          <Link
            href={hrefMese(meseCorrente)}
            scroll={false}
            aria-label={t.oggiAria}
            aria-current={mese === meseCorrente ? 'date' : undefined}
            className="inline-flex h-11 items-center rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t.oggi}
          </Link>
          <Link href={hrefMese(aggiungiMesi(mese, 1))} scroll={false} aria-label={t.meseSuccessivo} className={classeNav}>
            <IndicatoreLink className="size-5" riposo={<ChevronRight className="size-5" aria-hidden="true" />} />
          </Link>
        </nav>
      </div>

      {/* the legend: what each colour is, the month's number of each, and the filter with one tap */}
      <section aria-labelledby={`${idAiuto}-legenda`} className="space-y-1.5">
        <h4 id={`${idAiuto}-legenda`} className="text-xs text-muted-foreground">
          {t.legenda}
        </h4>
        <ul className="flex flex-wrap gap-1.5">
          {ORDINE_STATUS.map((stato) => {
            const n = conteggiStatus[stato] ?? 0
            const attiva = statoFiltrato === stato
            return (
              <li key={stato}>
                <Link
                  href={hrefStatus(stato)}
                  scroll={false}
                  aria-label={t.voceLegenda(ETICHETTA_STATUS[stato], n, attiva)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-sm transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    attiva ? 'border-foreground/40 bg-accent' : 'border-transparent',
                    n === 0 && !attiva && 'opacity-60',
                  )}
                >
                  <TagStatus stato={stato} className="text-xs" />
                  <span className="num text-muted-foreground">{f.formatNumero(n)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t.legendaAiuto}</p>
      </section>

      {meseVuoto ? (
        <StatoVuoto
          Icona={CalendarDays}
          titolo={t.vuotoMese(etichettaMese)}
          descrizione={filtrato ? t.vuotoMeseFiltri : t.vuotoMeseDescrizione}
          azione={
            filtrato ? (
              <LinkBottone href={hrefTogliFiltri} variant="outline" scroll={false}>
                {MARKETING[lingua].piano.togliFiltri}
              </LinkBottone>
            ) : (
              <Button
                type="button"
                className="h-11"
                aria-busy={creando !== null || undefined}
                disabled={creando !== null}
                onClick={(e) => void crea(giornoProposto, e.currentTarget)}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t.nuovoContenuto}
              </Button>
            )
          }
        />
      ) : null}

      {/* from 672px of section: the month grid */}
      <div className="hidden space-y-2 @2xl:block">
        <p id={idAiuto} className="text-xs text-muted-foreground">
          {t.trascina}
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full table-fixed border-collapse text-xs">
            <caption className="sr-only">{t.caption(etichettaMese)}</caption>
            <thead>
              <tr className="border-b border-border bg-card">
                {t.giorniBrevi.map((g, i) => (
                  <th key={g} scope="col" className="py-2 text-center text-xs font-normal text-muted-foreground">
                    <abbr title={t.giorniLunghi[i]} className="no-underline">
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
                        data-giorno={g.data}
                        onDragOver={(e) => suDragOver(e, g.data)}
                        onDragLeave={(e) => suDragLeave(e, g.data)}
                        onDrop={(e) => suDrop(e, g.data)}
                        className={cn(
                          'group h-36 border-t border-l border-border p-1 align-top transition-colors first:border-l-0',
                          !g.delMese && 'bg-muted/30',
                          sopra === g.data && 'bg-accent/60 ring-2 ring-ring/50 ring-inset',
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
                            aria-label={t.nuovoPer(g.data)}
                            title={t.nuovoPer(g.data)}
                            aria-busy={creando === g.data || undefined}
                            disabled={creando !== null}
                            onClick={(e) => void crea(g.data, e.currentTarget)}
                            className={cn(
                              'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:opacity-100',
                              creando === g.data && 'opacity-100',
                            )}
                          >
                            <Plus className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        {visibili.length > 0 ? (
                          <ul className={cn('-mt-2 space-y-1', !g.delMese && 'opacity-75')}>
                            {visibili.map((r) => {
                              const reelType = nomeReelType(r.reel_type)
                              return (
                                <li
                                  key={r.id}
                                  data-riga-contenuto={r.id}
                                  data-nome-contenuto={r.nome}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData(TIPO_TRASCINATO, r.id)
                                    e.dataTransfer.effectAllowed = 'move'
                                    setTrascinato(r.id)
                                  }}
                                  onDragEnd={() => {
                                    setTrascinato(null)
                                    setSopra(null)
                                  }}
                                  className={cn('cursor-grab active:cursor-grabbing', trascinato === r.id && 'opacity-40')}
                                >
                                  <LinkContenuto
                                    id={r.id}
                                    riga={r}
                                    draggable={false}
                                    aria-label={t.card(r.nome, ETICHETTA_STATUS[r.stato], reelType)}
                                    aria-describedby={idAiuto}
                                    title={r.nome}
                                    className="block space-y-1 rounded-md border border-border/70 bg-card px-1.5 py-1.5 leading-tight shadow-xs transition-colors hover:border-border hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                                  >
                                    <span className={cn('line-clamp-2 font-medium wrap-anywhere', classeNome(r.stato))}>
                                      {r.nome}
                                    </span>
                                    <span className="flex flex-wrap gap-1">
                                      <TagStatus stato={r.stato} />
                                      {reelType ? (
                                        <Pillola
                                          nome={reelType}
                                          colore={opzioneDaValore(opzioni.reel_type, r.reel_type)?.colore ?? 'default'}
                                          className="px-1.5 text-[11px] leading-4"
                                        />
                                      ) : null}
                                    </span>
                                  </LinkContenuto>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                        {altri > 0 ? (
                          // the name starts with the words on screen (WCAG 2.5.3): "+2 altri contenuti di …"
                          <button
                            type="button"
                            aria-expanded={tutti}
                            onClick={() => espandi(g.data)}
                            className="mt-1 inline-flex min-h-7 items-center rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
                          >
                            {tutti ? t.mostraMeno : `+${altri}`}
                            <span className="sr-only">{tutti ? t.menoDopo(g.data) : t.altriDopo(altri, g.data)}</span>
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
      </div>

      {/* below 672px of section: the mini month with a dot per content, then the agenda */}
      <div className="space-y-5 @2xl:hidden">
        <table className="mx-auto table-fixed border-collapse">
          <caption className="sr-only">{t.miniMese(etichettaMese)}</caption>
          <thead>
            <tr>
              {t.giorniBrevi.map((g, i) => (
                <th key={g} scope="col" className="w-11 pb-1 text-center text-xs font-normal text-muted-foreground">
                  <abbr title={t.giorniLunghi[i]} className="no-underline">
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
                  const delGiorno = g.delMese ? (perData.get(g.data) ?? []) : []
                  const stati = delGiorno.map((r) => r.stato)
                  const { punti, altri } = puntiDelGiorno(stati)
                  const classi = cn(
                    'relative mx-auto flex size-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm',
                    g.oggi && 'font-semibold ring-1 ring-primary',
                    !g.delMese && 'text-muted-foreground/50',
                  )
                  const contenutoCella = (
                    <>
                      <span className="num leading-none">{numeroGiorno(g.data)}</span>
                      <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                        {punti.map((s, i) => (
                          <PuntoStatus key={i} stato={s} />
                        ))}
                        {altri > 0 ? <span className="text-[9px] leading-none text-muted-foreground">+</span> : null}
                      </span>
                    </>
                  )
                  return (
                    <td key={g.data} className="p-0 text-center">
                      {delGiorno.length > 0 ? (
                        <a
                          href={`#giorno-${g.data}`}
                          aria-label={t.giornoConContenuti(
                            g.data,
                            delGiorno.length,
                            statiContati(stati)
                              .map(({ stato, n }) => `${ETICHETTA_STATUS[stato]} ${n}`)
                              .join(', '),
                          )}
                          aria-current={g.oggi ? 'date' : undefined}
                          className={cn(
                            classi,
                            'hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          )}
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

        {meseVuoto ? null : (
          <div className="space-y-5">
            {delMese.map((data) => (
              <section key={data} aria-labelledby={`giorno-${data}`} className="space-y-2">
                <h4 id={`giorno-${data}`} className="scroll-mt-20 text-sm font-medium">
                  {t.titoloGiorno(data, oggi)}
                </h4>
                <ListaCard righe={perData.get(data) ?? []} />
              </section>
            ))}
          </div>
        )}
      </div>

      {totaleSenzaData > 0 ? (
        <section aria-labelledby="senza-data" className="space-y-2 pt-2">
          <h3 id="senza-data" className="text-sm font-medium">
            {t.senzaData} <span className="num text-muted-foreground">({f.formatNumero(totaleSenzaData)})</span>
          </h3>
          <ListaCard righe={senzaData} />
          {totaleSenzaData > limiteSenzaData ? (
            <p className="text-sm text-muted-foreground">
              {t.altriSenzaData(f.formatNumero(totaleSenzaData - senzaData.length))}{' '}
              <Link href={hrefTabella} className="font-medium text-foreground underline underline-offset-4">
                {t.usaTabella}
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
