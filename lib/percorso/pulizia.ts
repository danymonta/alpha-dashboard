import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The cleanup of the clients' users (release B1a, docs/onboarding/rilascio-b.md,
 * «Conservazione»). Storage and Auth are not cleaned from SQL: a deleted client takes its
 * account with it (cascade on clienti_account), and its user in auth.users is removed here,
 * by the server action that deletes the client and, as a net, by the evening's cron, which
 * removes the users with app_metadata.tipo = 'cliente' and no account. Never stops anything:
 * a failure is a line in the log, with no id, address or name.
 */

type Admin = SupabaseClient<Database>

/** The user of a deleted client: after elimina_cliente, never blocking it. */
export async function togliUtenteCliente(userId: string, admin: Admin = createAdminClient()): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('[percorso] utente del cliente non tolto:', error.code ?? error.status)
      return false
    }
    return true
  } catch {
    console.error('[percorso] utente del cliente non tolto')
    return false
  }
}

/** A user of a client is left alone for this long after its creation: never one being registered. */
const MARGINE_MS = 60 * 60 * 1000
/** At most this many users removed per evening, and pages of users read. */
const MAX_TOLTI = 100
const PAGINE_MAX = 20
const PER_PAGINA = 1000

export type EsitoPulizia = { letti: number; tolti: number; errori: number }

/**
 * The orphan users: app_metadata.tipo = 'cliente', no row in clienti_account, created more
 * than an hour ago. Read with the admin API of Auth (auth.users is not in the Data API).
 */
export async function pulisciUtentiOrfani(admin: Admin, adesso: number = Date.now()): Promise<EsitoPulizia> {
  const esito: EsitoPulizia = { letti: 0, tolti: 0, errori: 0 }
  const candidati: string[] = []

  for (let pagina = 1; pagina <= PAGINE_MAX; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: PER_PAGINA })
    if (error) {
      console.error('[percorso] utenti non letti:', error.code ?? error.status)
      esito.errori++
      break
    }
    const utenti = data.users ?? []
    esito.letti += utenti.length
    for (const u of utenti) {
      const creato = u.created_at ? Date.parse(u.created_at) : NaN
      if (u.app_metadata?.tipo === 'cliente' && Number.isFinite(creato) && adesso - creato > MARGINE_MS) {
        candidati.push(u.id)
      }
    }
    if (utenti.length < PER_PAGINA) break
  }
  if (candidati.length === 0) return esito

  const conAccount = new Set<string>()
  for (let i = 0; i < candidati.length; i += 200) {
    const blocco = candidati.slice(i, i + 200)
    const { data, error } = await admin.from('clienti_account').select('user_id').in('user_id', blocco)
    if (error) {
      // the database does not answer: nothing is removed tonight
      console.error('[percorso] account non letti:', error.code)
      esito.errori++
      return esito
    }
    for (const r of data ?? []) conAccount.add(r.user_id)
  }

  for (const id of candidati.filter((id) => !conAccount.has(id)).slice(0, MAX_TOLTI)) {
    if (await togliUtenteCliente(id, admin)) esito.tolti++
    else esito.errori++
  }
  return esito
}

// ---------------------------------------------------------------------------
// The files of the questionnaire (release B1b)
// ---------------------------------------------------------------------------

const BUCKET_ALLEGATI = 'onboarding-allegati'
/** Storage removes at most this many objects per call; at most this many per evening. */
const PER_CHIAMATA = 100
const MAX_FILE_SERA = 1000

/**
 * The objects of some files of the questionnaire, now (a revocation of the consent, a deleted
 * client): the paths come from the database, never from the browser. Never stops anything: a
 * failure is a line in the log, with no path; the evening's cron removes the rest.
 */
export async function togliFileQuestionario(percorsi: readonly string[], admin?: Admin): Promise<number> {
  if (percorsi.length === 0) return 0
  let tolti = 0
  try {
    const db = admin ?? createAdminClient()
    for (let i = 0; i < percorsi.length; i += PER_CHIAMATA) {
      const blocco = percorsi.slice(i, i + PER_CHIAMATA)
      const { error } = await db.storage.from(BUCKET_ALLEGATI).remove([...blocco])
      if (error) {
        console.error('[percorso] file del questionario non tolti:', error.name)
        continue
      }
      tolti += blocco.length
    }
  } catch {
    console.error('[percorso] file del questionario non tolti')
  }
  return tolti
}

export type EsitoPuliziaFile = { file: number; righe: number; errori: number }

/**
 * The evening: the rows da_cancellare created before today and the objects of the bucket with no
 * row (onboarding_allegati_da_togliere, service role), removed from Storage, then their rows.
 * A row goes only after its object went.
 */
export async function pulisciFileQuestionario(admin: Admin): Promise<EsitoPuliziaFile> {
  const esito: EsitoPuliziaFile = { file: 0, righe: 0, errori: 0 }
  const { data, error } = await admin.rpc('onboarding_allegati_da_togliere')
  if (error) {
    console.error('[percorso] file da togliere non letti:', error.code)
    esito.errori++
    return esito
  }
  const righe = (data ?? []).slice(0, MAX_FILE_SERA)
  for (let i = 0; i < righe.length; i += PER_CHIAMATA) {
    const blocco = righe.slice(i, i + PER_CHIAMATA)
    const { error: errStorage } = await admin.storage.from(BUCKET_ALLEGATI).remove(blocco.map((r) => r.percorso))
    if (errStorage) {
      console.error('[percorso] file non tolti:', errStorage.name)
      esito.errori++
      continue
    }
    esito.file += blocco.length
    const ids = blocco.map((r) => r.id).filter((id): id is string => typeof id === 'string')
    if (ids.length === 0) continue
    const { error: errRighe, count } = await admin
      .from('onboarding_allegati')
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('stato', 'da_cancellare')
    if (errRighe) {
      console.error('[percorso] righe dei file non tolte:', errRighe.code)
      esito.errori++
      continue
    }
    esito.righe += count ?? 0
  }
  return esito
}
