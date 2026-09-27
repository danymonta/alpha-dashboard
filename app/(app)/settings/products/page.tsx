import { Package } from 'lucide-react'

import { AttivoProdotto, ProdottoForm } from '@/app/(app)/settings/products/prodotto-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { leggiPianoPredefinito, type PianoPredefinito } from '@/lib/validation/anagrafiche'

export const dynamic = 'force-dynamic'

/** "3 × 500,00 € poi 3 × 333,33 €": runs of equal instalments, in order. */
function descriviPiano(piano: PianoPredefinito) {
  const gruppi: { n: number; importo: number }[] = []
  for (const r of [...piano].sort((a, b) => a.mese - b.mese)) {
    const ultimo = gruppi.at(-1)
    if (ultimo && ultimo.importo === r.importo) ultimo.n += 1
    else gruppi.push({ n: 1, importo: r.importo })
  }
  return gruppi.map((g) => `${g.n} × ${formatEuro(g.importo)}`).join(' poi ')
}

export default async function ProdottiPage() {
  await requireRuolo(['admin'])
  const supabase = await createClient()
  const { data: prodotti, error } = await supabase
    .from('products')
    .select('id, nome, durata_mesi, prezzo_listino, attivo, piano_predefinito')
    .order('attivo', { ascending: false })
    .order('durata_mesi')
  if (error) throw new Error('Impossibile caricare i prodotti')

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Prodotti"
        descrizione="Il piano abituale si propone nella nuova vendita e resta modificabile. Fuori vendita: sparisce dal modulo ma resta nelle vendite passate. Eliminato: le vendite passate ne tengono il nome."
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
          {prodotti.map((p) => {
            const piano = leggiPianoPredefinito(p.piano_predefinito)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2">
                {/* mobile: name on its own row, price and controls on the row below */}
                <div className="min-w-0 basis-full md:basis-0 md:flex-1">
                  <p className="text-sm font-medium">{p.nome}</p>
                  <p className="num text-sm text-muted-foreground">
                    {p.durata_mesi === 1 ? '1 mese' : `${p.durata_mesi} mesi`}
                    {piano ? ` · ${descriviPiano(piano)}` : ' · rate uguali'}
                  </p>
                </div>
                <p className="num mr-auto text-sm font-medium md:mr-0 md:w-24 md:text-right">{formatEuro(p.prezzo_listino)}</p>
                <AttivoProdotto id={p.id} nome={p.nome} attivo={p.attivo} />
                <ProdottoForm prodotto={{ ...p, piano_predefinito: piano }} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
