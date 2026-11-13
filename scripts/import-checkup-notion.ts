/**
 * One-time import of the check-ups written in Notion (1.83.0, CLAUDE.md section 34): the pages
 * «Checkup mensile | Nome» that Claude fetched into import/checkup-notion/*.json become one
 * idempotent SQL file Dany runs in the Supabase SQL Editor.
 *
 *   npm run import:checkup -- import/checkup-notion import/checkup-notion.sql
 *
 * Never touches a database and needs no env file. The parsing is lib/percorso/da-notion-checkup.ts.
 * The summary says counts only, never a name or the text of a page; the names of the students the
 * SQL cannot match are said by the SQL itself, in the SQL Editor. Both the pages and the SQL hold
 * real data: they live in import/, which never goes to GitHub.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import {
  lineeRicorrenti,
  normalizzaNome,
  sqlImportCheckup,
  vociDaPagina,
  type GruppoAllievo,
  type MotivoScarto,
  type PaginaCheckup,
} from '../lib/percorso/da-notion-checkup'

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

const [cartella, fileSql] = process.argv.slice(2)
if (!cartella || !fileSql) esci('Uso: npm run import:checkup -- <cartella delle pagine> <import.sql>')
if (!existsSync(cartella)) esci(`${cartella}: la cartella non c’è`)
const cartellaImport = resolve(process.cwd(), 'import')
for (const percorso of [cartella, fileSql]) {
  const dentro = relative(cartellaImport, resolve(percorso))
  if (dentro === '' || dentro.startsWith('..') || isAbsolute(dentro)) {
    esci('Le pagine e il file SQL stanno nella cartella import/ (dati veri: mai su GitHub)')
  }
}

const pagine: PaginaCheckup[] = []
for (const nome of readdirSync(cartella).filter((f) => f.endsWith('.json')).sort()) {
  try {
    const p = JSON.parse(readFileSync(join(cartella, nome), 'utf8')) as PaginaCheckup
    if (typeof p.notion_id !== 'string' || typeof p.contenuto !== 'string') throw new Error('forma')
    pagine.push(p)
  } catch {
    esci(`${nome}: non è una pagina salvata da Notion`)
  }
}
if (pagine.length === 0) esci('Nessuna pagina nella cartella')

const ricorrenti = lineeRicorrenti(pagine)
const gruppi = new Map<string, GruppoAllievo>()
const scarti: Record<MotivoScarto, number> = { senza_data: 0, data_segnaposto: 0, vuota: 0, guida: 0 }
let senzaAllievo = 0
let conFathom = 0
let conResoconto = 0
let conCompiti = 0
let conAppunti = 0

for (const p of pagine) {
  if (!p.allievo) {
    senzaAllievo++
    continue
  }
  const { voci, scartate } = vociDaPagina(p, { ricorrenti })
  for (const s of scartate) scarti[s.motivo]++
  const chiave = normalizzaNome(p.allievo)
  const gruppo = gruppi.get(chiave) ?? { allievo: p.allievo.trim(), voci: [] }
  gruppo.voci.push(...voci)
  gruppi.set(chiave, gruppo)
  for (const v of voci) {
    if (v.fathomUrl) conFathom++
    if (v.resoconto) conResoconto++
    if (v.compiti.length > 0) conCompiti++
    if (v.appunti) conAppunti++
  }
}

const daScrivere = [...gruppi.values()].filter((g) => g.voci.length > 0)
writeFileSync(fileSql, sqlImportCheckup(daScrivere))

const totale = daScrivere.reduce((n, g) => n + g.voci.length, 0)
console.log(`
Pagine lette: ${pagine.length}${senzaAllievo ? ` (${senzaAllievo} senza allievo, saltate)` : ''}
Allievi con almeno un check-up: ${daScrivere.length} su ${gruppi.size}
Check-up da importare: ${totale}
  con il link di Fathom: ${conFathom}
  con il resoconto: ${conResoconto}
  con i compiti: ${conCompiti}
  con gli appunti: ${conAppunti}
Blocchi saltati:
  guide del coach (NEPQ, sales call, template): ${scarti.guida}
  senza una data: ${scarti.senza_data}
  con la data dei template (01/01/2025): ${scarti.data_segnaposto}
  template vuoti: ${scarti.vuota}

File SQL: ${fileSql}
Incollalo nel SQL Editor di Supabase: alla fine dice quanti check-up ha creato e quali allievi non ha
trovato tra i clienti (nessuno o più di uno con quel nome).
`)
