import { AlertTriangle, Clapperboard } from 'lucide-react'

import { FiltriAnalisiVista } from '@/components/marketing/analisi/filtri-analisi'
import { ElencoReel } from '@/components/marketing/analisi/elenco-reel'
import { PannelloReel, type DettaglioReelIniziale } from '@/components/marketing/analisi/pannello-reel'
import { RigaSituazione } from '@/components/marketing/analisi/situazione'
import { ValutaTutti } from '@/components/marketing/analisi/valuta-tutti'
import { Tessere } from '@/components/marketing/analisi/tessere'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { RICHIESTE_AL_GIORNO } from '@/lib/marketing/analisi/costi'
import { leggiDettaglioReel } from '@/lib/marketing/analisi/dettaglio'
import {
  leggiPermesso,
  leggiReelConRipiego,
  leggiRichiesteRimaste,
  leggiRiepilogo,
  leggiSituazione,
  REEL_MAX,
} from '@/lib/marketing/analisi/elenco'
import { filtriDaParametri, PARAMETRO_REEL, sonoFiltriPredefiniti } from '@/lib/marketing/analisi/filtri'
import { eMediaId } from '@/lib/marketing/analisi/pannello'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Who asks for an analysis (Dany, 09/10/2026): the admin and marketing; the video editor reads. */
const RUOLI_ANALIZZA = ['admin', 'marketing']

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/**
 * «Analisi» (1.36.0, CLAUDE.md section 30): how the reels of the account went
 * against the median of the account at the same age, the verdict (Spingere,
 * Mantenere, Cambiare: decided in SQL), what Claude saw and says, and the
 * ideas that go to the calendar. The admin, the video editor and marketing;
 * everything read with the session (RLS). The reel panel opens at ?reel=.
 */
export default async function AnalisiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const sp = await searchParams
  const filtri = filtriDaParametri(sp)
  const richiesto = primo(sp[PARAMETRO_REEL])
  const reelId = eMediaId(richiesto) ? richiesto : null
  const supabase = await createClient()

  const dettaglioPromessa: Promise<DettaglioReelIniziale> = reelId
    ? leggiDettaglioReel(supabase, reelId).then(
        (dettaglio) => ({ id: reelId, dettaglio }),
        () => ({ id: reelId, errore: true as const }),
      )
    : Promise.resolve(null)

  // The tiles and the verdicts are the parts that need the comparison of the reels: if they cannot be read
  // the page still shows the reels (and says what is missing), instead of the error of the whole page.
  const [{ righe, senzaVerdetti }, riepilogo, situazione, permesso, account, dettaglio, restanoOggi] = await Promise.all([
    leggiReelConRipiego(supabase, filtri),
    leggiRiepilogo(supabase, filtri).catch((e) => {
      console.error('[analisi] tessere non lette:', e instanceof Error ? e.message : 'errore')
      return null
    }),
    leggiSituazione(supabase),
    leggiPermesso(supabase).catch(() => null),
    supabase.from('instagram_contenuti_stato').select('account_username').maybeSingle(),
    dettaglioPromessa,
    leggiRichiesteRimaste(supabase),
  ])

  const oggi = oggiRoma()
  const nomeAccount = account.data?.account_username ? `@${account.data.account_username}` : null
  const puoAnalizzare = RUOLI_ANALIZZA.includes(profilo.ruolo)
  // the reels of this list that Claude has not scored, the most recent first (the list's own order is by date by default)
  const daValutare = righe
    .filter((r) => r.media_id && !r.eliminato && r.punteggio_totale === null && r.analisi_stato !== 'in_coda' && r.analisi_stato !== 'in_corso')
    .map((r) => r.media_id as string)

  return (
    <PannelloReel righe={righe} iniziale={dettaglio} puoAnalizzare={puoAnalizzare} puoScrivere={true}>
      <div className="space-y-6">
        <IntestazionePagina
          titolo="Analisi dei reel"
          descrizione={`Come sono andati i reel ${nomeAccount ? `di ${nomeAccount}` : 'dell’account'} contro la mediana dei tuoi alla stessa età, cosa ha visto Claude e cosa pubblicare dopo.`}
        />

        <RigaSituazione situazione={situazione} oggi={oggi} permesso={permesso} accountStatistiche={nomeAccount ?? undefined} />

        <Tessere r={riepilogo} />

        {senzaVerdetti ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground" role="status" data-testid="analisi-senza-verdetti">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <span>I verdetti e i confronti non si sono caricati: qui sotto i reel con i loro numeri. Riprova fra un momento.</span>
          </p>
        ) : null}

        <FiltriAnalisiVista filtri={filtri} />

        {puoAnalizzare ? <ValutaTutti mediaIds={daValutare} restano={restanoOggi} limiteGiorno={RICHIESTE_AL_GIORNO} /> : null}

        <section aria-labelledby="titolo-reel" className="@container space-y-3" data-testid="elenco-reel">
          <h2 id="titolo-reel" className="sr-only">
            Reel
          </h2>
          {righe.length === 0 ? (
            sonoFiltriPredefiniti(filtri) ? (
              <StatoVuoto
                Icona={Clapperboard}
                titolo="Nessun reel da analizzare"
                descrizione="I reel dell’account si leggono ogni mattina da Instagram: appena ce ne sono, li trovi qui con i numeri e il verdetto."
              />
            ) : (
              <StatoVuoto
                Icona={Clapperboard}
                titolo="Nessun reel con questi filtri"
                descrizione="Cambia il periodo o il verdetto, oppure togli i filtri."
              />
            )
          ) : (
            <ElencoReel righe={righe} limite={REEL_MAX} />
          )}
        </section>
      </div>
    </PannelloReel>
  )
}
