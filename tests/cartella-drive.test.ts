import { describe, expect, it } from 'vitest'

import { frasiAnteprima } from '@/lib/eliminazione'
import { cartellaDriveSchema, ERRORE_URL_DRIVE } from '@/lib/validation/cartella'

const ID = '53530000-0000-4000-8000-0000000000a1'

function errore(url: string) {
  const r = cartellaDriveSchema.safeParse({ client_id: ID, url })
  return r.success ? null : r.error.issues[0]?.message
}

describe('link della cartella Drive del cliente', () => {
  it('accetta un link di Google Drive, anche incollato senza https:// o con spazi attorno', () => {
    expect(cartellaDriveSchema.parse({ client_id: ID, url: '  https://drive.google.com/drive/folders/1AbC?usp=sharing ' }).url).toBe(
      'https://drive.google.com/drive/folders/1AbC?usp=sharing',
    )
    expect(cartellaDriveSchema.parse({ client_id: ID, url: 'drive.google.com/drive/u/0/folders/xyz' }).url).toBe(
      'https://drive.google.com/drive/u/0/folders/xyz',
    )
  })

  it('rifiuta ogni altro indirizzo, come il vincolo del database', () => {
    expect(errore('')).toBe('Incolla il link della cartella')
    expect(errore('https://example.com/drive.google.com/x')).toBe(ERRORE_URL_DRIVE)
    expect(errore('http://drive.google.com/drive/folders/x')).toBe(ERRORE_URL_DRIVE)
    expect(errore('https://drive.google.com.evil.com/x')).toBe(ERRORE_URL_DRIVE)
    expect(errore('https://drive.google.com@evil.com/x')).toBe(ERRORE_URL_DRIVE)
    expect(errore('https://drive.google.com/drive/folders/con spazio')).toBe(ERRORE_URL_DRIVE)
    expect(errore('javascript:alert(1)')).toBe(ERRORE_URL_DRIVE)
    expect(errore(`https://drive.google.com/${'x'.repeat(500)}`)).toBe('Al massimo 500 caratteri')
  })

  it('eliminando il cliente, l’anteprima dice che il link se ne va e la cartella resta', () => {
    expect(frasiAnteprima('cliente', { vendite: 1, rate: 1, cartella_drive: 1 })).toContain(
      'Si toglie anche il link alla sua cartella Drive: la cartella su Drive resta.',
    )
    expect(frasiAnteprima('cliente', { vendite: 1, rate: 1, cartella_drive: 0 }).join(' ')).not.toContain('Drive')
  })
})
