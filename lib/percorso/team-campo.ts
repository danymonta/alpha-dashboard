import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { leggiCampoBaseTeam, type CampoBaseTeam } from '@/lib/percorso/campo-base'
import type { Database } from '@/lib/supabase/database.types'
import { ERRORI_CHECKUP, checkupSchema, eliminaCheckupSchema } from '@/lib/validation/checkup'

/**
 * The client's home base for his team (1.83.0): the reads and the writes of the check-ups, with the
 * session of whoever acts (the admin, the people in charge of his onboarding, the coach of his
 * project), never the service role. The database decides who (campo_base_vede, checkup_salva).
 */

type Db = SupabaseClient<Database>

export type LetturaTeam = { ok: true; campo: CampoBaseTeam } | { ok: false; motivo: 'accesso' | 'errore' }

export async function leggiCampoTeam(db: Db, clientId: string): Promise<LetturaTeam> {
  const { data, error } = await db.rpc('campo_base_team', { p_client_id: clientId })
  if (error) {
    if (error.code === '42501' || error.code === '22P02') return { ok: false, motivo: 'accesso' }
    console.error('[campo base] lettura del team non riuscita:', error.code)
    return { ok: false, motivo: 'errore' }
  }
  const campo = leggiCampoBaseTeam(data)
  return campo ? { ok: true, campo } : { ok: false, motivo: 'errore' }
}

export type EsitoCheckup = { ok: true; id: string } | { ok: false; errore: string }

/** The database's words (22023, 23505, P0002, 42501) are already for people; anything else is the fallback. */
function parole(error: { code?: string; message: string }, fallback: string): string {
  if (['22023', '23505', 'P0002', '42501'].includes(error.code ?? '') && !/violates|permission denied|null value/i.test(error.message)) {
    return error.message
  }
  console.error('[campo base] scrittura non riuscita:', error.code)
  return fallback
}

export async function salvaCheckup(db: Db, input: unknown): Promise<EsitoCheckup> {
  const parsed = checkupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_CHECKUP.nonValidi }
  const v = parsed.data
  const { data, error } = await db.rpc('checkup_salva', {
    p_client_id: v.client_id,
    p_id: v.id as string,
    p_dati: {
      giorno: v.giorno,
      fathom_url: v.fathom_url || null,
      argomento: v.argomento || null,
      resoconto: v.resoconto.trim() || null,
      compiti: v.compiti,
      appunti: v.appunti.trim() ? v.appunti : null,
      call_id: v.call_id,
    },
  })
  if (error) return { ok: false, errore: parole(error, ERRORI_CHECKUP.nonSalvato) }
  const id = data && typeof data === 'object' && !Array.isArray(data) ? (data as { id?: unknown }).id : null
  return typeof id === 'string' ? { ok: true, id } : { ok: false, errore: ERRORI_CHECKUP.nonSalvato }
}

export async function eliminaCheckup(db: Db, input: unknown): Promise<{ ok: true } | { ok: false; errore: string }> {
  const parsed = eliminaCheckupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_CHECKUP.nonValidi }
  const { error } = await db.rpc('checkup_elimina', { p_id: parsed.data.id })
  if (error) return { ok: false, errore: parole(error, ERRORI_CHECKUP.nonEliminata) }
  return { ok: true }
}
