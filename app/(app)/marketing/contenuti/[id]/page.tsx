import { SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { AzioniContenuto, SchedaContenuto } from '@/components/marketing/scheda-contenuto'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const INDIETRO = { href: '/marketing/contenuti', etichetta: 'Contenuti' }

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
  // the page, the panel and Claude read a content the same way (lib/marketing/letture.ts); a failed read throws to error.tsx
  const dettaglio = await leggiDettaglioContenuto(await createClient(), id)

  // a bad id, a deleted content, or one RLS hides
  if (!dettaglio) {
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

  const { contenuto, testi, impronte, instagram } = dettaglio
  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina titolo={contenuto.nome} indietro={INDIETRO} azione={<AzioniContenuto contenuto={contenuto} />} />
      <SchedaContenuto
        dove="pagina"
        contenuto={contenuto}
        sezioni={{ stato: 'pronto', testi, impronte }}
        instagram={instagram}
        puoEliminare={eliminaContenuti(profilo.ruolo)}
      />
    </div>
  )
}
