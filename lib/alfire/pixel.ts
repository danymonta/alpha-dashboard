import { crc32, deflateSync } from 'node:zlib'

/**
 * The pages of a scanned PDF, made into images the vision model can read,
 * without a native image library (Vercel's Node runtime, no binaries): the
 * decoded pixels of the page's picture become a smaller grayscale PNG.
 * Grayscale: a document reads just as well, in a third of the bytes.
 */

/** How pdf.js hands over decoded pixels (its ImageKind). */
export const TIPO_PIXEL = { bianconero1bit: 1, rgb: 2, rgba: 3 } as const

export type Pixel = { larghezza: number; altezza: number; tipo: number; dati: Uint8Array | Uint8ClampedArray }

export type Grigi = { larghezza: number; altezza: number; dati: Uint8Array }

/** The gray (0-255) of one source pixel. Alpha over white: a transparent page is white. */
function lettore(p: Pixel): ((x: number, y: number) => number) | null {
  const { larghezza, tipo, dati } = p
  if (tipo === TIPO_PIXEL.bianconero1bit) {
    const riga = (larghezza + 7) >> 3
    // pdf.js: a bit set is white
    return (x, y) => ((dati[y * riga + (x >> 3)] ?? 255) & (0x80 >> (x & 7)) ? 255 : 0)
  }
  if (tipo === TIPO_PIXEL.rgb) {
    return (x, y) => {
      const i = (y * larghezza + x) * 3
      return (dati[i] * 299 + dati[i + 1] * 587 + dati[i + 2] * 114) / 1000
    }
  }
  if (tipo === TIPO_PIXEL.rgba) {
    return (x, y) => {
      const i = (y * larghezza + x) * 4
      const a = dati[i + 3] / 255
      const l = (dati[i] * 299 + dati[i + 1] * 587 + dati[i + 2] * 114) / 1000
      return l * a + 255 * (1 - a)
    }
  }
  return null
}

/** How pdf.js would call the channels: 1 (gray), 3, 4. Anything else is not a picture we read. */
export function tipoDaCanali(p: { larghezza: number; altezza: number; dati: ArrayLike<number>; tipo?: number }): number | null {
  if (p.tipo === TIPO_PIXEL.bianconero1bit || p.tipo === TIPO_PIXEL.rgb || p.tipo === TIPO_PIXEL.rgba) return p.tipo
  const canali = p.dati.length / (p.larghezza * p.altezza)
  if (canali === 3) return TIPO_PIXEL.rgb
  if (canali === 4) return TIPO_PIXEL.rgba
  return null
}

/**
 * The picture in grayscale, its longest side at most `lato` pixels: every
 * pixel of the result is the average of the source pixels it covers (a box
 * filter, so thin strokes of text survive the shrink).
 */
export function inGrigiRidotta(p: Pixel, lato: number): Grigi | null {
  if (p.larghezza < 1 || p.altezza < 1) return null
  const scala = Math.min(1, lato / Math.max(p.larghezza, p.altezza))
  return inGrigi(p, Math.max(1, Math.round(p.larghezza * scala)), Math.max(1, Math.round(p.altezza * scala)))
}

/** The picture in grayscale at exactly this size, shrunk or stretched (the background under a scan's text). */
export function inGrigi(p: Pixel, larghezza: number, altezza: number): Grigi | null {
  const leggi = lettore(p)
  if (!leggi || p.larghezza < 1 || p.altezza < 1 || larghezza < 1 || altezza < 1) return null
  const dati = new Uint8Array(larghezza * altezza)
  for (let ty = 0; ty < altezza; ty++) {
    const y0 = Math.min(p.altezza - 1, Math.floor((ty * p.altezza) / altezza))
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * p.altezza) / altezza))
    for (let tx = 0; tx < larghezza; tx++) {
      const x0 = Math.min(p.larghezza - 1, Math.floor((tx * p.larghezza) / larghezza))
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * p.larghezza) / larghezza))
      let somma = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) somma += leggi(x, y)
      dati[ty * larghezza + tx] = Math.round(somma / ((y1 - y0) * (x1 - x0)))
    }
  }
  return { larghezza, altezza, dati }
}

function pezzo(tipo: string, dati: Uint8Array): Buffer {
  const lunghezza = Buffer.alloc(4)
  lunghezza.writeUInt32BE(dati.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dati])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([lunghezza, corpo, crc])
}

/** An 8-bit grayscale PNG: rows with the "Up" filter, which suits pages of text. */
export function pngGrigi({ larghezza, altezza, dati }: Grigi): Buffer {
  const righe = Buffer.alloc((larghezza + 1) * altezza)
  for (let y = 0; y < altezza; y++) {
    const inizio = y * (larghezza + 1)
    righe[inizio] = y === 0 ? 0 : 2
    for (let x = 0; x < larghezza; x++) {
      const v = dati[y * larghezza + x]
      righe[inizio + 1 + x] = y === 0 ? v : (v - dati[(y - 1) * larghezza + x]) & 0xff
    }
  }
  const intestazione = Buffer.alloc(13)
  intestazione.writeUInt32BE(larghezza, 0)
  intestazione.writeUInt32BE(altezza, 4)
  intestazione[8] = 8 // bit depth
  intestazione[9] = 0 // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', intestazione),
    pezzo('IDAT', deflateSync(righe, { level: 6 })),
    pezzo('IEND', new Uint8Array(0)),
  ])
}
