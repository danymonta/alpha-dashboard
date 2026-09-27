// From a backup file (the Monday email attachment, or "Scarica il backup") to
// the SQL that restores it. Usage:
//   npm run backup:sql -- backup-alpha-2026-09-28.json.gz ripristino.sql
// then run ripristino.sql in the Supabase SQL editor (or with psql).
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

import { conteggi, sqlRipristino, type Backup } from '../lib/backup/formato'

const [sorgente, destinazione] = process.argv.slice(2)
if (!sorgente) {
  console.error('Uso: npm run backup:sql -- <backup.json.gz> [ripristino.sql]')
  process.exit(1)
}

const grezzo = readFileSync(sorgente)
const backup = JSON.parse((sorgente.endsWith('.gz') ? gunzipSync(grezzo) : grezzo).toString('utf8')) as Backup
const sql = sqlRipristino(backup)

if (destinazione) {
  writeFileSync(destinazione, sql)
  console.error(`Scritto ${destinazione} dal backup del ${backup.creato_il}`)
  for (const c of conteggi(backup)) console.error(`  ${c.tabella}: ${c.righe}`)
} else {
  process.stdout.write(sql)
}
