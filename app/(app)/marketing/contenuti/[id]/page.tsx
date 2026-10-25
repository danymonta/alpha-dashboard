import { SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { OpzioniProvider } from '@/components/marketing/opzioni-contesto'
import { AzioniContenuto, SchedaContenuto } from '@/components/marketing/scheda-contenuto'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { getLingua } from '@/lib/i18n/server'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { requireRuolo } from '@/lib/auth/session'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { leggiConteggiOpzioni, leggiOpzioni } from '@/lib/marketing/letture'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


/**
 * A content's own page, as a Notion page: direct links, Cmd/Ctrl-click and
 * «Apri a tutta pagina» from the panel land here (1.33.0). The same card as
 * the panel (SchedaContenuto): the Status with one tap, every property saved
 * by itself in place, the sections of its template (Reel Topic or Carousel
 * Topic) as toggles; «Elimina» at its bottom, for the admin and marketing.
 */
export default async function ContenutoPage({ params }: { params: Promise<{ id: string }> }) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const { id } = await params
  const lingua = await getLingua()
  const t = CONTENUTO[lingua].pagina
  const INDIETRO = { href: '/marketing/contenuti', etichetta: MARKETING[lingua].piano.titolo }
  // the page, the panel and Claude read a content the same way (lib/marketing/letture.ts); a failed read throws to error.tsx
  const supabase = await createClient()
  const [dettaglio, opzioni, conteggi] = await Promise.all([
    leggiDettaglioContenuto(supabase, id),
    leggiOpzioni(supabase),
    leggiConteggiOpzioni(supabase),
  ])

  // a bad id, a deleted content, or one RLS hides
  if (!dettaglio) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo={t.contenuto} indietro={INDIETRO} />
        <StatoVuoto
          Icona={SearchX}
          titolo={t.sparito}
          descrizione={t.sparitoDescrizione}
          azione={
            <LinkBottone href="/marketing/contenuti" variant="outline">
              {t.torna}
            </LinkBottone>
          }
        />
      </div>
    )
  }

  const { contenuto, testi, impronte, instagram, idea } = dettaglio
  return (
    <OpzioniProvider opzioni={opzioni} conteggi={conteggi} puoEliminare={eliminaContenuti(profilo.ruolo)}>
      <div className="max-w-3xl space-y-5">
        <IntestazionePagina titolo={contenuto.nome} indietro={INDIETRO} azione={<AzioniContenuto contenuto={contenuto} />} />
        <SchedaContenuto
          dove="pagina"
          contenuto={contenuto}
          sezioni={{ stato: 'pronto', testi, impronte }}
          instagram={instagram}
          idea={idea}
          puoEliminare={eliminaContenuti(profilo.ruolo)}
        />
      </div>
    </OpzioniProvider>
  )
}
