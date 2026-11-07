'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { useAnnuncia } from '@/components/insight/annunci'
import type { ContenutoCalendario } from '@/components/insight/arriva-da'
import { CercaPersona } from '@/components/insight/cerca-persona'
import { ContentRecapSezione } from '@/components/insight/content-recap'
import { GruppiDivisione, SceltaDivisione } from '@/components/insight/divisioni'
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
import { cercaChat, paroleRicerca } from '@/lib/insight/cerca'
import type { Fonte } from '@/lib/insight/canale'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { contaDivisioni, type ChiaveDivisione } from '@/lib/insight/divisioni'
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
  const [divisione, setDivisione] = useState<ChiaveDivisione>('tutte')
  // «Cerca una persona» (1.71.0): while there is a query, its results take the place of the list
  const [cerca, setCerca] = useState('')
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

  const conteggiDivisioni = useMemo(() => contaDivisioni(leads, recap.reactivate), [leads, recap.reactivate])
  const tutteLeChat = useMemo<LeadScheda[]>(() => [...leads, ...recap.reactivate], [leads, recap.reactivate])

  const attesaDi = useCallback((lead: LeadScheda) => attesaLead(lead, adessoMs, anno), [adessoMs, anno])
  const contenutoDi = useCallback(
    (lead: LeadScheda) => (lead.origine?.shortcode ? (calendario[lead.origine.shortcode] ?? null) : null),
    [calendario],
  )

  /** The urgency inside a division: hours of waiting, else days of silence or hours since our last message. */
  const urgenzaDi = useCallback(
    (lead: LeadScheda) => {
      const attesa = attesaLead(lead, adessoMs, anno)
      if (attesa) return attesa.ore
      if (lead.days_silent !== undefined) return lead.days_silent * 24
      const ultimo = Date.parse(lead.last_message_at)
      return Number.isNaN(ultimo) ? null : Math.max(0, (adessoMs - ultimo) / 3_600_000)
    },
    [adessoMs, anno],
  )

  const trovate = useMemo(
    () => cercaChat(cerca, [leads, recap.reactivate], recap.non_leads),
    [cerca, leads, recap.reactivate, recap.non_leads],
  )
  const cercando = paroleRicerca(cerca).length > 0
  const quanteTrovate = trovate.leads.length + trovate.nonLeads.length

  // the count is said once typing pauses, never at every letter
  useEffect(() => {
    if (!cercando) return
    const id = window.setTimeout(() => annuncia(t.cerca.annuncio(quanteTrovate)), 700)
    return () => window.clearTimeout(id)
  }, [cercando, quanteTrovate, annuncia, t])

  function scegliDivisione(chiave: ChiaveDivisione) {
    setDivisione(chiave)
    annuncia(t.annuncioDivisione(t.divisioni[chiave]?.titolo ?? chiave, chiave === 'tutte' ? leads.length : conteggiDivisioni[chiave]))
  }

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
    setCerca('')
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

      {tutteLeChat.length || recap.non_leads.length ? <CercaPersona valore={cerca} onCambia={setCerca} /> : null}

      <NumeriFiltro conteggi={conteggi} attivo={filtro} onScegli={scegli} riferimenti={tessere} />

      {cercando ? (
        <section aria-labelledby="titolo-ricerca" className="grid gap-3.5" data-testid="risultati-ricerca">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titolo-ricerca" className="text-lg font-semibold [overflow-wrap:anywhere]">
              {t.cerca.titolo(cerca.trim())}{' '}
              <span className="num text-sm font-normal text-muted-foreground">{quanteTrovate}</span>
            </h2>
            <Button type="button" variant="outline" className="h-11 px-3" onClick={() => setCerca('')}>
              {t.cerca.togli}
            </Button>
          </div>
          {trovate.leads.length ? <GruppiPriorita leads={trovate.leads} {...schede} /> : null}
          {trovate.nonLeads.length ? (
            <div className="grid gap-2 rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase">{t.cerca.nonLead}</h3>
              <ElencoNonLead voci={trovate.nonLeads} fonte={fonte} />
            </div>
          ) : null}
          {quanteTrovate === 0 ? (
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{t.cerca.nessuno(cerca.trim())}</p>
          ) : null}
        </section>
      ) : filtro ? (
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
        <>
          {tutteLeChat.length ? (
            <SceltaDivisione conteggi={conteggiDivisioni} attiva={divisione} onScegli={scegliDivisione} />
          ) : null}
          {divisione === 'tutte' ? (
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
          ) : (
            <section aria-labelledby="titolo-divisione" className="grid gap-3.5" data-testid={`divisione-${divisione}`}>
              <h2 id="titolo-divisione" className="text-lg font-semibold">
                {t.divisioni[divisione]?.titolo}{' '}
                <span className="num text-sm font-normal text-muted-foreground">{conteggiDivisioni[divisione]}</span>
              </h2>
              <GruppiDivisione divisione={divisione} voci={tutteLeChat} urgenza={urgenzaDi} {...schede} />
            </section>
          )}
        </>
      )}

      {!cercando && !filtro && divisione === 'tutte' ? <DaRiattivare voci={recap.reactivate} {...schede} /> : null}
      <Obiezioni voci={recap.objections} fonte={fonte} />
      <ContentRecapSezione content={recap.content} calendario={calendario} lingua={lingua} />
      {!cercando && !filtro ? (
        <EscluseRecap voci={recap.non_leads} escluse={recap.escluse} fonte={fonte} admin={admin} />
      ) : null}
    </>
  )
}
