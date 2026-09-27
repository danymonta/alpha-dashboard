import type { NextRequest } from 'next/server'

import { getProfilo } from '@/lib/auth/session'
import { dataCsv, importoCsv, righeCsv, type Cella } from '@/lib/csv'
import { oggiRoma } from '@/lib/date'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_CATEGORIA } from '@/lib/validation/anagrafiche'
import { ETICHETTA_METODO } from '@/lib/validation/incasso'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

const TIPI = ['vendite', 'incassi', 'costi'] as const
type Tipo = (typeof TIPI)[number]

/**
 * Export for the accountant (section 10, Impostazioni): a month (?mese=) or
 * any range (?da=&a=), read exactly like the pages do. Admin only.
 * Rows come straight from the database; amounts are only formatted.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || profilo.ruolo !== 'admin') {
    return new Response('Non autorizzato', { status: 403 })
  }

  const { tipo } = await params
  if (!TIPI.includes(tipo as Tipo)) return new Response('Export non trovato', { status: 404 })

  const periodo = leggiPeriodo(request.nextUrl.searchParams, oggiRoma())
  const { da, a } = periodo
  // "costi-2026-09.csv" for a month, "costi-2026-07-01_2026-08-15.csv" for a range
  const nomeFile = `${tipo}-${periodo.mese ? periodo.mese.slice(0, 7) : `${da}_${a}`}.csv`
  const supabase = await createClient()

  let intestazione: string[]
  let righe: Cella[][]

  if (tipo === 'vendite') {
    const { data, error } = await supabase
      .from('sales')
      .select('id, data_vendita, tipo, valore_contratto, numero_rate, data_inizio, data_fine, cliente:clients(nome, cognome), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), closer:profiles!sales_closer_id_fkey(nome)')
      .gte('data_vendita', da)
      .lte('data_vendita', a)
      .order('data_vendita')
    if (error) return new Response('Errore di lettura', { status: 500 })
    intestazione = ['Data vendita', 'Cliente', 'Tipo', 'Prodotto', 'Valore contratto', 'Rate', 'Inizio', 'Fine', 'Setter', 'Closer']
    righe = data.map((v) => [
      dataCsv(v.data_vendita),
      [v.cliente?.nome, v.cliente?.cognome].filter(Boolean).join(' '),
      ETICHETTA_TIPO_VENDITA[v.tipo],
      v.prodotto?.nome,
      importoCsv(v.valore_contratto),
      v.numero_rate,
      dataCsv(v.data_inizio),
      dataCsv(v.data_fine),
      v.setter?.nome,
      v.closer?.nome,
    ])
  } else if (tipo === 'incassi') {
    const { data, error } = await supabase
      .from('v_rate')
      .select('incassato_il, cliente, tipo, numero_rata, importo_incassato, metodo, stato')
      .in('stato', ['incassata', 'rimborsata'])
      .gte('incassato_il', da)
      .lte('incassato_il', a)
      .order('incassato_il')
    if (error) return new Response('Errore di lettura', { status: 500 })
    intestazione = ['Data', 'Cliente', 'Tipo vendita', 'Rata', 'Importo', 'Metodo', 'Movimento']
    righe = data.map((r) => [
      dataCsv(r.incassato_il),
      r.cliente,
      r.tipo ? ETICHETTA_TIPO_VENDITA[r.tipo] : '',
      r.numero_rata,
      importoCsv(r.importo_incassato),
      r.metodo ? ETICHETTA_METODO[r.metodo] : '',
      r.stato === 'rimborsata' ? 'Rimborso' : 'Incasso',
    ])
  } else {
    const { data, error } = await supabase
      .from('expenses')
      .select('data, categoria, descrizione, importo, ricorrente')
      .gte('data', da)
      .lte('data', a)
      .order('data')
    if (error) return new Response('Errore di lettura', { status: 500 })
    intestazione = ['Data', 'Categoria', 'Descrizione', 'Importo', 'Ricorrente']
    righe = data.map((c) => [dataCsv(c.data), ETICHETTA_CATEGORIA[c.categoria], c.descrizione, importoCsv(c.importo), c.ricorrente])
  }

  return new Response(righeCsv(intestazione, righe), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}
