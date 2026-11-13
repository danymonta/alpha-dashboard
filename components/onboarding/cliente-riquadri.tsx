import { CircleCheck, CircleDashed, KeyRound, PauseCircle, PlayCircle, ShieldCheck, ShieldOff, UserRoundCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { RevocaConsenso } from '@/components/onboarding/revoca-consenso'
import type { ConsensoScheda, VideoScheda } from '@/lib/onboarding/letture'
import { cn } from '@/lib/utils'

function Riquadro({
  id,
  titolo,
  Icona,
  descrizione,
  children,
  testId,
}: {
  id: string
  titolo: string
  Icona: typeof KeyRound
  descrizione?: string
  children: ReactNode
  testId: string
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-card p-3" data-testid={testId}>
      <div className="space-y-0.5 py-1.5">
        <h2 id={id} className="flex items-center gap-1.5 text-sm font-medium">
          <Icona className="size-4 text-muted-foreground" aria-hidden="true" />
          {titolo}
        </h2>
        {descrizione ? <p className="text-xs text-muted-foreground">{descrizione}</p> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * The client's side of the card, read by the admin (release B1a): the account of the area
 * (v_onboarding.account_stato and registrato_il), the consents given with their version,
 * the videos of the CMS watched with their percentage. Admin only (RLS). The videos are
 * the client's own, never a measure of the team (CLAUDE.md section 17).
 */
export function RiquadriCliente({
  clientId,
  cliente,
  lingua,
  accountStato,
  registratoIl,
  consensi,
  video,
}: {
  clientId: string
  cliente: string
  lingua: Lingua
  accountStato: string | null
  registratoIl: string | null
  consensi: readonly ConsensoScheda[]
  video: readonly VideoScheda[]
}) {
  const t = ONBOARDING[lingua].cliente
  const { formatData, formatPercentuale } = formato(lingua)
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))
  const versione = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatData(v) : v)

  return (
    <>
      <Riquadro id="accesso-titolo" titolo={t.accessoTitolo} Icona={KeyRound} descrizione={t.accessoDescrizione} testId="riquadro-accesso">
        {accountStato ? (
          <div className="space-y-1.5 py-2 text-sm" data-account={accountStato}>
            <p className="flex items-center gap-2 font-medium">
              {accountStato === 'attivo' ? (
                <UserRoundCheck className="size-4 text-status-ok" aria-hidden="true" />
              ) : (
                <PauseCircle className="size-4 text-status-warning" aria-hidden="true" />
              )}
              {t.statoAccount(t.statiAccount[accountStato] ?? accountStato)}
            </p>
            {registratoIl ? <p className="num text-muted-foreground">{t.registratoIl(giorno(registratoIl))}</p> : null}
            {accountStato === 'sospeso' ? <p className="text-xs text-muted-foreground">{t.sospesoNota}</p> : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <CircleDashed className="size-4" aria-hidden="true" />
            {t.nonRegistrato}
          </p>
        )}
      </Riquadro>

      {/* before the registration there are no consents nor videos: one line in the box above says so */}
      {accountStato ? (
        <>
      <Riquadro id="consensi-titolo" titolo={t.consensiTitolo} Icona={ShieldCheck} testId="riquadro-consensi">
        {consensi.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t.consensiVuoto}</p>
        ) : (
          <ul className="divide-y divide-border">
            {consensi.map((c) => (
              <li key={c.id} className="flex items-start gap-2 py-2.5 text-sm" data-consenso={c.tipo}>
                {c.revocato_il ? (
                  <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{t.tipiConsenso[c.tipo] ?? c.tipo}</p>
                  <p className="num text-xs text-muted-foreground">
                    {[t.versione(versione(c.versione)), t.datoIl(giorno(c.dato_il)), c.revocato_il ? t.revocatoIl(giorno(c.revocato_il)) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* release B1b: the client asks the team to withdraw the consent on health data */}
        {consensi.some((c) => c.tipo === 'salute' && !c.revocato_il) ? (
          <div className="-mx-1 border-t border-border pt-1.5">
            <RevocaConsenso clientId={clientId} cliente={cliente} />
          </div>
        ) : null}
      </Riquadro>

      <Riquadro id="video-titolo" titolo={t.videoTitolo} Icona={PlayCircle} testId="riquadro-video">
        {video.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t.videoVuoto}</p>
        ) : (
          <ul className="divide-y divide-border">
            {video.map((v) => {
              const visto = v.visto_il !== null
              return (
                <li key={v.id} className="space-y-1.5 py-2.5 text-sm" data-video-visto={visto}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words">{v.titolo ?? t.videoSenzaTitolo}</p>
                    <span className={cn('flex shrink-0 items-center gap-1 text-xs', visto ? 'text-status-ok' : 'text-muted-foreground')}>
                      {visto ? <CircleCheck className="size-3.5" aria-hidden="true" /> : null}
                      {visto ? t.visto : t.daFinire}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={cn('h-full rounded-full', visto ? 'bg-status-ok' : 'bg-primary')}
                        style={{ width: `${Math.min(100, v.percentuale)}%` }}
                      />
                    </div>
                    <span className="num text-xs text-muted-foreground">{t.percentuale(formatPercentuale(v.percentuale / 100))}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Riquadro>
        </>
      ) : null}
    </>
  )
}
