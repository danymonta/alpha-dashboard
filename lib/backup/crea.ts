import 'server-only'

import { gzipSync } from 'node:zlib'

import type { createAdminClient } from '@/lib/supabase/admin'
import type { Backup } from '@/lib/backup/formato'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Every table of the public schema (public.backup_completo, service role only)
 * plus the sign-in accounts they hang on. The admin client is required: the
 * backup must see every row, whoever asks for it.
 */
export async function creaBackup(admin: Admin): Promise<Backup> {
  const { data: tabelle, error } = await admin.rpc('backup_completo')
  if (error || !tabelle) throw new Error(`Backup non riuscito: ${error?.message ?? 'nessun dato'}`)

  const utenti: Backup['utenti'] = []
  for (let pagina = 1; ; pagina++) {
    const { data, error: e } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (e) throw new Error(`Utenti non letti: ${e.message}`)
    utenti.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        user_metadata: u.user_metadata ?? {},
        created_at: u.created_at,
      })),
    )
    if (data.users.length < 1000) break
  }

  return {
    formato: 1,
    creato_il: new Date().toISOString(),
    tabelle: tabelle as Backup['tabelle'],
    utenti,
  }
}

/** The file: JSON, gzip. Small enough for an email attachment for years. */
export function fileBackup(backup: Backup): { nome: string; contenuto: Buffer } {
  const giorno = backup.creato_il.slice(0, 10)
  return { nome: `backup-alpha-${giorno}.json.gz`, contenuto: gzipSync(JSON.stringify(backup)) }
}
