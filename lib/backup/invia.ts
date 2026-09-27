import 'server-only'

import { creaBackup, fileBackup } from '@/lib/backup/crea'
import { emailBackup } from '@/lib/email/backup'
import { inviaEmail } from '@/lib/email/invia'
import type { createAdminClient } from '@/lib/supabase/admin'

/** The whole database by email to these addresses (the weekly backup). */
export async function inviaBackup(admin: ReturnType<typeof createAdminClient>, indirizzi: string[]) {
  const backup = await creaBackup(admin)
  const file = fileBackup(backup)
  const esito = await inviaEmail({ a: indirizzi, ...emailBackup(backup, file.nome), allegati: [file] })
  return { inviata: esito.inviata, file: file.nome, byte: file.contenuto.length }
}
