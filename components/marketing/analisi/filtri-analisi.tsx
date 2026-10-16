'use client'

import { Circle, CircleCheck, LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition, type ReactNode } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ETICHETTA_FASCIA_FILTRO,
  ETICHETTA_ORDINE,
  ETICHETTA_PERIODO,
  ETICHETTA_VERDETTO_FILTRO,
  FASCE_FILTRO,
  FILTRI_PREDEFINITI,
  hrefAnalisi,
  ORDINI,
  PERIODI,
  sonoFiltriPredefiniti,
  VERDETTI_FILTRO,
  type FiltriAnalisi,
} from '@/lib/marketing/analisi/filtri'
import { cn } from '@/lib/utils'

/** How many filters differ from the ones the page opens with: the number on «Filtri» at 390 px. */
export function filtriAttivi(f: FiltriAnalisi): number {
  return (
    (f.periodo !== FILTRI_PREDEFINITI.periodo ? 1 : 0) +
    (f.verdetto !== FILTRI_PREDEFINITI.verdetto ? 1 : 0) +
    (f.punteggio !== FILTRI_PREDEFINITI.punteggio ? 1 : 0) +
    (f.ordine !== FILTRI_PREDEFINITI.ordine ? 1 : 0) +
    (f.senzaContenuto ? 1 : 0)
  )
}

function Campo({ id, etichetta, children, className }: { id: string; etichetta: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {etichetta}
      </label>
      {children}
    </div>
  )
}

/**
 * The four filters with their labels, and the toggle of the reels without a content in the calendar. The filters
 * live in the address (hrefAnalisi: a reload, a shared link, Back keep them): a change goes there with router.push,
 * the same parameters and the same meaning as before. Native selects: one tap on a phone.
 */
function CampiFiltri({ filtri, prefisso, impilati }: { filtri: FiltriAnalisi; prefisso: string; impilati?: boolean }) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const vai = (nuovi: FiltriAnalisi) => avvia(() => router.push(hrefAnalisi(nuovi), { scroll: false }))
  const larghezza = impilati ? 'w-full' : 'w-44'
  return (
    <>
      <Campo id={`${prefisso}-periodo`} etichetta="Periodo" className={larghezza}>
        <select
          id={`${prefisso}-periodo`}
          value={filtri.periodo}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, periodo: Number(e.currentTarget.value) as FiltriAnalisi['periodo'] })}
        >
          {PERIODI.map((p) => (
            <option key={p} value={p}>
              {ETICHETTA_PERIODO[p]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefisso}-verdetto`} etichetta="Verdetto" className={larghezza}>
        <select
          id={`${prefisso}-verdetto`}
          value={filtri.verdetto}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, verdetto: e.currentTarget.value as FiltriAnalisi['verdetto'] })}
        >
          {VERDETTI_FILTRO.map((v) => (
            <option key={v} value={v}>
              {v === 'tutti' ? 'Tutti i verdetti' : ETICHETTA_VERDETTO_FILTRO[v]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefisso}-punteggio`} etichetta="Punteggio" className={impilati ? 'w-full' : 'w-60'}>
        <select
          id={`${prefisso}-punteggio`}
          value={filtri.punteggio}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, punteggio: e.currentTarget.value as FiltriAnalisi['punteggio'] })}
        >
          {FASCE_FILTRO.map((f) => (
            <option key={f} value={f}>
              {f === 'tutte' ? 'Tutti i punteggi' : ETICHETTA_FASCIA_FILTRO[f]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefisso}-ordine`} etichetta="Ordina per" className={larghezza}>
        <select
          id={`${prefisso}-ordine`}
          value={filtri.ordine}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, ordine: e.currentTarget.value as FiltriAnalisi['ordine'] })}
        >
          {ORDINI.map((o) => (
            <option key={o} value={o}>
              {ETICHETTA_ORDINE[o]}
            </option>
          ))}
        </select>
      </Campo>
      <button
        type="button"
        aria-pressed={filtri.senzaContenuto}
        disabled={inCorso}
        onClick={() => vai({ ...filtri, senzaContenuto: !filtri.senzaContenuto })}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 self-end rounded-lg border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
          impilati && 'w-full justify-start',
          filtri.senzaContenuto ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-input/30 text-foreground hover:bg-accent',
        )}
      >
        {filtri.senzaContenuto ? <CircleCheck className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
        Senza contenuto in calendario
      </button>
      {inCorso ? (
        <span role="status" className="inline-flex min-h-11 items-center gap-1.5 self-end text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Aggiorno l’elenco…
        </span>
      ) : null}
    </>
  )
}

/**
 * The filters of the Analisi page (1.39.1): one bar with labelled controls. On the computer, one row of selects;
 * at 390 px a «Filtri (n)» button that opens a sheet with the same controls, so the list is never pushed down by
 * four rows of chips. The width is the section's own (a container query), never the screen next to the sidebar.
 * `children` is «Valuta i reel non valutati»: it sits on the same row, at its end.
 */
export function FiltriAnalisiVista({ filtri, children }: { filtri: FiltriAnalisi; children?: ReactNode }) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const n = filtriAttivi(filtri)
  const router = useRouter()
  return (
    <section aria-label="Filtri dell’analisi" className="@container space-y-3" data-testid="filtri-analisi">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {/* on the wide bar the controls flow in the same row as the end button: «contents» */}
        <div className="hidden @min-[56rem]:contents">
          <CampiFiltri filtri={filtri} prefisso={`${id}d`} />
          {!sonoFiltriPredefiniti(filtri) ? (
            <Button type="button" variant="ghost" className="h-11 underline underline-offset-4" onClick={() => router.push('/marketing/analisi', { scroll: false })}>
              Togli i filtri
            </Button>
          ) : null}
        </div>
        <Button type="button" variant="outline" className="h-11 @min-[56rem]:hidden" aria-expanded={aperto} onClick={() => setAperto(true)} data-testid="filtri-apri">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtri{n > 0 ? ` (${n})` : ''}
        </Button>
        {children}
      </div>
      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto p-0" data-testid="filtri-foglio">
          <SheetHeader>
            <SheetTitle>Filtri</SheetTitle>
            <SheetDescription>L’elenco si aggiorna a ogni scelta.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            <CampiFiltri filtri={filtri} prefisso={`${id}m`} impilati />
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            {!sonoFiltriPredefiniti(filtri) ? (
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => router.push('/marketing/analisi', { scroll: false })}>
                Togli i filtri
              </Button>
            ) : null}
            <Button type="button" className="h-11 flex-1" onClick={() => setAperto(false)}>
              Fatto
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
