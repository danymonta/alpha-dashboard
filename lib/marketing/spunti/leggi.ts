import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import type { FontiSpunti, SpuntiContenuto } from '@/lib/marketing/spunti/tipi'

/**
 * What the Spunti page reads (1.37.0, CLAUDE.md section 31), with the session of whoever opens it
 * (RLS: the Marketing area). The latest ready brief, the one being written or failed after it, and
 * which ideas are already in the calendar. Pure reading: no clock, no write.
 */
export type RigaSpunti = {
  id: string
  motivo: 'automatica' | 'richiesta'
  stato: 'in_coda' | 'in_corso' | 'pronta' | 'fallita'
  periodo_da: string
  periodo_a: string
  errore: string | null
  finita_il: string | null
  created_at: string
  contenuto: SpuntiContenuto | null
  fonti: FontiSpunti | null
}

export type LetturaSpunti = {
  pronta: RigaSpunti | null
  /** being written now (in the queue or in progress) */
  inCorso: RigaSpunti | null
  /** failed after the ready one (or with none ready) */
  fallita: RigaSpunti | null
  /** idea index of the ready brief -> the content of the calendar it became */
  nelCalendario: Map<number, { id: string; nome: string }>
}

export async function leggiSpunti(db: SupabaseClient<Database>): Promise<LetturaSpunti> {
  const { data, error } = await db
    .from('marketing_spunti')
    .select('id, motivo, stato, periodo_da, periodo_a, errore, finita_il, created_at, contenuto, fonti')
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) throw new Error('Impossibile leggere gli spunti')
  const righe = (data ?? []) as unknown as RigaSpunti[]
  const pronta = righe.find((r) => r.stato === 'pronta') ?? null
  const inCorso = righe.find((r) => r.stato === 'in_coda' || r.stato === 'in_corso') ?? null
  const fallita = righe.find((r) => r.stato === 'fallita' && (!pronta || r.created_at > pronta.created_at)) ?? null

  const nelCalendario = new Map<number, { id: string; nome: string }>()
  if (pronta) {
    const { data: contenuti, error: e2 } = await db
      .from('marketing_contenuti')
      .select('id, nome, da_spunti_idea')
      .eq('da_spunti', pronta.id)
    if (e2) throw new Error('Impossibile leggere il calendario')
    for (const c of contenuti ?? []) if (c.da_spunti_idea !== null) nelCalendario.set(c.da_spunti_idea, { id: c.id, nome: c.nome })
  }
  return { pronta, inCorso, fallita, nelCalendario }
}
