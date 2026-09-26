import 'server-only'

import type { RigaVendita } from '@/components/vendite/elenco-vendite'
import { createClient } from '@/lib/supabase/server'
import type { TipoVendita } from '@/lib/validation/vendita'

type Filtri = {
  closerId?: string
  setterId?: string
  tipo?: TipoVendita
  /** inclusive 'YYYY-MM-DD' bounds on data_vendita */
  da?: string
  a?: string
}

/**
 * Sales with names from the tables and money from v_vendite. Two reads merged
 * by id: no amount is computed here. RLS decides which rows come back.
 */
export async function caricaVendite(filtri: Filtri = {}): Promise<RigaVendita[]> {
  const supabase = await createClient()

  let query = supabase
    .from('sales')
    .select(
      'id, tipo, data_vendita, valore_contratto, cliente:clients(nome, cognome), prodotto:products(nome), closer:profiles!sales_closer_id_fkey(nome), setter:profiles!sales_setter_id_fkey(nome)',
    )
    .order('data_vendita', { ascending: false })
    .limit(300)

  if (filtri.closerId) query = query.eq('closer_id', filtri.closerId)
  if (filtri.setterId) query = query.eq('setter_id', filtri.setterId)
  if (filtri.tipo) query = query.eq('tipo', filtri.tipo)
  if (filtri.da) query = query.gte('data_vendita', filtri.da)
  if (filtri.a) query = query.lte('data_vendita', filtri.a)

  const { data: vendite, error } = await query
  if (error) throw new Error('Impossibile caricare le vendite')
  if (vendite.length === 0) return []

  const { data: importi, error: erroreImporti } = await supabase
    .from('v_vendite')
    .select('sale_id, incassato, da_incassare, rate_in_ritardo, prossima_scadenza')
    .in(
      'sale_id',
      vendite.map((v) => v.id),
    )
  if (erroreImporti) throw new Error('Impossibile caricare gli incassi')

  const perVendita = new Map(importi.map((i) => [i.sale_id, i]))

  return vendite.map((v) => {
    const i = perVendita.get(v.id)
    return {
      id: v.id,
      cliente: [v.cliente?.nome, v.cliente?.cognome].filter(Boolean).join(' ') || 'Cliente',
      prodotto: v.prodotto?.nome ?? '–',
      tipo: v.tipo,
      data_vendita: v.data_vendita,
      valore_contratto: v.valore_contratto,
      incassato: i?.incassato ?? null,
      da_incassare: i?.da_incassare ?? null,
      rate_in_ritardo: i?.rate_in_ritardo ?? null,
      prossima_scadenza: i?.prossima_scadenza ?? null,
      closer: v.closer?.nome ?? null,
      setter: v.setter?.nome ?? null,
    }
  })
}
