import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { leggiPercorso, type Percorso } from '@/lib/percorso/letture'
import { TESTI_PERCORSO } from '@/lib/percorso/testi'
import type { Database } from '@/lib/supabase/database.types'
import {
  ERRORI_PERCORSO,
  avanzaPassoSchema,
  consensoSchema,
  progressoVideoSchema,
} from '@/lib/validation/percorso'

/**
 * The client's writes (release B1a): one road each, the functions of the database with the
 * client's own session (security definer, the first line cliente_corrente()). Never the
 * service role here. The server actions (app/(cliente)/percorso/actions.ts) and the route
 * of the video (app/api/percorso/video/route.ts) add only the session.
 */

type Db = SupabaseClient<Database>
type ErroreDb = { code?: string; message: string }

export type EsitoPercorso = { ok: true; percorso: Percorso } | { ok: false; errore: string; accesso?: true }
export type EsitoConsenso = { ok: true; datoIl: string | null } | { ok: false; errore: string; accesso?: true }
export type EsitoVideo = { ok: true; percentuale: number; visto: boolean } | { ok: false; errore: string; accesso?: true }

/** Postgres' own English words (a refused write, a privilege): never shown to the client. */
const PAROLE_DI_POSTGRES = /^(new row|permission denied|null value|duplicate key|insert or update|update or delete)|violates|constraint/i

/** The functions raise 22023 and 42501 already worded for the client; anything else is the fallback. */
function messaggio(error: ErroreDb): { errore: string; accesso?: true } {
  if (error.code === '42501') return { errore: TESTI_PERCORSO.accessoNonValido, accesso: true }
  if (error.code === '22023' && !PAROLE_DI_POSTGRES.test(error.message)) return { errore: error.message }
  console.error('[percorso] scrittura non riuscita:', error.code)
  return { errore: TESTI_PERCORSO.errore }
}

/** A step completed with the client's action: percorso_avanza, the closed list of pairs. */
export async function avanzaPasso(db: Db, input: unknown): Promise<EsitoPercorso> {
  const parsed = avanzaPassoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_PERCORSO.nonValidi }
  const v = parsed.data
  const { data, error } = await db.rpc('percorso_avanza', {
    p_passo: v.passo,
    p_azione: v.azione,
    p_dati: v.azione === 'accetta' ? v.dati : {},
  })
  if (error) return { ok: false, ...messaggio(error) }
  const percorso = leggiPercorso(data)
  return percorso ? { ok: true, percorso } : { ok: false, errore: TESTI_PERCORSO.errore }
}

/** A consent given again after its text changed. */
export async function daiConsenso(db: Db, input: unknown): Promise<EsitoConsenso> {
  const parsed = consensoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_PERCORSO.nonValidi }
  const { data, error } = await db.rpc('consenso_dai', { p_tipo: parsed.data.tipo, p_versione: parsed.data.versione })
  if (error) return { ok: false, ...messaggio(error) }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  return { ok: true, datoIl: typeof r.dato_il === 'string' ? r.dato_il : null }
}

/**
 * The seconds of a video seen: the stretches go as int4range literals «[da,a)», the database
 * joins them to the ones already seen and says the percentage.
 */
export async function progressoVideo(db: Db, input: unknown): Promise<EsitoVideo> {
  const parsed = progressoVideoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_PERCORSO.video }
  const v = parsed.data
  const { data, error } = await db.rpc('video_progresso', {
    p_blocco: (v.blocco ?? null) as string,
    p_consegna: (v.consegna ?? null) as string,
    p_durata: v.durata,
    p_intervalli: v.intervalli.map(([da, a]) => `[${da},${a})`),
  })
  if (error) return { ok: false, ...messaggio(error) }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const percentuale = typeof r.percentuale === 'number' ? r.percentuale : Number(r.percentuale ?? 0)
  return { ok: true, percentuale: Number.isFinite(percentuale) ? percentuale : 0, visto: r.visto === true }
}
