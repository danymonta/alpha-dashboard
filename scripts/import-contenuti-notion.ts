/**
 * One-time import of the content calendar from Notion (1.32.0, CLAUDE.md
 * section 26): the pages Claude fetched into a JSON file become an
 * idempotent SQL file Dany runs in the Supabase SQL Editor.
 *
 *   npm run import:contenuti -- import/notion-contenuti/notion-contenuti-2026-09-10.json \
 *     import/contenuti-notion-settembre-ottobre-2026.sql [--per-file 20] [--admin <email>]
 *
 * Never touches a database and needs no env file. Every page is validated
 * with the app's own schema (lib/validation/contenuto.ts) and converted by
 * lib/marketing/da-notion.ts; one page refused and nothing is written (exit 1).
 * The summary says counts, Notion ids and reasons, never the text of a page.
 * Both files hold real data: they live in import/, which never goes to GitHub.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import {
  dividiPerFile,
  nomiFile,
  paginaInRiga,
  problemiImport,
  sqlImportContenuti,
  type PaginaNotion,
  type RigaImport,
} from '../lib/marketing/da-notion'
import { ETICHETTA_STATUS, ORDINE_GRUPPI, GRUPPI_STATUS } from '../lib/marketing/etichette'
import { formatMese } from '../lib/format'

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'per-file': { type: 'string' },
    admin: { type: 'string' },
  },
})

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

const [fileJson, fileSql] = positionals
if (!fileJson || !fileSql) {
  esci('Uso: npm run import:contenuti -- <pagine.json> <import.sql> [--per-file 20] [--admin <email>]')
}
if (!existsSync(fileJson)) esci(`${fileJson}: il file non c’è`)
// the SQL holds the pages' text: only in import/, which .gitignore keeps off GitHub
const cartellaImport = resolve(process.cwd(), 'import')
const dentro = relative(cartellaImport, resolve(fileSql))
if (dentro === '' || dentro.startsWith('..') || isAbsolute(dentro)) {
  esci('Il file SQL va nella cartella import/ (dati veri: mai su GitHub)')
}
const perFile = o['per-file'] === undefined ? null : Number(o['per-file'])
if (perFile !== null && (!Number.isInteger(perFile) || perFile < 1)) esci('--per-file vuole un numero intero da 1 in su')

let pagine: PaginaNotion[]
try {
  const letto: unknown = JSON.parse(readFileSync(fileJson, 'utf8'))
  if (!Array.isArray(letto)) throw new Error('non è un elenco di pagine')
  pagine = letto as PaginaNotion[]
} catch (e) {
  esci(`${fileJson}: JSON non leggibile (${e instanceof Error ? e.message : 'errore'})`)
}

const righe: RigaImport[] = []
const rifiutate: { id: string; motivi: string[] }[] = []
const conta = { immagini: 0, allegati: 0, url: 0, viewCount: 0, inspiration: 0, inspirationCompletate: 0 }
const nomiDiModello: string[] = []

for (const [i, pagina] of pagine.entries()) {
  if (!pagina || typeof pagina !== 'object') {
    rifiutate.push({ id: `#${i + 1}`, motivi: ['non è una pagina'] })
    continue
  }
  const esito = paginaInRiga(pagina)
  if (!esito.ok) {
    rifiutate.push({ id: esito.id, motivi: esito.motivi })
    continue
  }
  righe.push(esito.riga)
  conta.immagini += esito.immagini
  conta.allegati += esito.allegati
  if (esito.riga.url) conta.url++
  if (esito.riga.view_count !== null) conta.viewCount++
  if (esito.riga.inspiration) conta.inspiration++
  if (esito.inspirationCompletata) conta.inspirationCompletate++
  if (esito.nomeDiModello) nomiDiModello.push(esito.riga.notion_page_id)
}

const problemi = problemiImport(righe)

// ---------------------------------------------------------------------------
// Summary: counts and ids, never the text of a page
// ---------------------------------------------------------------------------
console.log(`\nImport dei contenuti da Notion · ${fileJson}\n`)
console.log(`Pagine lette:        ${pagine.length}`)
console.log(`Valide:              ${righe.length}`)
console.log(`Rifiutate:           ${rifiutate.length}`)
console.log(`Immagini sostituite: ${conta.immagini}${conta.allegati ? ` (e ${conta.allegati} altri file)` : ''}`)
console.log(`URL presente:        ${conta.url} di ${righe.length}`)
console.log(`View Count presente: ${conta.viewCount} di ${righe.length}`)
console.log(`Inspiration:         ${conta.inspiration}, di cui ${conta.inspirationCompletate} completate con https://`)

console.log('\nPer Status:')
for (const gruppo of ORDINE_GRUPPI) {
  for (const stato of GRUPPI_STATUS[gruppo]) {
    const n = righe.filter((r) => r.stato === stato).length
    if (n > 0) console.log(`  ${ETICHETTA_STATUS[stato].padEnd(16)} ${n}`)
  }
}

console.log('\nPer mese (Post Date):')
const perMese = new Map<string, number>()
for (const r of righe) {
  const mese = r.post_date ? `${r.post_date.slice(0, 7)}-01` : ''
  perMese.set(mese, (perMese.get(mese) ?? 0) + 1)
}
for (const [mese, n] of [...perMese].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))) {
  console.log(`  ${(mese ? formatMese(mese) : 'senza data').padEnd(16)} ${n}`)
}

if (nomiDiModello.length > 0) {
  console.log(`\nCon il nome di un modello (Reel Topic, Carousel Topic): ${nomiDiModello.length}`)
  for (const id of nomiDiModello) console.log(`  ${id}`)
}

if (rifiutate.length > 0) {
  console.log('\nRifiutate:')
  for (const r of rifiutate) console.log(`  ${r.id}: ${r.motivi.join('; ')}`)
}
if (problemi.length > 0) {
  console.log('\nProblemi:')
  for (const p of problemi) console.log(`  ${p}`)
}

if (rifiutate.length > 0 || problemi.length > 0) esci('Nessun file scritto: correggi e rilancia.')
if (righe.length === 0) esci('Nessuna pagina da importare: nessun file scritto.')

// ---------------------------------------------------------------------------
// The SQL file(s)
// ---------------------------------------------------------------------------
const parti = dividiPerFile(righe, perFile)
const nomi = nomiFile(fileSql, parti.length)
let sql: string[]
try {
  sql = parti.map((parte, i) =>
    sqlImportContenuti(
      parte,
      `Contenuti da Notion: «📸 Instagram Posts DANYMONTA» (CLAUDE.md, sezione 26).${
        parti.length > 1 ? `\nParte ${i + 1} di ${parti.length}: eseguile in ordine, una alla volta.` : ''
      }`,
      { admin: o.admin ?? null },
    ),
  )
} catch (e) {
  esci(e instanceof Error ? e.message : 'File SQL non scritto')
}
parti.forEach((parte, i) => writeFileSync(nomi[i], sql[i]))

console.log('\nScritto:')
parti.forEach((parte, i) => console.log(`  ${nomi[i]} (${parte.length} ${parte.length === 1 ? 'pagina' : 'pagine'})`))
console.log(
  parti.length > 1
    ? '\nEseguili in ordine nel SQL Editor di Supabase, dopo le migration della 1.32.0: saltano le pagine già importate.\n'
    : '\nEseguilo nel SQL Editor di Supabase dopo le migration della 1.32.0: salta le pagine già importate.\n',
)
