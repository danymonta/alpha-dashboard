import {
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Eye,
  PackageCheck,
  Target,
  TriangleAlert,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING_TEAM } from '@/lib/i18n/testi/onboarding'
import { codeDelleRighe, type Coda, type RigaIncaricato } from '@/lib/onboarding/code'
import { nomeCliente } from '@/lib/onboarding/stati'
import { cn } from '@/lib/utils'

const ICONA_CODA: Record<Coda, LucideIcon> = {
  call_da_confermare: CalendarCheck,
  call_da_segnare: ClipboardCheck,
  preparazione_incompleta: TriangleAlert,
  richiesta_community: Users,
  presentazione_da_controllare: UserCheck,
  obiettivo_da_impostare: Target,
  test_da_confermare: ClipboardCheck,
  test_da_rivedere: Eye,
  programma_da_consegnare: PackageCheck,
}

/**
 * The queues on top of the list (release B2): what the team has to do now, one box per
 * queue that has someone in it, each client a link to his card. Each person sees only the
 * queues of his incarico (the database decides: onboarding_incaricati_elenco); the admin
 * all of them. Never a count per person of the team (CLAUDE.md section 17).
 */
export function CodeTeam({ righe, lingua }: { righe: readonly RigaIncaricato[]; lingua: Lingua }) {
  const t = ONBOARDING_TEAM[lingua].code
  const code = codeDelleRighe(righe)
  if (code.length === 0) return null

  return (
    <section aria-labelledby="code-team-titolo" className="space-y-2" data-testid="code-team">
      <div className="space-y-0.5 px-1">
        <h2 id="code-team-titolo" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.titolo}
        </h2>
        <p className="text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {code.map(({ coda, righe: clienti }) => {
          const Icona = ICONA_CODA[coda]
          const critica = coda === 'preparazione_incompleta'
          return (
            <section
              key={coda}
              aria-labelledby={`coda-${coda}`}
              className="space-y-1.5 rounded-xl bg-card p-3"
              data-coda={coda}
            >
              <h3
                id={`coda-${coda}`}
                className={cn('flex items-center gap-1.5 text-sm font-medium', critica && 'text-status-warning')}
              >
                <Icona className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t.voci[coda]}</span>
                <span className="num text-muted-foreground">{clienti.length}</span>
              </h3>
              <p className="text-xs text-muted-foreground">{t.aiuto[coda]}</p>
              <ul className="-mx-1">
                {clienti.map((r) => {
                  const nome = nomeCliente(r, lingua)
                  return (
                    <li key={r.client_id}>
                      <LinkRiga
                        href={`/onboarding/${r.client_id}`}
                        aria-label={t.apri(nome)}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1 truncate">{nome}</span>
                        <IndicatoreLink riposo={<ChevronRight className="size-4 text-muted-foreground" />} />
                      </LinkRiga>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}
