import { Clapperboard, SearchX } from 'lucide-react'
import { cookies } from 'next/headers'

import { LinkBottone } from '@/components/link-bottone'
import { CalendarioContenuti } from '@/components/marketing/calendario-contenuti'
import { FiltriContenuti } from '@/components/marketing/filtri-contenuti'
import { NuovaRiga } from '@/components/marketing/nuova-riga'
import { OpzioniProvider } from '@/components/marketing/opzioni-contesto'
import { PannelloContenuti, type DettaglioIniziale } from '@/components/marketing/pannello-contenuto'
import { SceltaVista } from '@/components/marketing/scelta-vista'
import { SezioneContenuti, UscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import { TabellaContenuti } from '@/components/marketing/tabella-contenuti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SchedePagina } from '@/components/shell/schede-pagina'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { fineMese, oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { LIMITE_MESE, LIMITE_SENZA_DATA, intervalloGriglia, ordineCalendario } from '@/lib/marketing/calendario'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import type { CanalePiano } from '@/lib/marketing/etichette'
import { LIMITE_TABELLA } from '@/lib/marketing/elenco'
import { filtriDaParametri, haFiltri, parametriDaFiltri, senzaOpzioniSparite, soloCanale } from '@/lib/marketing/filtri'
import {
  contaContenuti,
  contaPerStatus,
  leggiConteggiOpzioni,
  leggiElenco,
  leggiOpzioni,
  leggiProprietaContenuto,
} from '@/lib/marketing/letture'
import { PARAMETRO_CONTENUTO, PARAMETRO_NUOVA } from '@/lib/marketing/pannello'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { COOKIE_VISTA_CONTENUTI, hrefVista, vistaDaUrl, vistaIniziale } from '@/lib/marketing/vista'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

function indirizzo(parametri: Record<string, string | undefined>): string {
  const cerca = new URLSearchParams()
  for (const [chiave, v] of Object.entries(parametri)) if (v) cerca.set(chiave, v)
  const testo = cerca.toString()
  return testo ? `/marketing/contenuti?${testo}` : '/marketing/contenuti'
}

/**
 * The Piano editoriale (Dany, 21/10/2026: «una sezione dove gestisco il PED e
 * aggiungo e tolgo contenuti e metto le etichette»): Notion's "📸 Instagram
 * Posts DANYMONTA" as one quiet table, with a tab of its own for the YouTube
 * videos (24/10/2026: «una tab youtube e questa sarà la tab Reels») (Name, Reel Type, Format, Status, Post
 * Date, URL, Views), from the latest Post Date, on cards below 960px. The
 * admin, the video editor and marketing. Lists read the properties only,
 * never the sections. The labels of Reel Type and Format are the live ones
 * (marketing_opzioni), created and coloured from the cells.
 */
export default async function PianoEditorialePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const sp = await searchParams
  const lingua = await getLingua()
  const t = MARKETING[lingua].piano
  const richiesto = primo(sp[PARAMETRO_CONTENUTO])
  const contenutoId = isUuid(richiesto) ? richiesto : null
  const nuova = primo(sp[PARAMETRO_NUOVA])
  const nuovaId = isUuid(nuova) ? nuova : null
  const supabase = await createClient()

  // the page, the panel and Claude read the same way (lib/marketing/letture.ts); a failed read throws to error.tsx
  const [opzioni, conteggi] = await Promise.all([leggiOpzioni(supabase), leggiConteggiOpzioni(supabase)])
  const filtri = senzaOpzioniSparite(filtriDaParametri(sp), opzioni)
  // the tabs (24/10/2026): the YouTube videos apart from the reels and carousels
  const canale: CanalePiano = filtri.canale === 'youtube' ? 'youtube' : 'reels'
  const youtube = canale === 'youtube'

  // ?vista always wins; without it, the view this device chose last (a cookie), then the table (1.69.0)
  const vistaNellUrl = vistaDaUrl(primo(sp.vista))
  const vista = vistaIniziale(vistaNellUrl, (await cookies()).get(COOKIE_VISTA_CONTENUTI)?.value)
  const calendario = vista === 'calendario'
  const oggi = oggiRoma()
  const meseNellUrl = parseMese(primo(sp.mese))
  const mese = meseNellUrl ?? primoDelMeseISO(oggi)
  const intervallo = intervalloGriglia(mese)
  const filtriCanale = { ...filtri, canale }

  // the panel's content, in parallel with the list; a failed read is the panel's own error, never the page's
  const dettaglioPromessa: Promise<DettaglioIniziale> = contenutoId
    ? leggiDettaglioContenuto(supabase, contenutoId).then(
        (dettaglio) => ({ id: contenutoId, dettaglio }),
        () => ({ id: contenutoId, errore: true as const }),
      )
    : Promise.resolve(null)
  const [tabella, delMese, senzaDataLetti, conteggiStatus, quanti, dettaglio, rigaNuova] = await Promise.all([
    calendario ? null : leggiElenco(supabase, filtriCanale, LIMITE_TABELLA),
    // the calendar reads the grid's days (Monday before the 1st to Sunday after the end), day by day
    calendario ? leggiElenco(supabase, { ...filtriCanale, ...intervallo }, LIMITE_MESE, 'giorni') : null,
    calendario ? leggiElenco(supabase, { ...filtriCanale, senzaData: true }, LIMITE_SENZA_DATA) : null,
    // the legend: the month's contents of each Status, counted by the database
    calendario ? contaPerStatus(supabase, { ...filtriCanale, da: mese, a: fineMese(mese) }) : null,
    // is there anything at all in this tab (the empty state of the page, not of the month)
    calendario ? contaContenuti(supabase, { canale }) : null,
    dettaglioPromessa,
    // the row «Nuovo» just created comes first, whatever the filters: undated, it would sit at the bottom
    nuovaId ? leggiProprietaContenuto(supabase, nuovaId).catch(() => null) : Promise.resolve(null),
  ])

  const filtrato = haFiltri(filtri)
  // the filters keep the view the address says (without one, the memory decides again) and the month
  const resto = { vista: vistaNellUrl ?? undefined, mese: calendario && meseNellUrl ? meseNellUrl.slice(0, 7) : undefined }
  const parametriFiltri = parametriDaFiltri(filtri)
  const hrefTogliFiltri = indirizzo({ ...parametriDaFiltri(soloCanale(filtri)), ...resto })

  // the table: the row «Nuovo» pinned at the top; the calendar: at the top of «Senza data» (it has none)
  const righeTabella = tabella
    ? rigaNuova
      ? [rigaNuova, ...tabella.righe.filter((r) => r.id !== rigaNuova.id)]
      : tabella.righe
    : []
  const nuovaSenzaData = rigaNuova && !rigaNuova.post_date ? rigaNuova : null
  const righeSenzaData = senzaDataLetti
    ? nuovaSenzaData
      ? [nuovaSenzaData, ...senzaDataLetti.righe.filter((r) => r.id !== nuovaSenzaData.id)]
      : senzaDataLetti.righe
    : []
  const righeMese = delMese?.righe ?? []
  const totaleSenzaData = Math.max(senzaDataLetti?.totale ?? 0, righeSenzaData.length)

  const nessunContenuto = calendario
    ? !filtrato && (quanti ?? 0) === 0 && !rigaNuova
    : !filtrato && (tabella?.totale ?? 0) === 0 && !rigaNuova
  // the rows on the page, in the order they show: «precedente» and «successivo» in the panel
  const righe = calendario ? [...righeMese, ...righeSenzaData] : righeTabella
  const ordine = calendario ? ordineCalendario(righeMese, righeSenzaData) : righe.map((r) => r.id)
  // the tabs keep the view the address says and the calendar's month (the filters are the tab's own)
  const restoSchede = { vista: vistaNellUrl ?? undefined, mese: resto.mese }

  return (
    <OpzioniProvider opzioni={opzioni} conteggi={conteggi} puoEliminare={eliminaContenuti(profilo.ruolo)}>
      <UscitaDallaLista filtri={filtri} calendario={calendario}>
        <PannelloContenuti
          righe={righe}
          ordine={ordine}
          iniziale={dettaglio}
          puoEliminare={eliminaContenuti(profilo.ruolo)}
        >
          <div className="space-y-4">
            <IntestazionePagina
              titolo={t.titolo}
              descrizione={`${youtube ? t.descrizioneYoutube : t.descrizione}${lingua === 'en' ? ` ${t.inItaliano}` : ''}`}
              azione={<NuovaRiga tipo={youtube ? 'youtube' : 'reel'} />}
            />

            <SchedePagina
              etichetta={t.canali}
              schede={[
                { href: indirizzo(restoSchede), etichetta: t.reels, attiva: !youtube },
                { href: indirizzo({ canale: 'youtube', ...restoSchede }), etichetta: t.youtube, attiva: youtube },
              ]}
            />

            {nessunContenuto ? (
              <div data-tour="elenco-contenuti">
                <StatoVuoto
                  Icona={Clapperboard}
                  titolo={youtube ? t.vuotoYoutube : t.vuoto}
                  descrizione={youtube ? t.vuotoYoutubeDescrizione : t.vuotoDescrizione}
                  azione={<NuovaRiga variante="outline" tipo={youtube ? 'youtube' : 'reel'} />}
                />
              </div>
            ) : (
              <>
                <SceltaVista vista={vista} parametri={{ ...parametriFiltri, ...resto }} />
                <FiltriContenuti filtri={filtri} resto={resto} />

                <SezioneContenuti>
                  {calendario ? (
                    <CalendarioContenuti
                      mese={mese}
                      oggi={oggi}
                      righe={righeMese}
                      senzaData={righeSenzaData}
                      totaleSenzaData={totaleSenzaData}
                      limiteSenzaData={LIMITE_SENZA_DATA}
                      conteggiStatus={conteggiStatus!}
                      statoFiltrato={filtri.stato ?? null}
                      parametri={{ ...parametriFiltri, vista: vistaNellUrl ?? undefined }}
                      filtrato={filtrato}
                      hrefTogliFiltri={hrefTogliFiltri}
                      hrefTabella={hrefVista('tabella', vista, { ...parametriFiltri, vista: vistaNellUrl ?? undefined })}
                      canale={canale}
                    />
                  ) : righeTabella.length === 0 ? (
                    <StatoVuoto
                      Icona={SearchX}
                      titolo={t.vuotoFiltri}
                      descrizione={t.vuotoFiltriDescrizione}
                      azione={
                        <LinkBottone href={hrefTogliFiltri} variant="outline" scroll={false}>
                          {t.togliFiltri}
                        </LinkBottone>
                      }
                    />
                  ) : (
                    <TabellaContenuti
                      righe={righeTabella}
                      totale={tabella?.totale ?? 0}
                      limite={LIMITE_TABELLA}
                      canale={canale}
                    />
                  )}
                </SezioneContenuti>
              </>
            )}
          </div>
        </PannelloContenuti>
      </UscitaDallaLista>
    </OpzioniProvider>
  )
}
