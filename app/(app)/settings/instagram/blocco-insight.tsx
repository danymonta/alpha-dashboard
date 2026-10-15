import { CircleCheck, Clock, Sparkles, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { quando } from '@/app/(app)/settings/instagram/quando'
import { buttonVariants } from '@/components/ui/button'
import { formatNumero, VUOTO } from '@/lib/format'
import {
  AVVISO_STATISTICHE,
  esecuzioneInCorso,
  haAvvisoStatistiche,
  pianificatoreFermo,
  type EsecuzioneInsightAdmin,
  type StatoInsightAdmin,
} from '@/lib/insight/stato'
import { cn } from '@/lib/utils'

const dollari = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * «Ultimo recap: oggi alle 19:02 · 112 chat · 9 lead attribuiti a un post ·
 * 0,94 $ di Claude»: the latest run, as insight_stato() gives it to the admin.
 * The cost is SQL's (insight_costo_usd, D19); the errors are fixed sentences.
 */
function UltimoRecap({ esecuzione, oggi }: { esecuzione: EsecuzioneInsightAdmin | null; oggi: string }) {
  if (!esecuzione) return <span className="text-muted-foreground">Ancora nessun recap</span>
  if (esecuzioneInCorso({ esecuzione })) {
    return <span className="num">Aggiornamento in corso, avviato {quando(esecuzione.creata_il, oggi)}</span>
  }
  const fine = esecuzione.finita_il ?? esecuzione.creata_il
  if (esecuzione.stato === 'fallita') {
    return (
      <span className="flex items-start gap-1.5 text-status-critical" data-testid="insight-ultimo-errore">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="num">Non riuscito {quando(fine, oggi)}</span>
          {esecuzione.errore ? `: ${esecuzione.errore}` : '.'}
        </span>
      </span>
    )
  }
  const parti = [quando(fine, oggi)]
  if (esecuzione.chat_instagram !== null || esecuzione.chat_messenger !== null) {
    const chat = (esecuzione.chat_instagram ?? 0) + (esecuzione.chat_messenger ?? 0)
    parti.push(`${formatNumero(chat)} chat`)
  }
  if (esecuzione.chat_attribuite !== null) {
    const n = esecuzione.chat_attribuite
    parti.push(`${formatNumero(n)} ${n === 1 ? 'lead attribuito' : 'lead attribuiti'} a un post`)
  }
  if (esecuzione.costo_usd !== null) parti.push(`${dollari.format(esecuzione.costo_usd)} $ di Claude`)
  return <span className="num">{parti.join(' · ')}</span>
}

/** «Token in cache: 182.400 letti, 9.100 scritti»: the cached system prompt at work (D14). */
function TokenInCache({ esecuzione }: { esecuzione: EsecuzioneInsightAdmin | null }) {
  if (!esecuzione || (esecuzione.token_cache_letti === null && esecuzione.token_cache_scritti === null)) {
    return <span className="text-muted-foreground">{VUOTO}</span>
  }
  return (
    <span className="num">
      {formatNumero(esecuzione.token_cache_letti ?? 0)} letti, {formatNumero(esecuzione.token_cache_scritti ?? 0)}{' '}
      scritti
    </span>
  )
}

/**
 * Impostazioni › Instagram e Messenger › «Insight ultime 24h» (1.35.0): read
 * only, the admin's view of insight_stato(). Whether ANTHROPIC_API_KEY is set
 * is known to the server only (D23): this page is the admin's.
 */
export function BloccoInsight({
  stato,
  configurato,
  adesso,
  oggi,
}: {
  stato: StatoInsightAdmin | null
  configurato: boolean
  /** epoch ms of this render */
  adesso: number
  oggi: string
}) {
  const esecuzione = stato?.esecuzione ?? null
  const fermo = stato !== null && pianificatoreFermo(stato, new Date(adesso))

  return (
    <section
      id="insight"
      aria-labelledby="titolo-insight"
      className="space-y-3 rounded-xl bg-card p-4"
      data-testid="insight-stato"
    >
      <div className="space-y-1">
        <h2 id="titolo-insight" className="text-sm font-medium">
          Insight ultime 24h
        </h2>
        <p className="text-sm text-muted-foreground">
          Il recap dei DM di Instagram e Messenger che Claude prepara ogni giorno. Le chat restano nel gestionale al
          massimo 30 giorni.
        </p>
      </div>

      {!configurato ? (
        <p className="flex items-start gap-2 text-sm font-medium text-status-critical" data-testid="insight-spento">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Insight spento: manca ANTHROPIC_API_KEY su Vercel.
        </p>
      ) : null}
      {haAvvisoStatistiche(stato) ? (
        <p className="flex items-start gap-2 text-sm text-status-warning" data-testid="insight-avviso-statistiche">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {AVVISO_STATISTICHE}
        </p>
      ) : null}

      <dl className="divide-y divide-border">
        <Voce etichetta="Automazione">
          {stato?.attivo ? (
            <span className="inline-flex items-start gap-1.5">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              <span>
                Attiva: recap pronto ogni giorno alle <span className="num">{stato.ora}</span>.
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Disattivata.</span>
          )}{' '}
          <span className="text-muted-foreground">Si cambia in cima all’Insight.</span>
        </Voce>
        <Voce etichetta="Ultimo recap">
          <UltimoRecap esecuzione={esecuzione} oggi={oggi} />
        </Voce>
        <Voce etichetta="Token in cache">
          <TokenInCache esecuzione={esecuzione} />
        </Voce>
        <Voce etichetta="Pianificatore">
          {stato?.ultimo_tick_il ? (
            <span className="num inline-flex items-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Ultimo controllo {quando(stato.ultimo_tick_il, oggi)}
            </span>
          ) : (
            <span className="text-muted-foreground">Nessun controllo finora</span>
          )}
          {fermo ? (
            <span className="mt-1 flex items-start gap-1.5 text-status-warning" data-testid="insight-pianificatore-fermo">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Il pianificatore non risponde da più di 15 minuti: il recap automatico è fermo. Usa Aggiorna dati e avvisa
              chi gestisce l’app.
            </span>
          ) : null}
        </Voce>
      </dl>

      {/* the same sparkles as the link in Setter, Oggi and I miei numeri */}
      <Link href="/insight" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full sm:w-auto')}>
        <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
        Apri l’Insight
      </Link>
    </section>
  )
}
