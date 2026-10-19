import 'server-only'

import { LIMITI_NOTIFICA, linkInterno, type TipoAvviso } from '@/lib/notifiche/tipi'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The in-app alerts of the notification center (1.42.0): they exist only in the
 * app, never as an email, for the active admins (the people who receive the
 * emails). Written by the server with the service_role through
 * public.notifiche_avviso, once per `chiave` for everybody: the same key is
 * never emitted twice, so a second run of a cron, or the same scan the next
 * evening, repeats nothing (and one the admin deleted is not created again).
 *
 * Money, keys, Claude's spend and the one thing the admin decides (the
 * Instagram proposals): nothing about what a person did or did not fill in
 * (CLAUDE.md section 17).
 */
type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

export type AvvisoDaRegistrare = {
  tipo: TipoAvviso
  titolo: string
  /** one short line for the list */
  anteprima: string
  /** plain lines for the detail page (at most 31, 300 characters each); never HTML */
  dettagli?: string[]
  /** an internal path ("/settings/chiavi"); anything else is dropped (the alert has no button) */
  link: string
  /** stable per alert: the same key is emitted once */
  chiave: string
}

/** The row's values, bounded like the table's checks (pure, tested). */
export function valoriAvviso(a: AvvisoDaRegistrare) {
  const dettagli = (a.dettagli ?? [])
    .map((riga) => riga.trim().slice(0, LIMITI_NOTIFICA.riga))
    .filter((riga) => riga.length > 0)
    .slice(0, LIMITI_NOTIFICA.dettagli)
  return {
    titolo: a.titolo.trim().slice(0, LIMITI_NOTIFICA.titolo) || 'Avviso',
    anteprima: a.anteprima.trim().slice(0, LIMITI_NOTIFICA.anteprima),
    dettagli: dettagli.length > 0 ? dettagli : null,
    link: linkInterno(a.link),
    chiave: a.chiave.slice(0, LIMITI_NOTIFICA.chiave),
  }
}

/**
 * Saves an alert for these profiles. Returns the rows written (0 when the key
 * was emitted before), or null on any failure; never throws and never logs a
 * title, a text or a key: one line with the code only.
 */
export async function registraAvviso({
  db,
  destinatari,
  avviso,
}: {
  db: Db
  /** profile ids */
  destinatari: string[]
  avviso: AvvisoDaRegistrare
}): Promise<number | null> {
  if (destinatari.length === 0) return 0
  try {
    const v = valoriAvviso(avviso)
    const { data, error } = await db.rpc('notifiche_avviso', {
      p_destinatari: destinatari,
      p_tipo: avviso.tipo,
      p_titolo: v.titolo,
      p_anteprima: v.anteprima,
      p_dettagli: v.dettagli as never,
      p_link: v.link as string,
      p_chiave: v.chiave,
    })
    if (error) {
      console.error('[avvisi] non registrato:', error.code ?? 'errore')
      return null
    }
    return typeof data === 'number' ? data : 0
  } catch {
    console.error('[avvisi] non registrato: errore')
    return null
  }
}

/** The evening digest of the instalments that became overdue (SQL decides, writes and remembers). */
export async function avvisaRateInRitardo(db: Db, giorno: string): Promise<number | null> {
  try {
    const { data, error } = await db.rpc('notifiche_rate_in_ritardo', { p_giorno: giorno })
    if (error) {
      console.error('[avvisi] rate in ritardo:', error.code ?? 'errore')
      return null
    }
    return typeof data === 'number' ? data : 0
  } catch {
    console.error('[avvisi] rate in ritardo: errore')
    return null
  }
}
