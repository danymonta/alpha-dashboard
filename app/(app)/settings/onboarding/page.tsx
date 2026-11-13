import { ChevronRight, LayoutList } from 'lucide-react'
import Link from 'next/link'

import { ImpostazioniOnboardingForm } from '@/app/(app)/settings/onboarding/impostazioni-form'
import { AreaClienti } from '@/components/onboarding/team/area-clienti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { leggiImpostazioni, leggiMancaPerAprire, leggiPersone } from '@/lib/onboarding/letture'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Impostazioni › Onboarding (1.77.0): the people the wizard proposes, the community's
 * link and the days a link lasts. Release B2 (1.81.0): the booking page, the email
 * «Tocca a te» and the switch «Area clienti», which opens and closes only through its two
 * functions (with their checks).
 */
export default async function ImpostazioniOnboardingPage() {
  const profilo = await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = ONBOARDING[lingua].impostazioni
  const supabase = await createClient()
  const [impostazioni, persone] = await Promise.all([leggiImpostazioni(supabase), leggiPersone(supabase)])
  // what is missing before opening, said on the card: the database checks again at the tap
  const manca = impostazioni.aperto_ai_clienti ? [] : await leggiMancaPerAprire(supabase, impostazioni)

  return (
    <div className="max-w-xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        indietro={{ href: '/settings', etichetta: IMPOSTAZIONI[lingua].titolo }}
      />
      <Link
        href="/settings/onboarding/contenuti"
        className="flex min-h-14 items-center gap-3 rounded-xl bg-card p-3 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        data-testid="link-contenuti"
      >
        <LayoutList className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t.contenuti}</span>
          <span className="block text-xs text-muted-foreground">{t.contenutiAiuto}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      <AreaClienti aperto={impostazioni.aperto_ai_clienti} manca={manca} />
      <ImpostazioniOnboardingForm
        impostazioni={impostazioni}
        persone={persone.map(({ id, nome }) => ({ id, nome }))}
        io={profilo.id}
      />
    </div>
  )
}
