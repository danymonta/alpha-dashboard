'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { modificaCallSchema } from '@/lib/validation/call'
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

export type EsitoModifica = { ok: true } | { ok: false; errore: string }

/**
 * Reschedule, change type, closer or notes; the closer and the admin also record
 * how the call went. Who may touch which call is decided by RLS inside the RPCs.
 */
export async function modificaCall(input: unknown): Promise<EsitoModifica> {
  const parsed = modificaCallSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }

  const v = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('modifica_call', {
    p_call_id: v.call_id,
    p_tipo: v.tipo,
    p_data: v.data,
    p_ora: v.ora,
    p_closer_id: v.closer_id,
    p_note: v.note ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Call non aggiornata. Riprova.') }

  if (v.dettagli && (profilo.ruolo === 'closer' || profilo.ruolo === 'admin')) {
    const { error: erroreDettagli } = await supabase.rpc('dettagli_call', {
      p_call_id: v.call_id,
      p_link_registrazione: v.dettagli.link_registrazione ?? undefined,
      p_performance: v.dettagli.performance ?? undefined,
      p_prodotto_proposto_id: v.dettagli.prodotto_proposto_id ?? undefined,
      p_importo_proposto: v.dettagli.importo_proposto ?? undefined,
    })
    if (erroreDettagli) {
      return { ok: false, errore: messaggioErrore(erroreDettagli, 'Data salvata, dettagli no. Riprova.') }
    }
  }

  revalidatePath('/calls')
  revalidatePath('/leads')
  revalidatePath('/')
  revalidatePath('/setting')
  return { ok: true }
}
