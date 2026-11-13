import { ChevronRight, CircleCheck, CirclePause, ListChecks, Rocket, TriangleAlert } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { CodeTeam } from '@/components/onboarding/team/code-team'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING, ONBOARDING_TEAM, titoloPasso } from '@/lib/i18n/testi/onboarding'
import {
  GRUPPI_INCARICATI,
  codeDellaRiga,
  incarichiDi,
  perGruppoIncaricati,
  type GruppoIncaricato,
  type RigaIncaricato,
} from '@/lib/onboarding/code'
import { nomeCliente } from '@/lib/onboarding/stati'
import { cn } from '@/lib/utils'

/**
 * The section Onboarding for the people in charge (release B2): the queues on top, then
 * their registered clients in four groups («Tocca a te», «Tocca al cliente», «In pausa»,
 * «Completati»). Read from onboarding_incaricati_elenco(): never the link, the payment or
 * the log, a paused client without why.
 */
export function ListaIncaricati({ righe, lingua }: { righe: readonly RigaIncaricato[]; lingua: Lingua }) {
  const t = ONBOARDING_TEAM[lingua]
  const titolo = ONBOARDING[lingua].titolo
  const gruppi = perGruppoIncaricati(righe)

  function riga(r: RigaIncaricato, gruppo: GruppoIncaricato) {
    const nome = nomeCliente(r, lingua)
    const incarichi = incarichiDi(r).map((i) => t.incarichi[i])
    const code = codeDellaRiga(r)
    const sotto =
      gruppo === 'in_pausa'
        ? t.lista.inPausa
        : gruppo === 'completati'
          ? t.lista.completato
          : r.passo
            ? t.lista.passo(titoloPasso(r.passo, r.passo_titolo, lingua))
            : null
    return (
      <li key={r.client_id}>
        <LinkRiga
          href={`/onboarding/${r.client_id}`}
          className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          data-testid="riga-incaricato"
        >
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate text-sm font-medium">{nome}</span>
            {sotto ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {gruppo === 'in_pausa' ? <CirclePause className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                {gruppo === 'completati' ? (
                  <CircleCheck className="size-3.5 shrink-0 text-status-ok" aria-hidden="true" />
                ) : null}
                <span className="truncate">{sotto}</span>
              </span>
            ) : null}
            {code.length > 0 ? (
              <span className="flex flex-wrap gap-1 pt-0.5">
                {code.map((coda) => (
                  <span
                    key={coda}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium',
                      coda === 'preparazione_incompleta' ? 'bg-status-warning/10 text-status-warning' : 'bg-selezione',
                    )}
                    data-coda-riga={coda}
                  >
                    {coda === 'preparazione_incompleta' ? (
                      <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                    ) : null}
                    {t.code.vociRiga[coda] ?? t.code.voci[coda]}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          {incarichi.length > 0 ? (
            <span className="shrink-0 text-right text-xs text-muted-foreground">{incarichi.join(' · ')}</span>
          ) : null}
          <IndicatoreLink riposo={<ChevronRight className="size-4 text-muted-foreground" />} />
        </LinkRiga>
      </li>
    )
  }

  return (
    <div className="max-w-3xl space-y-6" data-testid="onboarding-incaricati">
      <IntestazionePagina titolo={titolo} descrizione={t.lista.descrizione} />
      {righe.length === 0 ? (
        <StatoVuoto
          Icona={Rocket}
          titolo={t.lista.vuotoTitolo}
          descrizione={t.lista.vuotoDescrizione}
          azione={
            <LinkBottone href="/task" variant="outline">
              <ListChecks className="size-4" aria-hidden="true" />
              {t.lista.vaiAiTask}
            </LinkBottone>
          }
        />
      ) : (
        <>
          <CodeTeam righe={righe} lingua={lingua} />
          {GRUPPI_INCARICATI.map((g) => {
            const elenco = gruppi[g]
            if (elenco.length === 0) return null
            const id = `incaricati-${g}`
            return (
              <section key={g} aria-labelledby={id} className="space-y-2" data-testid={`gruppo-${g}`}>
                <h2 id={id} className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t.lista.conteggio(t.lista.gruppi[g], elenco.length)}
                </h2>
                <ul className="space-y-2">{elenco.map((r) => riga(r, g))}</ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
