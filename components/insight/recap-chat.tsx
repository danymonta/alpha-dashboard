'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { useAnnuncia } from '@/components/insight/annunci'
import type { ContenutoCalendario } from '@/components/insight/arriva-da'
import { ContentRecapSezione } from '@/components/insight/content-recap'
import { FattiProvider } from '@/components/insight/fatti'
import { NumeriFiltro } from '@/components/insight/numeri-filtro'
import { useAdessoMinuto } from '@/components/insight/orologio'
import type { LeadScheda } from '@/components/insight/scheda-lead'
import {
  AvvisoParziale,
  DaRiattivare,
  ElencoNonLead,
  EscluseRecap,
  GruppiPriorita,
  Obiezioni,
  Verdetto,
} from '@/components/insight/sezioni'
import { Button } from '@/components/ui/button'
import { annoDelRecap, attesaLead } from '@/lib/insight/attesa'
import type { Fonte } from '@/lib/insight/canale'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { applicaFiltro, CHIAVI_FILTRO, contaFiltro, type ChiaveFiltro } from '@/lib/insight/filtri'
import { ordinaPerPriorita } from '@/lib/insight/priorita'
import type { RecapLetto } from '@/lib/insight/recap'

export type PropsRecapChat = {
  recap: RecapLetto
  fonte: Fonte
  /** the recap's Rome day ('YYYY-MM-DD'): the Fatto switches belong to it */
  giorno: string
  /** the keys marked Fatto when the page was read */
  fatti: readonly string[]
  admin: boolean
  /** the server's instant (ISO): «aspetta da» of the first render only (D11) */
  adesso: string
  /** admin only: shortcode → calendar content; {} for the setter */
  calendario: Record<string, ContenutoCalendario>
}

/**
 * The Instagram and Messenger tabs of the Insight, the artifact "Recap DM
 * Alpha" section by section: the verdict, the five numbers that filter, the
 * chats by priority (or the filtered ones), «Da riattivare», «Obiezioni
 * aperte», «Content», «Escluse dal recap». The page's one large client
 * component: the bubbles of a chat render only once it is opened.
 *
 * The filter is this component's state: another day or tab starts again
 * from all the chats (the page gives it a new key), as the artifact.
 */
export function RecapChat(props: PropsRecapChat) {
  return (
    <FattiProvider fonte={props.fonte} giorno={props.giorno} iniziali={props.fatti}>
      <Contenuto {...props} />
    </FattiProvider>
  )
}

function Contenuto({ recap, fonte, admin, adesso, calendario, giorno }: PropsRecapChat) {
  const annuncia = useAnnuncia()
  const lingua = useLingua()
  const t = INSIGHT_RECAP[lingua]
  const FILTRI = t.filtri as Record<ChiaveFiltro, { etichetta: string; titolo: string }>
  const [filtro, setFiltro] = useState<ChiaveFiltro | null>(null)
  const tessere = useRef<Partial<Record<ChiaveFiltro, HTMLButtonElement | null>>>({})
  const sezioneFiltrata = useRef<HTMLElement>(null)
  // set by a tap that turns a filter on: the effect scrolls to the filtered chats once they are there
  const daScorrere = useRef(false)

  const adessoMs = useAdessoMinuto(Date.parse(adesso))
  const anno = annoDelRecap(giorno, new Date(Date.parse(adesso)).getUTCFullYear())

  const leads = useMemo(() => ordinaPerPriorita(recap.leads), [recap.leads])
  const conteggi = useMemo(
    () =>
      Object.fromEntries(CHIAVI_FILTRO.map((k) => [k, contaFiltro(k, leads, recap.non_leads)])) as Record<
        ChiaveFiltro,
        number
      >,
    [leads, recap.non_leads],
  )

  const attesaDi = useCallback((lead: LeadScheda) => attesaLead(lead, adessoMs, anno), [adessoMs, anno])
  const contenutoDi = useCallback(
    (lead: LeadScheda) => (lead.origine?.shortcode ? (calendario[lead.origine.shortcode] ?? null) : null),
    [calendario],
  )

  useEffect(() => {
    if (!filtro || !daScorrere.current) return
    daScorrere.current = false
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sezioneFiltrata.current?.scrollIntoView({ block: 'start', behavior: ridotto ? 'auto' : 'smooth' })
  }, [filtro])

  function scegli(chiave: ChiaveFiltro) {
    if (filtro === chiave) {
      togli(chiave)
      return
    }
    daScorrere.current = true
    setFiltro(chiave)
    annuncia(t.annuncioFiltro(FILTRI[chiave].titolo, conteggi[chiave]))
  }

  /** The filter off (its tile again, or «Mostra tutto»): the focus back on its tile, as the artifact. */
  function togli(chiave: ChiaveFiltro) {
    setFiltro(null)
    annuncia(t.annuncioFiltroTolto)
    const tessera = tessere.current[chiave]
    tessera?.focus({ preventScroll: true })
    tessera?.scrollIntoView({ block: 'nearest' })
  }

  const schede = { fonte, attesaDi, contenutoDi }
  const filtrate = filtro ? applicaFiltro(filtro, leads) : []

  return (
    <>
      <Verdetto testo={recap.headline} />
      {recap.stato === 'parziale' ? <AvvisoParziale admin={admin} avvisi={recap.avvisi} fonte={fonte} /> : null}

      <NumeriFiltro conteggi={conteggi} attivo={filtro} onScegli={scegli} riferimenti={tessere} />

      {filtro ? (
        <section
          ref={sezioneFiltrata}
          aria-labelledby="titolo-filtrate"
          className="grid scroll-mt-20 gap-3.5 md:scroll-mt-4"
          data-testid="sezione-filtrata"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titolo-filtrate" className="text-lg font-semibold">
              {FILTRI[filtro].titolo} <span className="num text-sm font-normal text-muted-foreground">{conteggi[filtro]}</span>
            </h2>
            <Button type="button" variant="outline" className="h-11 px-3" onClick={() => togli(filtro)}>
              {t.numeri.mostraTutto}
            </Button>
          </div>
          {filtrate.length ? (
            <GruppiPriorita leads={filtrate} {...schede} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.numeri.nessunaInCategoria}</p>
          )}
          {filtro === 'tutte' && recap.non_leads.length ? (
            <div className="grid gap-2 rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase">{t.titoloNonLead(recap.non_leads.length)}</h3>
              <ElencoNonLead voci={recap.non_leads} fonte={fonte} />
            </div>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="titolo-priorita" className="grid gap-3.5">
          <h2 id="titolo-priorita" className="text-lg font-semibold">
            {t.leads.titolo} <span className="num text-sm font-normal text-muted-foreground">{leads.length}</span>
          </h2>
          {leads.length ? (
            <GruppiPriorita leads={leads} {...schede} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.leads.vuoto}</p>
          )}
        </section>
      )}

      {!filtro ? <DaRiattivare voci={recap.reactivate} {...schede} /> : null}
      <Obiezioni voci={recap.objections} fonte={fonte} />
      <ContentRecapSezione content={recap.content} calendario={calendario} lingua={lingua} />
      {!filtro ? (
        <EscluseRecap voci={recap.non_leads} escluse={recap.escluse} fonte={fonte} admin={admin} />
      ) : null}
    </>
  )
}
