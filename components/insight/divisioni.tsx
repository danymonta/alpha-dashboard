'use client'

import { Hourglass, MailQuestionMark, Reply, type LucideIcon } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { IntestazioneGruppo, type ContestoSchede } from '@/components/insight/sezioni'
import { SchedaLead, type LeadScheda } from '@/components/insight/scheda-lead'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { CHIAVI_DIVISIONE, raggruppaDivisione, type ChiaveDivisione, type Divisione, type LivelloVicinanza } from '@/lib/insight/divisioni'
import { chiaveLead } from '@/lib/insight/recap'
import { cn } from '@/lib/utils'

const ICONA: Partial<Record<ChiaveDivisione, LucideIcon>> = { rispondere: Reply, follow_up: MailQuestionMark, attesa: Hourglass }

const BORDO_LIVELLO: Record<LivelloVicinanza, string> = {
  vicina: 'border-status-critical',
  prenotata: 'border-status-ok',
  qualifica: 'border-status-warning',
  apertura: 'border-border',
  lontana: 'border-border',
}

/**
 * The divisions of the chats (Dany, 27/10/2026, lib/insight/divisioni.ts):
 * «Tutte», «Da rispondere», «Follow-up», «In attesa», each with its number.
 * Real buttons with aria-pressed, 44 px, on one row that scrolls inside its
 * own box at 390 px: the page never scrolls sideways.
 */
export function SceltaDivisione({
  conteggi,
  attiva,
  onScegli,
}: {
  conteggi: Record<ChiaveDivisione, number>
  attiva: ChiaveDivisione
  onScegli: (chiave: ChiaveDivisione) => void
}) {
  const t = INSIGHT_RECAP[useLingua()]
  return (
    <div className="grid gap-1.5">
      <div
        role="group"
        aria-label={t.gruppoDivisioni}
        aria-describedby="descrizione-divisione"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        data-testid="divisioni"
      >
        {CHIAVI_DIVISIONE.map((chiave) => {
          const Icona = ICONA[chiave]
          const premuto = attiva === chiave
          const parole = t.divisioni[chiave]
          return (
            <button
              key={chiave}
              type="button"
              aria-pressed={premuto}
              data-divisione={chiave}
              onClick={() => onScegli(chiave)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                premuto && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {Icona ? <Icona className="size-4 shrink-0" aria-hidden="true" /> : null}
              {parole?.etichetta ?? chiave}
              {chiave !== 'tutte' ? (
                <span className={cn('num text-xs', premuto ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {conteggi[chiave]}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <p id="descrizione-divisione" className="text-xs text-muted-foreground">
        {t.divisioni[attiva]?.descrizione}
        {attiva !== 'tutte' ? ` ${t.suggerimentoDivisioni}` : ''}
      </p>
    </div>
  )
}

/**
 * The chats of a division, grouped by how close the call is (the importance),
 * each group by stage, target, priority and then how long the lead has been
 * waiting or silent (the urgency).
 */
export function GruppiDivisione({
  divisione,
  voci,
  urgenza,
  fonte,
  attesaDi,
  contenutoDi,
}: {
  divisione: Divisione
  voci: readonly LeadScheda[]
  urgenza: (lead: LeadScheda) => number | null
} & ContestoSchede) {
  const t = INSIGHT_RECAP[useLingua()]
  const gruppi = raggruppaDivisione(divisione, voci, urgenza)
  if (!gruppi.length) return <p className="text-sm text-muted-foreground">{t.nessunaDivisione}</p>
  return (
    <div className="grid gap-5">
      {gruppi.map(({ livello, voci: delLivello }) => (
        <div key={livello} className="grid gap-2.5" data-testid={`vicinanza-${livello}`}>
          <IntestazioneGruppo
            titolo={t.vicinanza[livello]?.titolo ?? livello}
            numero={delLivello.length}
            descrizione={t.vicinanza[livello]?.descrizione ?? ''}
            chiavi={delLivello.map(chiaveLead)}
            bordo={BORDO_LIVELLO[livello]}
          />
          <div className="grid gap-3">
            {delLivello.map((lead, i) => (
              <SchedaLead
                key={chiaveLead(lead) || `${divisione}-${livello}-${i}`}
                lead={lead}
                fonte={fonte}
                attesa={attesaDi(lead)}
                contenuto={contenutoDi(lead)}
                leggera={livello === 'lontana'}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
