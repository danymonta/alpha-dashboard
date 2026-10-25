'use client'

import { RotateCw, SearchX } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ChiudiPannello } from '@/components/marketing/analisi/chiudi-pannello'
import { ContestoPannelloReel, type AzioniPannelloReel } from '@/components/marketing/analisi/contesto-reel'
import { SchedaReel } from '@/components/marketing/analisi/scheda-reel'
import { NelPannello } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useTesti } from '@/components/i18n/lingua-provider'
import { ANALISI_REEL } from '@/lib/i18n/testi/analisi-reel'
import type { DettaglioReel } from '@/lib/marketing/analisi/dettaglio'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { PARAMETRO_REEL } from '@/lib/marketing/pubblicati/filtri'
import { eMediaId, urlConReel, urlSenzaReel } from '@/lib/marketing/analisi/pannello'

/** A preload stays good this long. */
const VALIDITA_PRECARICO_MS = 20_000
/** While an analysis or a reading is going, the panel reads its detail again this often. */
const SONDAGGIO_MS = 6_000

/** What the page read for ?reel with this render. */
export type DettaglioReelIniziale = { id: string; dettaglio: DettaglioReel | null } | { id: string; errore: true } | null

type Risultato = { esito: 'pronto'; dettaglio: DettaglioReel } | { esito: 'sparito' } | { esito: 'errore' } | { esito: 'annullato' }
type Voce = { dettaglio?: DettaglioReel; stato: 'pronto' | 'sparito' | 'errore' }
type Lettura = { promessa: Promise<Risultato>; quando: number; controllo: AbortController; conclusa: boolean }

async function leggi(id: string, controllo: AbortController): Promise<Risultato> {
  try {
    const risposta = await fetch(`/api/marketing/analisi/${id}`, {
      signal: controllo.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (risposta.status === 404) return { esito: 'sparito' }
    // a session gone sends the login page: never a detail
    if (!risposta.ok || risposta.redirected || !risposta.headers.get('content-type')?.includes('application/json')) {
      return { esito: 'errore' }
    }
    return { esito: 'pronto', dettaglio: (await risposta.json()) as DettaglioReel }
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? { esito: 'annullato' } : { esito: 'errore' }
  }
}

function inLavoro(d: DettaglioReel | undefined): boolean {
  if (!d) return false
  return d.ultima?.stato === 'in_coda' || d.ultima?.stato === 'in_corso' || d.reel.lettura_stato === 'in_coda' || d.reel.lettura_stato === 'in_corso'
}

function visibile(el: Element): boolean {
  return el.isConnected && el.getClientRects().length > 0
}

/**
 * The reel panel (1.36.0): a sheet on the right, the whole screen on a phone,
 * as the content's. The state lives in the address (?reel=<media id>,
 * pushState): the link is shared, Back closes it, a reload keeps it. The row's
 * numbers show at once; the detail (analysis, card, speech, calendar) comes
 * from a GET, preloaded with the intent to open or read by the page for a
 * direct link. While an analysis or a reading is going the panel reads again
 * every 6 seconds and, when the analysis becomes ready, redraws the list once.
 */
export function PannelloReel({
  righe,
  iniziale,
  puoAnalizzare,
  puoScrivere,
  children,
}: {
  righe: readonly RigaReel[]
  iniziale: DettaglioReelIniziale
  puoAnalizzare: boolean
  puoScrivere: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const t = useTesti(ANALISI_REEL).pannello
  const richiesto = useSearchParams().get(PARAMETRO_REEL)
  const daIndirizzo = eMediaId(richiesto) ? richiesto : null

  const [locale, setLocale] = useState<{ id: string | null } | null>(null)
  if (locale && locale.id === daIndirizzo) setLocale(null)
  const idAperto = locale ? locale.id : daIndirizzo

  const [mostrato, setMostrato] = useState<string | null>(idAperto)
  if (idAperto !== null && idAperto !== mostrato) setMostrato(idAperto)
  const idMostrato = idAperto ?? mostrato

  const [voci, setVoci] = useState<Record<string, Voce>>(() => {
    if (!iniziale) return {}
    if ('errore' in iniziale) return { [iniziale.id]: { stato: 'errore' } }
    return iniziale.dettaglio ? { [iniziale.id]: { stato: 'pronto', dettaglio: iniziale.dettaglio } } : { [iniziale.id]: { stato: 'sparito' } }
  })
  const [tentativo, setTentativo] = useState(0)
  const [copie, setCopie] = useState<Record<string, RigaReel>>({})

  const perId = useMemo(() => new Map(righe.map((r) => [r.media_id ?? '', r])), [righe])
  const letture = useRef(new Map<string, Lettura>())
  const spinto = useRef(false)
  const apertoDa = useRef<{ id: string; elemento: HTMLElement } | null>(null)
  const ritornoSu = useRef<HTMLElement | null>(null)
  const titolo = useRef<HTMLHeadingElement>(null)
  const iniziale0 = useRef(iniziale)
  const vociRef = useRef(voci)
  useEffect(() => {
    vociRef.current = voci
  })

  const carica = useCallback((id: string, forza = false): Lettura => {
    const nota = letture.current.get(id)
    if (!forza && nota && Date.now() - nota.quando < VALIDITA_PRECARICO_MS) return nota
    nota?.controllo.abort()
    const controllo = new AbortController()
    const lettura: Lettura = { promessa: leggi(id, controllo), quando: Date.now(), controllo, conclusa: false }
    letture.current.set(id, lettura)
    void lettura.promessa.then((r) => {
      lettura.conclusa = true
      if (r.esito !== 'pronto' && letture.current.get(id) === lettura) letture.current.delete(id)
    })
    return lettura
  }, [])

  // the open reel's detail: from a preload, the page's own render, or a GET now; again after «Riprova» and while at work
  useEffect(() => {
    if (!idAperto) return
    const id = idAperto
    const dallaPagina = iniziale0.current
    iniziale0.current = null
    if (tentativo === 0 && dallaPagina && dallaPagina.id === id && 'dettaglio' in dallaPagina && dallaPagina.dettaglio && vociRef.current[id]?.stato === 'pronto') return
    const mappa = letture.current
    const lettura = carica(id, tentativo > 0)
    let vivo = true
    void lettura.promessa.then((r) => {
      if (!vivo || r.esito === 'annullato') return
      setVoci((prima) => {
        const voce = prima[id]
        if (r.esito === 'pronto') {
          const eraInLavoro = inLavoro(voce?.dettaglio)
          if (eraInLavoro && !inLavoro(r.dettaglio) && r.dettaglio.analisi) router.refresh()
          return { ...prima, [id]: { stato: 'pronto', dettaglio: r.dettaglio } }
        }
        if (r.esito === 'sparito') return { ...prima, [id]: { ...voce, stato: 'sparito' } }
        return { ...prima, [id]: { ...voce, stato: voce?.stato === 'pronto' ? 'pronto' : 'errore' } }
      })
    })
    return () => {
      vivo = false
      if (!lettura.conclusa && mappa.get(id) === lettura) {
        lettura.controllo.abort()
        mappa.delete(id)
      }
    }
  }, [idAperto, tentativo, carica, router])

  // at work: read again every 6 seconds
  const lavoro = idMostrato ? inLavoro(voci[idMostrato]?.dettaglio) : false
  useEffect(() => {
    if (!idAperto || !lavoro) return
    const t = window.setTimeout(() => setTentativo((n) => n + 1), SONDAGGIO_MS)
    return () => window.clearTimeout(t)
  }, [idAperto, lavoro, tentativo])

  const apri = useCallback<AzioniPannelloReel['apri']>((id, opzioni = {}) => {
    if (opzioni.da) apertoDa.current = { id, elemento: opzioni.da }
    if (opzioni.riga) {
      const riga = opzioni.riga
      setCopie((prima) => (prima[id] ? prima : { ...prima, [id]: riga }))
    }
    setLocale({ id })
    const { pathname, search } = window.location
    window.history.pushState(null, '', urlConReel(pathname, search, id))
    spinto.current = true
  }, [])

  const chiudi = useCallback(() => {
    setLocale({ id: null })
    if (spinto.current) {
      spinto.current = false
      window.history.back()
    } else {
      const { pathname, search } = window.location
      window.history.replaceState(null, '', urlSenzaReel(pathname, search))
    }
  }, [])

  const precarica = useCallback((id: string) => void carica(id), [carica])
  const fuocoDiRitorno = useCallback((elemento: HTMLElement) => {
    if (ritornoSu.current !== elemento) return false
    ritornoSu.current = null
    return true
  }, [])

  const azioni = useMemo<AzioniPannelloReel>(() => ({ apri, precarica, fuocoDiRitorno }), [apri, precarica, fuocoDiRitorno])

  function fuocoFinale(): HTMLElement | boolean {
    const da = apertoDa.current
    if (da && da.id === idMostrato && visibile(da.elemento)) {
      ritornoSu.current = da.elemento
      return da.elemento
    }
    ritornoSu.current = null
    // the link of the same reel on the page, else the title of the page
    const link = idMostrato ? document.querySelector<HTMLElement>(`[data-apri-reel][href$="reel=${idMostrato}"]`) : null
    if (link && visibile(link)) {
      ritornoSu.current = link
      return link
    }
    return true
  }

  function rileggi() {
    if (!idMostrato) return
    letture.current.delete(idMostrato)
    setTentativo((n) => n + 1)
  }

  const voce = idMostrato ? voci[idMostrato] : undefined
  const riga = idMostrato ? (voce?.dettaglio?.reel ?? copie[idMostrato] ?? perId.get(idMostrato) ?? null) : null
  const sparito = voce?.stato === 'sparito'

  return (
    <ContestoPannelloReel.Provider value={azioni}>
      {children}
      <Sheet
        open={idAperto !== null}
        onOpenChange={(aperto) => {
          if (!aperto) chiudi()
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          initialFocus={titolo}
          finalFocus={fuocoFinale}
          className="gap-0 overflow-y-auto overscroll-contain p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl data-[side=right]:md:max-w-2xl"
        >
          <NelPannello value>
            <div className="min-h-full shrink-0" data-testid="pannello-reel">
              {sparito ? (
                <>
                  <SheetHeader className="relative">
                    <ChiudiPannello />
                    <SheetTitle ref={titolo} tabIndex={-1} className="outline-none">
                      {t.sparito}
                    </SheetTitle>
                    <SheetDescription>{t.sparitoDescrizione}</SheetDescription>
                  </SheetHeader>
                  <div className="flex flex-col items-start gap-3 px-4 pb-6">
                    <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
                    <Button type="button" variant="outline" className="h-11" onClick={chiudi}>
                      {t.chiudi}
                    </Button>
                  </div>
                </>
              ) : riga ? (
                <SchedaReel
                  key={riga.media_id ?? 'reel'}
                  riga={riga}
                  dettaglio={voce?.dettaglio ?? null}
                  errore={voce?.stato === 'errore'}
                  puoAnalizzare={puoAnalizzare}
                  puoScrivere={puoScrivere}
                  titoloRef={titolo}
                  onRileggi={rileggi}
                />
              ) : (
                <>
                  <SheetHeader className="relative">
                    <ChiudiPannello />
                    <SheetTitle ref={titolo} tabIndex={-1} className="outline-none">
                      {t.reel}
                    </SheetTitle>
                    <SheetDescription>{voce?.stato === 'errore' ? t.nonCaricato : t.caricamento}</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-3 px-4 pb-6">
                    {voce?.stato === 'errore' ? (
                      <Button type="button" variant="outline" className="h-11" onClick={rileggi}>
                        <RotateCw className="size-4" aria-hidden="true" />
                        {t.riprova}
                      </Button>
                    ) : (
                      <div className="space-y-3" aria-busy="true">
                        <Skeleton className="h-24 rounded-xl" />
                        <Skeleton className="h-48 rounded-xl" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </NelPannello>
        </SheetContent>
      </Sheet>
    </ContestoPannelloReel.Provider>
  )
}
