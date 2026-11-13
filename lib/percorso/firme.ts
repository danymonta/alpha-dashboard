import type { TipoAllegato } from '@/lib/validation/questionario'

/**
 * The signature of a file from its first bytes (release B1b): what the route of the
 * confirmation reads from the object before allegato_conferma, so that a page or a PDF
 * with a script declared as a photo never reaches the admin or the coach as one. Pure: the
 * route reads the first 16 bytes and asks here. Never trust the name, the type the browser
 * declared or the Content-Type of the upload.
 *
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WebP: «RIFF», 4 bytes of length, «WEBP»
 * - PDF: «%PDF-»
 */
export const BYTE_FIRMA = 16

function inizia(byte: Uint8Array, firma: readonly number[], da = 0): boolean {
  if (byte.length < da + firma.length) return false
  return firma.every((b, i) => byte[da + i] === b)
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RIFF = ascii('RIFF')
const WEBP = ascii('WEBP')
const PDF = ascii('%PDF-')

/** The type the first bytes say, or null when they are none of the four admitted. */
export function tipoDaFirma(byte: Uint8Array): TipoAllegato | null {
  if (inizia(byte, JPEG)) return 'image/jpeg'
  if (inizia(byte, PNG)) return 'image/png'
  if (inizia(byte, RIFF) && inizia(byte, WEBP, 8)) return 'image/webp'
  if (inizia(byte, PDF)) return 'application/pdf'
  return null
}
