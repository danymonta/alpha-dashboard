import { ExternalLink, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { MenuStatus } from '@/components/marketing/menu-status'
import { ModificaContenuto } from '@/components/marketing/modifica-contenuto'
import { SezioneContenuto } from '@/components/marketing/sezione-contenuto'
import { VersioneContenuto } from '@/components/marketing/versione-contenuto'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { formatData, formatNumero } from '@/lib/format'
import { COLONNE_ELENCO } from '@/lib/marketing/elenco'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  SEZIONI,
  sezioniVisibili,
} from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const INDIETRO = { href: '/marketing/contenuti', etichetta: 'Contenuti' }

/** Notion's page link from the page id: the dashes go. */
function linkNotion(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`
}

function Valore({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <span className="text-muted-foreground">Vuoto</span>
  ) : (
    <>{children}</>
  )
}

function LinkFuori({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 max-w-full items-center gap-1.5 break-all underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="min-w-0 truncate">{href.replace(/^https?:\/\/(www\.)?/, '')}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">(si apre in una nuova scheda)</span>
    </a>
  )
}

/**
 * A content's page, as a Notion page: Status with one tap, the properties
 * with their Notion names, then the sections of its template (Reel Topic or
 * Carousel Topic) as toggles, each written in place. "Modifica" opens the
 * properties; "Elimina" at its bottom, for the admin and marketing only.
 */
export default async function ContenutoPage({ params }: { params: Promise<{ id: string }> }) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const { id } = await params
  const supabase = await createClient()

  const { data: contenuto, error } = isUuid(id)
    ? await supabase
        .from('marketing_contenuti')
        .select(`${COLONNE_ELENCO}, messaggio, bozza, commenti, finale, notion_page_id`)
        .eq('id', id)
        .maybeSingle()
    : { data: null, error: null }
  if (error) throw new Error('Impossibile caricare il contenuto')

  // a bad id, a deleted content, or one RLS hides
  if (!contenuto) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo="Contenuto" indietro={INDIETRO} />
        <StatoVuoto
          Icona={SearchX}
          titolo="Questo contenuto non c’è più"
          descrizione="Forse l’ha eliminato qualcuno del team."
          azione={
            <LinkBottone href="/marketing/contenuti" variant="outline">
              Torna ai contenuti
            </LinkBottone>
          }
        />
      </div>
    )
  }

  // the properties sheet gets the properties only: the sections travel once, with their toggles
  const { messaggio, bozza, commenti, finale, notion_page_id, ...proprietaContenuto } = contenuto
  const testi = { messaggio, bozza, commenti, finale }
  const sezioni = sezioniVisibili(contenuto.tipo, testi)
  const titoli = SEZIONI[contenuto.tipo]
  const proprieta: { etichetta: string; valore: ReactNode; num?: boolean }[] = [
    { etichetta: CAMPI.reel_type, valore: contenuto.reel_type ? ETICHETTA_REEL_TYPE[contenuto.reel_type] : null },
    { etichetta: CAMPI.formato, valore: contenuto.formato ? ETICHETTA_FORMAT[contenuto.formato] : null },
    { etichetta: CAMPI.post_date, valore: contenuto.post_date ? formatData(contenuto.post_date) : null, num: true },
    { etichetta: CAMPI.audio, valore: contenuto.audio },
    { etichetta: CAMPI.inspiration, valore: contenuto.inspiration ? <LinkFuori href={contenuto.inspiration} /> : null },
    { etichetta: CAMPI.url, valore: contenuto.url ? <LinkFuori href={contenuto.url} /> : null },
    {
      etichetta: CAMPI.view_count,
      valore: contenuto.view_count !== null ? formatNumero(contenuto.view_count) : null,
      num: true,
    },
  ]

  return (
    <VersioneContenuto iniziale={contenuto.updated_at}>
      <div className="max-w-3xl space-y-5">
        <IntestazionePagina
          titolo={contenuto.nome}
          indietro={INDIETRO}
          azione={<ModificaContenuto contenuto={proprietaContenuto} puoEliminare={eliminaContenuti(profilo.ruolo)} />}
        />

        <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <MenuStatus id={contenuto.id} nome={contenuto.nome} stato={contenuto.stato} grande />
          <p className="text-sm text-muted-foreground">
            <span className="sr-only">{CAMPO_MODELLO}: </span>
            {ETICHETTA_MODELLO[contenuto.tipo]}
          </p>
        </div>

        <section aria-label="Proprietà" className="rounded-xl bg-card px-4 py-2">
          {/* every row as tall as a link's 44px target: an even rhythm, links or not */}
          <dl className="grid gap-x-6 sm:grid-cols-2">
            {proprieta.map((p) => (
              <div key={p.etichetta} className="grid min-h-11 min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
                <dt className="text-xs text-muted-foreground">{p.etichetta}</dt>
                <dd className={p.num ? 'num min-w-0 text-sm' : 'min-w-0 text-sm break-words'}>
                  <Valore>{p.valore}</Valore>
                </dd>
              </div>
            ))}
          </dl>
          {notion_page_id ? (
            <div className="mt-1 border-t border-border pt-1">
              <a
                href={linkNotion(notion_page_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Apri in Notion
                <span className="sr-only">(si apre in una nuova scheda)</span>
              </a>
            </div>
          ) : null}
        </section>

        <div className="space-y-3">
          {sezioni.map((campo, i) => (
            <SezioneContenuto
              key={campo}
              id={contenuto.id}
              campo={campo}
              titolo={titoli[campo]}
              testo={testi[campo]}
              impronta={improntaTesto(testi[campo])}
              // as Notion's toggles: the first open, and every one with text
              apertaDiBase={i === 0 || !!testi[campo]?.trim()}
            />
          ))}
        </div>
      </div>
    </VersioneContenuto>
  )
}
