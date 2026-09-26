import { Download } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { buttonVariants } from '@/components/ui/button'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formatMese } from '@/lib/format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const EXPORT = [
  { tipo: 'vendite', titolo: 'Vendite', descrizione: 'Contratti firmati nel mese: cliente, tipo, prodotto, valore, rate.' },
  { tipo: 'incassi', titolo: 'Incassi', descrizione: 'Rate incassate e rimborsi del mese, con metodo di pagamento.' },
  { tipo: 'costi', titolo: 'Costi', descrizione: 'Spese del mese per categoria.' },
]

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  await requireRuolo(['admin'])
  const meseCorrente = primoDelMeseISO(oggiRoma())
  const mese = parseMese((await searchParams).mese) ?? meseCorrente

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Esporta CSV"
        descrizione="Per la commercialista e come copia di sicurezza mensile. Si aprono direttamente in Excel."
      />
      <SelettoreMese mese={mese} meseCorrente={meseCorrente} percorso="/settings/export" />

      <ul className="grid gap-2 sm:grid-cols-3">
        {EXPORT.map((e) => (
          <li key={e.tipo} className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4">
            <div>
              <p className="text-sm font-medium">{e.titolo}</p>
              <p className="text-sm text-muted-foreground">{e.descrizione}</p>
            </div>
            <a
              href={`/api/export/${e.tipo}?mese=${mese.slice(0, 7)}`}
              download
              className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}
            >
              <Download className="size-4" aria-hidden="true" />
              {e.titolo} di {formatMese(mese)}
            </a>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Formato: separatore punto e virgola, decimali con la virgola, date gg/mm/aaaa. Il piano Free di Supabase
        non ha backup: scarica i tre file ogni mese.
      </p>
    </div>
  )
}
