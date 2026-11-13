import { EditorAula, type RigaModulo } from '@/components/onboarding/aula/editor-aula'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { CAMPO_TEAM } from '@/lib/i18n/testi/campo-base'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Impostazioni › Onboarding › Aula (1.83.0, CLAUDE.md section 34): the modules and lessons of the
 * Aula of the client's home base. Admin only, with the admin's session under RLS.
 */
export default async function AulaOnboardingPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aula_moduli')
    .select(
      'id, titolo, descrizione, copertina_url, icona, ordine, stato, durante_onboarding, created_at, lezioni:aula_lezioni(id, modulo_id, titolo, ordine, tipo, corpo, youtube_id, url, obbligatoria, pubblicata, created_at)',
    )
    .order('ordine')
    .order('created_at')
  if (error) throw new Error(t.errore)
  const moduli = (data ?? []).map((m) => ({
    ...m,
    lezioni: [...(m.lezioni ?? [])].sort((a, b) => a.ordine - b.ordine || a.created_at.localeCompare(b.created_at)),
  })) as unknown as RigaModulo[]

  return (
    <div className="max-w-5xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        indietro={{ href: '/settings/onboarding', etichetta: ONBOARDING[lingua].contenuti.indietro }}
      />
      <EditorAula moduli={moduli} />
    </div>
  )
}
