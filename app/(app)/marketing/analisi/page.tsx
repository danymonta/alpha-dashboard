import { Clapperboard } from 'lucide-react'

import { FiltriAnalisiVista } from '@/components/marketing/analisi/filtri-analisi'
import { ElencoReel } from '@/components/marketing/analisi/elenco-reel'
import { PannelloReel, type DettaglioReelIniziale } from '@/components/marketing/analisi/pannello-reel'
import { RigaSituazione } from '@/components/marketing/analisi/situazione'
import { Tessere } from '@/components/marketing/analisi/tessere'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { leggiDettaglioReel } from '@/lib/marketing/analisi/dettaglio'
import { leggiPermesso, leggiReel, leggiRiepilogo, leggiSituazione, REEL_MAX } from '@/lib/marketing/analisi/elenco'
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

  const [righe, riepilogo, situazione, permesso, account, dettaglio] = await Promise.all([
    leggiReel(supabase, filtri),
    leggiRiepilogo(supabase, filtri),
    leggiSituazione(supabase),
    leggiPermesso(supabase).catch(() => null),
    supabase.from('instagram_contenuti_stato').select('account_username').maybeSingle(),
    dettaglioPromessa,
  ])

  const oggi = oggiRoma()
  const nomeAccount = account.data?.account_username ? `@${account.data.account_username}` : null
  const puoAnalizzare = RUOLI_ANALIZZA.includes(profilo.ruolo)

  return (
    <PannelloReel righe={righe} iniziale={dettaglio} puoAnalizzare={puoAnalizzare} puoScrivere={true}>
      <div className="space-y-6">
        <IntestazionePagina
          titolo="Analisi dei reel"
          descrizione={`Come sono andati i reel ${nomeAccount ? `di ${nomeAccount}` : 'dell’account'} contro la mediana dei tuoi alla stessa età, cosa ha visto Claude e cosa pubblicare dopo.`}
        />

        <RigaSituazione situazione={situazione} oggi={oggi} permesso={permesso} accountStatistiche={nomeAccount ?? undefined} />

        <Tessere r={riepilogo} />

        <FiltriAnalisiVista filtri={filtri} />

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
