import { AlertTriangle, Images, SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { PannelloReel, type DettaglioReelIniziale } from '@/components/marketing/analisi/pannello-reel'
import { RigaSituazione } from '@/components/marketing/analisi/situazione'
import { Tessere } from '@/components/marketing/analisi/tessere'
import { ValutaTutti } from '@/components/marketing/analisi/valuta-tutti'
import { AggiornaDaInstagram } from '@/components/marketing/instagram/aggiorna-da-instagram'
import { OpzioniProvider } from '@/components/marketing/opzioni-contesto'
import { PannelloContenuti, type DettaglioIniziale } from '@/components/marketing/pannello-contenuto'
import { ProviderCollega, type ContenutoLibero } from '@/components/marketing/pubblicati/collega'
import { FiltriPubblicatiVista } from '@/components/marketing/pubblicati/filtri-pubblicati'
import { StatoGiroInstagram } from '@/components/marketing/pubblicati/stato-giro'
import { TabellaPubblicati } from '@/components/marketing/pubblicati/tabella-pubblicati'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { RICHIESTE_AL_GIORNO } from '@/lib/marketing/analisi/costi'
import { leggiDettaglioReel } from '@/lib/marketing/analisi/dettaglio'
import { leggiPermesso, leggiRichiesteRimaste, leggiRiepilogo, leggiSituazione } from '@/lib/marketing/analisi/elenco'
import { eMediaId } from '@/lib/marketing/analisi/pannello'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { COLONNE_ELENCO } from '@/lib/marketing/elenco'
import { leggiConteggiOpzioni, leggiOpzioni } from '@/lib/marketing/letture'
import { PARAMETRO_CONTENUTO } from '@/lib/marketing/pannello'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { POST_MAX, leggiPubblicatiConRipiego } from '@/lib/marketing/pubblicati/elenco'
import { filtriDaParametri, PARAMETRO_REEL, sonoFiltriPredefiniti } from '@/lib/marketing/pubblicati/filtri'
import { SENZA_NUMERI_INSTAGRAM } from '@/lib/marketing/pubblicati/parole'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The contents «Collega» offers: without a post, not Canceled. */
const CONTENUTI_LIBERI_MAX = 500

/** Who starts "Aggiorna da Instagram" (Dany, 09/10/2026); the video editor reads the posts every morning. */
const RUOLI_AGGIORNA = ['admin', 'marketing']
/** Who asks for an analysis (Dany, 09/10/2026): the admin and marketing; the video editor reads. */
const RUOLI_ANALIZZA = ['admin', 'marketing']

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/**
 * «Pubblicati» (Dany, 25/10/2026: «una sezione di contenuti pubblicati dove vedo bene gli insight»; it replaces
 * «Post di Instagram» and «Analisi»): one row per post or reel of the account, from Instagram, with what it did
 * (views, reach, saves, shares, comments), the leads that came from it (DMs, in target, calls booked), its score,
 * and the content of the Piano editoriale it is linked to (or one discreet «Collega»). A tap on a row opens the
 * reel's panel (the analysis, the transcript, what to do); the content's Name opens the content's panel. The
 * posts link themselves when the URL of a content is pasted in the plan (and the run does the safe ones): nobody
 * has to link a post. The admin, the video editor and marketing; everything read with the session (RLS).
 */
export default async function PubblicatiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const puoAggiornare = RUOLI_AGGIORNA.includes(profilo.ruolo)
  const puoAnalizzare = RUOLI_ANALIZZA.includes(profilo.ruolo)
  const sp = await searchParams
  const filtri = filtriDaParametri(sp)
  const reelRichiesto = primo(sp[PARAMETRO_REEL])
  const reelId = eMediaId(reelRichiesto) ? reelRichiesto : null
  const contenutoRichiesto = primo(sp[PARAMETRO_CONTENUTO])
  const contenutoId = isUuid(contenutoRichiesto) ? contenutoRichiesto : null
  const supabase = await createClient()

  // the two panels' details, in parallel with the list; a failed read is the panel's own error, never the page's
  const dettaglioReel: Promise<DettaglioReelIniziale> = reelId
    ? leggiDettaglioReel(supabase, reelId).then(
        (dettaglio) => ({ id: reelId, dettaglio }),
        () => ({ id: reelId, errore: true as const }),
      )
    : Promise.resolve(null)
  const dettaglioContenuto: Promise<DettaglioIniziale> = contenutoId
    ? leggiDettaglioContenuto(supabase, contenutoId).then(
        (dettaglio) => ({ id: contenutoId, dettaglio }),
        () => ({ id: contenutoId, errore: true as const }),
      )
    : Promise.resolve(null)

  // The tiles are the part that needs the comparison of the reels: if they cannot be read the page still shows the
  // posts (and the verdicts could not be read either: it says so), instead of the error of the whole page.
  const [{ righe, senzaVerdetti }, riepilogo, situazione, permesso, stato, reelDettaglio, contenutoDettaglio, restanoOggi, opzioni, conteggi, liberi] =
    await Promise.all([
      leggiPubblicatiConRipiego(supabase, filtri),
      leggiRiepilogo(supabase, filtri).catch((e) => {
        console.error('[pubblicati] tessere non lette:', e instanceof Error ? e.message : 'errore')
        return null
      }),
      leggiSituazione(supabase),
      leggiPermesso(supabase).catch(() => null),
      supabase
        .from('instagram_contenuti_stato')
        .select('account_username, ultimo_giro_il, ultimo_giro_esito, ultimo_giro_motivo, ultimo_giro_letti, campi, ultimo_errore')
        .maybeSingle(),
      dettaglioReel,
      dettaglioContenuto,
      leggiRichiesteRimaste(supabase),
      leggiOpzioni(supabase),
      leggiConteggiOpzioni(supabase),
      // the contents «Collega» offers (and the content panel's rows)
      supabase
        .from('marketing_contenuti')
        .select(COLONNE_ELENCO)
        .is('url', null)
        .neq('stato', 'canceled')
        .order('post_date', { ascending: false, nullsFirst: false })
        .order('id')
        .limit(CONTENUTI_LIBERI_MAX),
    ])
  if (stato.error || liberi.error) throw new Error('Impossibile caricare i pubblicati')

  // the linked contents: the content panel opens at once with their properties
  const idCollegati = [...new Set(righe.map((r) => r.contenuto_id).filter((id): id is string => id !== null))]
  const collegati = idCollegati.length
    ? await supabase.from('marketing_contenuti').select(COLONNE_ELENCO).in('id', idCollegati)
    : { data: [], error: null }
  if (collegati.error) throw new Error('Impossibile caricare i pubblicati')

  const contenutiLiberi: ContenutoLibero[] = (liberi.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    stato: c.stato,
    post_date: c.post_date,
  }))
  const righeContenuti = [...(liberi.data ?? []), ...(collegati.data ?? [])]

  const s = stato.data
  const oggi = oggiRoma()
  const account = s?.account_username ? `@${s.account_username}` : 'dell’account collegato'
  const fallito = s?.ultimo_giro_esito === 'fallito'
  const nomeAccount = s?.account_username ? `@${s.account_username}` : null
  const predefiniti = sonoFiltriPredefiniti(filtri)
  // no post at all on the page and nothing read by the last run (none yet, or it failed)
  const nessunPostLetto = righe.length === 0 && predefiniti && (!s?.ultimo_giro_il || fallito)
  // the reels of this list that Claude has not scored, the most recent first
  const daValutare = righe
    .filter((r) => r.media_id && (r.reel === true || r.media_type === 'VIDEO') && !r.eliminato && r.punteggio_totale === null && r.analisi_stato !== 'in_coda' && r.analisi_stato !== 'in_corso')
    .map((r) => r.media_id as string)
  // Instagram did not give the statistics: the numbers stay «–», and the page says why
  const senzaStatistiche = righe.length > 0 && righe.every((r) => r.metriche_stato !== 'lette')

  return (
    <OpzioniProvider opzioni={opzioni} conteggi={conteggi} puoEliminare={eliminaContenuti(profilo.ruolo)}>
      <ProviderCollega contenuti={contenutiLiberi} puoScrivere>
        <PannelloContenuti righe={righeContenuti} iniziale={contenutoDettaglio} puoEliminare={eliminaContenuti(profilo.ruolo)}>
          <PannelloReel righe={righe} iniziale={reelDettaglio} puoAnalizzare={puoAnalizzare} puoScrivere>
            <div className="space-y-6">
              <IntestazionePagina
                titolo="Pubblicati"
                descrizione={`I post e i reel ${nomeAccount ? `di ${nomeAccount}` : account} con i loro numeri: cosa hanno fatto su Instagram, quanti lead sono arrivati dai DM e a quale contenuto del Piano editoriale corrispondono. Tocca una riga per l’analisi.`}
                azione={puoAggiornare ? <AggiornaDaInstagram /> : undefined}
              />

              <div className="space-y-1.5">
                <StatoGiroInstagram stato={s} oggi={oggi} puoAggiornare={puoAggiornare} admin={profilo.ruolo === 'admin'} />
                <RigaSituazione situazione={situazione} oggi={oggi} permesso={permesso} accountStatistiche={nomeAccount ?? undefined} />
                {senzaStatistiche ? (
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground" data-testid="pubblicati-senza-statistiche">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
                    <span>{SENZA_NUMERI_INSTAGRAM}</span>
                  </p>
                ) : null}
              </div>

              <Tessere r={riepilogo} filtri={filtri} />

              {senzaVerdetti ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground" role="status" data-testid="pubblicati-senza-verdetti">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
                  <span>I verdetti e i confronti non si sono caricati: qui sotto i post con i loro numeri. Riprova fra un momento.</span>
                </p>
              ) : null}

              <FiltriPubblicatiVista filtri={filtri}>
                {puoAnalizzare ? <ValutaTutti mediaIds={daValutare} restano={restanoOggi} limiteGiorno={RICHIESTE_AL_GIORNO} /> : null}
              </FiltriPubblicatiVista>

              <section aria-labelledby="titolo-pubblicati" className="@container space-y-3" data-testid="elenco-pubblicati">
                <h2 id="titolo-pubblicati" className="sr-only">
                  Post pubblicati
                </h2>
                {righe.length === 0 ? (
                  nessunPostLetto ? (
                    <StatoVuoto
                      Icona={Images}
                      titolo={fallito ? 'Nessun post da mostrare' : 'Nessun post letto finora'}
                      descrizione={
                        fallito
                          ? puoAggiornare
                            ? 'L’ultimo aggiornamento non è riuscito: quando il problema qui sopra è risolto, aggiorna da Instagram.'
                            : 'L’ultimo aggiornamento non è riuscito: i post arrivano col prossimo, ogni notte.'
                          : puoAggiornare
                            ? 'Leggi adesso i post e i reel dell’account: appena ci sono li trovi qui con i loro numeri.'
                            : 'I post e i reel dell’account si leggono ogni notte: domattina li trovi qui.'
                      }
                      azione={puoAggiornare ? <AggiornaDaInstagram variante="default" /> : undefined}
                    />
                  ) : predefiniti ? (
                    <StatoVuoto
                      Icona={Images}
                      titolo="Nessun post in questo periodo"
                      descrizione="Prova un periodo più lungo: i post si leggono ogni mattina da Instagram."
                    />
                  ) : (
                    <StatoVuoto
                      Icona={SearchX}
                      titolo="Nessun post con questi filtri"
                      descrizione="Cambia il periodo, il tipo o la ricerca, oppure togli i filtri."
                      azione={
                        <LinkBottone href="/marketing/pubblicati" variant="outline" scroll={false}>
                          Togli i filtri
                        </LinkBottone>
                      }
                    />
                  )
                ) : (
                  <TabellaPubblicati righe={righe} limite={POST_MAX} />
                )}
              </section>
            </div>
          </PannelloReel>
        </PannelloContenuti>
      </ProviderCollega>
    </OpzioniProvider>
  )
}
