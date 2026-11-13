import { ChevronRight, FlaskConical, Rocket, UserRoundPlus } from 'lucide-react'
import { redirect } from 'next/navigation'

import { LinkBottone } from '@/components/link-bottone'
import { StatoOnboardingBadge } from '@/components/onboarding/stato'
import { CodeTeam } from '@/components/onboarding/team/code-team'
import { ListaIncaricati } from '@/components/onboarding/team/lista-incaricati'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoIniziale } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getFormato, getLingua } from '@/lib/i18n/server'
import { ONBOARDING, ONBOARDING_TEAM, titoloPasso } from '@/lib/i18n/testi/onboarding'
import { PROVA } from '@/lib/i18n/testi/prova'
import { ELENCO_MAX, SENZA_ONBOARDING_MAX, leggiElenco } from '@/lib/onboarding/letture'
import {
  GRUPPI_LISTA,
  daQuando,
  etichettaStato,
  nomeCliente,
  perGruppo,
  statoOnboarding,
  type GruppoLista,
  type RigaOnboarding,
} from '@/lib/onboarding/stati'
import { contaIncarichi, leggiElencoIncaricati } from '@/lib/onboarding/team'
import { createClient } from '@/lib/supabase/server'

/** The new sales without onboarding in view; the others one tap away. */
const SENZA_IN_VISTA = 5

export const dynamic = 'force-dynamic'

/**
 * Onboarding (1.77.0, docs/onboarding/rilascio-a.md): the new clients from the sale to
 * the start of the path. Three groups by whose turn it is (the empty ones are not shown),
 * then the «nuovo» sales registered without their onboarding. The admin's views answer no
 * row to anyone else. Never an amount, never a list by collaborator.
 *
 * Release B2 (1.81.0): the same page for the people in charge (coach, reviewer,
 * responsible), who read only their registered clients from onboarding_incaricati_elenco()
 * (ListaIncaricati), and, for the admin too, the team's queues on top.
 */
export default async function OnboardingPage() {
  const profilo = await requireProfilo()
  const lingua = await getLingua()
  const supabase = await createClient()
  if (profilo.ruolo !== 'admin') {
    // nobody in charge of a registered client: the page is not his (the menu does not show it either)
    if ((await contaIncarichi(supabase, profilo.id)) === 0) redirect(percorsoIniziale(profilo.ruolo))
    return <ListaIncaricati righe={await leggiElencoIncaricati(supabase)} lingua={lingua} />
  }

  const t = ONBOARDING[lingua]
  const { formatData } = await getFormato()
  const [elenco, code] = await Promise.all([
    leggiElenco(supabase),
    // the queues never stop the list: without them the page says so in one line
    leggiElencoIncaricati(supabase).catch(() => null),
  ])
  const gruppi = perGruppo(elenco.righe)
  const inCorso = GRUPPI_LISTA.reduce((n, g) => n + gruppi[g].length, 0)

  const nuovoCliente = (
    <div className="flex flex-wrap gap-2">
      <LinkBottone href="/prova-onboarding" variant="outline" data-testid="prova-percorso">
        <FlaskConical className="size-4" aria-hidden="true" />
        {PROVA[lingua].bottone}
      </LinkBottone>
      <LinkBottone href="/onboarding/nuovo" data-testid="nuovo-cliente">
        <UserRoundPlus className="size-4" aria-hidden="true" />
        {t.nuovoCliente}
      </LinkBottone>
    </div>
  )

  function riga(r: RigaOnboarding) {
    const stato = statoOnboarding(r, elenco.aperto)
    const nome = nomeCliente(r, lingua)
    const quando = daQuando(r, stato)
    return (
      <li key={r.client_id}>
        <LinkRiga
          href={`/onboarding/${r.client_id}`}
          aria-label={t.lista.nomeRiga(nome, etichettaStato(stato, lingua))}
          className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          data-testid="riga-onboarding"
        >
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate text-sm font-medium">{nome}</span>
            <StatoOnboardingBadge stato={stato} lingua={lingua} className="text-xs [&_svg]:size-3.5" />
            {r.percorso_stato === 'in_corso' && r.passo_corrente ? (
              <span className="block truncate text-xs text-muted-foreground">
                {t.passoCorrente(titoloPasso(r.passo_corrente, r.passo_titolo, lingua))}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 space-y-0.5 text-right text-xs text-muted-foreground">
            {quando ? <span className="num block">{t.daQuando(formatData(oggiRoma(new Date(quando))))}</span> : null}
            <span className="block max-w-36 truncate">{r.coach_nome ? t.lista.coach(r.coach_nome) : t.lista.senzaCoach}</span>
          </span>
          <IndicatoreLink riposo={<ChevronRight className="size-4 text-muted-foreground" />} />
        </LinkRiga>
      </li>
    )
  }

  function gruppo(chiave: GruppoLista) {
    const righe = gruppi[chiave]
    if (righe.length === 0) return null
    const id = `onboarding-${chiave}`
    return (
      <section key={chiave} aria-labelledby={id} className="space-y-2" data-testid={`gruppo-${chiave}`}>
        <h2 id={id} className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.lista.conteggio(t.lista.gruppi[chiave], righe.length)}
        </h2>
        <ul className="space-y-2">{righe.map(riga)}</ul>
      </section>
    )
  }

  // the new sales without onboarding: one compact line each, the five most recent in view
  const primeSenza = elenco.senza.slice(0, SENZA_IN_VISTA)
  const altreSenza = elenco.senza.slice(SENZA_IN_VISTA)
  function rigaSenza(v: (typeof elenco.senza)[number]) {
    const nome = nomeCliente(v, lingua)
    const sotto = [v.prodotto ?? t.senzaOnboarding.senzaProdotto, v.data_vendita ? formatData(v.data_vendita) : null]
      .filter(Boolean)
      .join(' · ')
    return (
      <li key={v.sale_id} className="flex items-center justify-between gap-3 rounded-xl bg-card py-1 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="num truncate text-xs text-muted-foreground">{sotto}</p>
        </div>
        <LinkBottone
          href={`/onboarding/nuovo?vendita=${v.sale_id}`}
          variant="ghost"
          className="shrink-0 px-3"
          aria-label={t.senzaOnboarding.nomeAvvia(nome)}
        >
          <Rocket className="size-4" aria-hidden="true" />
          {t.avviaOnboarding}
        </LinkBottone>
      </li>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina titolo={t.titolo} descrizione={t.descrizione} azione={nuovoCliente} />

      {code ? (
        <CodeTeam righe={code} lingua={lingua} />
      ) : (
        <p className="px-1 text-sm text-muted-foreground" role="status">
          {ONBOARDING_TEAM[lingua].codeErrore}
        </p>
      )}

      {inCorso === 0 ? (
        <StatoVuoto
          Icona={Rocket}
          titolo={t.lista.vuotoTitolo}
          descrizione={t.lista.vuotoDescrizione}
          azione={
            <LinkBottone href="/onboarding/nuovo" variant="outline">
              <UserRoundPlus className="size-4" aria-hidden="true" />
              {t.nuovoCliente}
            </LinkBottone>
          }
        />
      ) : (
        GRUPPI_LISTA.map(gruppo)
      )}

      {elenco.senzaTotale > 0 ? (
        <section aria-labelledby="senza-onboarding" className="space-y-2" data-testid="senza-onboarding">
          <div className="space-y-1 px-1">
            <h2 id="senza-onboarding" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t.senzaOnboarding.titolo(elenco.senzaTotale)}
            </h2>
            <p className="text-sm text-muted-foreground">{t.senzaOnboarding.descrizione}</p>
          </div>
          <ul className="space-y-1.5">{primeSenza.map(rigaSenza)}</ul>
          {altreSenza.length > 0 ? (
            // the most recent ones first; the others one tap away, so the clients to start now stay in view
            <details className="group space-y-1.5" data-testid="senza-onboarding-altre">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                {t.senzaOnboarding.mostraTutte(altreSenza.length)}
              </summary>
              <ul className="space-y-1.5">{altreSenza.map(rigaSenza)}</ul>
            </details>
          ) : null}
          {elenco.senzaTotale > elenco.senza.length ? (
            <p className="px-1 text-xs text-muted-foreground">{t.lista.massimo(SENZA_ONBOARDING_MAX)}</p>
          ) : null}
        </section>
      ) : null}

      {gruppo('conclusi')}

      {elenco.tagliato ? <p className="px-1 text-xs text-muted-foreground">{t.lista.massimo(ELENCO_MAX)}</p> : null}
    </div>
  )
}
