import { describe, expect, it } from 'vitest'

import { tipoDaFirma } from '@/lib/percorso/firme'

/* The signature of a file from its first 16 bytes (release B1b): never the name or the declared type. */

const byte = (...b: number[]) => {
  const a = new Uint8Array(16)
  a.set(b)
  return a
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe('le firme dei file', () => {
  it('JPEG, PNG, WebP e PDF', () => {
    expect(tipoDaFirma(byte(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(tipoDaFirma(byte(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(tipoDaFirma(byte(...ascii('RIFF'), 0x24, 0x08, 0, 0, ...ascii('WEBPVP8 ')))).toBe('image/webp')
    expect(tipoDaFirma(byte(...ascii('%PDF-1.7')))).toBe('application/pdf')
  })
  it('un HTML rinominato in .png no', () => {
    expect(tipoDaFirma(new TextEncoder().encode('<!doctype html><script>alert(1)</script>').subarray(0, 16))).toBeNull()
  })
  it('un SVG, un RIFF che non è WebP, pochi byte o niente no', () => {
    expect(tipoDaFirma(new TextEncoder().encode('<svg xmlns="http'))).toBeNull()
    expect(tipoDaFirma(byte(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull()
    expect(tipoDaFirma(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(tipoDaFirma(new Uint8Array())).toBeNull()
  })
})
