import { Check, EyeOff, Laptop, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { LinkBottone } from '@/components/link-bottone'
import { DecisioneConsenso } from '@/components/oauth/decisione-consenso'
import { NOME_APP } from '@/lib/brand/nome'
import { CONSENSO, avvisoPhishing, azioniConsenso, doveTorni, maiVistoPer, type ChiCollega, type DestinazioneClaude } from '@/lib/mcp/consenso'

/*
 * The consent page's cards (Claude connected to Alpha Management, 09/10/2026).
 * Outside the shell, mobile first at 390 px, tokens only and no gold: a page
 * that asks for trust, not a data screen. Every sentence is in lib/mcp/consenso.ts.
 */

/** The frame: the app's mark on top, so the person knows where they are. */
export function PaginaConsenso({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <LogoFuoco dimensione="mini" decorativo />
          <p className="font-heading text-base font-semibold">{NOME_APP}</p>
        </div>
        {children}
      </div>
    </main>
  )
}

function Scheda({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section aria-labelledby="titolo-consenso" className="space-y-5 rounded-xl bg-card p-5">
      <h1 id="titolo-consenso" className="font-heading text-xl font-semibold tracking-tight">
        {titolo}
      </h1>
      {children}
    </section>
  )
}

/** Where the browser goes after the tap: claude.ai in large, or the computer for Claude Code. */
function DoveTorni({
  destinazione,
  etichetta = CONSENSO.dopo,
}: {
  destinazione: Pick<DestinazioneClaude, 'tipo' | 'host'>
  etichetta?: string
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">{etichetta}</p>
      {destinazione.tipo === 'claude' ? (
        <p className="text-lg font-semibold [overflow-wrap:anywhere]">{doveTorni(destinazione)}</p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-base font-semibold [overflow-wrap:anywhere]">
            <Laptop className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {doveTorni(destinazione)}
          </p>
          <p className="text-sm text-muted-foreground">{CONSENSO.loopback}</p>
        </>
      )}
    </div>
  )
}

function AvvisoLink({ testo }: { testo: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-sm font-medium">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
      {testo}
    </p>
  )
}

/** Who is connecting: name and role from the cookie profile, never from the request. */
function ChiSiCollega({ client, nome, ruolo }: { client: string; nome: string; ruolo: string }) {
  return (
    <p className="text-sm">
      <strong className="font-semibold">{client}</strong> {CONSENSO.chiede}{' '}
      <strong className="font-semibold">{nome}</strong> ({ruolo}).
    </p>
  )
}

/** First consent: what Claude may do, what it never sees, then «Consenti» or «Rifiuta». */
export function SchedaConsenso({
  authorizationId,
  client,
  destinazione,
  nome,
  ruolo,
  chi,
}: {
  authorizationId: string
  client: string
  destinazione: Pick<DestinazioneClaude, 'tipo' | 'host'>
  nome: string
  ruolo: string
  /** Role and project level: what Claude may do depends on them (22/10/2026). */
  chi: ChiCollega
}) {
  const azioni = azioniConsenso(chi)
  return (
    <Scheda titolo={CONSENSO.titolo}>
      <ChiSiCollega client={client} nome={nome} ruolo={ruolo} />
      <DoveTorni destinazione={destinazione} />
      <div className="space-y-2">
        <p className="text-sm font-medium">{CONSENSO.potra}</p>
        <ul className="space-y-1.5 text-sm">
          {azioni.map((a) => (
            <li key={a} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex gap-2 text-sm">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{CONSENSO.maiVistoInizio}</strong> {maiVistoPer(chi)}
        </span>
      </p>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{CONSENSO.team}</p>
        <p>{CONSENSO.privacy}</p>
      </div>
      <AvvisoLink testo={avvisoPhishing(destinazione.tipo)} />
      <p className="text-sm text-muted-foreground">{CONSENSO.scollega}</p>
      <DecisioneConsenso
        authorizationId={authorizationId}
        bottoni={[
          { decisione: 'consenti', etichetta: CONSENSO.consenti, primario: true },
          { decisione: 'rifiuta', etichetta: CONSENSO.rifiuta },
        ]}
      />
    </Scheda>
  )
}

/**
 * A repeat consent: Supabase approved it while reading the details and the code
 * exists already. Never forwarded without a tap: a link sent by someone else
 * must not connect their Claude to this account.
 */
export function SchedaRicollega({
  authorizationId,
  redirectUrl,
  destinazione,
  nome,
  ruolo,
}: {
  authorizationId: string
  redirectUrl: string
  destinazione: Pick<DestinazioneClaude, 'tipo' | 'host'>
  nome: string
  ruolo: string
}) {
  return (
    <Scheda titolo={CONSENSO.titoloRicollega}>
      <p className="text-sm">
        {CONSENSO.ricollega} {CONSENSO.account} <strong className="font-semibold">{nome}</strong> ({ruolo}).
      </p>
      <DoveTorni destinazione={destinazione} etichetta={CONSENSO.dopoRicollega} />
      <AvvisoLink testo={avvisoPhishing(destinazione.tipo, true)} />
      <p className="text-sm text-muted-foreground">{CONSENSO.scollega}</p>
      <DecisioneConsenso
        authorizationId={authorizationId}
        redirectUrl={redirectUrl}
        bottoni={[
          { decisione: 'continua', etichetta: CONSENSO.continua, primario: true },
          { decisione: 'annulla', etichetta: CONSENSO.annulla },
        ]}
      />
    </Scheda>
  )
}

/** Who may not connect Claude: why, and one way back that sends Claude a refusal. */
export function SchedaNonAmmesso({ authorizationId }: { authorizationId: string }) {
  return (
    <Scheda titolo={CONSENSO.titoloNonAmmesso}>
      <p className="flex items-start gap-2 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        {CONSENSO.nonAmmesso}
      </p>
      <DecisioneConsenso
        authorizationId={authorizationId}
        bottoni={[{ decisione: 'rifiuta', etichetta: CONSENSO.tornaAClaude, primario: true }]}
      />
    </Scheda>
  )
}

/**
 * A request whose return address is not Claude's. With the authorization id it
 * can still be refused in Supabase (the browser then goes nowhere).
 */
export function SchedaNonDaClaude({ authorizationId }: { authorizationId?: string }) {
  return (
    <Scheda titolo={CONSENSO.titoloNonDaClaude}>
      <p className="flex items-start gap-2 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
        {CONSENSO.nonDaClaude}
      </p>
      {authorizationId ? (
        <DecisioneConsenso
          authorizationId={authorizationId}
          bottoni={[{ decisione: 'rifiuta', etichetta: CONSENSO.rifiuta, primario: true }]}
        />
      ) : (
        <LinkBottone href="/" variant="outline" className="w-full">
          {CONSENSO.vaiAllApp}
        </LinkBottone>
      )}
    </Scheda>
  )
}

/** Expired, already used, not active, not valid: the sentence and the way into the app. */
export function SchedaMessaggio({ titolo, testo }: { titolo: string; testo: string }) {
  return (
    <Scheda titolo={titolo}>
      <p role="status" className="flex items-start gap-2 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        {testo}
      </p>
      <LinkBottone href="/" variant="outline" className="w-full">
        {CONSENSO.vaiAllApp}
      </LinkBottone>
    </Scheda>
  )
}
