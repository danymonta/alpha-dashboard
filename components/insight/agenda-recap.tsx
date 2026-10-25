import { CalendarX2, CircleCheck, CircleHelp, TriangleAlert, UserX, Video, type LucideIcon } from 'lucide-react'

import { MessaggioCopiabile } from '@/components/insight/messaggio-copiabile'
import { Pillola } from '@/components/insight/pillola'
import { ChiBreve } from '@/components/insight/sezioni'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { buttonVariants } from '@/components/ui/button'
import type { Lingua } from '@/lib/i18n/lingua'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { urlSicuro } from '@/lib/insight/link'
import type { AgendaRecap as VoceAgenda, ShowUpRecap } from '@/lib/insight/recap'
import { tonoAgenda, tonoEsito, type Tono } from '@/lib/insight/toni'
import { cn } from '@/lib/utils'

const ICONA_AGENDA: Record<Tono, LucideIcon | undefined> = {
  critico: TriangleAlert,
  ok: CircleCheck,
  attenzione: CircleHelp,
  neutro: undefined,
}

const ICONA_ESITO: Record<Tono, LucideIcon | undefined> = {
  critico: UserX,
  ok: CircleCheck,
  attenzione: CircleHelp,
  neutro: undefined,
}

/** «@user · Nome» of a call, as the artifact's call-who (Messenger: the name only). */
function ChiCall({ voce }: { voce: { username: string; name: string; channel?: 'Messenger' } }) {
  const messenger = voce.channel === 'Messenger' || !voce.username
  return (
    <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
      {messenger ? (
        <span>{voce.name}</span>
      ) : (
        <>
          <ChiBreve voce={{ username: voce.username }} fonte="instagram" />
          {voce.name ? <span className="font-normal text-muted-foreground"> · {voce.name}</span> : null}
        </>
      )}
    </p>
  )
}

type Testi = (typeof INSIGHT_RECAP)['it']

function chiNome(voce: { username: string; name: string }, t: Testi): string {
  return voce.username ? `@${voce.username}` : voce.name || t.agenda.ilLead
}

/** «oggi», «domani», «ieri» as the recap writes them, in the page's language; anything else as written. */
function giornoAgenda(giorno: string, t: Testi): string {
  return t.giorniAgenda[giorno] ?? giorno
}

function Ora({ ora, giorno }: { ora: string; giorno: string }) {
  return (
    <div className="grid content-start gap-0.5">
      <span className="num text-2xl leading-none font-semibold">{ora}</span>
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{giorno}</span>
    </div>
  )
}

function Call({ voce, t }: { voce: VoceAgenda; t: Testi }) {
  const tono = tonoAgenda(voce.status)
  // never in 1.35.0 (no Calendly or Meet link): the button renders only for a real Meet address
  const meet = urlSicuro(voce.meet_link, 'meet')
  return (
    <li
      data-testid="call-agenda"
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] md:p-4"
    >
      <Ora ora={voce.time} giorno={giornoAgenda(voce.day, t)} />
      <div className="grid min-w-0 gap-1.5">
        <ChiCall voce={voce} />
        {voce.status ? (
          <div className="flex flex-wrap gap-1.5">
            <Pillola tono={tono} Icona={ICONA_AGENDA[tono]} lang="it">
              {voce.status}
            </Pillola>
          </div>
        ) : null}
        {voce.da_ricontrollare ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span lang="it" className="[overflow-wrap:anywhere]">{voce.da_ricontrollare}</span>
          </p>
        ) : null}
        {voce.suggested_message ? (
          <MessaggioCopiabile
            eyebrow={t.agenda.promemoria}
            testo={voce.suggested_message}
            nomeCopia={t.copiaPromemoria(chiNome(voce, t))}
          />
        ) : null}
      </div>
      {meet ? (
        <a
          href={meet}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'col-start-2 h-11 justify-self-start gap-1.5 px-3 sm:col-start-auto')}
        >
          <Video className="size-4" aria-hidden="true" />
          {t.agenda.meet}
          <span className="sr-only">{t.meetNuovaScheda}</span>
        </a>
      ) : null}
    </li>
  )
}

function CallDiIeri({ voce, t }: { voce: ShowUpRecap; t: Testi }) {
  const esito = voce.outcome || t.agenda.daVerificare
  const tono = tonoEsito(voce.outcome)
  return (
    <li
      data-testid="call-ieri"
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] md:p-4"
    >
      <Ora ora={voce.time} giorno={giornoAgenda(voce.day || 'ieri', t)} />
      <div className="grid min-w-0 gap-1.5">
        <ChiCall voce={voce} />
        <div className="flex flex-wrap gap-1.5">
          <Pillola tono={tono} Icona={ICONA_ESITO[tono]}>
            {esito}
          </Pillola>
        </div>
        {voce.note ? <p lang="it" className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{voce.note}</p> : null}
        {voce.suggested_message ? (
          <MessaggioCopiabile
            eyebrow={t.agenda.messaggio}
            testo={voce.suggested_message}
            nomeCopia={t.copiaMessaggioPer(chiNome(voce, t))}
          />
        ) : null}
      </div>
    </li>
  )
}

/**
 * The Agenda tab, as the artifact's agendaBlock: the calls of today and
 * tomorrow with their time, who and status, the reminder to copy; «Call di
 * ieri» with who came and who did not. The calls come from the app (the
 * closer's outcomes, 1.35.0, D3): never notes, amounts or the closer, for the
 * admin and the setter alike. It reads the Instagram recap of the chosen day.
 */
export function AgendaRecap({
  agenda,
  showUp,
  lingua = 'it',
}: {
  agenda: readonly VoceAgenda[]
  showUp: readonly ShowUpRecap[]
  lingua?: Lingua
}) {
  const t = INSIGHT_RECAP[lingua]
  const AGENDA = t.agenda
  if (!agenda.length && !showUp.length) {
    return <StatoVuoto Icona={CalendarX2} titolo={AGENDA.vuotoTitolo} descrizione={AGENDA.vuotoDescrizione} />
  }
  return (
    <section aria-labelledby="titolo-agenda" className="grid gap-3.5" data-testid="agenda">
      <h2 id="titolo-agenda" className="text-lg font-semibold">
        {AGENDA.titolo} <span className="num text-sm font-normal text-muted-foreground">{agenda.length}</span>
      </h2>
      {agenda.length ? (
        <ul className="grid gap-2">
          {agenda.map((c, i) => (
            <Call key={c.call_id || i} voce={c} t={t} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{AGENDA.nessuna}</p>
      )}
      {showUp.length ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-border pb-1.5">
            <h3 className="text-base font-semibold">
              {AGENDA.ieri} <span className="num text-sm font-normal text-muted-foreground">{showUp.length}</span>
            </h3>
            <span className="text-sm text-muted-foreground">{AGENDA.ieriDescrizione}</span>
          </div>
          <ul className="grid gap-2">
            {showUp.map((c, i) => (
              <CallDiIeri key={c.call_id || i} voce={c} t={t} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
