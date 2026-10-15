'use client'

import {
  ArrowUp,
  BellOff,
  CircleHelp,
  Clock,
  Hand,
  Hourglass,
  Minus,
  ShieldAlert,
  Target,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useId } from 'react'

import { ArrivaDa, type ContenutoCalendario } from '@/components/insight/arriva-da'
import { ChatLead } from '@/components/insight/chat-lead'
import { useFatti } from '@/components/insight/fatti'
import { InterruttoreFatto } from '@/components/insight/interruttore-fatto'
import { MessaggioCopiabile } from '@/components/insight/messaggio-copiabile'
import { Pillola } from '@/components/insight/pillola'
import type { Attesa } from '@/lib/insight/attesa'
import { etichettaSilenzio } from '@/lib/insight/attesa'
import type { Fonte } from '@/lib/insight/canale'
import { attendeRisposta } from '@/lib/insight/filtri'
import { linkProfiloInstagram, usernameValido } from '@/lib/insight/link'
import { eyebrowAlternativa, eyebrowMessaggio, LEADS, pillPriorita } from '@/lib/insight/parole'
import { chiaveLead, type LeadRecap, type PrioritaLead } from '@/lib/insight/recap'
import { etichettaTarget, tonoPriorita, tonoStato, tonoTarget } from '@/lib/insight/toni'
import { cn } from '@/lib/utils'

const ICONA_PRIORITA: Record<PrioritaLead, LucideIcon | undefined> = { alta: ArrowUp, media: Minus, bassa: undefined }
const ICONA_TARGET = { si: Target, no: undefined, 'da verificare': CircleHelp } as const

const BORDO_PRIORITA: Record<PrioritaLead, string> = {
  alta: 'border-l-status-critical',
  media: 'border-l-status-warning',
  bassa: 'border-l-muted-foreground',
}

export type LeadScheda = LeadRecap & { days_silent?: number }

/** How a card names its lead: «@user» on Instagram («@?» without one), the name on Messenger. */
export function chiDelLead(lead: Pick<LeadRecap, 'username' | 'name'>, fonte: Fonte): string {
  if (fonte === 'messenger') return lead.name || LEADS.lead
  return lead.username ? `@${lead.username}` : lead.name || LEADS.senzaUsername
}

/** The lead's name as the artifact shows it: «@user · Nome» with the profile link, or the name on Messenger. */
export function NomeLead({ lead, fonte }: { lead: Pick<LeadRecap, 'username' | 'name'>; fonte: Fonte }) {
  if (fonte === 'messenger') return <>{lead.name || LEADS.lead}</>
  const profilo = linkProfiloInstagram(lead.username)
  const u = usernameValido(lead.username)
  return (
    <>
      {profilo && u ? (
        <a
          href={profilo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          @{u}
          <span className="sr-only"> (profilo Instagram, si apre in una nuova scheda)</span>
        </a>
      ) : (
        <span>{lead.username ? `@${lead.username}` : LEADS.senzaUsername}</span>
      )}
      {lead.name ? <span className="text-base font-normal text-muted-foreground"> · {lead.name}</span> : null}
    </>
  )
}

/**
 * A lead's card, as the artifact "Recap DM Alpha": the Fatto switch, the name,
 * the pills (priority, target, stage, status, «aspetta da», silence, flow,
 * «serve Dany»), «Arriva da» (1.35.0), age, situation, pain and next move, the
 * «Serve Dany» box, the suggested messages with «Copia», the chat. The card of
 * an under-14 lead (D25) has no chat and no quote; a card without analysis
 * says so and sends to the chat.
 */
export function SchedaLead({
  lead,
  fonte,
  attesa,
  contenuto,
  leggera = false,
}: {
  lead: LeadScheda
  fonte: Fonte
  /** «aspetta da …», computed by the list with the clock of now */
  attesa: Attesa | null
  /** admin only: the calendar content of the post the lead comes from */
  contenuto?: ContenutoCalendario | null
  /** a low-priority card: the browser lays it out only near the screen */
  leggera?: boolean
}) {
  const { fatto } = useFatti()
  const id = useId()
  const chiave = chiaveLead(lead)
  const chi = chiDelLead(lead, fonte)
  const fatta = chiave ? fatto(chiave) : false
  const silenzio = etichettaSilenzio(lead.days_silent ?? 0)
  const mossa = lead.analisi_mancante ? LEADS.mossaAnalisiMancante : lead.next_action
  const IconaPriorita = ICONA_PRIORITA[lead.priority]
  // the status the code writes on an under-14 card and on a placeholder is the pill of its own (with its icon): once
  const stato = lead.status.trim().toLowerCase()
  const mostraStato =
    Boolean(lead.status) &&
    !(lead.minore_14 && stato === LEADS.minore) &&
    !(lead.analisi_mancante && stato === LEADS.analisiMancante)
  const tonoDelloStato = tonoStato(lead.status, attendeRisposta(lead))

  return (
    <article
      aria-labelledby={`lead-${id}`}
      data-testid="scheda-lead"
      data-fatto={fatta}
      className={cn(
        'grid min-w-0 gap-2.5 rounded-xl border border-l-4 border-border bg-card p-3 md:p-4',
        BORDO_PRIORITA[lead.priority],
        'data-[fatto=true]:border-status-ok data-[fatto=true]:bg-status-ok/10',
        leggera && '[contain-intrinsic-size:auto_360px] [content-visibility:auto]',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {chiave ? <InterruttoreFatto chiave={chiave} chi={chi} /> : null}
        <h4 id={`lead-${id}`} className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">
          <NomeLead lead={lead} fonte={fonte} />
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <Pillola tono={tonoPriorita(lead.priority)} Icona={IconaPriorita}>
            {pillPriorita(lead.priority)}
          </Pillola>
          <Pillola tono={tonoTarget(lead.target)} Icona={ICONA_TARGET[lead.target]}>
            {etichettaTarget(lead.target)}
          </Pillola>
          {lead.minore_14 ? (
            <Pillola tono="attenzione" Icona={ShieldAlert}>
              {LEADS.minore}
            </Pillola>
          ) : null}
          {lead.analisi_mancante ? (
            <Pillola tono="neutro" Icona={CircleHelp}>
              {LEADS.analisiMancante}
            </Pillola>
          ) : null}
          {lead.stage ? <Pillola>{lead.stage}</Pillola> : null}
          {mostraStato ? (
            <Pillola tono={tonoDelloStato} Icona={tonoDelloStato === 'critico' ? Hourglass : undefined}>
              {lead.status}
            </Pillola>
          ) : null}
          {attesa ? (
            <Pillola tono={attesa.calda ? 'critico' : 'attenzione'} Icona={Clock}>
              <span data-testid="attesa" className="num">
                {attesa.etichetta}
              </span>
            </Pillola>
          ) : null}
          {silenzio ? (
            <Pillola tono="attenzione" Icona={BellOff}>
              <span className="num">{silenzio}</span>
            </Pillola>
          ) : null}
          {lead.flow ? <Pillola>{lead.flow}</Pillola> : null}
          {lead.needs_dany ? (
            <Pillola tono="critico" Icona={Hand}>
              {LEADS.pillServeDany}
            </Pillola>
          ) : null}
        </div>
      </div>

      {lead.origine ? <ArrivaDa origine={lead.origine} contenuto={contenuto} /> : null}

      {lead.age || lead.situation || lead.pain || mossa ? (
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
          {lead.age ? <Voce etichetta={LEADS.eta} valore={lead.age} numerico /> : null}
          {lead.situation ? <Voce etichetta={LEADS.situazione} valore={lead.situation} /> : null}
          {lead.pain ? <Voce etichetta={LEADS.pain} valore={lead.pain} /> : null}
          {mossa ? <Voce etichetta={LEADS.prossimaMossa} valore={mossa} forte /> : null}
        </dl>
      ) : null}

      {lead.needs_dany ? (
        <div className="grid gap-1 rounded-lg border border-status-critical/40 bg-status-critical/10 p-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-rosso-testo uppercase">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            {LEADS.serveDany}
          </span>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{lead.needs_dany}</p>
        </div>
      ) : null}

      {lead.da_ricontrollare ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          <span className="[overflow-wrap:anywhere]">
            {LEADS.daRicontrollare}: {lead.da_ricontrollare}
          </span>
        </p>
      ) : null}

      {lead.suggested_message ? (
        <MessaggioCopiabile
          eyebrow={eyebrowMessaggio(Boolean(lead.suggested_message_alt))}
          testo={lead.suggested_message}
          nomeCopia={`Copia il messaggio suggerito per ${chi}`}
          sullaCard={fatta}
        />
      ) : null}
      {lead.suggested_message_alt ? (
        <MessaggioCopiabile
          eyebrow={eyebrowAlternativa(lead.alt_condition)}
          testo={lead.suggested_message_alt}
          nomeCopia={`Copia il messaggio alternativo per ${chi}`}
          sullaCard={fatta}
        />
      ) : null}

      <ChatLead lead={lead} fonte={fonte} />
    </article>
  )
}

function Voce({ etichetta, valore, numerico, forte }: { etichetta: string; valore: string; numerico?: boolean; forte?: boolean }) {
  return (
    <>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase sm:pt-0.5">{etichetta}</dt>
      <dd className={cn('min-w-0 [overflow-wrap:anywhere]', numerico && 'num', forte && 'font-semibold')}>{valore}</dd>
    </>
  )
}
