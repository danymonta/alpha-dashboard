'use client'

import { CalendarDays, CircleCheck, ExternalLink, MessageCircle, PlayCircle, ScrollText, Users, Video } from 'lucide-react'

import { ListaBlocchi } from '@/components/percorso/blocchi'
import { BarraModulo, CopertinaModulo } from '@/components/percorso/campo-base/aula'
import { VaiA } from '@/components/percorso/campo-base/navigazione'
import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { nomeGiorno } from '@/lib/date'
import { formatData } from '@/lib/format'
import type { BloccoPercorso } from '@/lib/percorso/blocchi'
import { chiusoPerche, prossimaLezione, type CampoBase, type CheckupCliente } from '@/lib/percorso/campo-base'
import { TESTI_CAMPO as T } from '@/lib/percorso/testi-campo'
import { cn } from '@/lib/utils'

function iniziali(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function conNome(t: string | null, nome: string): string | null {
  return t ? t.replaceAll('[Nome]', nome) : t
}

function Scheda({ className, children, testId }: { className?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className={cn('vetro campo-entra space-y-3 rounded-2xl p-5', className)} data-testid={testId}>
      {children}
    </section>
  )
}

function TitoloScheda({ children }: { children: React.ReactNode }) {
  return <h3 className="font-heading text-lg leading-snug font-semibold tracking-tight text-rosso-testo">{children}</h3>
}

/** The Home: welcome, assistance, the recurring tasks, the coach, the next call, the Aula to pick up. */
export function SchedaHome({ campo }: { campo: CampoBase }) {
  const nome = campo.nome
  const voci = campo.home.filter((b) => b.tipo === 'voce')
  const benvenuto = campo.home.find((b) => b.tipo === 'testo')
  const assistenza = campo.home.find((b) => b.tipo === 'avviso')
  const altri = campo.home.filter((b) => b !== benvenuto && b !== assistenza && b.tipo !== 'voce')
  const daRiprendere = campo.aula.find((m) => chiusoPerche(m) === null && m.completate < m.totali)
  const lezione = daRiprendere ? prossimaLezione(daRiprendere) : null

  return (
    <div className="space-y-4" data-testid="scheda-home">
      <div className="grid gap-4 lg:grid-cols-3">
        {benvenuto ? (
          <Scheda testId="home-benvenuto">
            {benvenuto.titolo ? <TitoloScheda>{conNome(benvenuto.titolo, nome)}</TitoloScheda> : null}
            {benvenuto.corpo ? <MarkdownCliente testo={benvenuto.corpo} nome={nome} /> : null}
          </Scheda>
        ) : null}
        {assistenza ? (
          <Scheda testId="home-assistenza">
            <TitoloScheda>
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="size-5" aria-hidden="true" />
                {conNome(assistenza.titolo, nome)}
              </span>
            </TitoloScheda>
            {assistenza.corpo ? <MarkdownCliente testo={assistenza.corpo} nome={nome} /> : null}
          </Scheda>
        ) : null}
        {voci.length > 0 ? (
          <Scheda testId="home-compiti">
            <TitoloScheda>{T.compitiRicorrenti}</TitoloScheda>
            <ul className="space-y-2.5">
              {voci.map((v) => (
                <li key={v.id} className="flex gap-2.5">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-status-ok" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{conNome(v.titolo, nome)}</p>
                    {v.corpo ? <MarkdownCliente testo={v.corpo} nome={nome} className="text-sm text-muted-foreground" /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Scheda>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {campo.coach ? (
          <Scheda testId="home-coach">
            <h3 className="font-heading text-lg font-semibold tracking-tight">{T.coachRiferimento}</h3>
            <div className="flex items-center gap-4">
              <Avatar className="size-20 ring-2 ring-primary/40 sm:size-24">
                {campo.coach.fotoUrl ? <AvatarImage src={campo.coach.fotoUrl} alt="" referrerPolicy="no-referrer" /> : null}
                <AvatarFallback className="text-lg font-semibold">{iniziali(campo.coach.nome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-heading text-lg font-semibold break-words">{campo.coach.nome}</p>
                <p className="text-sm text-muted-foreground">{campo.coach.ruolo}</p>
              </div>
            </div>
          </Scheda>
        ) : null}
        <Scheda testId="home-prossima-call">
          <h3 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
            <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
            {T.prossimaCall}
          </h3>
          {campo.prossimaCall ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{T.prossimaCallTipo[campo.prossimaCall.tipo]}</p>
              <p className="glow-oro font-heading text-2xl font-semibold text-gold">
                {T.alle(`${nomeGiorno(campo.prossimaCall.giorno)} ${formatData(campo.prossimaCall.giorno)}`, campo.prossimaCall.ora)}
              </p>
              {campo.prossimaCall.meetUrl ? (
                <a
                  href={campo.prossimaCall.meetUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-light"
                >
                  <Video className="size-4" aria-hidden="true" />
                  {T.entraCall}
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{T.nessunaCall}</p>
          )}
          {daRiprendere ? (
            <div className="space-y-2 border-t border-border/70 pt-3">
              <p className="text-sm font-medium">{T.continuaAula}</p>
              <VaiA
                a={{ scheda: 'aula', modulo: daRiprendere.id, lezione: lezione?.id ?? null }}
                className="flex min-h-11 items-center gap-3 rounded-xl bg-muted/40 p-3 text-left hover:bg-accent"
              >
                <PlayCircle className="size-5 shrink-0 text-rosso-testo" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{daRiprendere.titolo}</span>
                  {lezione ? <span className="block text-sm text-muted-foreground">{T.continuaLezione(lezione.titolo)}</span> : null}
                </span>
              </VaiA>
              <BarraModulo modulo={daRiprendere} />
            </div>
          ) : null}
        </Scheda>
      </div>

      {altri.length > 0 ? (
        <Scheda>
          <ListaBlocchi blocchi={altri} nome={nome} modo="rileggi" />
        </Scheda>
      ) : null}
    </div>
  )
}

/** One check-up as the client reads it: the day, the topic, the recap, the tasks, Fathom. */
export function CardCheckup({ checkup, children }: { checkup: CheckupCliente; children?: React.ReactNode }) {
  return (
    <article className="vetro campo-entra space-y-4 rounded-2xl p-5" data-testid="checkup" data-checkup={checkup.id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {nomeGiorno(checkup.giorno)} {formatData(checkup.giorno)}
          </p>
          <h3 className="font-heading text-lg leading-snug font-semibold tracking-tight break-words">
            {checkup.argomento ?? T.argomentoMancante}
          </h3>
        </div>
        {checkup.fathomUrl ? (
          <a
            href={checkup.fathomUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
            data-testid="checkup-fathom"
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            {T.rivediFathom}
            <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {checkup.resoconto ? <MarkdownCliente testo={checkup.resoconto} /> : null}
      {checkup.compiti.length > 0 ? (
        <div className="space-y-2 rounded-xl bg-muted/40 p-4">
          <p className="text-sm font-semibold">{T.compitiProssima}</p>
          <ul className="space-y-1.5">
            {checkup.compiti.map((c, i) => (
              <li key={i} className="flex gap-2 text-[0.95rem]">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-rosso-testo" aria-hidden="true" />
                <span className="min-w-0 break-words">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {children}
    </article>
  )
}

export function SchedaCall({ campo }: { campo: CampoBase }) {
  if (campo.checkup.length === 0) {
    return (
      <p className="vetro flex items-start gap-3 rounded-2xl p-6 text-muted-foreground" data-testid="call-vuote">
        <CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        {T.callVuote}
      </p>
    )
  }
  return (
    <div className="space-y-4" data-testid="scheda-call">
      {campo.checkup.map((k) => (
        <CardCheckup key={k.id} checkup={k} />
      ))}
    </div>
  )
}

export function SchedaRegole({ campo }: { campo: CampoBase }) {
  const tutte: BloccoPercorso[] = [...campo.regolePercorso, ...campo.regole]
  if (tutte.length === 0) {
    return <p className="vetro rounded-2xl p-6 text-muted-foreground">{T.regoleVuote}</p>
  }
  return (
    <div className="space-y-4" data-testid="scheda-regole">
      {campo.regolePercorso.length > 0 ? (
        <Scheda>
          <h3 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
            <ScrollText className="size-5 text-muted-foreground" aria-hidden="true" />
            {T.regoleAccettate}
          </h3>
          <ListaBlocchi blocchi={campo.regolePercorso} nome={campo.nome} modo="rileggi" />
        </Scheda>
      ) : null}
      {campo.regole.length > 0 ? (
        <Scheda>
          <ListaBlocchi blocchi={campo.regole} nome={campo.nome} modo="rileggi" />
        </Scheda>
      ) : null}
    </div>
  )
}

export function SchedaCommunity({ campo }: { campo: CampoBase }) {
  return (
    <div className="space-y-4" data-testid="scheda-community">
      {campo.community.length > 0 ? (
        <Scheda>
          <ListaBlocchi blocchi={campo.community} nome={campo.nome} modo="rileggi" />
        </Scheda>
      ) : null}
      <Scheda>
        <h3 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
          <Users className="size-5 text-muted-foreground" aria-hidden="true" />
          Telegram
        </h3>
        {campo.linkCommunity || campo.gruppoPrivatoUrl ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {campo.linkCommunity ? (
              <a
                href={campo.linkCommunity}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-light"
              >
                {T.entraCommunity}
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : null}
            {campo.gruppoPrivatoUrl ? (
              <a
                href={campo.gruppoPrivatoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
              >
                {T.gruppoPrivato}
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{T.communityVuota}</p>
        )}
      </Scheda>
    </div>
  )
}

export { CopertinaModulo }
