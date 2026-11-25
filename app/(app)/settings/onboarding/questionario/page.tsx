import { LinkBottone } from '@/components/link-bottone'
import { EditorQuestionario } from '@/components/onboarding/editor-questionario'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { QUESTIONARIO_ADMIN } from '@/lib/i18n/testi/questionario-admin'
import type { RigaDomanda } from '@/lib/percorso/questionario'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Impostazioni › Questionario (1.88.0, Dany, 25/11/2026: «modificare tutto anche domande
 * eventuali così non devo farlo da codice… in modo però super chiaro e preciso»): the questions
 * of the onboarding questionnaire, read with the admin's session under RLS, and their editor.
 */
export default async function QuestionarioImpostazioniPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = QUESTIONARIO_ADMIN[lingua]
  const supabase = await createClient()
  const { data, error } = await supabase.from('onboarding_domande').select('*').order('sezione').order('ordine')
  if (error) throw new Error(t.errore)

  return (
    <div className="max-w-4xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        indietro={{ href: '/settings/onboarding', etichetta: t.indietro }}
        azione={
          <LinkBottone href="/prova-onboarding" variant="outline">
            {t.prova}
          </LinkBottone>
        }
      />
      <EditorQuestionario righe={(data ?? []) as RigaDomanda[]} />
    </div>
  )
}
