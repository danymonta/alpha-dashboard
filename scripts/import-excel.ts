/**
 * One-off import of the coach's Excel (CLAUDE.md section 14). Idempotent: run it
 * again and nothing is duplicated.
 *
 *   Passaggio 1: setter reports (columns I-Q), setter payouts, the setter's
 *                commission rule if missing, and import/vendite-da-completare.csv
 *   Passaggio 2: reads the completed CSV and creates clients, sales and payments
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/import-excel.ts <file.xlsx> \
 *     --setter <email> --closer <email> [--passaggio 2] [--prova] [--segnaposto] [--cloud]
 *
 *   --prova        reads and checks everything, writes nothing
 *   --segnaposto   fills the CSV with placeholder clients (to be corrected in the app)
 *   --cloud        required when the database is not the local one
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

import {
  attribuisciPeriodi,
  confrontaConExcel,
  csvDaCompletare,
  leggiCsvVendite,
  leggiFoglioMensile,
  leggiPagamentiSetter,
  rateCoperte,
  type FoglioMensile,
  type RigaVendita,
} from '../lib/import/excel'
import type { Database } from '../lib/supabase/database.types'

const CSV = path.join('import', 'vendite-da-completare.csv')
const NOTA = 'Importato dall’Excel'

const { values: opzioni, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    setter: { type: 'string' },
    closer: { type: 'string' },
    passaggio: { type: 'string', default: '1' },
    prova: { type: 'boolean', default: false },
    segnaposto: { type: 'boolean', default: false },
    cloud: { type: 'boolean', default: false },
  },
})

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

const file = positionals[0]
if (!file || !existsSync(file)) esci('Indica il file Excel, ad esempio "import/MMM x Percorso Alpha DM Tracking.xlsx"')
if (!opzioni.setter || !opzioni.closer) esci('Servono --setter <email> e --closer <email>')
if (!['1', '2'].includes(opzioni.passaggio!)) esci('--passaggio vale 1 o 2')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chiave = process.env.SUPABASE_SECRET_KEY
if (!url || !chiave) esci('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY: lancia con --env-file')

const locale = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
if (!locale && !opzioni.cloud) esci(`Il database è ${new URL(url).hostname}, non quello locale: aggiungi --cloud se è voluto`)

const db = createClient<Database>(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })
const prova = opzioni.prova!

type Conteggi = Record<string, number>
const riepilogo: Record<string, Conteggi> = {}
const avvisi: string[] = []
function conta(sezione: string, voce: string, n = 1) {
  riepilogo[sezione] ??= {}
  riepilogo[sezione][voce] = (riepilogo[sezione][voce] ?? 0) + n
}

async function profilo(email: string, ruoli: string[]) {
  const { data, error } = await db.from('profiles').select('id, nome, ruolo, attivo').ilike('email', email).maybeSingle()
  if (error) esci(`Lettura profili: ${error.message}`)
  if (!data) esci(`${email} non ha ancora un profilo: invitalo da Team e fagli fare il primo accesso`)
  if (!ruoli.includes(data.ruolo)) esci(`${email} ha ruolo ${data.ruolo}, serve ${ruoli.join(' o ')}`)
  return data
}

async function leggiExcel() {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.readFile(file!)
  const mesi = libro.worksheets.map(leggiFoglioMensile).filter((f): f is FoglioMensile => f !== null)
  if (mesi.length === 0) esci('Nessun foglio mensile riconosciuto (intestazione DATE in B, OUT BOUND in I)')
  const fogliPagamenti = libro.getWorksheet('Setter Payments')
  return { mesi, fogliPagamenti }
}

// ---------------------------------------------------------------------------
// Passaggio 1
// ---------------------------------------------------------------------------
async function passaggio1() {
  const setter = await profilo(opzioni.setter!, ['setter'])
  const { mesi, fogliPagamenti } = await leggiExcel()

  // setter reports: existing days are never overwritten, the app may have corrected them
  const report = mesi.flatMap((m) => m.report)
  for (const m of mesi) {
    conta('Report giornalieri', 'righe vuote saltate', m.vuote)
    avvisi.push(...m.avvisi)
  }
  const { data: esistenti, error } = await db
    .from('setter_daily_reports')
    .select('data')
    .eq('setter_id', setter.id)
    .in('data', report.map((r) => r.data))
  if (error) esci(`Lettura report: ${error.message}`)
  const giaPresenti = new Set((esistenti ?? []).map((r) => r.data))
  const nuovi = report.filter((r) => !giaPresenti.has(r.data))
  conta('Report giornalieri', 'letti', report.length)
  conta('Report giornalieri', 'già presenti', report.length - nuovi.length)
  if (!prova && nuovi.length > 0) {
    const { error: e } = await db
      .from('setter_daily_reports')
      .insert(nuovi.map((r) => ({ ...r, setter_id: setter.id, note: NOTA })))
    if (e) esci(`Scrittura report: ${e.message}`)
  }
  conta('Report giornalieri', prova ? 'da creare' : 'creati', nuovi.length)

  // setter payouts, attributed to months oldest first
  const chiusure = mesi.flatMap((m) => m.chiusure)
  const primoMese = `${mesi.flatMap((m) => m.report.map((r) => r.data)).concat(chiusure.map((c) => c.data)).sort()[0]?.slice(0, 7)}-01`
  if (fogliPagamenti) {
    const { pagamenti, avvisi: a } = leggiPagamentiSetter(fogliPagamenti)
    avvisi.push(...a)
    const cashPerMese = new Map<string, number>()
    for (const m of mesi) {
      const giorni = [...m.report.map((r) => r.data), ...m.chiusure.map((c) => c.data)]
      const mese = giorni.length > 0 ? `${giorni.sort()[0].slice(0, 7)}-01` : null
      if (mese) cashPerMese.set(mese, m.chiusure.reduce((s, c) => s + c.cash, 0))
    }
    const periodi = attribuisciPeriodi(pagamenti, cashPerMese)
    conta('Pagamenti provvigioni', 'letti', pagamenti.length)

    for (const [i, p] of pagamenti.entries()) {
      const { data: gia } = await db
        .from('commission_payouts')
        .select('id')
        .eq('profile_id', setter.id)
        .eq('pagato_il', p.pagato_il)
        .eq('importo', p.importo)
        .maybeSingle()
      if (gia) {
        conta('Pagamenti provvigioni', 'già presenti')
        continue
      }
      if (!prova) {
        const { error: e } = await db.from('commission_payouts').insert({
          profile_id: setter.id,
          periodo: periodi[i],
          importo: p.importo,
          pagato_il: p.pagato_il,
          note: `${NOTA}: base ${p.base} € al ${Math.round(p.percentuale * 10000) / 100}%`,
        })
        if (e) esci(`Scrittura pagamento: ${e.message}`)
      }
      conta('Pagamenti provvigioni', prova ? 'da creare' : 'creati')
      console.log(`  pagamento del ${p.pagato_il} (${p.importo} €) → riferito a ${periodi[i].slice(0, 7)}`)
    }

    // the setter's rule, only if there is none: percent from the sheet, from the first month
    const { count } = await db
      .from('commission_rules')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', setter.id)
    const percentuale = pagamenti[0]?.percentuale
    if ((count ?? 0) > 0) conta('Regola provvigione', 'già presente')
    else if (percentuale) {
      if (!prova) {
        const { error: e } = await db.from('commission_rules').insert({
          profile_id: setter.id,
          percentuale,
          applica_a: ['nuovo'],
          valida_dal: primoMese,
        })
        if (e) esci(`Scrittura regola: ${e.message}`)
      }
      conta('Regola provvigione', prova ? 'da creare' : 'creata')
      console.log(`  regola: ${percentuale * 100}% sulle vendite nuove dal ${primoMese}`)
    }
  } else avvisi.push('Foglio "Setter Payments" non trovato: pagamenti non importati')

  // the CSV Dany completes: written once, never overwritten
  conta('Vendite da completare', 'giorni con chiusure', chiusure.length)
  if (existsSync(CSV)) {
    conta('Vendite da completare', 'CSV già presente, non toccato')
  } else if (!prova) {
    let segnaposto
    if (opzioni.segnaposto) {
      const { data: prodotti } = await db.from('products').select('nome, prezzo_listino').eq('attivo', true).order('nome')
      if (!prodotti?.length) esci('Per i segnaposto serve almeno un prodotto attivo: crealo da Impostazioni > Prodotti')
      segnaposto = {
        prodotto: (revenue: number) =>
          (prodotti.find((p) => Number(p.prezzo_listino) === revenue) ?? prodotti[0]).nome,
      }
    }
    writeFileSync(CSV, csvDaCompletare(chiusure, segnaposto))
    conta('Vendite da completare', 'CSV scritto')
  }
}

// ---------------------------------------------------------------------------
// Passaggio 2
// ---------------------------------------------------------------------------
async function passaggio2() {
  const setter = await profilo(opzioni.setter!, ['setter'])
  const closer = await profilo(opzioni.closer!, ['admin', 'closer'])
  if (!existsSync(CSV)) esci(`Manca ${CSV}: lancia prima il passaggio 1`)

  const { mesi } = await leggiExcel()
  const { vendite, errori } = leggiCsvVendite(readFileSync(CSV, 'utf8'))
  errori.push(...confrontaConExcel(vendite, mesi.flatMap((m) => m.chiusure)))

  const { data: prodotti } = await db.from('products').select('id, nome')
  const prodotto = new Map((prodotti ?? []).map((p) => [p.nome.trim().toLowerCase(), p.id]))

  // everything is checked before the first write: a half import is worse than none
  const piani = new Map<number, number>()
  for (const v of vendite) {
    if (!prodotto.has(v.prodotto.trim().toLowerCase())) {
      errori.push(`Riga ${v.riga}: prodotto "${v.prodotto}" non esiste (Impostazioni > Prodotti)`)
      continue
    }
    const { data: piano, error } = await db.rpc('piano_rate', {
      p_valore: v.revenue,
      p_numero_rate: v.numero_rate,
      p_data_vendita: v.data,
    })
    if (error) esci(`Piano rate: ${error.message}`)
    const coperte = rateCoperte(v.cash, (piano ?? []).map((r) => Number(r.importo)))
    if (coperte === null) {
      errori.push(`Riga ${v.riga}: ${v.cash} € di cash non coincide con le prime rate di ${v.numero_rate} da ${Number(piano?.[0]?.importo)} €: cambia numero_rate`)
    } else piani.set(v.riga, coperte)
  }

  if (errori.length > 0) {
    console.error('\nIl CSV va corretto prima di importare:')
    for (const e of errori) console.error(`  - ${e}`)
    esci(`${errori.length} problemi, nessun dato scritto`)
  }

  // oldest first: a renewal needs the client's earlier sale
  for (const v of [...vendite].sort((a, b) => a.data.localeCompare(b.data))) {
    conta('Vendite', 'righe lette')
    if (prova) {
      conta('Vendite', 'da creare')
      continue
    }
    const clienteId = await cliente(v, v.da_setter ? setter.id : null, closer.id)
    const venditaId = await vendita(v, clienteId, prodotto.get(v.prodotto.trim().toLowerCase())!, v.da_setter ? setter.id : null, closer.id)
    await incassi(v, venditaId, piani.get(v.riga)!)
  }
}

async function cliente(v: RigaVendita, setterId: string | null, closerId: string) {
  let query = db.from('clients').select('id').ilike('nome', v.cliente_nome)
  query = v.cliente_cognome ? query.ilike('cognome', v.cliente_cognome) : query.is('cognome', null)
  const { data: gia } = await query.limit(1).maybeSingle()
  if (gia) {
    conta('Clienti', 'già presenti')
    return gia.id
  }
  const { data, error } = await db
    .from('clients')
    .insert({ nome: v.cliente_nome, cognome: v.cliente_cognome, setter_id: setterId, closer_id: closerId, note: NOTA })
    .select('id')
    .single()
  if (error) esci(`Riga ${v.riga}, cliente: ${error.message}`)
  conta('Clienti', 'creati')
  return data.id
}

async function vendita(v: RigaVendita, clienteId: string, prodottoId: string, setterId: string | null, closerId: string) {
  const { data: gia } = await db
    .from('sales')
    .select('id')
    .eq('client_id', clienteId)
    .eq('data_vendita', v.data)
    .eq('valore_contratto', v.revenue)
    .limit(1)
    .maybeSingle()
  if (gia) {
    conta('Vendite', 'già presenti')
    return gia.id
  }
  // the database generates the instalment plan (sales_genera_piano_rate) and the end date
  const { data, error } = await db
    .from('sales')
    .insert({
      client_id: clienteId,
      product_id: prodottoId,
      tipo: v.tipo,
      setter_id: setterId,
      closer_id: closerId,
      data_vendita: v.data,
      data_inizio: v.data,
      valore_contratto: v.revenue,
      numero_rate: v.numero_rate,
      note: NOTA,
    } as Database['public']['Tables']['sales']['Insert'])
    .select('id')
    .single()
  if (error) esci(`Riga ${v.riga}, vendita: ${error.message}`)
  conta('Vendite', 'create')
  return data.id
}

/** The cash of the signing day covers the first instalments; repairs a half-imported sale too. */
async function incassi(v: RigaVendita, venditaId: string, coperte: number) {
  if (coperte === 0) return
  const { data: rate } = await db
    .from('payments')
    .select('id, numero_rata, stato, importo_previsto')
    .eq('sale_id', venditaId)
    .order('numero_rata')
    .limit(coperte)
  for (const r of rate ?? []) {
    if (r.stato !== 'prevista') {
      conta('Rate incassate', 'già registrate')
      continue
    }
    const { error } = await db
      .from('payments')
      .update({
        stato: 'incassata',
        incassato_il: v.data,
        importo_incassato: r.importo_previsto,
        metodo: v.metodo as Database['public']['Enums']['payment_method'] | null,
      })
      .eq('id', r.id)
    if (error) esci(`Riga ${v.riga}, incasso: ${error.message}`)
    conta('Rate incassate', 'registrate')
  }
}

// ---------------------------------------------------------------------------
async function principale() {
  console.log(`\nImport Excel · passaggio ${opzioni.passaggio}${prova ? ' · PROVA, nessuna scrittura' : ''}`)
  console.log(`Database: ${locale ? 'locale' : new URL(url!).hostname}\n`)

  if (opzioni.passaggio === '1') await passaggio1()
  else await passaggio2()

  console.log('\nRiepilogo')
  for (const [sezione, voci] of Object.entries(riepilogo)) {
    console.log(`  ${sezione}: ${Object.entries(voci).map(([k, n]) => `${n} ${k}`).join(', ')}`)
  }
  if (avvisi.length > 0) {
    console.log('\nAvvisi')
    for (const a of avvisi) console.log(`  - ${a}`)
  }
  if (opzioni.passaggio === '1' && !prova) {
    console.log(`\nProssimo passo: completa ${CSV} (cliente, prodotto, numero_rate, da_setter) e lancia --passaggio 2.`)
  }
  console.log('')
}

principale().catch((e) => esci(e instanceof Error ? e.message : String(e)))
