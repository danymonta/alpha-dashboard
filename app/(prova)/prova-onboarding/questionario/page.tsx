'use client'

import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect } from 'react'

import { CorniceCliente } from '../cornice-cliente'
import { INDIRIZZI_PROVA, useProva } from '@/components/percorso/prova/prova-provider'
import { Questionario } from '@/components/percorso/questionario'
import { consensoInVigore } from '@/lib/percorso/prova'
import { TESTI_QUESTIONARIO as T } from '@/lib/percorso/testi'

/**
 * The questionnaire of the fake client, as /percorso/questionario draws it: a step not open yet
 * (or already sent) goes back to the path; without the consent in force the same card says
 * where to give it. Then the same Typeform-style Questionario, which saves in the test's memory.
 */
export default function QuestionarioProva() {
  const router = useRouter()
  const { dati, stato } = useProva()
  const p = stato.passi.questionario
  const aperto = !stato.questionario.inviatoIl && (p?.stato === 'disponibile' || p?.stato === 'in_corso')

  useEffect(() => {
    if (!aperto) router.replace(INDIRIZZI_PROVA.percorso)
  }, [aperto, router])

  if (!aperto) return null

  if (!consensoInVigore(dati, stato)) {
    return (
      <CorniceCliente>
        <section className="vetro mt-10 space-y-5 rounded-[20px] p-6 text-center sm:p-10" data-testid="questionario-senza-consenso">
          <ShieldAlert className="mx-auto size-10 text-status-warning" aria-hidden="true" />
          <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">{T.serveConsenso}</h1>
          <Link
            href={INDIRIZZI_PROVA.percorso}
            className="glow-primario inline-flex h-12 min-w-48 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {T.tornaPercorso}
          </Link>
        </section>
      </CorniceCliente>
    )
  }

  return (
    <CorniceCliente>
      <Suspense fallback={null}>
        <Questionario
          risposteIniziali={stato.questionario.risposte}
          versioneIniziale={stato.questionario.versione}
          allegatiIniziali={stato.allegati}
        />
      </Suspense>
    </CorniceCliente>
  )
}
