import { CircleCheck, Clapperboard, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { InterruttoriAnalisi, LimiteSpesaAnalisi } from '@/app/(app)/settings/instagram/analisi-client'
import { quando } from '@/app/(app)/settings/instagram/quando'
import { buttonVariants } from '@/components/ui/button'
import type { Lingua } from '@/lib/i18n/lingua'
import { formatDollari, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { INSTAGRAM_IMPOSTAZIONI } from '@/lib/i18n/testi/instagram-impostazioni'
import type { Situazione } from '@/lib/marketing/analisi/elenco'
import { cn } from '@/lib/utils'

function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * Impostazioni › Instagram e Messenger › «Analisi dei reel» (1.36.0, CLAUDE.md
 * section 30): the admin's view of marketing_lavori_situazione() and the three
 * settings (monthly limit, automatic analyses, the team's notes). The cost is
 * SQL's (insight_costo_usd and the Whisper hour); this page only says it.
 */
export function BloccoAnalisi({
  situazione,
  claudeConfigurato,
  voceConfigurata,
  statisticheAttive,
  adesso,
  oggi,
  lingua = 'it',
}: {
  situazione: Situazione | null
  claudeConfigurato: boolean
  voceConfigurata: boolean
  /** Meta said the permission for the statistics is missing: false */
  statisticheAttive: boolean | null
  adesso: number
  oggi: string
  lingua?: Lingua
}) {
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].analisi
  const s = situazione
  const tickFermo = s?.ultimo_tick_il ? adesso - Date.parse(s.ultimo_tick_il) > 15 * 60_000 : false
  return (
    <section
      id="analisi-reel"
      aria-labelledby="titolo-analisi-reel"
      className="space-y-3 rounded-xl bg-card p-4"
      data-testid="analisi-reel-stato"
    >
      <div className="space-y-1">
        <h2 id="titolo-analisi-reel" className="text-sm font-medium">
          {t.titolo}
        </h2>
        <p className="text-sm text-muted-foreground">{t.descrizione}</p>
      </div>

      {!claudeConfigurato ? (
        <p className="flex items-start gap-2 text-sm font-medium text-status-critical" data-testid="analisi-spente">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.spente}
        </p>
      ) : null}
      {!voceConfigurata ? (
        <p className="flex items-start gap-2 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.senzaVoce}
        </p>
      ) : null}
      {statisticheAttive === false ? (
        <p className="flex items-start gap-2 text-sm text-status-warning" data-testid="analisi-permesso">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.permesso}
        </p>
      ) : null}

      <dl className="divide-y divide-border">
        <Voce etichetta={t.trascrizioni}>
          {s ? (
            <span className="inline-flex items-start gap-1.5">
              {s.automatiche === 'attive' ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
              )}
              <span>{t.modo[s.automatiche]}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t.nonSiLegge}</span>
          )}
        </Voce>
        <Voce etichetta={t.spesa}>
          {s && typeof s.costo_mese === 'number' && typeof s.costo_max === 'number' ? (
            <span className="num" data-testid="analisi-costo">
              {t.costo(formatDollari(s.costo_mese, lingua), formatDollari(s.costo_max, lingua))}
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </Voce>
        <Voce etichetta={t.inCoda}>
          <span className="num">{s ? s.in_coda : 0}</span>
        </Voce>
        <Voce etichetta={t.ultimoPasso}>
          {s?.ultimo_passo_il ? (
            <span className="num inline-flex items-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {quando(s.ultimo_passo_il, oggi, lingua)}
              {s.ultimo_esito ? ` · ${t.esitoPasso(s.ultimo_esito)}` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">{t.ancoraNessuno}</span>
          )}
          {s?.ultimo_errore ? (
            <span className="mt-1 flex items-start gap-1.5 text-status-critical" data-testid="analisi-ultimo-errore">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {traduciImpostazioni(s.ultimo_errore, lingua)}
            </span>
          ) : null}
          {tickFermo ? (
            <span className="mt-1 flex items-start gap-1.5 text-status-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t.fermo}
            </span>
          ) : null}
        </Voce>
      </dl>

      {s ? (
        <div className="space-y-4">
          <LimiteSpesaAnalisi valore={s.costo_max ?? 25} />
          <InterruttoriAnalisi automatiche={s.automatiche_accese ?? true} noteTeam={s.note_team ?? true} />
        </div>
      ) : null}

      <Link href="/marketing/pubblicati" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full sm:w-auto')}>
        <Clapperboard className="size-4" aria-hidden="true" />
        {t.apriPubblicati}
      </Link>
    </section>
  )
}
