import { Clapperboard, SearchX } from 'lucide-react'
import { cookies } from 'next/headers'

import { LinkBottone } from '@/components/link-bottone'
import { CalendarioContenuti } from '@/components/marketing/calendario-contenuti'
import { FiltriContenuti } from '@/components/marketing/filtri-contenuti'
import { NuovoContenuto } from '@/components/marketing/nuovo-contenuto'
import { PannelloContenuti, type DettaglioIniziale } from '@/components/marketing/pannello-contenuto'
import { SceltaVista } from '@/components/marketing/scelta-vista'
import { SezioneContenuti, UscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import { TabellaContenuti } from '@/components/marketing/tabella-contenuti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { intervalloGriglia } from '@/lib/marketing/calendario'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { LIMITE_SENZA_DATA, LIMITE_TABELLA } from '@/lib/marketing/elenco'
import { filtriDaParametri, haFiltri, parametriDaFiltri } from '@/lib/marketing/filtri'
import { contaPerGruppo, leggiElenco } from '@/lib/marketing/letture'
import { PARAMETRO_CONTENUTO } from '@/lib/marketing/pannello'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { COOKIE_VISTA_CONTENUTI, vistaDaUrl, vistaIniziale } from '@/lib/marketing/vista'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The calendar's month reads at most this many contents (a month is a few dozen). */
const LIMITE_MESE = 500

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
 * The content calendar (Dany, 08/10/2026): Notion's "📸 Instagram Posts
 * DANYMONTA" with the same properties, as a table (Notion's table view, from
 * the latest Post Date) or as a month calendar. The admin, the video editor
 * and marketing. Lists read the properties only, never the sections.
 */
export default async function ContenutiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const sp = await searchParams
  const richiesto = primo(sp[PARAMETRO_CONTENUTO])
  const contenutoId = isUuid(richiesto) ? richiesto : null
  const filtri = filtriDaParametri(sp)
  // ?vista always wins; without it, the view this browser chose last (a cookie)
  const vistaNellUrl = vistaDaUrl(primo(sp.vista))
  const vista = vistaIniziale(vistaNellUrl, (await cookies()).get(COOKIE_VISTA_CONTENUTI)?.value)
  const oggi = oggiRoma()
  const meseNellUrl = parseMese(primo(sp.mese))
  const mese = meseNellUrl ?? primoDelMeseISO(oggi)
  const supabase = await createClient()

  // the page, the panel and Claude read the same way (lib/marketing/letture.ts); a failed read throws to error.tsx.
  // Each group chip counts with the filters its link opens (a Status of another group dropped).
  const intervallo = intervalloGriglia(mese)
  // the panel's content, in parallel with the list; a failed read is the panel's own error, never the page's
  const dettaglioPromessa: Promise<DettaglioIniziale> = contenutoId
    ? leggiDettaglioContenuto(supabase, contenutoId).then(
        (dettaglio) => ({ id: contenutoId, dettaglio }),
        () => ({ id: contenutoId, errore: true as const }),
      )
    : Promise.resolve(null)
  const [conteggi, tabella, delMese, senzaData, dettaglio] = await Promise.all([
    contaPerGruppo(supabase, filtri),
    vista === 'tabella' ? leggiElenco(supabase, filtri, LIMITE_TABELLA) : null,
    vista === 'calendario'
      ? leggiElenco(supabase, { ...filtri, da: intervallo.da, a: intervallo.a }, LIMITE_MESE, 'giorni')
      : null,
    vista === 'calendario' ? leggiElenco(supabase, { ...filtri, senzaData: true }, LIMITE_SENZA_DATA) : null,
    dettaglioPromessa,
  ])

  const filtrato = haFiltri(filtri)
  // the filters keep the view the address says (without one, the memory decides again) and the month
  const resto = { vista: vistaNellUrl ?? undefined, mese: meseNellUrl ? meseNellUrl.slice(0, 7) : undefined }
  const parametriFiltri = parametriDaFiltri(filtri)
  const hrefTogliFiltri = indirizzo(resto)
  const nessunContenuto = !filtrato && conteggi.tutti === 0
  // the rows on the page, in the order they show: «precedente» and «successivo» in the panel
  const righe =
    vista === 'tabella' ? (tabella?.righe ?? []) : [...(delMese?.righe ?? []), ...(senzaData?.righe ?? [])]
  const ordine = righe.map((r) => r.id)

  return (
    <UscitaDallaLista filtri={filtri} intervallo={vista === 'calendario' ? intervallo : null}>
      <PannelloContenuti
        righe={righe}
        ordine={ordine}
        iniziale={dettaglio}
        puoEliminare={eliminaContenuti(profilo.ruolo)}
      >
        <div className="space-y-5">
          <IntestazionePagina
            titolo="Instagram Posts"
            descrizione="Reel e caroselli dall’idea al post pubblicato, con le stesse proprietà di Notion."
            azione={<NuovoContenuto />}
          />

          {nessunContenuto ? (
            <div data-tour="elenco-contenuti">
              <StatoVuoto
                Icona={Clapperboard}
                titolo="Nessun contenuto"
                descrizione="Crea il primo reel o carosello: le proprietà sono quelle di Notion."
                azione={<NuovoContenuto variante="outline" />}
              />
            </div>
          ) : (
            <>
              <SceltaVista vista={vista} parametri={{ ...parametriFiltri, ...resto }} />
              <FiltriContenuti filtri={filtri} conteggi={conteggi} resto={resto} />

              <SezioneContenuti>
                {vista === 'tabella' ? (
                  (tabella?.righe.length ?? 0) === 0 ? (
                    <StatoVuoto
                      Icona={SearchX}
                      titolo="Nessun contenuto con questi filtri"
                      descrizione="Cambia i filtri o la ricerca, o toglili per vedere tutti i contenuti."
                      azione={
                        <LinkBottone href={hrefTogliFiltri} variant="outline" scroll={false}>
                          Togli i filtri
                        </LinkBottone>
                      }
                    />
                  ) : (
                    <TabellaContenuti righe={tabella?.righe ?? []} totale={tabella?.totale ?? 0} limite={LIMITE_TABELLA} />
                  )
                ) : (
                  <CalendarioContenuti
                    mese={mese}
                    oggi={oggi}
                    righe={delMese?.righe ?? []}
                    senzaData={senzaData?.righe ?? []}
                    totaleSenzaData={senzaData?.totale ?? 0}
                    limiteSenzaData={LIMITE_SENZA_DATA}
                    parametri={{ ...parametriFiltri, vista: vistaNellUrl ?? undefined }}
                    filtrato={filtrato}
                    hrefTogliFiltri={hrefTogliFiltri}
                    hrefTabella={indirizzo({ ...parametriFiltri, vista: 'tabella' })}
                  />
                )}
              </SezioneContenuti>
            </>
          )}
        </div>
      </PannelloContenuti>
    </UscitaDallaLista>
  )
}
