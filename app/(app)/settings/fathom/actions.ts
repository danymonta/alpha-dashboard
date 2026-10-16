'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { urlPassoCall } from '@/lib/call/lavori/config'
import { provaChiave } from '@/lib/fathom/api'
import { ErroreFathom } from '@/lib/fathom/frasi'
import { pulisciChiave } from '@/lib/fathom/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }
/** The key saved; `prova` says whether Fathom answers with it (the key itself never comes back). */
export type EsitoChiave = { ok: true; prova: 'risponde' | { errore: string } } | { ok: false; errore: string }

const PAGINA = '/settings/fathom'
const CHIAVE_NON_VALIDA = 'Questa non sembra una chiave di Fathom: copiala di nuovo da Impostazioni › API Access.'
const INCOLLATO_MAX = 2048

/**
 * The admin connects Fathom (Dany, 16/10/2026): the API key pasted from Fathom's panel goes to
 * Vault through public.fathom_imposta_chiave (the admin's own session: the function checks him).
 * It arrives in a FormData (field `chiave`), never as a plain argument: `next dev` logs every
 * server function call with its arguments. It never comes back: not in the answer, not in a log,
 * not in an error. Then the key is tried with GET /meeting_types, which reads no meeting.
 */
export async function salvaChiaveFathom(dati: unknown): Promise<EsitoChiave> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const incollato = dati instanceof FormData ? dati.get('chiave') : null
  if (typeof incollato !== 'string' || incollato.length > INCOLLATO_MAX) return { ok: false, errore: CHIAVE_NON_VALIDA }
  const chiave = pulisciChiave(incollato)
  if (!chiave) return { ok: false, errore: 'Incolla la chiave copiata da Fathom.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fathom_imposta_chiave', { p_chiave: chiave })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Chiave non salvata. Riprova.') }

  let prova: 'risponde' | { errore: string } = 'risponde'
  const db = createAdminClient()
  try {
    await provaChiave({ chiave })
    await db.rpc('fathom_segna_esito', { p_errore: null as never })
  } catch (e) {
    const errore = e instanceof ErroreFathom ? e : new ErroreFathom('rete')
    prova = { errore: errore.message }
    await db.rpc('fathom_segna_esito', { p_errore: errore.message })
  }
  // the address the database posts the steps of the call work to (also after a restore on a new project)
  try {
    await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
  } catch (e) {
    console.error('[fathom] indirizzo dei passi non scritto:', e instanceof Error ? e.name : 'errore')
  }
  revalidatePath(PAGINA)
  return { ok: true, prova }
}

export async function togliChiaveFathom(): Promise<Esito> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fathom_togli_chiave')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Chiave non tolta. Riprova.') }
  revalidatePath(PAGINA)
  return { ok: true }
}

/** The two switches: the analysis of the recorded calls, the weekly brief on Mondays. */
export async function impostaInterruttoriCall(input: unknown): Promise<Esito> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const letto = z.object({ analisi: z.boolean().optional(), spunti: z.boolean().optional() }).safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Richiesta non valida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('call_imposta_interruttori', {
    p_analisi: (letto.data.analisi ?? null) as never,
    p_spunti: (letto.data.spunti ?? null) as never,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Impostazione non salvata. Riprova.') }
  revalidatePath(PAGINA)
  return { ok: true }
}

export async function impostaLimiteSpesaCall(input: unknown): Promise<Esito> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const letto = z.object({ usd: z.number().min(0).max(200) }).safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Scegli un limite tra 0 e 200 $.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('call_imposta_costo_max', { p_usd: letto.data.usd })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Limite non salvato. Riprova.') }
  revalidatePath(PAGINA)
  return { ok: true }
}
