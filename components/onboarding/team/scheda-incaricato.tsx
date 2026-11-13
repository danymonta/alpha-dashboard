import { CirclePause, ExternalLink, ListChecks, MessageCircle, PlayCircle, Rocket, Wrench } from 'lucide-react'

import { QuestionarioScheda } from '@/components/onboarding/questionario-scheda'
import { LavoroTeam } from '@/components/onboarding/team/lavoro-team'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING, ONBOARDING_TEAM, titoloPasso } from '@/lib/i18n/testi/onboarding'
import { incarichiDi, permessiTeam } from '@/lib/onboarding/code'
import { nomeCliente } from '@/lib/onboarding/stati'
import type { SchedaIncaricato } from '@/lib/onboarding/team'
import { eStatoPasso } from '@/lib/validation/onboarding'
import { cn } from '@/lib/utils'

/**
 * The card of a client for a person in charge (release B2): his incarico, the team's work
 * on the client, the steps, the videos watched, Telegram (coach and responsible) and the
 * questionnaire with its files (the coach only). Read from onboarding_scheda_incaricato():
 * never the link, the payment, the sale or the log; a paused client only says so.
 */
export function SchedaIncaricatoPagina({
  scheda,
  lingua,
  adesso,
}: {
  scheda: SchedaIncaricato
  lingua: Lingua
  adesso: number
}) {
  const t = ONBOARDING_TEAM[lingua]
  const o = ONBOARDING[lingua]
  const { formatData, formatPercentuale } = formato(lingua)
  const nome = nomeCliente(scheda, lingua)
  const incarichi = incarichiDi(scheda).map((i) => t.incarichi[i])
  const permessi = permessiTeam(scheda.incarichi, false)
  const indietro = { href: '/onboarding', etichetta: o.titolo }
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))

  const intestazione = (
    <IntestazionePagina
      titolo={t.scheda.titolo(nome)}
      indietro={indietro}
      descrizione={incarichi.length > 0 ? t.tuoIncarico(incarichi.join(', ')) : undefined}
    />
  )

  if (scheda.in_pausa) {
    return (
      <div className="max-w-3xl space-y-6" data-testid="scheda-incaricato">
        {intestazione}
        <StatoVuoto Icona={CirclePause} titolo={t.scheda.inPausaTitolo} descrizione={t.scheda.inPausaDescrizione} />
      </div>
    )
  }

  const telegram = scheda.telegram
  const questionario = scheda.questionario
  const allegati = (scheda.allegati ?? []).map((a) => ({
    ...a,
    tipo: /\.pdf$/i.test(a.nome_file) ? 'application/pdf' : 'image/*',
  }))

  return (
    <div className="max-w-5xl space-y-6" data-testid="scheda-incaricato">
      {intestazione}

      {scheda.percorso?.stato === 'completato' ? (
        <p className="flex items-center gap-2 rounded-xl bg-card p-3 text-sm text-status-ok" data-testid="incaricato-completato">
          <Rocket className="size-4 shrink-0" aria-hidden="true" />
          {t.scheda.completato}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="lavoro-titolo" className="space-y-3 rounded-xl bg-card p-3" data-testid="riquadro-lavoro">
            <div className="space-y-0.5 py-1.5">
              <h2 id="lavoro-titolo" className="flex items-center gap-1.5 text-sm font-medium">
                <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.scheda.lavoro}
              </h2>
              <p className="text-xs text-muted-foreground">{t.scheda.lavoroDescrizione}</p>
            </div>
            <LavoroTeam scheda={scheda} permessi={permessi} lingua={lingua} adesso={adesso} cliente={nome} />
          </section>

          {permessi.questionario && questionario !== undefined ? (
            <QuestionarioScheda
              lingua={lingua}
              senzaContatti
              questionario={
                questionario
                  ? {
                      risposte: questionario.risposte ?? {},
                      inviato_il: questionario.inviato_il,
                      schermata: null,
                      updated_at: null,
                    }
                  : null
              }
              allegati={allegati}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <section aria-labelledby="passi-incaricato" className="rounded-xl bg-card p-3" data-testid="passi-incaricato">
            <h2 id="passi-incaricato" className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
              {o.passi.titolo}
            </h2>
            <ol className="divide-y divide-border">
              {scheda.passi.map((p, i) => {
                const stato = eStatoPasso(p.stato) ? p.stato : 'bloccato'
                return (
                  <li key={p.chiave} className="flex items-start gap-3 py-2" data-passo={p.chiave} data-stato={stato}>
                    <span className={cn('min-w-0 flex-1 text-sm break-words', stato === 'bloccato' && 'text-muted-foreground')}>
                      {o.passi.numero(i + 1, titoloPasso(p.chiave, p.titolo, lingua))}
                      {p.completato_il ? (
                        <span className="num block text-xs text-muted-foreground">
                          {o.passi.completatoIl(giorno(p.completato_il))}
                        </span>
                      ) : null}
                    </span>
                    <span className={cn('shrink-0 text-xs', stato === 'fatto' ? 'text-status-ok' : 'text-muted-foreground')}>
                      {o.passi.stati[stato]}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>

          <section aria-labelledby="video-incaricato" className="rounded-xl bg-card p-3" data-testid="video-incaricato">
            <div className="space-y-0.5 py-1.5">
              <h2 id="video-incaricato" className="flex items-center gap-1.5 text-sm font-medium">
                <PlayCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.scheda.video}
              </h2>
              <p className="text-xs text-muted-foreground">{t.scheda.videoDescrizione}</p>
            </div>
            {scheda.video.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t.scheda.videoVuoto}</p>
            ) : (
              <ul className="space-y-2.5 pt-1">
                {scheda.video.map((v, i) => (
                  <li key={`${v.tipo}-${i}`} className="space-y-1">
                    <p className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words">
                        {v.titolo}
                        {v.obbligatorio ? <span className="text-xs text-muted-foreground"> · {t.scheda.obbligatorio}</span> : null}
                      </span>
                      <span className={cn('num shrink-0 text-xs', v.visto ? 'text-status-ok' : 'text-muted-foreground')}>
                        {v.visto ? t.scheda.visto : formatPercentuale(v.percentuale / 100)}
                      </span>
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, v.percentuale)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {telegram !== undefined ? (
            <section aria-labelledby="telegram-incaricato" className="rounded-xl bg-card p-3" data-testid="telegram-incaricato">
              <h2 id="telegram-incaricato" className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
                <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.scheda.telegram}
              </h2>
              {!telegram?.username && !telegram?.gruppo_privato_url ? (
                <p className="text-sm text-muted-foreground">{t.scheda.telegramVuoto}</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{t.scheda.telegramUsername}</dt>
                    <dd className="min-w-0 break-all">{telegram?.username ? `@${telegram.username}` : t.scheda.nessuno}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{t.scheda.telegramGruppo}</dt>
                    <dd>
                      {telegram?.gruppo_privato_url ? (
                        <a
                          href={telegram.gruppo_privato_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                        >
                          {t.scheda.apriGruppo}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        t.scheda.nessuno
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
