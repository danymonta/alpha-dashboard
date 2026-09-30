import 'server-only'

import { createInflateRaw, inflateRawSync } from 'node:zlib'

import { APICallError, RetryError } from 'ai'
import { zipSync } from 'fflate'
import mammoth from 'mammoth'
import readXlsxFile from 'read-excel-file/node'
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf'

import {
  DIMENSIONE_MAX,
  ERRORI_ALLEGATO,
  TESTO_FILE_MAX,
  nomePulito,
  type Allegato,
  type TipoAllegato,
} from '@/lib/alfire/allegati'
import { TIPO_PIXEL, inGrigi, inGrigiRidotta, pngGrigi, tipoDaCanali, type Grigi, type Pixel } from '@/lib/alfire/pixel'
import type { Immagine, LetturaVisione } from '@/lib/alfire/visione'

/**
 * A file becomes text for the chat model (attachments, 30/09/2026). Nothing
 * is written anywhere: the bytes live in memory for the length of the
 * request. The type is told by the bytes, never by the name; a zip (Word,
 * Excel) is measured and rebuilt before a library opens it, a PDF measured.
 */

export class ErroreAllegato extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
    /** For the log: what went wrong, never whose file or what it said. */
    readonly codice: string,
  ) {
    super(messaggio)
    this.name = 'ErroreAllegato'
  }
}

// ---------------------------------------------------------------------------
// What the bytes say

export type Riconosciuto =
  | { tipo: Exclude<TipoAllegato, 'immagine'> }
  | { tipo: 'immagine'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { errore: 'heic' | 'vecchio' | 'illeggibile' | 'sconosciuto' }

function uguali(dati: Uint8Array, firma: readonly number[], da = 0): boolean {
  return dati.length >= da + firma.length && firma.every((b, i) => dati[da + i] === b)
}

function ascii(dati: Uint8Array, da: number, n: number): string {
  return String.fromCharCode(...dati.subarray(da, da + n))
}

const MARCHI_HEIF = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']

/** A CSV the way computers name it: Windows says "application/vnd.ms-excel" for a .csv. */
function sembraCsv(nome: string, mime: string): boolean {
  return /\.csv$/i.test(nome) || mime === 'text/csv' || mime === 'application/csv'
}

/** A text file has no NUL bytes; UTF-16 has them, but starts with its mark. */
function sembraTesto(dati: Uint8Array): boolean {
  if (uguali(dati, [0xff, 0xfe]) || uguali(dati, [0xfe, 0xff])) return true
  return !dati.subarray(0, 8192).includes(0)
}

export function riconosciFile(dati: Uint8Array, nome: string, mime = ''): Riconosciuto {
  if (ascii(dati, 0, 1024).includes('%PDF-')) return { tipo: 'pdf' }
  if (uguali(dati, [0xff, 0xd8, 0xff])) return { tipo: 'immagine', mediaType: 'image/jpeg' }
  if (uguali(dati, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { tipo: 'immagine', mediaType: 'image/png' }
  if (ascii(dati, 0, 4) === 'RIFF' && ascii(dati, 8, 4) === 'WEBP') return { tipo: 'immagine', mediaType: 'image/webp' }
  if (ascii(dati, 4, 4) === 'ftyp' && MARCHI_HEIF.includes(ascii(dati, 8, 4))) return { errore: 'heic' }
  // Office 97-2003, or a Word or Excel with a password (an encrypted package)
  if (uguali(dati, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { errore: 'vecchio' }
  if (uguali(dati, [0x50, 0x4b, 0x03, 0x04])) {
    let nomi: Set<string>
    try {
      nomi = new Set(vociZip(dati).map((v) => v.nome))
    } catch {
      return { errore: 'illeggibile' }
    }
    // Word for the web names the document word/document2.xml: mammoth finds it
    // through the relationships. read-excel-file reads only xl/workbook.xml.
    if ([...nomi].some((n) => /^word\/[^/]+\.xml$/i.test(n))) return { tipo: 'docx' }
    if (nomi.has('xl/workbook.xml')) return { tipo: 'xlsx' }
    return { errore: 'sconosciuto' }
  }
  if (sembraCsv(nome, mime) && sembraTesto(dati)) return { tipo: 'csv' }
  return { errore: 'sconosciuto' }
}

// ---------------------------------------------------------------------------
// Zip: every text part measured by really inflating it, with a ceiling

/** What a Word or Excel may become once opened: more is a bomb, or a file too big to be useful. */
export const ZIP_APERTO_MAX = 50 * 1024 * 1024
const ZIP_VOCI_MAX = 2000

type VoceZip = { nome: string; flag: number; metodo: number; compressa: number; offsetLocale: number }

class ZipIlleggibile extends Error {}

/** The central directory, read without trusting it: every offset is checked. */
export function vociZip(dati: Uint8Array): VoceZip[] {
  const v = new DataView(dati.buffer, dati.byteOffset, dati.byteLength)
  let fine = -1
  for (let i = dati.length - 22; i >= Math.max(0, dati.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fine = i
      break
    }
  }
  if (fine < 0) throw new ZipIlleggibile()
  const numero = v.getUint16(fine + 10, true)
  const lunghezzaDir = v.getUint32(fine + 12, true)
  const inizioDir = v.getUint32(fine + 16, true)
  // Zip64 has no business in a 4 MB document
  if (numero === 0xffff || inizioDir === 0xffffffff || lunghezzaDir === 0xffffffff) throw new ZipIlleggibile()
  if (numero > ZIP_VOCI_MAX || inizioDir + lunghezzaDir > fine) throw new ZipIlleggibile()

  const decodifica = new TextDecoder()
  const voci: VoceZip[] = []
  let p = inizioDir
  for (let k = 0; k < numero; k++) {
    if (p + 46 > fine || v.getUint32(p, true) !== 0x02014b50) throw new ZipIlleggibile()
    const lunghezzaNome = v.getUint16(p + 28, true)
    voci.push({
      flag: v.getUint16(p + 8, true),
      metodo: v.getUint16(p + 10, true),
      compressa: v.getUint32(p + 20, true),
      nome: decodifica.decode(dati.subarray(p + 46, p + 46 + lunghezzaNome)),
      offsetLocale: v.getUint32(p + 42, true),
    })
    p += 46 + lunghezzaNome + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
  }
  return voci
}

/** The parts a library reads to get the text: XML and relationships. Pictures never leave the zip. */
function parteDiTesto(nome: string): boolean {
  return /\.(xml|rels)$/i.test(nome)
}

/**
 * The zip a library opens, rebuilt from what is measured here. Every text part
 * is inflated with a ceiling on the total (zlib stops at maxOutputLength: a
 * bomb is never allocated), then written again, uncompressed. Whatever else
 * the file holds (an entry left out of the directory, a second directory,
 * pictures) never reaches mammoth or read-excel-file: they read exactly the
 * bytes that were counted, whichever way they walk a zip.
 */
export function zipMisurato(dati: Uint8Array, nome: string, limite = ZIP_APERTO_MAX): Uint8Array {
  const illeggibile = new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'zip_illeggibile')
  const troppoGrande = () => new ErroreAllegato(413, ERRORI_ALLEGATO.troppoGrandeAperto(nome), 'zip_troppo_grande')
  let voci: VoceZip[]
  try {
    voci = vociZip(dati)
  } catch {
    throw illeggibile
  }
  const v = new DataView(dati.buffer, dati.byteOffset, dati.byteLength)
  const parti = new Map<string, Uint8Array>()
  let totale = 0
  for (const voce of voci) {
    if (!parteDiTesto(voce.nome)) continue
    // two parts with one name: which one a library takes is anybody's guess
    if (parti.has(voce.nome)) throw illeggibile
    if (voce.flag & 1) throw new ErroreAllegato(415, ERRORI_ALLEGATO.vecchio(nome), 'zip_cifrato')
    const locale = voce.offsetLocale
    if (locale + 30 > dati.length || v.getUint32(locale, true) !== 0x04034b50) throw illeggibile
    const inizio = locale + 30 + v.getUint16(locale + 26, true) + v.getUint16(locale + 28, true)
    const fine = inizio + voce.compressa
    if (fine > dati.length) throw illeggibile
    const resto = limite - totale
    let aperta: Uint8Array
    if (voce.metodo === 0) aperta = dati.subarray(inizio, fine)
    else if (voce.metodo === 8) {
      try {
        aperta = inflateRawSync(dati.subarray(inizio, fine), { maxOutputLength: Math.max(1, resto) })
      } catch (e) {
        if (e instanceof RangeError || (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw troppoGrande()
        throw illeggibile
      }
    } else throw illeggibile
    totale += aperta.length
    if (totale > limite) throw troppoGrande()
    parti.set(voce.nome, aperta)
  }
  return zipSync(Object.fromEntries(parti), { level: 0 })
}

// ---------------------------------------------------------------------------
// Text helpers

const numero = new Intl.NumberFormat('it-IT', { useGrouping: 'always' })

/** Lines trimmed, runs of blank lines shortened, no stray control characters. */
export function pulisciTesto(testo: string): string {
  return (
    testo
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((r) => r.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** At most `max` characters, cut at a line or a word, with a note that says so. */
export function tagliaTesto(testo: string, max = TESTO_FILE_MAX): string {
  if (testo.length <= max) return testo
  let fine = testo.lastIndexOf('\n', max)
  if (fine < max * 0.8) fine = testo.lastIndexOf(' ', max)
  if (fine < max * 0.8) fine = max
  return `${testo.slice(0, fine).trimEnd()}\n(testo tagliato: qui ${numero.format(fine)} caratteri su ${numero.format(testo.length)})`
}

// ---------------------------------------------------------------------------
// Tables (Excel, CSV): compact, one row per line

export const RIGHE_MAX = 200
export const COLONNE_MAX = 30
const CELLA_MAX = 200

const due = (n: number) => String(n).padStart(2, '0')

function cellaInTesto(valore: unknown): string {
  if (valore === null || valore === undefined) return ''
  if (valore instanceof Date) {
    if (Number.isNaN(valore.getTime())) return ''
    // Excel dates carry no time zone: read as written
    const giorno = `${due(valore.getUTCDate())}/${due(valore.getUTCMonth() + 1)}/${valore.getUTCFullYear()}`
    const ora = valore.getUTCHours() || valore.getUTCMinutes() ? ` ${due(valore.getUTCHours())}:${due(valore.getUTCMinutes())}` : ''
    return giorno + ora
  }
  if (typeof valore === 'number') return Number.isInteger(valore) ? String(valore) : String(Number(valore.toPrecision(12)))
  if (typeof valore === 'boolean') return valore ? 'sì' : 'no'
  const testo = String(valore).replace(/\s+/g, ' ').replace(/\|/g, '¦').trim()
  return testo.length > CELLA_MAX ? `${testo.slice(0, CELLA_MAX - 1)}…` : testo
}

/**
 * Rows as "a | b | c", empty rows left out, at most RIGHE_MAX rows and
 * COLONNE_MAX columns, with a first line that says what was kept.
 */
export function tabellaInTesto(righe: readonly (readonly unknown[])[], titolo: string): string {
  let colonne = 0
  const piene: string[][] = []
  for (const riga of righe) {
    const celle = riga.map(cellaInTesto)
    while (celle.length && celle.at(-1) === '') celle.pop()
    if (celle.length === 0) continue
    colonne = Math.max(colonne, celle.length)
    piene.push(celle.slice(0, COLONNE_MAX))
  }
  const note: string[] = []
  if (piene.length > RIGHE_MAX) note.push(`righe tagliate: qui le prime ${RIGHE_MAX} su ${numero.format(piene.length)}`)
  if (colonne > COLONNE_MAX) note.push(`colonne tagliate: qui le prime ${COLONNE_MAX} su ${colonne}`)
  const testa =
    `${titolo}: ${numero.format(piene.length)} ${piene.length === 1 ? 'riga' : 'righe'}, ${colonne} ${colonne === 1 ? 'colonna' : 'colonne'}` +
    (note.length ? ` (${note.join('; ')})` : '')
  return [testa, ...piene.slice(0, RIGHE_MAX).map((c) => c.join(' | '))].join('\n')
}

/** UTF-8 (with or without BOM), UTF-16 with its mark, otherwise Windows-1252 (Excel's CSV on Windows). */
export function decodificaTesto(dati: Uint8Array): string {
  if (uguali(dati, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(dati.subarray(2))
  if (uguali(dati, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(dati.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(dati).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(dati)
  }
}

/** The separator the first line uses most, outside quotes: ";" (Italian Excel), ",", or tab. */
function separatore(testo: string): string {
  const conta: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  let virgolette = false
  for (const c of testo.slice(0, 10_000)) {
    if (c === '"') virgolette = !virgolette
    else if (!virgolette && c === '\n') break
    else if (!virgolette && c in conta) conta[c]++
  }
  const [migliore, volte] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]
  return volte > 0 ? migliore : ','
}

/** RFC 4180: quoted fields may hold separators, doubled quotes and line breaks. */
export function leggiCsv(testo: string): string[][] {
  const sep = separatore(testo)
  const righe: string[][] = []
  let riga: string[] = []
  let campo = ''
  let virgolette = false
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') virgolette = false
      else campo += c
    } else if (c === '"' && campo === '') virgolette = true
    else if (c === sep) {
      riga.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++
      riga.push(campo)
      righe.push(riga)
      riga = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || riga.length) {
    riga.push(campo)
    righe.push(riga)
  }
  return righe
}

// ---------------------------------------------------------------------------
// Word: mammoth's HTML keeps paragraphs, lists and tables; then plain text

function senzaTag(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function entita(testo: string): string {
  return testo
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function htmlInTesto(html: string): string {
  const testo = html
    // a table row on one line: "a | b | c"
    .replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g, (_, cella: string) => `${senzaTag(cella.replace(/<\/p>/g, ' ')).replace(/\s+/g, ' ').trim()} | `)
    .replace(/\s*\|\s*<\/tr>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<li\b[^>]*>/g, '- ')
    .replace(/<\/(p|h[1-6]|li|tr|table|ul|ol)>/g, '\n')
  return pulisciTesto(entita(senzaTag(testo)))
}

// ---------------------------------------------------------------------------
// PDF

/** Below this many letters a page, on average, the PDF is a scan (or a photo of a page). */
const LETTERE_PER_PAGINA_MIN = 20
/** The longest side of a scanned page for the vision model: a page of text stays readable. */
const LATO_SCANSIONE = 1600
/** Groq's documented ceiling for images sent inline was 4 MB for the request: stay well under. */
const IMMAGINI_BYTE_MAX = 3 * 1024 * 1024
/**
 * The biggest picture pdf.js decodes, in pixels: an A4 page scanned at 600 dpi
 * is about 35 million. A bigger one is left out before it is decoded.
 */
export const PIXEL_IMMAGINE_MAX = 40_000_000

/** What the compressed streams of a PDF may become once inflated: more is a bomb. */
export const PDF_APERTO_MAX = 150 * 1024 * 1024
/** Filters chained deeper than this (a stream inside a stream…) are only a bomb. */
const PDF_ANNIDAMENTO_MAX = 6
/** Compressed streams counted in one PDF: a real one of 4 MB has a few thousand at most. */
const PDF_FLUSSI_MAX = 20_000

class TroppoAperto extends Error {}

/** A zlib header as pdf.js accepts it: deflate, a valid check, no preset dictionary. */
function testaZlib(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && (a & 0x0f) === 8 && ((a << 8) | b) % 31 === 0 && !(b & 0x20)
}

type Misura = { aperti: number; letti: number; limiteAperti: number; limiteLetti: number }

/**
 * Inflates one zlib stream (header already skipped), counting what comes out
 * and never keeping it; when what comes out is itself a zlib stream (a chain
 * of filters), that is counted too. A broken stream stops where pdf.js stops,
 * and what came out before is counted. Resolves once every level is done.
 */
function contaFlusso(dati: Uint8Array, misura: Misura, livello: number): { z: ReturnType<typeof createInflateRaw>; fatto: Promise<void> } {
  const z = createInflateRaw({ chunkSize: 64 * 1024 })
  const fatto = new Promise<void>((ok, ko) => {
    let chiuso = false
    let testa = Buffer.alloc(0)
    // undefined: not known yet; null: the output is not a zlib stream
    let dentro: ReturnType<typeof contaFlusso> | null | undefined
    let dentroFinito = false
    const fine = (errore?: unknown) => {
      if (chiuso) return
      chiuso = true
      if (errore) {
        z.destroy()
        dentro?.z.destroy()
        ko(errore)
      } else if (dentro) {
        if (!dentroFinito) dentro.z.end()
        dentro.fatto.then(ok, ko)
      } else ok()
    }
    z.on('data', (pezzo: Buffer) => {
      misura.aperti += pezzo.length
      if (misura.aperti > misura.limiteAperti) return fine(new TroppoAperto())
      if (dentro === null || dentroFinito) return
      if (dentro === undefined) {
        testa = Buffer.concat([testa, pezzo])
        if (testa.length < 2) return
        if (!testaZlib(testa[0], testa[1])) {
          dentro = null
          return
        }
        if (livello >= PDF_ANNIDAMENTO_MAX) return fine(new TroppoAperto())
        dentro = contaFlusso(new Uint8Array(0), misura, livello + 1)
        // a nested stream that ends early takes no more input: the outer one goes on alone
        const finito = () => {
          dentroFinito = true
          z.resume()
        }
        dentro.z.once('end', finito)
        dentro.z.once('close', finito)
        dentro.fatto.catch((e) => fine(e))
        pezzo = testa.subarray(2)
      }
      // the nested stream sets the pace: no output piles up in memory
      if (!dentro.z.write(pezzo)) {
        z.pause()
        dentro.z.once('drain', () => z.resume())
      }
    })
    z.on('end', () => fine())
    // a broken stream: pdf.js stops there too
    z.on('error', () => fine())
  })
  if (dati.length > 0) {
    misura.letti += dati.length
    z.end(dati)
  }
  return { z, fatto }
}

/**
 * Every compressed stream of the PDF, inflated and counted before pdf.js
 * opens it (pdf.js has no ceiling of its own): the streams are found the way
 * pdf.js finds them, after the "stream" keyword, whatever their dictionary
 * says. The input each stream may read is limited too, so a file cannot make
 * the count itself slow. An encrypted PDF is not counted (its streams are
 * ciphered): pdf.js reads it with the ceiling on pictures only.
 */
export async function verificaPdf(dati: Uint8Array, nome: string, limite = PDF_APERTO_MAX): Promise<void> {
  const testo = Buffer.from(dati.buffer, dati.byteOffset, dati.byteLength).toString('latin1')
  const misura: Misura = { aperti: 0, letti: 0, limiteAperti: limite, limiteLetti: 4 * dati.length + 1024 * 1024 }
  // where the next line feed and carriage return are (-1: none left), kept
  // between keywords: a file of keywords without line ends stays a linear scan
  let lf = 0
  let cr = 0
  let flussi = 0
  const aCapo = (da: number): number => {
    if (lf !== -1 && lf < da) lf = testo.indexOf('\n', da)
    if (cr !== -1 && cr < da) cr = testo.indexOf('\r', da)
    if (lf === -1) return cr
    if (cr === -1) return lf
    return Math.min(lf, cr)
  }
  try {
    for (let k = testo.indexOf('stream'); k >= 0; k = testo.indexOf('stream', k + 6)) {
      // a keyword of its own ("endstream" is not one)
      if (k > 0 && /[A-Za-z0-9]/.test(testo[k - 1])) continue
      // pdf.js skips whatever follows the keyword up to the line end, then reads
      const eol = aCapo(k + 6)
      if (eol < 0) break
      const da = eol + (testo[eol] === '\r' && testo[eol + 1] === '\n' ? 2 : 1)
      if (!testaZlib(dati[da], dati[da + 1])) continue
      const resto = misura.limiteLetti - misura.letti
      if (resto <= 0 || ++flussi > PDF_FLUSSI_MAX) throw new TroppoAperto()
      const flusso = contaFlusso(dati.subarray(da + 2, da + 2 + resto), misura, 1)
      await flusso.fatto
      // what the stream really used, not what it was offered
      misura.letti -= Math.min(resto, dati.length - da - 2) - flusso.z.bytesWritten
    }
  } catch (e) {
    if (e instanceof TroppoAperto) throw new ErroreAllegato(413, ERRORI_ALLEGATO.troppoGrandeAperto(nome), 'pdf_troppo_grande')
    throw e
  }
}

type DocumentoPdf = Awaited<ReturnType<typeof getDocumentProxy>>
type PaginaPdf = Awaited<ReturnType<DocumentoPdf['getPage']>>

/** An image object of the page, or null when pdf.js never hands it over. */
function oggettoPagina(pagina: PaginaPdf, chiave: string): Promise<unknown> {
  const archivio = chiave.startsWith('g_') ? pagina.commonObjs : pagina.objs
  return new Promise((ok) => {
    const attesa = setTimeout(() => ok(null), 10_000)
    archivio.get(chiave, (oggetto: unknown) => {
      clearTimeout(attesa)
      ok(oggetto)
    })
  })
}

function comePixel(immagine: unknown): Pixel | null {
  const i = immagine as { width?: number; height?: number; kind?: number; data?: Uint8Array | Uint8ClampedArray } | null
  if (!i?.data || !i.width || !i.height) return null
  const tipo = tipoDaCanali({ larghezza: i.width, altezza: i.height, dati: i.data, tipo: i.kind })
  return tipo ? { larghezza: i.width, altezza: i.height, tipo, dati: i.data } : null
}

/**
 * A stencil mask (the text layer of a compressed office scan): one bit a
 * pixel, pdf.js has already turned it so that a 0 is ink. Read as black on white.
 */
function comeMaschera(maschera: unknown): Pixel | null {
  const m = maschera as { width?: number; height?: number; data?: Uint8Array | Uint8ClampedArray } | null
  if (!m?.data || !m.width || !m.height || m.data.length < ((m.width + 7) >> 3) * m.height) return null
  return { larghezza: m.width, altezza: m.height, tipo: TIPO_PIXEL.bianconero1bit, dati: m.data }
}

const area = (p: Pixel) => p.larghezza * p.altezza

/**
 * The page in grays, its longest side at most `lato`. An office scanner's
 * "compact PDF" (MRC) keeps a small picture of the page and the text as a big
 * one-bit mask on top: when the mask is the bigger one, the text wins, laid
 * over the picture when both cover the same page.
 */
function paginaInGrigi(immagine: Pixel | null, maschera: Pixel | null, lato: number): Grigi | null {
  if (!maschera || (immagine && area(immagine) >= area(maschera))) return immagine ? inGrigiRidotta(immagine, lato) : null
  const testo = inGrigiRidotta(maschera, lato)
  if (!testo || !immagine) return testo
  const proporzione = (p: Pixel) => p.larghezza / p.altezza
  if (Math.abs(proporzione(immagine) - proporzione(maschera)) > 0.03 * proporzione(maschera)) return testo
  const sfondo = inGrigi(immagine, testo.larghezza, testo.altezza)
  if (!sfondo) return testo
  for (let i = 0; i < testo.dati.length; i++) testo.dati[i] = Math.min(testo.dati[i], sfondo.dati[i])
  return testo
}

/** The biggest picture of each page: on a scan, the page itself. */
async function paginePerVisione(pdf: DocumentoPdf, quante: number, signal?: AbortSignal): Promise<Immagine[]> {
  const { OPS } = await getResolvedPDFJS()
  const immagini: Immagine[] = []
  let byte = 0
  for (let n = 1; n <= Math.min(quante, pdf.numPages); n++) {
    signal?.throwIfAborted()
    const pagina = await pdf.getPage(n)
    const operazioni = await pagina.getOperatorList()
    let migliore: Pixel | null = null
    let maschera: Pixel | null = null
    for (let k = 0; k < operazioni.fnArray.length; k++) {
      const op = operazioni.fnArray[k]
      const argomenti = operazioni.argsArray[k] as unknown[]
      if (op === OPS.paintImageXObject || op === OPS.paintImageXObjectRepeat || op === OPS.paintInlineImageXObject) {
        const pixel =
          op === OPS.paintInlineImageXObject ? comePixel(argomenti[0]) : comePixel(await oggettoPagina(pagina, String(argomenti[0])))
        if (pixel && (!migliore || area(pixel) > area(migliore))) migliore = pixel
      } else if (op === OPS.paintImageMaskXObject || op === OPS.paintImageMaskXObjectRepeat) {
        // the mask travels by name, or inline (a Type 3 glyph)
        const dati = (argomenti[0] as { data?: unknown } | undefined)?.data
        const pixel = comeMaschera(typeof dati === 'string' ? await oggettoPagina(pagina, dati) : argomenti[0])
        if (pixel && (!maschera || area(pixel) > area(maschera))) maschera = pixel
      }
    }
    pagina.cleanup()
    if (!migliore && !maschera) continue
    let png: Buffer | null = null
    for (const lato of [LATO_SCANSIONE, 1200, 900]) {
      const grigi = paginaInGrigi(migliore, maschera, lato)
      png = grigi ? pngGrigi(grigi) : null
      if (!png || byte + png.length <= IMMAGINI_BYTE_MAX) break
    }
    if (!png || byte + png.length > IMMAGINI_BYTE_MAX) break
    byte += png.length
    immagini.push({ dati: new Uint8Array(png), mediaType: 'image/png' })
  }
  return immagini
}

function pagine(n: number): string {
  return `${numero.format(n)} ${n === 1 ? 'pagina' : 'pagine'}`
}

/** "qui la prima pagina su 4", "qui le prime 3 pagine su 12". */
function primePagine(lette: number, totale: number): string {
  return `${lette === 1 ? 'qui la prima pagina' : `qui le prime ${numero.format(lette)} pagine`} su ${numero.format(totale)}`
}

export type ContestoLettura = {
  /** Photos and scanned pages to text; null when the reading of images is off. */
  visione: ((immagini: Immagine[], opzioni: { pagine: boolean }) => Promise<LetturaVisione>) | null
  /** How many pages of a scan are made into images for the vision model (budgetVisione). */
  pagineScansione: number
  signal?: AbortSignal
}

type Letto = { testo: string; descrizione: string; visione: boolean; pagine: number | null }

const lettere = (t: string) => t.replace(/\s/g, '').length

/** Under a page of a PDF with text that has (almost) none: a scanned signature, a picture. */
export const NOTA_PAGINA_SENZA_TESTO = '(pagina senza testo da leggere: forse scansionata o solo immagini, che qui non sono lette)'

async function leggiPdf(dati: Uint8Array, nome: string, ctx: ContestoLettura): Promise<Letto> {
  await verificaPdf(dati, nome)
  let pdf: DocumentoPdf
  try {
    // a copy: pdf.js may take the buffer over (this build never evaluates font programs)
    pdf = await getDocumentProxy(new Uint8Array(dati), { stopAtErrors: false, maxImageSize: PIXEL_IMMAGINE_MAX, verbosity: 0 })
  } catch {
    throw new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'pdf_illeggibile')
  }
  try {
    const totale = pdf.numPages
    const testi: string[] = []
    let caratteri = 0
    for (let n = 1; n <= totale && caratteri <= TESTO_FILE_MAX; n++) {
      ctx.signal?.throwIfAborted()
      const pagina = await pdf.getPage(n)
      const contenuto = await pagina.getTextContent()
      const testo = pulisciTesto(
        contenuto.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join(''),
      )
      pagina.cleanup()
      testi.push(testo)
      caratteri += testo.length
    }
    const tutte = lettere(testi.join(''))

    if (tutte < LETTERE_PER_PAGINA_MIN * testi.length) {
      // a scan: its pages go to the vision model
      const immagini = await paginePerVisione(pdf, ctx.pagineScansione, ctx.signal)
      if (immagini.length > 0) {
        if (!ctx.visione) throw new ErroreAllegato(422, ERRORI_ALLEGATO.scansioneSenzaVisione(nome), 'scansione_senza_visione')
        const { testo: trascritto, lette } = await ctx.visione(immagini, { pagine: true })
        const nota = totale > lette ? `\n(scansione: ${primePagine(lette, totale)})` : ''
        return {
          testo: trascritto + nota,
          descrizione: `PDF scansionato, ${pagine(totale)}, trascritto`,
          visione: true,
          pagine: totale,
        }
      }
      if (tutte === 0) throw new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'pdf_vuoto')
    }

    // a page with (almost) no text in a PDF with text: a scanned signature, a
    // picture. Said, so nobody takes the file for complete.
    const unito = testi
      .map((t) => (totale > 1 && lettere(t) < LETTERE_PER_PAGINA_MIN ? `${t}\n${NOTA_PAGINA_SENZA_TESTO}`.trim() : t))
      .map((t, i) => (totale > 1 ? `— pagina ${i + 1} di ${totale} —\n${t}` : t))
      .join('\n\n')
    const nota = testi.length < totale ? `\n(testo tagliato: ${primePagine(testi.length, totale)})` : ''
    return { testo: tagliaTesto(unito) + nota, descrizione: `PDF, ${pagine(totale)}`, visione: false, pagine: totale }
  } finally {
    await pdf.loadingTask.destroy()
  }
}

// ---------------------------------------------------------------------------
// The other types

function comeBuffer(dati: Uint8Array): Buffer {
  return Buffer.from(dati.buffer, dati.byteOffset, dati.byteLength)
}

async function leggiDocx(dati: Uint8Array, nome: string): Promise<Letto> {
  const misurato = zipMisurato(dati, nome)
  let html: string
  try {
    const risultato = await mammoth.convertToHtml(
      { buffer: comeBuffer(misurato) },
      {
        // pictures are never opened, and a document never reaches files outside itself
        convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
        externalFileAccess: false,
      },
    )
    html = risultato.value
  } catch {
    throw new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'docx_illeggibile')
  }
  const testo = htmlInTesto(html)
  if (!testo) throw new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'docx_vuoto')
  return { testo: tagliaTesto(testo), descrizione: 'Word', visione: false, pagine: null }
}

/** Sheets beyond these are named, not read. */
const FOGLI_MAX = 10

async function leggiXlsx(dati: Uint8Array, nome: string): Promise<Letto> {
  const misurato = zipMisurato(dati, nome)
  let fogli: { sheet: string; data: unknown[][] }[]
  try {
    fogli = (await readXlsxFile(comeBuffer(misurato))) as { sheet: string; data: unknown[][] }[]
  } catch {
    throw new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'xlsx_illeggibile')
  }
  const pieni = fogli.filter((f) => f.data.some((r) => r.some((c) => c !== null && c !== '')))
  if (pieni.length === 0) throw new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'xlsx_vuoto')
  const parti = pieni.slice(0, FOGLI_MAX).map((f) => tabellaInTesto(f.data, `Foglio «${cellaInTesto(f.sheet)}»`))
  if (pieni.length > FOGLI_MAX) {
    parti.push(`(altri ${pieni.length - FOGLI_MAX} fogli non letti: ${pieni.slice(FOGLI_MAX).map((f) => f.sheet).join(', ')})`)
  }
  const n = fogli.length
  return { testo: tagliaTesto(parti.join('\n\n')), descrizione: `Excel, ${n} ${n === 1 ? 'foglio' : 'fogli'}`, visione: false, pagine: null }
}

function leggiCsvFile(dati: Uint8Array, nome: string): Letto {
  const righe = leggiCsv(decodificaTesto(dati))
  const piene = righe.filter((r) => r.some((c) => c.trim() !== ''))
  if (piene.length === 0) throw new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'csv_vuoto')
  return {
    testo: tagliaTesto(tabellaInTesto(piene, 'Tabella')),
    descrizione: `CSV, ${numero.format(piene.length)} ${piene.length === 1 ? 'riga' : 'righe'}`,
    visione: false,
    pagine: null,
  }
}

/** A photo reaches the server already shrunk by the browser: more than this is not from our page. */
export const IMMAGINE_SERVER_MAX = 3 * 1024 * 1024

async function leggiImmagine(dati: Uint8Array, mediaType: string, nome: string, ctx: ContestoLettura): Promise<Letto> {
  if (dati.length > IMMAGINE_SERVER_MAX) throw new ErroreAllegato(413, ERRORI_ALLEGATO.troppoGrande(nome), 'immagine_grande')
  if (!ctx.visione) throw new ErroreAllegato(422, ERRORI_ALLEGATO.visioneSpenta(nome), 'visione_spenta')
  const { testo } = await ctx.visione([{ dati, mediaType }], { pagine: false })
  return { testo, descrizione: 'Immagine, trascritta', visione: true, pagine: null }
}

// ---------------------------------------------------------------------------

function interrotto(e: unknown, signal?: AbortSignal): boolean {
  const nome = (e as { name?: string } | null)?.name
  return Boolean(signal?.aborted) || nome === 'AbortError' || nome === 'TimeoutError'
}

/** The provider's error behind the SDK's retries. */
function stato(e: unknown): number | null {
  const causa = RetryError.isInstance(e) ? e.lastError : e
  return APICallError.isInstance(causa) ? (causa.statusCode ?? null) : null
}

/**
 * One file to text. Throws ErroreAllegato with the words for the chat; any
 * other failure is an unreadable file.
 */
export async function leggiAllegato(
  dati: Uint8Array,
  nomeOriginale: string,
  mime: string,
  ctx: ContestoLettura,
): Promise<{ allegato: Allegato; pagine: number | null }> {
  const nome = nomePulito(nomeOriginale)
  if (dati.length === 0) throw new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'vuoto')
  if (dati.length > DIMENSIONE_MAX) throw new ErroreAllegato(413, ERRORI_ALLEGATO.troppoGrande(nome), 'troppo_grande')

  const tipo = riconosciFile(dati, nome, mime)
  if ('errore' in tipo) {
    if (tipo.errore === 'heic') throw new ErroreAllegato(415, ERRORI_ALLEGATO.heic(nome), 'heic')
    if (tipo.errore === 'vecchio') throw new ErroreAllegato(415, ERRORI_ALLEGATO.vecchio(nome), 'office_vecchio')
    if (tipo.errore === 'illeggibile') throw new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'illeggibile')
    throw new ErroreAllegato(415, ERRORI_ALLEGATO.nonSupportato(nome), 'non_supportato')
  }

  let letto: Letto
  try {
    if (tipo.tipo === 'pdf') letto = await leggiPdf(dati, nome, ctx)
    else if (tipo.tipo === 'immagine') letto = await leggiImmagine(dati, tipo.mediaType, nome, ctx)
    else if (tipo.tipo === 'docx') letto = await leggiDocx(dati, nome)
    else if (tipo.tipo === 'xlsx') letto = await leggiXlsx(dati, nome)
    else letto = leggiCsvFile(dati, nome)
  } catch (e) {
    if (e instanceof ErroreAllegato) throw e
    if (interrotto(e, ctx.signal)) throw new ErroreAllegato(504, ERRORI_ALLEGATO.lento(nome), 'tempo_scaduto')
    const s = stato(e)
    if (s === 429) throw new ErroreAllegato(429, ERRORI_ALLEGATO.limite, 'visione_limite')
    if (s !== null) throw new ErroreAllegato(502, ERRORI_ALLEGATO.visioneFallita(nome), `visione_${s}`)
    throw new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'illeggibile')
  }

  const testo = letto.testo.trim()
  if (!testo) {
    throw letto.visione
      ? new ErroreAllegato(502, ERRORI_ALLEGATO.visioneFallita(nome), 'visione_vuota')
      : new ErroreAllegato(422, ERRORI_ALLEGATO.vuoto(nome), 'vuoto')
  }
  return {
    allegato: {
      nome,
      tipo: tipo.tipo,
      descrizione: letto.descrizione,
      dimensione: dati.length,
      // each reader already cut its text, notes included: only an overlong transcription is cut here
      testo: testo.length > TESTO_FILE_MAX + 400 ? tagliaTesto(testo) : testo,
      visione: letto.visione,
    },
    pagine: letto.pagine,
  }
}
