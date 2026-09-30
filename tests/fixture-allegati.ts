/**
 * Small files built in memory for the attachment tests (tests/alfire-allegati.test.ts
 * and e2e/alfire-allegati.spec.ts): a PDF with text, a scanned PDF (only an
 * image), an office scanner's compact PDF, a .docx, a .xlsx, a zip bomb, a PNG.
 * Nothing is read from disk.
 */
import { crc32, deflateRawSync, deflateSync } from 'node:zlib'

/** A zip archive, every entry deflated. `dichiara` lies about an entry's uncompressed size. */
export function zip(voci: Record<string, string | Buffer>, dichiara: Record<string, number> = {}): Buffer {
  const locali: Buffer[] = []
  const centrali: Buffer[] = []
  let offset = 0
  for (const [nome, contenuto] of Object.entries(voci)) {
    const dati = Buffer.isBuffer(contenuto) ? contenuto : Buffer.from(contenuto, 'utf8')
    const compressi = deflateRawSync(dati)
    const nomeB = Buffer.from(nome, 'utf8')
    const crc = crc32(dati)
    const dimensione = dichiara[nome] ?? dati.length

    const locale = Buffer.alloc(30)
    locale.writeUInt32LE(0x04034b50, 0)
    locale.writeUInt16LE(20, 4)
    locale.writeUInt16LE(0x0800, 6)
    locale.writeUInt16LE(8, 8)
    locale.writeUInt32LE(crc, 14)
    locale.writeUInt32LE(compressi.length, 18)
    locale.writeUInt32LE(dimensione, 22)
    locale.writeUInt16LE(nomeB.length, 26)
    locali.push(locale, nomeB, compressi)

    const centrale = Buffer.alloc(46)
    centrale.writeUInt32LE(0x02014b50, 0)
    centrale.writeUInt16LE(20, 4)
    centrale.writeUInt16LE(20, 6)
    centrale.writeUInt16LE(0x0800, 8)
    centrale.writeUInt16LE(8, 10)
    centrale.writeUInt32LE(crc, 16)
    centrale.writeUInt32LE(compressi.length, 20)
    centrale.writeUInt32LE(dimensione, 24)
    centrale.writeUInt16LE(nomeB.length, 28)
    centrale.writeUInt32LE(offset, 42)
    centrali.push(centrale, nomeB)
    offset += 30 + nomeB.length + compressi.length
  }
  const directory = Buffer.concat(centrali)
  const fine = Buffer.alloc(22)
  fine.writeUInt32LE(0x06054b50, 0)
  fine.writeUInt16LE(Object.keys(voci).length, 8)
  fine.writeUInt16LE(Object.keys(voci).length, 10)
  fine.writeUInt32LE(directory.length, 12)
  fine.writeUInt32LE(offset, 16)
  return Buffer.concat([...locali, directory, fine])
}

/** A PDF made of objects, with a correct cross-reference table. */
function pdf(oggetti: Buffer[]): Buffer {
  const parti: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]
  let lunghezza = parti[0].length
  const offset: number[] = []
  oggetti.forEach((o, i) => {
    offset.push(lunghezza)
    const intero = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')])
    parti.push(intero)
    lunghezza += intero.length
  })
  const xref =
    `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n` +
    offset.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${lunghezza}\n%%EOF\n`
  return Buffer.concat([...parti, Buffer.from(xref)])
}

function flusso(dizionario: string, dati: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`<< ${dizionario} /Length ${dati.length} >>\nstream\n`), dati, Buffer.from('\nendstream')])
}

function testoPdf(riga: string): string {
  return riga.replace(/[\\()]/g, (c) => `\\${c}`)
}

/** A PDF with a text layer: one array of lines per page (an empty array: a page with no text). */
export function pdfConTesto(pagine: string[][], filtri = ''): Buffer {
  const n = pagine.length
  // 1 catalog, 2 pages, 3 font, then page and content for each page
  const kids = pagine.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  const oggetti: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
  ]
  pagine.forEach((righe, i) => {
    const contenuto = `BT /F1 12 Tf 72 770 Td ${righe.map((r, j) => `${j ? '0 -18 Td ' : ''}(${testoPdf(r)}) Tj`).join(' ')} ET`
    oggetti.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      ),
      filtri === '/FlateDecode'
        ? flusso('/Filter /FlateDecode', deflateSync(Buffer.from(contenuto, 'latin1')))
        : filtri === '[/FlateDecode /FlateDecode]'
          ? flusso(`/Filter ${filtri}`, deflateSync(deflateSync(Buffer.from(contenuto, 'latin1'))))
          : flusso('', Buffer.from(contenuto, 'latin1')),
    )
  })
  return pdf(oggetti)
}

/** A scanned page: only an image (RGB, deflated), no text layer. */
export function pdfScansione(larghezza = 60, altezza = 80, pagine = 1): Buffer {
  const pixel = Buffer.alloc(larghezza * altezza * 3)
  for (let i = 0; i < pixel.length; i += 3) {
    const riga = Math.floor(i / 3 / larghezza)
    const v = riga % 10 < 2 ? 20 : 235
    pixel[i] = v
    pixel[i + 1] = v
    pixel[i + 2] = v
  }
  const kids = Array.from({ length: pagine }, (_, i) => `${4 + i * 2} 0 R`).join(' ')
  const oggetti: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pagine} >>`),
    flusso(
      `/Type /XObject /Subtype /Image /Width ${larghezza} /Height ${altezza} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
      deflateSync(pixel),
    ),
  ]
  for (let i = 0; i < pagine; i++) {
    oggetti.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      ),
      flusso('', Buffer.from('q 595 0 0 842 0 0 cm /Im1 Do Q')),
    )
  }
  return pdf(oggetti)
}

/**
 * An office scanner's "compact PDF" (MRC): a small gray picture of the page
 * and, on top, the text as a bigger one-bit mask (0 = ink). The mask has black
 * stripes: rows 0-3 of every 10.
 */
export function pdfScansioneCompatta(larghezza = 160, altezza = 200): Buffer {
  const sfondo = Buffer.alloc((larghezza / 4) * (altezza / 4), 230)
  const riga = (larghezza + 7) >> 3
  const maschera = Buffer.alloc(riga * altezza, 0xff)
  for (let y = 0; y < altezza; y++) if (y % 10 < 4) maschera.fill(0x00, y * riga, (y + 1) * riga)
  const oggetti: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [5 0 R] /Count 1 >>'),
    flusso(
      `/Type /XObject /Subtype /Image /Width ${larghezza / 4} /Height ${altezza / 4} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
      deflateSync(sfondo),
    ),
    flusso(`/Type /XObject /Subtype /Image /Width ${larghezza} /Height ${altezza} /ImageMask true /BitsPerComponent 1 /Filter /FlateDecode`, deflateSync(maschera)),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Sf 3 0 R /Tx 4 0 R >> >> /Contents 6 0 R >>',
    ),
    flusso('', Buffer.from('q 595 0 0 842 0 0 cm /Sf Do Q q 0 g 595 0 0 842 0 0 cm /Tx Do Q')),
  ]
  return pdf(oggetti)
}

/** A .docx with one paragraph per line, and a table. */
export function docx(paragrafi: string[], tabella: string[][] = [], parte = 'word/document.xml'): Buffer {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`
  const tbl = tabella.length
    ? `<w:tbl>${tabella.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
    : ''
  return zip({
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${parte}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${parte}"/></Relationships>`,
    [parte]: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragrafi.map(p).join('')}${tbl}</w:body></w:document>`,
  })
}

/** A minimal .xlsx with one sheet of inline strings and numbers, as Excel's own parts. */
export function xlsx(foglio: string, righe: (string | number)[][]): Buffer {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const colonna = (i: number) => String.fromCharCode(65 + i)
  const celle = righe
    .map(
      (r, y) =>
        `<row r="${y + 1}">${r
          .map((c, x) =>
            typeof c === 'number'
              ? `<c r="${colonna(x)}${y + 1}"><v>${c}</v></c>`
              : `<c r="${colonna(x)}${y + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('')
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="${esc(foglio)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${celle}</sheetData></worksheet>`,
    // a picture: never opened, never measured
    'xl/media/image1.png': png(4, 4),
  })
}

/** A small PNG (grayscale stripes), valid for any decoder. */
export function png(larghezza = 8, altezza = 8): Buffer {
  const righe = Buffer.alloc((larghezza + 1) * altezza)
  for (let y = 0; y < altezza; y++) {
    righe[y * (larghezza + 1)] = 0
    for (let x = 0; x < larghezza; x++) righe[y * (larghezza + 1) + 1 + x] = (x + y) % 2 ? 255 : 0
  }
  const pezzo = (tipo: string, dati: Buffer) => {
    const lunghezza = Buffer.alloc(4)
    lunghezza.writeUInt32BE(dati.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dati])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corpo))
    return Buffer.concat([lunghezza, corpo, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(larghezza, 0)
  ihdr.writeUInt32BE(altezza, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', ihdr),
    pezzo('IDAT', deflateSync(righe)),
    pezzo('IEND', Buffer.alloc(0)),
  ])
}
