'use client'

import { ChevronRight, Info, Settings, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import type { ContenutoCalendario } from '@/components/insight/arriva-da'
import { ConteggioFatte } from '@/components/insight/interruttore-fatto'
import { MessaggioCopiabile } from '@/components/insight/messaggio-copiabile'
import { SchedaLead, type LeadScheda } from '@/components/insight/scheda-lead'
import type { Attesa } from '@/lib/insight/attesa'
import type { Fonte } from '@/lib/insight/canale'
import { LINK_CHAT_ESCLUSE, linkProfiloInstagram, usernameValido } from '@/lib/insight/link'
import {
  GESTISCI_ESCLUSE,
  LEADS,
  OBIEZIONI,
  PARZIALE_ADMIN,
  parzialeSetter,
  RIATTIVARE,
  rigaEscluseImpostazioni,
  titoloEscluse,
  VERDETTO,
} from '@/lib/insight/parole'
import { raggruppaPerPriorita, raggruppaRiattivazione } from '@/lib/insight/priorita'
import { chiaveLead, type NonLeadRecap, type ObiezioneRecap, type PrioritaLead, type RiattivazioneRecap } from '@/lib/insight/recap'
import { cn } from '@/lib/utils'

/** «Verdetto della giornata», as the artifact; on the app's surface, the bordeaux as a bar (it is for actions). */
export function Verdetto({ testo }: { testo: string }) {
  if (!testo.trim()) return null
  return (
    <section aria-labelledby="titolo-verdetto" className="grid gap-1.5 rounded-xl border-l-4 border-primary bg-card p-4 md:p-5">
      <h2 id="titolo-verdetto" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {VERDETTO}
      </h2>
      <p className="max-w-[70ch] text-base whitespace-pre-wrap [overflow-wrap:anywhere] md:text-lg">{testo}</p>
    </section>
  )
}

/**
 * A partial recap (some chats without analysis): the admin reads the run's
 * warnings, the setter one line that sends him to the chats (C47).
 */
export function AvvisoParziale({ admin, avvisi, fonte }: { admin: boolean; avvisi: readonly string[]; fonte: Fonte }) {
  return (
    <div data-testid="recap-parziale" className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
      {admin ? (
        <div className="grid min-w-0 gap-1">
          <p className="font-medium">{PARZIALE_ADMIN}</p>
          {avvisi.length ? (
            <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
              {avvisi.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : (
            <p>{parzialeSetter(fonte)}</p>
          )}
        </div>
      ) : (
        <p className="min-w-0">{parzialeSetter(fonte)}</p>
      )}
    </div>
  )
}

const BORDO_GRUPPO: Record<PrioritaLead, string> = {
  alta: 'border-status-critical',
  media: 'border-status-warning',
  bassa: 'border-border',
}

/** A group's header, as the artifact: title and count, «n/m fatte», what to do with it. */
export function IntestazioneGruppo({
  titolo,
  numero,
  descrizione,
  chiavi,
  bordo = 'border-border',
}: {
  titolo: string
  numero: number
  descrizione: string
  chiavi: readonly string[]
  bordo?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 pb-1.5', bordo)}>
      <h3 className="text-base font-semibold">
        {titolo} <span className="num text-sm font-normal text-muted-foreground">{numero}</span>
      </h3>
      <ConteggioFatte chiavi={chiavi} />
      <span className="text-sm text-muted-foreground">{descrizione}</span>
    </div>
  )
}

type ContestoSchede = {
  fonte: Fonte
  attesaDi: (lead: LeadScheda) => Attesa | null
  contenutoDi: (lead: LeadScheda) => ContenutoCalendario | null
}

/** The leads by priority (alta, media, bassa), each group by how long the lead has been waiting. */
export function GruppiPriorita({ leads, fonte, attesaDi, contenutoDi }: { leads: readonly LeadScheda[] } & ContestoSchede) {
  const gruppi = raggruppaPerPriorita(leads, (l) => attesaDi(l)?.ore ?? null)
  return (
    <div className="grid gap-5">
      {gruppi.map(({ gruppo, voci }) => (
        <div key={gruppo.chiave} className="grid gap-2.5" data-testid={`gruppo-${gruppo.chiave}`}>
          <IntestazioneGruppo
            titolo={gruppo.titolo}
            numero={voci.length}
            descrizione={gruppo.descrizione}
            chiavi={voci.map(chiaveLead)}
            bordo={BORDO_GRUPPO[gruppo.chiave]}
          />
          <div className="grid gap-3">
            {voci.map((lead, i) => (
              <SchedaLead
                key={chiaveLead(lead) || `${gruppo.chiave}-${i}`}
                lead={lead}
                fonte={fonte}
                attesa={attesaDi(lead)}
                contenuto={contenutoDi(lead)}
                leggera={gruppo.chiave === 'bassa'}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** «Da riattivare», as the artifact: steps 1, 2 and 3, each by days of silence. */
export function DaRiattivare({ voci, fonte, attesaDi, contenutoDi }: { voci: readonly RiattivazioneRecap[] } & ContestoSchede) {
  if (!voci.length) return null
  const gruppi = raggruppaRiattivazione(voci)
  return (
    <section aria-labelledby="titolo-riattivare" className="grid gap-3.5" data-testid="da-riattivare">
      <h2 id="titolo-riattivare" className="text-lg font-semibold">
        {RIATTIVARE} <span className="num text-sm font-normal text-muted-foreground">{voci.length}</span>
      </h2>
      <div className="grid gap-5">
        {gruppi.map(({ gruppo, voci: delPasso }) => (
          <div key={gruppo.passo} className="grid gap-2.5" data-testid={`passo-${gruppo.passo}`}>
            <IntestazioneGruppo
              titolo={gruppo.titolo}
              numero={delPasso.length}
              descrizione={gruppo.descrizione}
              chiavi={delPasso.map(chiaveLead)}
            />
            <div className="grid gap-3">
              {delPasso.map((lead, i) => (
                <SchedaLead
                  key={chiaveLead(lead) || `riattiva-${gruppo.passo}-${i}`}
                  lead={lead}
                  fonte={fonte}
                  attesa={attesaDi(lead)}
                  contenuto={contenutoDi(lead)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Who a short line names, as the artifact's who(): «@user» with the profile on Instagram, the name on Messenger. */
export function ChiBreve({ voce, fonte }: { voce: Pick<NonLeadRecap, 'username' | 'user_id' | 'name'>; fonte: Fonte }) {
  if (fonte === 'messenger') return <span>{voce.name || voce.username || LEADS.lead}</span>
  const u = usernameValido(voce.username)
  const profilo = linkProfiloInstagram(voce.username)
  if (!u || !profilo) return <span>{voce.username ? `@${voce.username}` : LEADS.senzaUsername}</span>
  return (
    <a
      href={profilo}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      @{u}
      <span className="sr-only"> (profilo Instagram, si apre in una nuova scheda)</span>
    </a>
  )
}

/** «Obiezioni aperte», as the artifact: who, what they said, the reply to copy. */
export function Obiezioni({ voci, fonte }: { voci: readonly ObiezioneRecap[]; fonte: Fonte }) {
  if (!voci.length) return null
  return (
    <section aria-labelledby="titolo-obiezioni" className="grid gap-3.5" data-testid="obiezioni">
      <h2 id="titolo-obiezioni" className="text-lg font-semibold">
        {OBIEZIONI.titolo} <span className="num text-sm font-normal text-muted-foreground">{voci.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {voci.map((o, i) => {
          const chi = fonte === 'messenger' ? o.name || o.username || LEADS.lead : o.username ? `@${o.username}` : LEADS.senzaUsername
          return (
            <div key={i} className="grid min-w-0 content-start gap-2 rounded-xl border border-border bg-card p-4">
              <h3 className="text-base font-semibold [overflow-wrap:anywhere]">
                <ChiBreve voce={o} fonte={fonte} />
              </h3>
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{o.text}</p>
              {o.suggested_reply ? (
                <MessaggioCopiabile
                  eyebrow={OBIEZIONI.risposta}
                  testo={o.suggested_reply}
                  nomeCopia={`Copia la risposta suggerita per ${chi}`}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** The chats that are not leads, «@user · motivo», in «Escluse dal recap» and in the «Chat attive» filter. */
export function ElencoNonLead({ voci, fonte }: { voci: readonly NonLeadRecap[]; fonte: Fonte }) {
  return (
    <ul className="grid gap-1 pl-5 text-sm [list-style:disc]">
      {voci.map((n, i) => (
        <li key={i} className="[overflow-wrap:anywhere]">
          <ChiBreve voce={n} fonte={fonte} /> <span className="text-muted-foreground">· {n.reason}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * «Escluse dal recap (N)», as the artifact: the chats the model found not to
 * be leads, with why. The chats excluded in the settings were never read nor
 * sent (D5): only their number, in one line, and for the admin the way to the
 * list.
 */
export function EscluseRecap({
  voci,
  escluse,
  fonte,
  admin,
}: {
  voci: readonly NonLeadRecap[]
  escluse: number
  fonte: Fonte
  admin: boolean
}) {
  if (!voci.length && escluse <= 0) return null
  return (
    <section aria-label={titoloEscluse(voci.length)} className="grid gap-2" data-testid="escluse">
      {voci.length ? (
        <details className="group rounded-xl border border-border bg-card px-4 py-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 motion-safe:transition-transform group-open:rotate-90" aria-hidden="true" />
            {titoloEscluse(voci.length)}
          </summary>
          <div className="pb-3">
            <ElencoNonLead voci={voci} fonte={fonte} />
          </div>
        </details>
      ) : null}
      {escluse > 0 ? (
        <Riga>
          <span className="num">{rigaEscluseImpostazioni(escluse)}</span>
          {admin ? (
            <Link
              href={LINK_CHAT_ESCLUSE}
              className="inline-flex min-h-11 items-center gap-1.5 text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              <Settings className="size-4" aria-hidden="true" />
              {GESTISCI_ESCLUSE}
            </Link>
          ) : null}
        </Riga>
      ) : null}
    </section>
  )
}

function Riga({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" data-testid="riga-escluse">
      <Info className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  )
}
