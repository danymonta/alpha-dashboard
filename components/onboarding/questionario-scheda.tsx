import { ChevronDown, ClipboardList, Download, FileText, ImageIcon } from 'lucide-react'

import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import type { AllegatoScheda, QuestionarioScheda } from '@/lib/onboarding/letture'
import { dimensioneInParole } from '@/lib/percorso/allegati'
import { SCHERMATE, domandeDi, rispostaInParole } from '@/lib/percorso/questionario'

/**
 * The box «Questionario» of the card (release B1b): the client's answers in the 4 screens of
 * the form, read only, and the files he uploaded. Health data: the admin only (RLS; B2 the
 * coach in charge through his own function). The questions and the answers stay in Italian
 * in both languages (they are the client's data, marked lang="it"). A file opens through
 * /api/onboarding/allegati/[id]: a signed address of 60 seconds, always downloaded.
 */
/** The questions with the client's contacts: the admin's only. */
const DOMANDE_CONTATTO = new Set(['email', 'telefono'])

export function QuestionarioScheda({
  lingua,
  questionario,
  allegati,
  senzaContatti = false,
}: {
  lingua: Lingua
  /** The coach's sheet: the email and the phone never reach him (the function drops them), so no empty rows. */
  senzaContatti?: boolean
  /** The coach's function (B2) gives neither the screen nor the last save: null. */
  questionario:
    | (Omit<QuestionarioScheda, 'schermata' | 'updated_at'> & { schermata: number | null; updated_at: string | null })
    | null
  /** The coach's function gives no size: undefined. */
  allegati: readonly (Omit<AllegatoScheda, 'byte'> & { byte?: number })[]
}) {
  const t = ONBOARDING[lingua].cliente
  const { formatData } = formato(lingua)
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))

  return (
    <section aria-labelledby="questionario-titolo" className="rounded-xl bg-card p-3" data-testid="riquadro-questionario">
      <div className="space-y-0.5 py-1.5">
        <h2 id="questionario-titolo" className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
          {t.questionarioTitolo}
        </h2>
        <p className="text-xs text-muted-foreground">{t.questionarioDescrizione}</p>
      </div>

      {!questionario ? (
        <p className="py-2 text-sm text-muted-foreground">{t.questionarioVuoto}</p>
      ) : (
        <div className="space-y-3 pt-1">
          <p
            className={questionario.inviato_il ? 'num text-sm font-medium text-status-ok' : 'num text-sm text-muted-foreground'}
            data-testid="questionario-stato"
          >
            {questionario.inviato_il
              ? t.questionarioInviato(giorno(questionario.inviato_il))
              : questionario.schermata !== null && questionario.updated_at
                ? t.questionarioInCorso(questionario.schermata, giorno(questionario.updated_at))
                : t.questionarioNonInviato}
          </p>
          <div lang="it" className="space-y-1">
            {SCHERMATE.map((s) => (
              <details key={s.numero} className="group rounded-lg border border-border/70" open={s.numero === 1}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="num mr-1.5 text-muted-foreground">{s.numero}.</span>
                    {s.titolo}
                  </span>
                  {/* display:flex hides the marker of the browser: the chevron says it opens */}
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <dl className="divide-y divide-border/70 border-t border-border/70">
                  {domandeDi(s.numero).filter((d) => !senzaContatti || !DOMANDE_CONTATTO.has(d.chiave)).map((d) => {
                    const risposta = rispostaInParole(d, questionario.risposte[d.chiave])
                    return (
                      <div key={d.chiave} className="space-y-1 px-3 py-2.5" data-risposta={d.chiave}>
                        <dt className="text-xs text-muted-foreground">{d.testo}</dt>
                        <dd className={risposta ? 'text-sm break-words whitespace-pre-line' : 'text-sm text-muted-foreground italic'}>
                          {risposta ?? t.nonRisposto}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
        <h3 className="text-xs font-medium text-muted-foreground">{t.allegatiTitolo}</h3>
        {allegati.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.allegatiVuoto}</p>
        ) : (
          <ul className="-mx-2">
            {allegati.map((a) => {
              const isPdf = a.tipo === 'application/pdf'
              const Icona = isPdf ? FileText : ImageIcon
              return (
                <li key={a.id}>
                  <a
                    href={`/api/onboarding/allegati/${a.id}`}
                    aria-label={t.scaricaFile(a.nome_file)}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    data-allegato-admin={a.id}
                  >
                    <Icona className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.nome_file}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {[
                          t.campiAllegato[a.campo] ?? a.campo,
                          isPdf ? t.filePdf : t.fileFoto,
                          a.byte !== undefined ? dimensioneInParole(a.byte) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
