import 'server-only'

import { creaBackup, fileBackup } from '@/lib/backup/crea'
import { emailBackup } from '@/lib/email/backup'
import type { Destinatario } from '@/lib/email/riepilogo-invio'
import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { formatData } from '@/lib/format'
import { notificaBackup } from '@/lib/notifiche/testi'
import { registraNotifica } from '@/lib/notifiche/registra'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The whole database by email to the admins (the weekly backup). The in-app
 * notification (1.41.0) carries no attachment and no data: it says the backup
 * went by email (or did not) and links to Impostazioni › Esporta. It is saved
 * whether or not the email could leave; without email configured the backup is
 * not even built (nobody could receive it), and the notification says so.
 * `giorno` is today in Europe/Rome (YYYY-MM-DD): the same day, the same
 * notification, however many times the job runs.
 */
export async function inviaBackup(
  admin: ReturnType<typeof createAdminClient>,
  destinatari: Destinatario[],
  giorno: string,
) {
  const registra = (inviata: boolean) => {
    const n = notificaBackup({ giorno: formatData(giorno), inviata })
    return registraNotifica({
      db: admin,
      destinatari: destinatari.map((d) => d.id),
      notifica: {
        tipo: 'backup',
        titolo: n.titolo,
        anteprima: n.anteprima,
        corpoHtml: n.html,
        link: n.link,
        emailInviata: inviata,
        chiave: `backup/${giorno}`,
      },
    })
  }

  if (!emailConfigurata()) {
    await registra(false)
    return { inviata: false, file: null as string | null, byte: 0 }
  }
  try {
    const backup = await creaBackup(admin)
    const file = fileBackup(backup)
    const esito = await inviaEmail({
      a: destinatari.map((d) => d.email).filter(Boolean),
      ...emailBackup(backup, file.nome),
      allegati: [file],
    })
    await registra(esito.inviata)
    return { inviata: esito.inviata, file: file.nome as string | null, byte: file.contenuto.length }
  } catch (e) {
    // the backup could not be built: the notification says it did not leave, the caller still sees the failure
    await registra(false)
    throw e
  }
}
