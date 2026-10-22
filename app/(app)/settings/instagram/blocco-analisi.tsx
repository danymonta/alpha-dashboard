import { CircleCheck, Clapperboard, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { InterruttoriAnalisi, LimiteSpesaAnalisi } from '@/app/(app)/settings/instagram/analisi-client'
import { quando } from '@/app/(app)/settings/instagram/quando'
import { buttonVariants } from '@/components/ui/button'
import type { Situazione } from '@/lib/marketing/analisi/elenco'
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

const MODO = {
  attive: 'Accese: di notte si trascrive il parlato dei reel nuovi, un reel alla volta, senza Claude.',
  in_pausa_spesa: 'In pausa: il limite di spesa del mese è raggiunto. Le richieste a mano si fermano allo stesso modo.',
  ferme_chiave: 'Ferme: manca la chiave di Claude su Vercel.',
  spente: 'Spente: il parlato si trascrive solo quando qualcuno tocca «Analizza».',
} as const

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
}: {
  situazione: Situazione | null
  claudeConfigurato: boolean
  voceConfigurata: boolean
  /** Meta said the permission for the statistics is missing: false */
  statisticheAttive: boolean | null
  adesso: number
  oggi: string
}) {
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
          Analisi dei reel
        </h2>
        <p className="text-sm text-muted-foreground">
          Quando tocchi «Analizza» su un reel, Claude lo guarda (fotogrammi e parlato), lo confronta con la mediana dei
          tuoi e dice cosa spingere, mantenere o cambiare, con qualche idea per il calendario, e gli dà un punteggio
          con la guida di Dany. Claude non parte mai da solo, su nessun reel. Le statistiche dei post si leggono ogni
          mattina e il parlato dei reel nuovi si trascrive di notte (senza Claude).
        </p>
      </div>

      {!claudeConfigurato ? (
        <p className="flex items-start gap-2 text-sm font-medium text-status-critical" data-testid="analisi-spente">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Analisi spente: manca ANTHROPIC_API_KEY su Vercel.
        </p>
      ) : null}
      {!voceConfigurata ? (
        <p className="flex items-start gap-2 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Il parlato dei reel non si trascrive: manca ALFIRE_API_KEY su Vercel. Claude vede solo i fotogrammi.
        </p>
      ) : null}
      {statisticheAttive === false ? (
        <p className="flex items-start gap-2 text-sm text-status-warning" data-testid="analisi-permesso">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Instagram non dà ancora le statistiche dei post: genera un nuovo token dal pannello Meta con il permesso
          «instagram_business_manage_insights» e incollalo qui sopra.
        </p>
      ) : null}

      <dl className="divide-y divide-border">
        <Voce etichetta="Trascrizioni automatiche">
          {s ? (
            <span className="inline-flex items-start gap-1.5">
              {s.automatiche === 'attive' ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
              )}
              <span>{MODO[s.automatiche]}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Non si legge adesso.</span>
          )}
        </Voce>
        <Voce etichetta="Spesa del mese">
          {s && typeof s.costo_mese === 'number' && typeof s.costo_max === 'number' ? (
            <span className="num" data-testid="analisi-costo">
              {dollari.format(s.costo_mese)} $ di {dollari.format(s.costo_max)} $
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </Voce>
        <Voce etichetta="In coda">
          <span className="num">{s ? s.in_coda : 0}</span>
        </Voce>
        <Voce etichetta="Ultimo passo">
          {s?.ultimo_passo_il ? (
            <span className="num inline-flex items-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {quando(s.ultimo_passo_il, oggi)}
              {s.ultimo_esito ? ` · ${s.ultimo_esito.replace(/_/g, ' ')}` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">Ancora nessuno</span>
          )}
          {s?.ultimo_errore ? (
            <span className="mt-1 flex items-start gap-1.5 text-status-critical" data-testid="analisi-ultimo-errore">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {s.ultimo_errore}
            </span>
          ) : null}
          {tickFermo ? (
            <span className="mt-1 flex items-start gap-1.5 text-status-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Il pianificatore non risponde da più di 15 minuti: le analisi sono ferme.
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
        Apri i Pubblicati
      </Link>
    </section>
  )
}
