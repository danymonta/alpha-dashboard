import { CalendarCheck2, CalendarClock, CalendarPlus, Check, CircleHelp, TriangleAlert, X } from 'lucide-react'

import { RiprovaPrenotate } from '@/components/calendario/riprova-prenotate'
import { LinkBottone } from '@/components/link-bottone'
import { Skeleton } from '@/components/ui/skeleton'
import type { PrenotataDaAggiungere } from '@/lib/calendario/confronto'
import { prenotateNonNelGestionale } from '@/lib/calendario/prenotate'
import { oggiRoma } from '@/lib/date'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { PRENOTATE } from '@/lib/i18n/testi/prenotate'
import { createClient } from '@/lib/supabase/server'

/** The most the section lists: the others show up as these are added. */
const MAX_VOCI = 20

/** «Nuova call» already filled in: the source stays Dany's choice, every time. */
function linkNuovaCall(voce: PrenotataDaAggiungere, da: string): string {
  const qs = new URLSearchParams({ data: voce.giorno, ora: voce.ora })
  if (voce.nome) qs.set('nome', voce.nome)
  if (voce.handle) qs.set('handle', voce.handle)
  qs.set('da', da)
  return `/calls/new?${qs}`
}

function Budget({ si, lingua }: { si: boolean | null; lingua: Lingua }) {
  const t = PRENOTATE[lingua]
  if (si === true) {
    return (
      <span className="inline-flex items-center gap-1">
        <Check className="size-3.5 text-status-ok" aria-hidden="true" />
        {t.budgetSi}
      </span>
    )
  }
  if (si === false) {
    return (
      <span className="inline-flex items-center gap-1">
        <X className="size-3.5 text-status-warning" aria-hidden="true" />
        {t.budgetNo}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <CircleHelp className="size-3.5" aria-hidden="true" />
      {t.budgetNonDetto}
    </span>
  )
}

/**
 * «Prenotate su Calendly, non ancora nel gestionale (n)» (1.78.0, Dany, 13/11/2026), in «Le mie call» and in
 * Pipeline, admin only: the page renders it inside a Suspense, so it never waits for Google. Not connected:
 * nothing. Everything in the app: one quiet line, so a calendar that is checked and matches never looks like
 * one that is not read at all.
 */
export async function PrenotateCalendly({ da }: { da: string }) {
  const lingua = await getLingua()
  const t = PRENOTATE[lingua]
  const esito = await prenotateNonNelGestionale(await createClient())

  if (esito.stato === 'non_collegato') return null

  if (esito.stato === 'errore') {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
      >
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          {t.errore}
        </p>
        <RiprovaPrenotate />
      </div>
    )
  }

  if (esito.voci.length === 0) {
    return (
      <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
        <CalendarCheck2 className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
        {t.coincidono}
      </p>
    )
  }

  const oggi = oggiRoma()
  const voci = esito.voci.slice(0, MAX_VOCI)
  const altre = esito.voci.length - voci.length

  return (
    <section aria-labelledby="prenotate-calendly-titolo" className="space-y-2" data-testid="prenotate-calendly">
      <div className="px-1">
        <h2 id="prenotate-calendly-titolo" className="flex flex-wrap items-center gap-2 font-heading text-base font-semibold">
          <CalendarClock className="size-4 text-status-warning" aria-hidden="true" />
          {t.titolo}
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {esito.voci.length}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <ul className="space-y-2">
        {voci.map((voce) => {
          const chi = voce.nome ?? t.senzaNome
          const quando = t.quando(etichettaGiornoIn(voce.giorno, oggi, lingua), voce.ora)
          return (
            <li key={voce.uid} className="flex flex-col gap-3 rounded-xl bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                {/* names and handles as the lead wrote them in Calendly */}
                <p lang="it" className="truncate text-sm font-medium">
                  {chi}
                  {voce.handle ? <span className="ml-1.5 font-normal text-muted-foreground">@{voce.handle}</span> : null}
                </p>
                <p className="num text-sm">{quando}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {voce.eta !== null ? <span className="num">{t.anni(voce.eta)}</span> : null}
                  <Budget si={voce.budget_si} lingua={lingua} />
                </p>
              </div>
              <LinkBottone
                href={linkNuovaCall(voce, da)}
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                aria-label={t.aggiungiChi(chi, quando)}
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                {t.aggiungi}
              </LinkBottone>
            </li>
          )
        })}
      </ul>
      {altre > 0 ? <p className="px-1 text-xs text-muted-foreground">{t.altre(altre)}</p> : null}
    </section>
  )
}

/** The Suspense fallback: the section's shape while the calendar is read. */
export function ScheletroPrenotate({ lingua }: { lingua: Lingua }) {
  const t = PRENOTATE[lingua]
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-72 max-w-full" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <span className="sr-only">{t.carico}</span>
    </div>
  )
}
