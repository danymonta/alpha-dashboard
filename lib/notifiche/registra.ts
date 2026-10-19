import 'server-only'

import { corpoDiRiserva, anteprimaDaTesto } from '@/lib/notifiche/testi'
import { LIMITI_NOTIFICA, linkInterno, type TipoEmail } from '@/lib/notifiche/tipi'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Saves the in-app copy of an email the app sends to profiles of the app
 * (1.41.0, Dany 19/10/2026: "tutte le notifiche o mail che mi arrivano devono
 * essere salvate in una sezione di notifiche"). Called by the server code that
 * sends the email, with the service_role, once per email (not once per
 * recipient: the same notification is saved for each profile in `destinatari`).
 *
 * - Whether or not the email could leave: the copy in the app is the point.
 *   `emailInviata` only says if it went out.
 * - Idempotent: the same `chiave` for the same recipient is saved once, so a
 *   second run of a cron the same evening never doubles it; a repeat that
 *   finally sends the email turns `email_inviata` on (notifiche_registra).
 * - Never blocks or fails the email path: a failure to record is one log line
 *   with the code only, never a title, a text or an address.
 * - The bounds of the table are respected here too: a title or a line that is
 *   too long is cut, a body that is too big is replaced by a plain one, a link
 *   that is not an internal path is dropped.
 */
type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

export type NotificaDaRegistrare = {
  tipo: TipoEmail
  /** the email's subject */
  titolo: string
  /** one short line; when missing, taken from `testo` */
  anteprima?: string
  /** the email's plain-text version, for the preview line when `anteprima` is missing */
  testo?: string
  /** the email's HTML, as our own code generated it */
  corpoHtml: string
  /** an internal path ("/payments"); anything else is dropped */
  link?: string | null
  emailInviata: boolean
  /** stable per email and recipient, e.g. Resend's idempotency key */
  chiave: string
}

/** The row's values, bounded like the table's checks (pure, tested). */
export function valoriNotifica(n: NotificaDaRegistrare) {
  const titolo = n.titolo.trim().slice(0, LIMITI_NOTIFICA.titolo) || 'Notifica'
  const anteprima = (n.anteprima ?? anteprimaDaTesto(n.testo ?? '')).slice(0, LIMITI_NOTIFICA.anteprima)
  const corpoHtml =
    n.corpoHtml.length > 0 && n.corpoHtml.length <= LIMITI_NOTIFICA.corpoHtml
      ? n.corpoHtml
      : corpoDiRiserva(titolo, anteprima)
  return {
    titolo,
    anteprima,
    corpoHtml,
    link: linkInterno(n.link),
    chiave: n.chiave.slice(0, LIMITI_NOTIFICA.chiave),
  }
}

/** True when the notification is saved (or already was); false on any failure, never throws. */
export async function registraNotifica({
  db,
  destinatari,
  notifica,
}: {
  db: Db
  /** profile ids */
  destinatari: string[]
  notifica: NotificaDaRegistrare
}): Promise<boolean> {
  if (destinatari.length === 0) return true
  try {
    const v = valoriNotifica(notifica)
    const { error } = await db.rpc('notifiche_registra', {
      p_destinatari: destinatari,
      p_tipo: notifica.tipo,
      p_titolo: v.titolo,
      p_anteprima: v.anteprima,
      p_corpo_html: v.corpoHtml,
      p_link: v.link as string,
      p_email_inviata: notifica.emailInviata,
      p_chiave: v.chiave,
    })
    if (error) {
      console.error('[notifiche] non registrata:', error.code ?? 'errore')
      return false
    }
    return true
  } catch {
    console.error('[notifiche] non registrata: errore')
    return false
  }
}
