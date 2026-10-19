import 'server-only'

import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { emailPromemoria, type Promemoria } from '@/lib/email/promemoria'
import { registraNotifica } from '@/lib/notifiche/registra'
import type { TipoEmail } from '@/lib/notifiche/tipi'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The path reminders step of the daily cron (Dany, 04/10/2026): "Call dei 3
 * mesi" and "Call di rinnovo", one email each, to the active admins.
 * public.promemoria_percorso_da_inviare says which are due (service_role).
 * Each one is booked before its email (promemoria_percorso_prenota, in_invio):
 * two runs of the cron on the same evening never send it twice. Resend accepted
 * it: the booking becomes inviato. Refused: the booking goes, and tomorrow
 * evening it is due again. Without email configured nothing is sent and no
 * booking is made (the reminder stays due).
 *
 * Notifications (1.41.0): each reminder is also saved for the admins in the app
 * (public.notifiche), whether or not the email could leave, with a key per
 * client, kind and path end (never the day): the same reminder is one
 * notification however many evenings it is tried, and the evening it finally
 * goes by email turns "Email inviata" on. Without email configured the due
 * reminders are saved all the same. A failure to save never touches the email
 * path (registraNotifica never throws).
 */

/** Resend takes 2 requests a second: one email at a time, a pause in between. */
const PAUSA_TRA_INVII_MS = 600
/** A first run may find many: the rest go the next evenings, nothing is lost. */
export const MASSIMO_PER_SERA = 20
/** Resend refusing three in a row (quota, key): stop, tomorrow they go again. */
const ERRORI_DI_FILA_MAX = 3
/** One email waits at most this long for Resend: a hung call never outlives the function. */
export const TEMPO_INVIO_MAX_MS = 8_000

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc' | 'from'>
type Esito = Database['public']['Enums']['promemoria_esito']

export type EsitoPromemoria =
  | { configurata: false; /** saved in the app without email (1.41.0) */ notificate?: number }
  | {
      configurata: true
      inviati: number
      saltati: number
      non_riusciti: number
      /** booked by another run of the cron, or handled meanwhile */
      gia_presi: number
      rimandati: number
    }

const attendi = (ms: number) => new Promise((risolvi) => setTimeout(risolvi, ms))

/**
 * Takes the reminder for this run: 'in_invio' before the email, 'saltato' for
 * the catch-up. The row id when this run got it; null when another run holds
 * it or it was already handled. A database error: logged, and null.
 */
async function prendi(db: Db, p: Promemoria, esito: Extract<Esito, 'in_invio' | 'saltato'>) {
  const { data, error } = await db.rpc('promemoria_percorso_prenota', {
    p_client_id: p.client_id,
    p_tipo: p.tipo,
    p_data_fine: p.data_fine,
    p_sale_id: p.sale_id,
    p_esito: esito,
  })
  if (error) {
    console.error('[promemoria] prenotazione non riuscita:', error.message)
    return { id: null, errore: true }
  }
  return { id: (data as string | null) ?? null, errore: false }
}

/** Resend accepted it: the booking is the record that it went. */
async function segnaInviato(db: Db, id: string) {
  const { error } = await db.from('promemoria_percorso').update({ esito: 'inviato' }).eq('id', id).eq('esito', 'in_invio')
  // the booking stays: after 30 minutes it is free again, and tomorrow the
  // same email may go once more (the cost of a database that did not answer)
  if (error) console.error('[promemoria] invio non registrato:', error.message)
}

/** Resend refused it: no booking left, tomorrow evening it is due again. */
async function libera(db: Db, id: string) {
  const { error } = await db.from('promemoria_percorso').delete().eq('id', id).eq('esito', 'in_invio')
  // the booking frees itself after 30 minutes anyway
  if (error) console.error('[promemoria] prenotazione non tolta:', error.message)
}

const TIPO_NOTIFICA: Record<Promemoria['tipo'], TipoEmail> = {
  feedback_3_mesi: 'promemoria_feedback',
  rinnovo_1_mese: 'promemoria_rinnovo',
}

/** One notification per client, kind and path end: never the day (a later evening is the same reminder). */
export function chiaveNotifica(p: Promemoria) {
  return `promemoria-percorso/${p.client_id}/${p.tipo}/${p.data_fine}`
}

/** The same reminder on the same day is one email for Resend, whatever retries it. */
export function chiaveIdempotenza(p: Promemoria, oggi: string) {
  return `promemoria-percorso/${p.client_id}/${p.tipo}/${p.data_fine}/${oggi}`
}

export async function inviaPromemoriaPercorso({
  db,
  oggi,
  indirizzi,
  destinatari = [],
  urlApp,
  invia = inviaEmail,
  pausaMs = PAUSA_TRA_INVII_MS,
  entro,
}: {
  db: Db
  /** today in Europe/Rome, YYYY-MM-DD */
  oggi: string
  /** the active admins */
  indirizzi: string[]
  /** the same admins' profile ids: where the in-app notification goes (none: no notification) */
  destinatari?: string[]
  urlApp: string
  invia?: typeof inviaEmail
  pausaMs?: number
  /**
   * Epoch ms by which every email is over, Resend's answer included: one is
   * started only if it ends in time even waiting the whole TEMPO_INVIO_MAX_MS.
   * The function has a time limit, and one cut mid-send could go again
   * tomorrow. The rest wait for tomorrow.
   */
  entro?: number
}): Promise<EsitoPromemoria> {
  const configurata = emailConfigurata() && indirizzi.length > 0
  if (!configurata && destinatari.length === 0) return { configurata: false }

  const { data, error } = await db.rpc('promemoria_percorso_da_inviare', { p_giorno: oggi })
  if (error) throw new Error(`promemoria_percorso_da_inviare: ${error.message}`)
  const dovuti = (data ?? []) as Promemoria[]

  const salva = (p: Promemoria, emailInviata: boolean, email: ReturnType<typeof emailPromemoria>) =>
    registraNotifica({
      db: db as Parameters<typeof registraNotifica>[0]['db'],
      destinatari,
      notifica: {
        tipo: TIPO_NOTIFICA[p.tipo],
        titolo: email.oggetto,
        testo: email.testo,
        corpoHtml: email.html,
        link: `/clients/${p.client_id}`,
        emailInviata,
        chiave: chiaveNotifica(p),
      },
    })

  // no email to send with: the due reminders are saved in the app, and stay due for the email
  if (!configurata) {
    let notificate = 0
    for (const p of dovuti.filter((d) => d.azione === 'invia')) {
      if (await salva(p, false, emailPromemoria(p, { urlApp, oggi }))) notificate++
    }
    return { configurata: false, notificate }
  }

  // catch-up: past both thresholds, the renewal one goes and the feedback one is recorded as skipped
  let saltati = 0
  for (const p of dovuti.filter((d) => d.azione === 'salta')) {
    if ((await prendi(db, p, 'saltato')).id) saltati++
  }

  const daInviare = dovuti.filter((p) => p.azione === 'invia')
  let inviati = 0
  let nonRiusciti = 0
  let giaPresi = 0
  let errori = 0
  let tentati = 0
  let mandate = 0
  for (const p of daInviare.slice(0, MASSIMO_PER_SERA)) {
    if (errori >= ERRORI_DI_FILA_MAX) break
    if (entro !== undefined && Date.now() + pausaMs + TEMPO_INVIO_MAX_MS > entro) break
    tentati++

    const presa = await prendi(db, p, 'in_invio')
    if (presa.errore) {
      nonRiusciti++
      errori++
      continue
    }
    if (!presa.id) {
      giaPresi++
      continue
    }

    if (mandate > 0 && pausaMs > 0) await attendi(pausaMs)
    mandate++
    const email = emailPromemoria(p, { urlApp, oggi })
    const esito = await invia({
      a: indirizzi,
      ...email,
      idempotenza: chiaveIdempotenza(p, oggi),
      timeoutMs: TEMPO_INVIO_MAX_MS,
    })
    if (destinatari.length > 0) await salva(p, esito.inviata, email)
    if (!esito.inviata) {
      await libera(db, presa.id)
      nonRiusciti++
      errori++
      continue
    }
    errori = 0
    inviati++
    await segnaInviato(db, presa.id)
  }

  return {
    configurata: true,
    inviati,
    saltati,
    non_riusciti: nonRiusciti,
    gia_presi: giaPresi,
    rimandati: daInviare.length - tentati,
  }
}
