import { BookOpen, CircleCheck, CirclePause, ExternalLink, PlayCircle, Rocket, SearchX, Wrench } from 'lucide-react'
import Link from 'next/link'

import { LavoroTeam } from '@/components/onboarding/team/lavoro-team'
import { AnteprimaCliente } from '@/components/percorso/campo-base/team/anteprima-cliente'
import { CheckupTeam } from '@/components/percorso/campo-base/team/checkup-team'
import { TimelineTeam } from '@/components/percorso/campo-base/team/timeline-team'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { CAMPO_TEAM } from '@/lib/i18n/testi/campo-base'
import { titoloPasso } from '@/lib/i18n/testi/onboarding'
import { permessiTeam } from '@/lib/onboarding/code'
import { leggiSchedaIncaricato, momentoLettura } from '@/lib/onboarding/team'
import { percentualeModulo } from '@/lib/percorso/campo-base'
import { leggiCampoTeam } from '@/lib/percorso/team-campo'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * «Percorso del cliente» (1.83.0, CLAUDE.md section 34): the client's home base for his team, in his
 * project. The admin, the people in charge of his onboarding and the coach of the project
 * (campo_base_team, else nothing): where he is in the onboarding (the animated timeline, the steps
 * with their dates, the team's work with its actions), his progress in the Aula, the history of the
 * check-up calls with «Aggiungi call», and «Come lo vede il cliente». Never money or payment.
 */
export default async function PercorsoProgettoPage({ params }: { params: Promise<{ id: string }> }) {
  const profilo = await requireProfilo()
  const { id } = await params
  if (!isUuid(id)) return null
  const lingua = await getLingua()
  const t = CAMPO_TEAM[lingua]
  const { formatData } = formato(lingua)
  const db = await createClient()

  const { data: progetto } = await db.from('pm_progetti').select('id, client_id').eq('id', id).maybeSingle()
  const nonTuo = <StatoVuoto Icona={SearchX} titolo={t.nonTuo} descrizione={t.nonTuoDescrizione} />
  if (!progetto?.client_id) return nonTuo

  const lettura = await leggiCampoTeam(db, progetto.client_id)
  if (!lettura.ok) {
    if (lettura.motivo === 'accesso') return nonTuo
    throw new Error(t.errore)
  }
  const campo = lettura.campo
  if (campo.inPausa) return <StatoVuoto Icona={CirclePause} titolo={t.inPausa} descrizione={t.inPausaDescrizione} />

  // the onboarding: the same function of the section Onboarding (null when he is not the caller's there)
  const scheda = campo.onboarding ? await leggiSchedaIncaricato(db, progetto.client_id) : null
  const admin = profilo.ruolo === 'admin'
  const permessi = scheda ? permessiTeam(scheda.incarichi, admin) : null
  const fatti = scheda ? scheda.passi.filter((p) => p.stato === 'fatto').length : 0
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))
  const moduli = campo.aula.filter((m) => m.stato === 'pubblicato')

  return (
    <div className="space-y-5" data-testid="percorso-progetto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-heading text-xl font-semibold">{t.titolo(campo.nomeCliente)}</h2>
          <p className="text-sm text-muted-foreground">{t.descrizione}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnteprimaCliente campo={campo} />
          {scheda ? (
            <Link
              href={`/onboarding/${progetto.client_id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t.apriOnboarding}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="titolo-punto" className="space-y-4 rounded-2xl bg-card p-4" data-testid="percorso-punto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-punto" className="font-heading text-lg font-semibold">
            {t.aCheePunto}
          </h2>
          {scheda ? <p className="num text-sm text-muted-foreground">{t.passiFatti(fatti, scheda.passi.length)}</p> : null}
        </div>
        {scheda ? (
          <>
            <div lang="it">
              <TimelineTeam passi={scheda.passi} />
            </div>
            {scheda.percorso?.stato === 'completato' ? (
              <p className="flex items-center gap-2 text-sm text-status-ok">
                <Rocket className="size-4" aria-hidden="true" />
                {t.lanciato}
              </p>
            ) : null}
            <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {scheda.passi.map((p) => (
                <li key={p.chiave} className="flex min-h-9 items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CircleCheck
                      className={cn('size-4 shrink-0', p.stato === 'fatto' ? 'text-status-ok' : 'text-muted-foreground/50')}
                      aria-hidden="true"
                    />
                    <span className="truncate">{titoloPasso(p.chiave, p.titolo, lingua)}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {p.stato === 'fatto' && p.completato_il ? t.completatoIl(giorno(p.completato_il)) : (t.statoPasso[p.stato] ?? p.stato)}
                  </span>
                </li>
              ))}
            </ol>
            {scheda.video.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label={t.videoVisti} lang="it">
                {scheda.video.map((v, i) => (
                  <li
                    key={i}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs',
                      v.visto ? 'border-status-ok/40 text-status-ok' : 'border-border text-muted-foreground',
                    )}
                  >
                    <PlayCircle className="size-3.5" aria-hidden="true" />
                    <span className="max-w-48 truncate">{v.titolo}</span>
                    <span className="num">{Math.round(v.percentuale)}%</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{campo.onboarding ? t.onboardingAltri : t.senzaOnboarding}</p>
        )}
      </section>

      {scheda && permessi ? (
        <section aria-labelledby="titolo-lavoro" className="space-y-3 rounded-2xl bg-card p-4" data-testid="percorso-lavoro">
          <h2 id="titolo-lavoro" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Wrench className="size-5 text-muted-foreground" aria-hidden="true" />
            {t.lavoro}
          </h2>
          <LavoroTeam scheda={scheda} permessi={permessi} lingua={lingua} adesso={momentoLettura()} cliente={campo.nomeCliente} />
        </section>
      ) : null}

      <section aria-labelledby="titolo-aula" className="space-y-3 rounded-2xl bg-card p-4" data-testid="percorso-aula">
        <div className="space-y-1">
          <h2 id="titolo-aula" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <BookOpen className="size-5 text-muted-foreground" aria-hidden="true" />
            {t.aula}
          </h2>
          <p className="text-sm text-muted-foreground">{t.aulaDescrizione}</p>
        </div>
        {moduli.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.aulaVuota}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {moduli.map((m) => {
              const p = percentualeModulo(m)
              return (
                <li key={m.id} className="space-y-2 rounded-xl border border-border p-3" lang="it">
                  <p className="font-medium break-words">{m.titolo}</p>
                  <div className="flex items-center gap-3">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={p}
                      aria-label={t.lezioni(m.completate, m.totali)}
                      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div className={cn('h-full rounded-full', p >= 100 ? 'bg-status-ok' : 'bg-primary')} style={{ width: `${p}%` }} />
                    </div>
                    <span className="num text-sm font-medium">{p}%</span>
                  </div>
                  <p className="num text-xs text-muted-foreground">{t.lezioni(m.completate, m.totali)}</p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <CheckupTeam
        progettoId={progetto.id}
        clientId={progetto.client_id}
        nome={campo.nomeCliente}
        checkup={campo.checkup}
        checkpointSenzaResoconto={campo.checkpointSenzaResoconto}
      />
    </div>
  )
}
