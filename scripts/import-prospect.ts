/**
 * One-off import of Dany's sales call sheet into leads, calls and call_pitch.
 * Idempotent: a lead with the same name and a call on the same day is skipped.
 *
 *   npx tsx --env-file=.env.cloud.local scripts/import-prospect.ts import/prospect-call.csv \
 *     --closer <email> [--setter <email>] [--cloud] [--prova]
 *
 * The sheet does not say who booked each call: without --setter the leads and
 * calls have no setter (they count for the closer, not for a setter's numbers).
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import { leggiCsv, mappaProspect } from '../lib/import/prospect'
import type { Database } from '../lib/supabase/database.types'

const NOTA = 'Importato dal foglio delle call'

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    closer: { type: 'string' },
    setter: { type: 'string' },
    cloud: { type: 'boolean', default: false },
    prova: { type: 'boolean', default: false },
  },
})

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

const file = positionals[0]
if (!file || !existsSync(file)) esci('Indica il CSV, ad esempio import/prospect-call.csv')
if (!o.closer) esci('Serve --closer <email>')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chiave = process.env.SUPABASE_SECRET_KEY
if (!url || !chiave) esci('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY: lancia con --env-file')
const locale = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
if (!locale && !o.cloud) esci(`Il database è ${new URL(url).hostname}: aggiungi --cloud se è voluto`)

const db = createClient<Database>(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })

async function profilo(email: string, ruoli: string[]) {
  const { data } = await db.from('profiles').select('id, ruolo').ilike('email', email).maybeSingle()
  if (!data) esci(`${email}: nessun profilo`)
  if (!ruoli.includes(data.ruolo)) esci(`${email} ha ruolo ${data.ruolo}, serve ${ruoli.join(' o ')}`)
  return data.id
}

async function principale() {
  console.log(`\nImport call · ${locale ? 'locale' : new URL(url!).hostname}${o.prova ? ' · PROVA' : ''}\n`)
  const closer = await profilo(o.closer!, ['admin', 'closer'])
  const setter = o.setter ? await profilo(o.setter, ['setter']) : null

  const { call, avvisi } = mappaProspect(leggiCsv(readFileSync(file!, 'utf8')))
  const { data: prodotti } = await db.from('products').select('id, nome')
  const prodotto = new Map((prodotti ?? []).map((p) => [p.nome, p.id]))

  const conta = { lette: call.length, create: 0, gia: 0, pitch: 0 }
  for (const c of call) {
    const { data: lead } = await db.from('leads').select('id').ilike('nome', c.nome).limit(1).maybeSingle()
    if (lead) {
      const { count } = await db
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id)
        .gte('programmata_il', `${c.data}T00:00:00Z`)
        .lte('programmata_il', `${c.data}T23:59:59Z`)
      if ((count ?? 0) > 0) {
        conta.gia++
        continue
      }
    }
    if (o.prova) {
      conta.create++
      continue
    }

    let leadId = lead?.id
    if (!leadId) {
      const { data, error } = await db
        .from('leads')
        .insert({ nome: c.nome, instagram_handle: c.instagram_handle, fonte: 'altro', setter_id: setter, stato: c.stato_lead, note: NOTA })
        .select('id')
        .single()
      if (error) esci(`Riga ${c.riga}, lead: ${error.message}`)
      leadId = data.id
    }

    const { data: nuova, error } = await db
      .from('calls')
      .insert({
        lead_id: leadId,
        setter_id: setter,
        closer_id: closer,
        tipo: 'strategy',
        // no time in the sheet: midday keeps the day right in Europe/Rome
        programmata_il: `${c.data}T12:00:00Z`,
        stato: c.stato,
        qualificata: c.qualificata,
        esito: c.esito,
        obiezione_principale: c.obiezione,
        // the sheet is the closer's: its "Note aggiuntive" are his (calls.note_closer)
        note_closer: c.note,
        link_registrazione: c.link,
        performance: c.performance as Database['public']['Enums']['call_performance'] | null,
        prodotto_proposto_id: c.prodotto ? (prodotto.get(c.prodotto) ?? null) : null,
        // its sale came from the Excel, without the call: a closed one never asks for it
        // («Vendita da registrare»), even if its lead or its author is deleted later
        importata: true,
      })
      .select('id')
      .single()
    if (error) esci(`Riga ${c.riga}, call: ${error.message}`)
    conta.create++

    if (c.importo !== null) {
      const { error: e } = await db.from('call_pitch').insert({ call_id: nuova.id, importo_proposto: c.importo })
      if (e) esci(`Riga ${c.riga}, importo: ${e.message}`)
      conta.pitch++
    }
  }

  console.log(`Call: ${conta.lette} lette, ${conta.create} ${o.prova ? 'da creare' : 'create'}, ${conta.gia} già presenti; importi proposti: ${conta.pitch}`)
  if (avvisi.length > 0) {
    console.log('\nAvvisi')
    for (const a of avvisi) console.log(`  - ${a}`)
  }
  console.log('')
}

principale().catch((e) => esci(e instanceof Error ? e.message : String(e)))
