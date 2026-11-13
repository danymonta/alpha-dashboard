import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { leggiAllegati, type AllegatoCliente } from '@/lib/percorso/allegati'
import { leggiPercorso, type Percorso } from '@/lib/percorso/letture'
import { TESTI_PERCORSO } from '@/lib/percorso/testi'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  ERRORI_PERCORSO,
  avanzaPassoSchema,
  consensoSchema,
  completaLezioneSchema,
  progressoVideoSchema,
} from '@/lib/validation/percorso'
import {
  ERRORI_QUESTIONARIO,
  allegatoIdSchema,
  inviaQuestionarioSchema,
  preparaAllegatoSchema,
  risposteValide,
  salvaQuestionarioSchema,
  type Risposte,
  type TipoAllegato,
} from '@/lib/validation/questionario'

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
    p_dati: ('dati' in v ? v.dati : {}) as Json,
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
  const intervalli = v.intervalli.map(([da, a]) => `[${da},${a})`)
  // a video lesson of the Aula (1.83.0) has its own function, with the same rules
  const { data, error } = v.lezione
    ? await db.rpc('aula_video_progresso', { p_lezione: v.lezione, p_durata: v.durata, p_intervalli: intervalli })
    : await db.rpc('video_progresso', {
        p_blocco: (v.blocco ?? null) as string,
        p_consegna: (v.consegna ?? null) as string,
        p_durata: v.durata,
        p_intervalli: intervalli,
      })
  if (error) return { ok: false, ...messaggio(error) }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const percentuale = typeof r.percentuale === 'number' ? r.percentuale : Number(r.percentuale ?? 0)
  return { ok: true, percentuale: Number.isFinite(percentuale) ? percentuale : 0, visto: r.visto === true }
}

/** «Segna come completata» on a lesson of the Aula (1.83.0): aula_lezione_completa, the client's own. */
export type EsitoLezione = { ok: true; completataIl: string | null } | { ok: false; errore: string; accesso?: true }

export async function completaLezione(db: Db, input: unknown): Promise<EsitoLezione> {
  const parsed = completaLezioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_PERCORSO.nonValidi }
  const { data, error } = await db.rpc('aula_lezione_completa', { p_lezione: parsed.data.lezione })
  if (error) return { ok: false, ...messaggio(error) }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  return { ok: true, completataIl: typeof r.completata_il === 'string' ? r.completata_il : null }
}

// ---------------------------------------------------------------------------
// The questionnaire (release B1b)
// ---------------------------------------------------------------------------

export type EsitoSalva =
  | { ok: true; esito: 'salvato'; versione: number }
  | { ok: true; esito: 'cambiato'; risposte: Risposte; versione: number }
  | { ok: false; errore: string; accesso?: true }

export type EsitoInvia =
  | { ok: true; esito: 'inviato'; inviatoIl: string | null }
  | { ok: true; esito: 'cambiato'; risposte: Risposte; versione: number }
  | { ok: false; errore: string; accesso?: true; mancanti?: string[] }

/** percorso: the object to remove now, for the server action; never sent to the browser. */
export type EsitoTogli =
  | { ok: true; allegati: AllegatoCliente[]; percorso?: string | null }
  | { ok: false; errore: string; accesso?: true }

export type EsitoPrepara = { ok: true; id: string; percorso: string } | { ok: false; errore: string; accesso?: true }

/** `scartato`: the database marked the row da_cancellare (the object is not the declared file, or not there). */
export type EsitoConferma = { ok: true; allegato: AllegatoCliente } | { ok: false; errore: string; scartato?: true }

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** The answers the database sent back, kept only when they read as answers (else empty: the page reloads). */
function risposteDa(v: unknown): Risposte {
  return risposteValide(v) ? v : {}
}

/**
 * The answers saved only over the version the page read (questionario_salva): another device
 * saved meanwhile = «cambiato», with the answers as they are now.
 */
export async function salvaQuestionario(db: Db, input: unknown): Promise<EsitoSalva> {
  const parsed = salvaQuestionarioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_QUESTIONARIO.nonValidi }
  const v = parsed.data
  const { data, error } = await db.rpc('questionario_salva', {
    p_risposte: v.risposte as Json,
    p_schermata: v.schermata,
    p_versione: v.versione,
  })
  if (error) return { ok: false, ...messaggio(error) }
  const r = record(data)
  const versione = typeof r.versione === 'number' ? r.versione : Number(r.versione ?? NaN)
  if (!Number.isFinite(versione)) return { ok: false, errore: TESTI_PERCORSO.errore }
  if (r.esito === 'cambiato') return { ok: true, esito: 'cambiato', risposte: risposteDa(r.risposte), versione }
  return { ok: true, esito: 'salvato', versione }
}

/** The keys in the detail of the error of questionario_invia: a JSON array, in the order of the questionnaire. */
function mancantiDa(dettaglio: string | undefined | null): string[] {
  if (!dettaglio) return []
  try {
    const v: unknown = JSON.parse(dettaglio)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The questionnaire sent: every required answer, at the version read. */
export async function inviaQuestionario(db: Db, input: unknown): Promise<EsitoInvia> {
  const parsed = inviaQuestionarioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_QUESTIONARIO.richiesta }
  const { data, error } = await db.rpc('questionario_invia', { p_versione: parsed.data.versione })
  if (error) {
    const esito = messaggio(error)
    const mancanti = error.code === '22023' ? mancantiDa((error as { details?: string }).details) : []
    return { ok: false, ...esito, ...(mancanti.length > 0 ? { mancanti } : {}) }
  }
  const r = record(data)
  if (r.esito === 'cambiato') {
    const versione = typeof r.versione === 'number' ? r.versione : Number(r.versione ?? 0)
    return { ok: true, esito: 'cambiato', risposte: risposteDa(r.risposte), versione }
  }
  return { ok: true, esito: 'inviato', inviatoIl: typeof r.inviato_il === 'string' ? r.inviato_il : null }
}

/** A file removed before sending: the row goes da_cancellare, the evening cron removes the object. */
export async function togliAllegato(db: Db, input: unknown): Promise<EsitoTogli> {
  const parsed = allegatoIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_QUESTIONARIO.richiesta }
  const { data, error } = await db.rpc('allegato_togli', { p_id: parsed.data.id })
  if (error) return { ok: false, ...messaggio(error) }
  const r = record(data)
  return {
    ok: true,
    allegati: leggiAllegati(r.allegati),
    percorso: typeof r.percorso === 'string' ? r.percorso : null,
  }
}

/** The row of a file to upload (allegato_prepara, with the client's session): its id and its path. */
export async function preparaAllegato(db: Db, input: unknown): Promise<EsitoPrepara> {
  const parsed = preparaAllegatoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_QUESTIONARIO.file }
  const v = parsed.data
  const { data, error } = await db.rpc('allegato_prepara', {
    p_campo: v.campo,
    p_nome: v.nome,
    p_tipo: v.tipo,
    p_byte: v.byte,
  })
  if (error) return { ok: false, ...messaggio(error) }
  const r = record(data)
  if (typeof r.id !== 'string' || typeof r.percorso !== 'string') return { ok: false, errore: TESTI_PERCORSO.errore }
  return { ok: true, id: r.id, percorso: r.percorso }
}

/**
 * The confirmation of an upload, with the service role (allegato_conferma has no grant to a
 * session): the client from the verified session, the type read from the first bytes of the
 * object. Never a value from the browser but the id of the row.
 */
export async function confermaAllegato(
  admin: Db,
  clientId: string,
  id: string,
  tipoLetto: TipoAllegato | null,
): Promise<EsitoConferma> {
  const { data, error } = await admin.rpc('allegato_conferma', {
    p_client_id: clientId,
    p_id: id,
    p_tipo_letto: tipoLetto as string,
  })
  if (error) {
    const esito = messaggio(error)
    return { ok: false, errore: esito.errore }
  }
  const r = record(data)
  if (r.esito !== 'caricato') {
    return { ok: false, errore: typeof r.messaggio === 'string' ? r.messaggio : ERRORI_QUESTIONARIO.file, scartato: true }
  }
  const [allegato] = leggiAllegati([r])
  return allegato ? { ok: true, allegato } : { ok: false, errore: TESTI_PERCORSO.errore }
}
