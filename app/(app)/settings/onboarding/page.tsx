import { ImpostazioniOnboardingForm } from '@/app/(app)/settings/onboarding/impostazioni-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { leggiImpostazioni, leggiPersone } from '@/lib/onboarding/letture'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Impostazioni › Onboarding (1.77.0): the people the wizard proposes, the community's
 * link and the days a link lasts. «Area clienti» (aperto_ai_clienti) is read only: no
 * session writes it, it opens with release B.
 */
export default async function ImpostazioniOnboardingPage() {
  const profilo = await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = ONBOARDING[lingua].impostazioni
  const supabase = await createClient()
  const [impostazioni, persone] = await Promise.all([leggiImpostazioni(supabase), leggiPersone(supabase)])

  return (
    <div className="max-w-xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        indietro={{ href: '/settings', etichetta: IMPOSTAZIONI[lingua].titolo }}
      />
      <ImpostazioniOnboardingForm
        impostazioni={impostazioni}
        persone={persone.map(({ id, nome }) => ({ id, nome }))}
        io={profilo.id}
      />
    </div>
  )
}
