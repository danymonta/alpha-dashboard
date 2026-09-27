/**
 * The two Percorso Alpha products seen in the sales sheet (Semestrale mostly at
 * 1.500 €, Trimestrale at 500 €). Created only if missing; prices and names can
 * be changed later in Impostazioni > Prodotti.
 *
 *   npx tsx --env-file=.env.cloud.local scripts/prodotti-base.ts --cloud
 */
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../lib/supabase/database.types'

const { values: o } = parseArgs({ options: { cloud: { type: 'boolean', default: false } } })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chiave = process.env.SUPABASE_SECRET_KEY
if (!url || !chiave) throw new Error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY: lancia con --env-file')
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) && !o.cloud) {
  throw new Error('Il database non è quello locale: aggiungi --cloud se è voluto')
}

const db = createClient<Database>(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })

const PRODOTTI = [
  { nome: 'Percorso Alpha 3 mesi', durata_mesi: 3, prezzo_listino: 500 },
  { nome: 'Percorso Alpha 6 mesi', durata_mesi: 6, prezzo_listino: 1500 },
]

async function principale() {
  for (const p of PRODOTTI) {
    const { data: gia } = await db.from('products').select('id').eq('nome', p.nome).maybeSingle()
    if (gia) {
      console.log(`  ${p.nome}: già presente`)
      continue
    }
    const { error } = await db.from('products').insert(p)
    if (error) throw new Error(`${p.nome}: ${error.message}`)
    console.log(`  ${p.nome}: creato`)
  }
}

principale().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
