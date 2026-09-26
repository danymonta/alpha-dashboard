'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { aggiornamentoDaEsito, esitoCallSchema } from '@/lib/validation/esito'

export type EsitoRegistrazione =
  | { ok: true; vaiA: string | null }
  | { ok: false; errore: string }

/**
 * The closer records how a call went. Only calls assigned to the caller:
 * RLS already enforces it for closers, the explicit filter keeps the admin
 * (who may update everything) on his own calls from this screen too.
 */
export async function registraEsito(input: unknown): Promise<EsitoRegistrazione> {
  const parsed = esitoCallSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Esito non valido.' }
  }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'closer' && profilo.ruolo !== 'admin') {
    return { ok: false, errore: 'L’esito lo registra chi ha fatto la call.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calls')
    .update(aggiornamentoDaEsito(parsed.data))
    .eq('id', parsed.data.call_id)
    .eq('closer_id', profilo.id)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, errore: 'Esito non salvato. Riprova.' }
  if (!data) return { ok: false, errore: 'Questa call non è assegnata a te.' }

  revalidatePath('/calls')
  revalidatePath('/')
  revalidatePath('/setting')

  // A closed call goes straight to the prefilled sale
  return {
    ok: true,
    vaiA: parsed.data.esito === 'chiusa' ? `/sales/new?call=${data.id}` : null,
  }
}
