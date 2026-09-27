import { Download } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { buttonVariants } from '@/components/ui/button'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { leggiPeriodo } from '@/lib/periodo'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const EXPORT = [
  { tipo: 'vendite', titolo: 'Vendite', descrizione: 'Contratti firmati nel periodo: cliente, tipo, prodotto, valore, rate.' },
  { tipo: 'incassi', titolo: 'Incassi', descrizione: 'Rate incassate e rimborsi del periodo, con metodo di pagamento.' },
  { tipo: 'costi', titolo: 'Costi', descrizione: 'Spese del periodo per categoria.' },
]

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi)
  // same period params as the page: ?mese= or ?da=&a=
  const query = new URLSearchParams(periodo.parametri).toString()
  const quando = periodo.mese ? `di ${periodo.etichetta}` : periodo.frase

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Esporta CSV"
        descrizione="Per la commercialista e come copia di sicurezza mensile. Si aprono direttamente in Excel."
      />
      <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/settings/export" />

      <ul className="grid gap-2 sm:grid-cols-3">
        {EXPORT.map((e) => (
          <li key={e.tipo} className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4">
            <div>
              <p className="text-sm font-medium">{e.titolo}</p>
              <p className="text-sm text-muted-foreground">{e.descrizione}</p>
            </div>
            <a
              href={`/api/export/${e.tipo}?${query}`}
              download
              // a long range wraps instead of overflowing the card
              className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-11 py-2 text-center whitespace-normal')}
            >
              <Download className="size-4" aria-hidden="true" />
              {e.titolo} {quando}
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
