'use client'

import { Circle, CircleCheck, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react'
import Form from 'next/form'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition, type ReactNode } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RICERCA_MAX } from '@/lib/marketing/filtri'
import {
  filtriAttivi,
  hrefPubblicati,
  parametriDaFiltri,
  PERIODI,
  PIANI_FILTRO,
  sonoFiltriPredefiniti,
  TIPI_FILTRO,
  type FiltriPubblicati,
} from '@/lib/marketing/pubblicati/filtri'
import { cn } from '@/lib/utils'

const PERCORSO = '/marketing/pubblicati'

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
 * The selects (period, kind, in the plan or not) and the toggle of the reels that say «Cambiare», with their labels.
 * The filters live in the address (a reload, a shared link, Back keep them): a change goes there with router.push.
 * Native selects: one tap on a phone.
 */
function CampiFiltri({ filtri, prefisso, impilati }: { filtri: FiltriPubblicati; prefisso: string; impilati?: boolean }) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const vai = (nuovi: FiltriPubblicati) => avvia(() => router.push(hrefPubblicati(nuovi), { scroll: false }))
  const larghezza = impilati ? 'w-full' : 'w-44'
  const t = PUBBLICATI[useLingua()].filtri
  return (
    <>
      <Campo id={`${prefisso}-periodo`} etichetta={t.periodo} className={larghezza}>
        <select
          id={`${prefisso}-periodo`}
          value={filtri.periodo}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, periodo: Number(e.currentTarget.value) as FiltriPubblicati['periodo'] })}
        >
          {PERIODI.map((p) => (
            <option key={p} value={p}>
              {t.periodi[p]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefisso}-tipo`} etichetta={t.tipo} className={larghezza}>
        <select
          id={`${prefisso}-tipo`}
          value={filtri.tipo}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, tipo: e.currentTarget.value as FiltriPubblicati['tipo'] })}
        >
          {TIPI_FILTRO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {t.tipi[tipo]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefisso}-piano`} etichetta={t.piano} className={larghezza}>
        <select
          id={`${prefisso}-piano`}
          value={filtri.piano}
          aria-busy={inCorso}
          className={cn(CLASSE_SELECT, inCorso && 'opacity-60')}
          onChange={(e) => vai({ ...filtri, piano: e.currentTarget.value as FiltriPubblicati['piano'] })}
        >
          {PIANI_FILTRO.map((p) => (
            <option key={p} value={p}>
              {t.piani[p]}
            </option>
          ))}
        </select>
      </Campo>
      <button
        type="button"
        aria-pressed={filtri.cambiare}
        disabled={inCorso}
        onClick={() => vai({ ...filtri, cambiare: !filtri.cambiare })}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 self-end rounded-pillola border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
          impilati && 'w-full justify-start',
          filtri.cambiare ? 'border-selezione bg-selezione text-selezione-foreground' : 'border-input bg-input/30 text-foreground hover:bg-accent',
        )}
      >
        {filtri.cambiare ? <CircleCheck className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
        {t.cambiare}
      </button>
      {inCorso ? (
        <span role="status" className="inline-flex min-h-11 items-center gap-1.5 self-end text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {t.aggiorno}
        </span>
      ) : null}
    </>
  )
}

/**
 * The filters of Pubblicati: the search in the caption (a GET form: it works before the page's script has loaded),
 * period, kind and «Nel piano / Non nel piano». On the computer one quiet row; at 390 px the search stays in view and
 * a «Filtri (n)» button opens a sheet with the same controls, so the list is never pushed down by rows of chips. The
 * width is the section's own (a container query), never the screen next to the sidebar. `children` is «Valuta i reel
 * non valutati»: it sits on the same row, at its end.
 */
export function FiltriPubblicatiVista({ filtri, children }: { filtri: FiltriPubblicati; children?: ReactNode }) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const n = filtriAttivi(filtri)
  const router = useRouter()
  const parametriSenzaRicerca = Object.entries(parametriDaFiltri({ ...filtri, q: undefined }))
  const t = PUBBLICATI[useLingua()].filtri
  return (
    <section aria-label={t.aria} className="@container space-y-3" data-testid="filtri-pubblicati">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Form action={PERCORSO} scroll={false} role="search" className="relative w-full min-w-0 @min-[56rem]:w-64">
          {parametriSenzaRicerca.map(([chiave, v]) => (
            <input key={chiave} type="hidden" name={chiave} value={v} />
          ))}
          <label htmlFor={`${id}-cerca`} className="sr-only">
            {t.cerca}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${id}-cerca`}
            type="search"
            name="q"
            // a new search from elsewhere (Togli i filtri) shows in the field
            key={filtri.q ?? ''}
            defaultValue={filtri.q ?? ''}
            placeholder={t.cerca}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={RICERCA_MAX}
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </Form>
        {/* on the wide bar the controls flow in the same row as the end button: «contents» */}
        <div className="hidden @min-[56rem]:contents">
          <CampiFiltri filtri={filtri} prefisso={`${id}d`} />
          {!sonoFiltriPredefiniti(filtri) ? (
            <Button type="button" variant="ghost" className="h-11 gap-1.5" onClick={() => router.push(PERCORSO, { scroll: false })}>
              <X className="size-4" aria-hidden="true" />
              {t.togli}
            </Button>
          ) : null}
        </div>
        <Button type="button" variant="outline" className="h-11 @min-[56rem]:hidden" aria-expanded={aperto} onClick={() => setAperto(true)} data-testid="filtri-apri">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t.filtri(n)}
        </Button>
        {children}
      </div>
      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto p-0" data-testid="filtri-foglio">
          <SheetHeader>
            <SheetTitle>{t.titolo}</SheetTitle>
            <SheetDescription>{t.descrizione}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            <CampiFiltri filtri={filtri} prefisso={`${id}m`} impilati />
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            {!sonoFiltriPredefiniti(filtri) ? (
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => router.push(PERCORSO, { scroll: false })}>
                {t.togli}
              </Button>
            ) : null}
            <Button type="button" className="h-11 flex-1" onClick={() => setAperto(false)}>
              {t.fatto}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
