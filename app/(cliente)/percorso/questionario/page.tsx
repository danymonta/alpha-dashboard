import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Questionario } from '@/components/percorso/questionario'
import { leggiPercorsoCliente, leggiQuestionarioCliente } from '@/lib/percorso/letture'
import { TESTI_PERCORSO, TESTI_QUESTIONARIO as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: T.titolo }

/**
 * Step 3, the questionnaire (release B1b): read with the client's own session from
 * questionario_cliente() (the answers, the version, the screen, the files) and
 * percorso_cliente() (the consent in force). A step not open yet, or already sent, goes back
 * to the path; without the consent in force the page says where to give it.
 */
export default async function QuestionarioPage() {
  const supabase = await createClient()
  const [percorso, questionario] = await Promise.all([leggiPercorsoCliente(supabase), leggiQuestionarioCliente(supabase)])
  if (!questionario.ok) {
    if (questionario.motivo === 'inviato' || questionario.motivo === 'non_disponibile') redirect('/percorso')
    throw new Error(questionario.motivo === 'accesso' ? TESTI_PERCORSO.accessoNonValido : TESTI_PERCORSO.errore)
  }
  if (!percorso.ok) throw new Error(percorso.motivo === 'accesso' ? TESTI_PERCORSO.accessoNonValido : TESTI_PERCORSO.errore)

  const salute = percorso.percorso.consensi.find((c) => c.tipo === 'salute')
  const conConsenso = Boolean(salute?.datoIl) && salute?.versione === salute?.versioneInVigore
  if (!conConsenso) {
    return (
      <section className="vetro mt-10 space-y-5 rounded-[20px] p-6 text-center sm:p-10" data-testid="questionario-senza-consenso">
        <ShieldAlert className="mx-auto size-10 text-status-warning" aria-hidden="true" />
        <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">{T.serveConsenso}</h1>
        <Link
          href="/percorso"
          className="glow-primario inline-flex h-12 min-w-48 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {T.tornaPercorso}
        </Link>
      </section>
    )
  }

  const q = questionario.questionario
  return (
    <Questionario
      risposteIniziali={q.risposte}
      versioneIniziale={q.versione}
      schermataIniziale={q.schermata}
      allegatiIniziali={q.allegati}
    />
  )
}
