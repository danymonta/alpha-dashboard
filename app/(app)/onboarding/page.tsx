import { ChevronRight, Rocket, UserRoundPlus } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { StatoOnboardingBadge } from '@/components/onboarding/stato'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getFormato, getLingua } from '@/lib/i18n/server'
import { ONBOARDING, titoloPasso } from '@/lib/i18n/testi/onboarding'
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
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Onboarding (1.77.0, docs/onboarding/rilascio-a.md): the new clients from the sale to
 * the start of the path. Three groups by whose turn it is (the empty ones are not shown),
 * then the «nuovo» sales registered without their onboarding. Admin only: the views
 * answer no row to anyone else. Never an amount, never a list by collaborator.
 */
export default async function OnboardingPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = ONBOARDING[lingua]
  const { formatData } = await getFormato()
  const supabase = await createClient()
  const elenco = await leggiElenco(supabase)
  const gruppi = perGruppo(elenco.righe)
  const inCorso = GRUPPI_LISTA.reduce((n, g) => n + gruppi[g].length, 0)

  const nuovoCliente = (
    <LinkBottone href="/onboarding/nuovo" data-testid="nuovo-cliente">
      <UserRoundPlus className="size-4" aria-hidden="true" />
      {t.nuovoCliente}
    </LinkBottone>
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

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina titolo={t.titolo} descrizione={t.descrizione} azione={nuovoCliente} />

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
          <ul className="space-y-2">
            {elenco.senza.map((v) => {
              const nome = nomeCliente(v, lingua)
              return (
                <li
                  key={v.sale_id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 basis-40 space-y-0.5">
                    <p className="truncate text-sm font-medium">{nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.prodotto ?? t.senzaOnboarding.senzaProdotto}</p>
                    {v.data_vendita ? (
                      <p className="num text-xs text-muted-foreground">{t.senzaOnboarding.venditaDel(formatData(v.data_vendita))}</p>
                    ) : null}
                  </div>
                  <LinkBottone
                    href={`/onboarding/nuovo?vendita=${v.sale_id}`}
                    variant="outline"
                    className="px-3"
                    aria-label={t.senzaOnboarding.nomeAvvia(nome)}
                  >
                    <Rocket className="size-4" aria-hidden="true" />
                    {t.avviaOnboarding}
                  </LinkBottone>
                </li>
              )
            })}
          </ul>
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
