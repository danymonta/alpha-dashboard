import { Package } from 'lucide-react'

import { AttivoProdotto, ProdottoForm } from '@/app/(app)/settings/products/prodotto-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ProdottiPage() {
  await requireRuolo(['admin'])
  const supabase = await createClient()
  const { data: prodotti, error } = await supabase
    .from('products')
    .select('id, nome, durata_mesi, prezzo_listino, attivo')
    .order('attivo', { ascending: false })
    .order('durata_mesi')
  if (error) throw new Error('Impossibile caricare i prodotti')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <IntestazionePagina
        titolo="Prodotti"
        descrizione="Un prodotto fuori vendita resta nelle vendite passate ma non compare più nel modulo."
        azione={<ProdottoForm />}
      />

      {prodotti.length === 0 ? (
        <StatoVuoto
          Icona={Package}
          titolo="Nessun prodotto"
          descrizione="Crea il primo percorso in vendita, ad esempio «Percorso Alpha 3 mesi»."
          azione={<ProdottoForm />}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card">
          {prodotti.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {p.durata_mesi === 1 ? '1 mese' : `${p.durata_mesi} mesi`}
                </p>
              </div>
              <p className="num w-24 text-right text-sm font-medium">{formatEuro(p.prezzo_listino)}</p>
              <AttivoProdotto id={p.id} nome={p.nome} attivo={p.attivo} />
              <ProdottoForm prodotto={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
