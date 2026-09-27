/**
 * A placeholder profile for a collaborator who has not signed in yet, so their
 * historical data (setter reports, commissions) can be imported now. When the
 * real person signs in with Google, scripts/collega-profilo.ts moves everything
 * to their real profile and deactivates the placeholder.
 *
 * The placeholder cannot sign in: Google login only, on an .invalid address.
 *
 *   npx tsx --env-file=.env.cloud.local scripts/profilo-segnaposto.ts \
 *     --email loris.setter@segnaposto.invalid --nome "Loris (da collegare)" --ruolo setter --cloud
 */
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../lib/supabase/database.types'

const { values: o } = parseArgs({
  options: {
    email: { type: 'string' },
    nome: { type: 'string' },
    ruolo: { type: 'string', default: 'setter' },
    cloud: { type: 'boolean', default: false },
  },
})

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

const email = o.email?.trim().toLowerCase()
if (!email?.endsWith('.invalid')) esci('Usa un indirizzo che finisce in .invalid: nessuno deve poterci entrare')
if (!o.nome) esci('Serve --nome')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chiave = process.env.SUPABASE_SECRET_KEY
if (!url || !chiave) esci('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY: lancia con --env-file')
const locale = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
if (!locale && !o.cloud) esci('Il database non è quello locale: aggiungi --cloud se è voluto')

const db = createClient<Database>(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })

async function principale() {
  const { data: esistente } = await db.from('profiles').select('id, nome, ruolo').eq('email', email!).maybeSingle()
  if (esistente) {
    console.log(`Profilo già presente: ${esistente.nome} (${esistente.ruolo}) ${esistente.id}`)
    return
  }

  // the invite gate in handle_new_user needs an invite first
  const { error: e1 } = await db
    .from('invites')
    .upsert({ email: email!, ruolo: o.ruolo as Database['public']['Enums']['app_role'], revocato: false })
  if (e1) esci(`Invito: ${e1.message}`)

  const { data, error: e2 } = await db.auth.admin.createUser({
    email: email!,
    email_confirm: true,
    user_metadata: { full_name: o.nome },
  })
  if (e2) esci(`Utente: ${e2.message}`)

  console.log(`Creato ${o.nome} (${o.ruolo}) ${data.user.id}`)
}

principale().catch((e) => esci(e instanceof Error ? e.message : String(e)))
