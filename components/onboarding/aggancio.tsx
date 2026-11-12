import { ChevronRight, Rocket } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { StatoOnboardingBadge } from '@/components/onboarding/stato'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { statoOnboarding, type RigaOnboarding } from '@/lib/onboarding/stati'

/**
 * The hook of the onboarding on the client's card and on the page of his «nuovo» sale
 * (the design of release A, admin only): the way to the card of his onboarding with its
 * state when it was started, «Avvia onboarding» when it is missing. Nothing when neither
 * applies (a renewal, a path already over).
 */
export function AggancioOnboarding({
  riga,
  aperto,
  hrefAvvia,
  lingua,
}: {
  /** The client's row of v_onboarding: null when his onboarding was never started. */
  riga: RigaOnboarding | null
  /** onboarding_impostazioni.aperto_ai_clienti: an active link reads «Pagamento confermato» until it is on. */
  aperto: boolean
  /** Where «Avvia onboarding» goes; null: nothing to start from here. */
  hrefAvvia: string | null
  lingua: Lingua
}) {
  const t = ONBOARDING[lingua].agganci

  if (riga?.client_id) {
    return (
      <Link
        href={`/onboarding/${riga.client_id}`}
        data-testid="aggancio-onboarding"
        data-avviato="si"
        className="flex min-h-11 items-center gap-3 rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Rocket className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t.onboarding}</span>
          <StatoOnboardingBadge stato={statoOnboarding(riga, aperto)} lingua={lingua} className="text-xs [&_svg]:size-3.5" />
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{t.apri}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    )
  }

  if (!hrefAvvia) return null

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-card px-3 py-2.5"
      data-testid="aggancio-onboarding"
      data-avviato="no"
    >
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
        <Rocket className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t.nonAvviato}</span>
          <span className="block text-xs text-muted-foreground">{t.nonAvviatoNota}</span>
        </span>
      </div>
      <LinkBottone href={hrefAvvia} variant="outline" className="px-3">
        <Rocket className="size-4" aria-hidden="true" />
        {t.avvia}
      </LinkBottone>
    </div>
  )
}
