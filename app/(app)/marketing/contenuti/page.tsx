import { Clapperboard, SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { FiltriContenuti } from '@/components/marketing/filtri-contenuti'
import { NuovaRiga } from '@/components/marketing/nuova-riga'
import { OpzioniProvider } from '@/components/marketing/opzioni-contesto'
import { PannelloContenuti, type DettaglioIniziale } from '@/components/marketing/pannello-contenuto'
import { SezioneContenuti, UscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import { TabellaContenuti } from '@/components/marketing/tabella-contenuti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING_LETTURA, solaLettura } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { LIMITE_TABELLA } from '@/lib/marketing/elenco'
import { filtriDaParametri, haFiltri, senzaOpzioniSparite } from '@/lib/marketing/filtri'
import { leggiConteggiOpzioni, leggiElenco, leggiOpzioni, leggiProprietaContenuto } from '@/lib/marketing/letture'
import { PARAMETRO_CONTENUTO, PARAMETRO_NUOVA } from '@/lib/marketing/pannello'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/**
 * The Piano editoriale (Dany, 21/10/2026: «una sezione dove gestisco il PED e
 * aggiungo e tolgo contenuti e metto le etichette»): Notion's "📸 Instagram
 * Posts DANYMONTA" as one quiet table (Name, Reel Type, Format, Status, Post
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
  // the business coach reads the plan (22/10/2026): every cell shows its value, none changes (useSolaLettura)
  const profilo = await requireRuolo(RUOLI_MARKETING_LETTURA)
  const sp = await searchParams
  const lingua = await getLingua()
  const t = MARKETING[lingua].piano
  const leggeSolo = solaLettura(profilo.ruolo)
  const richiesto = primo(sp[PARAMETRO_CONTENUTO])
  const contenutoId = isUuid(richiesto) ? richiesto : null
  const nuova = primo(sp[PARAMETRO_NUOVA])
  const nuovaId = isUuid(nuova) ? nuova : null
  const supabase = await createClient()

  // the page, the panel and Claude read the same way (lib/marketing/letture.ts); a failed read throws to error.tsx
  const [opzioni, conteggi] = await Promise.all([leggiOpzioni(supabase), leggiConteggiOpzioni(supabase)])
  const filtri = senzaOpzioniSparite(filtriDaParametri(sp), opzioni)

  // the panel's content, in parallel with the list; a failed read is the panel's own error, never the page's
  const dettaglioPromessa: Promise<DettaglioIniziale> = contenutoId
    ? leggiDettaglioContenuto(supabase, contenutoId).then(
        (dettaglio) => ({ id: contenutoId, dettaglio }),
        () => ({ id: contenutoId, errore: true as const }),
      )
    : Promise.resolve(null)
  const [elenco, dettaglio, rigaNuova] = await Promise.all([
    leggiElenco(supabase, filtri, LIMITE_TABELLA),
    dettaglioPromessa,
    // the row «Nuovo» just created comes first, whatever the filters: undated, it would sit at the bottom
    nuovaId ? leggiProprietaContenuto(supabase, nuovaId).catch(() => null) : Promise.resolve(null),
  ])

  const filtrato = haFiltri(filtri)
  const righe = rigaNuova ? [rigaNuova, ...elenco.righe.filter((r) => r.id !== rigaNuova.id)] : elenco.righe
  const nessunContenuto = !filtrato && elenco.totale === 0 && !rigaNuova
  const hrefTogliFiltri = '/marketing/contenuti'
  // the rows on the page, in the order they show: «precedente» and «successivo» in the panel
  const ordine = righe.map((r) => r.id)

  return (
    <OpzioniProvider opzioni={opzioni} conteggi={conteggi} puoEliminare={eliminaContenuti(profilo.ruolo)}>
      <UscitaDallaLista filtri={filtri}>
        <PannelloContenuti
          righe={righe}
          ordine={ordine}
          iniziale={dettaglio}
          puoEliminare={eliminaContenuti(profilo.ruolo)}
        >
          <div className="space-y-4">
            <IntestazionePagina
              titolo={t.titolo}
              descrizione={`${leggeSolo ? t.descrizioneLettura : t.descrizione}${lingua === 'en' ? ` ${t.inItaliano}` : ''}`}
              azione={<NuovaRiga />}
            />

            {nessunContenuto ? (
              <div data-tour="elenco-contenuti">
                <StatoVuoto
                  Icona={Clapperboard}
                  titolo={t.vuoto}
                  descrizione={leggeSolo ? t.vuotoLettura : t.vuotoDescrizione}
                  azione={<NuovaRiga variante="outline" />}
                />
              </div>
            ) : (
              <>
                <FiltriContenuti filtri={filtri} resto={{}} />

                <SezioneContenuti>
                  {righe.length === 0 ? (
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
                    <TabellaContenuti righe={righe} totale={elenco.totale} limite={LIMITE_TABELLA} />
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
