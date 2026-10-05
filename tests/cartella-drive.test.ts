import { describe, expect, it } from 'vitest'

import { frasiAnteprima } from '@/lib/eliminazione'
import { cartellaClienteSchema, cartellaDriveSchema, chiVedeLaCartella, ERRORE_URL_DRIVE } from '@/lib/validation/cartella'

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

describe('chi vede la cartella Drive nel progetto del cliente (05/10/2026)', () => {
  const COACH = '44444444-4444-4444-8444-444444444444'
  const ALTRO = '55555555-5555-4555-8555-555555555555'
  const progetto = { client_id: ID, coach_id: COACH }

  it('l’admin e il coach del progetto, con le parole giuste per ognuno', () => {
    expect(chiVedeLaCartella({ id: ALTRO, ruolo: 'admin' }, progetto)).toBe('admin')
    expect(chiVedeLaCartella({ id: COACH, ruolo: 'coach' }, progetto)).toBe('coach')
    // the coach is whoever the project says, whatever his role
    expect(chiVedeLaCartella({ id: COACH, ruolo: 'nutrizione' }, progetto)).toBe('coach')
    // the admin who is also the coach reads the admin's words
    expect(chiVedeLaCartella({ id: COACH, ruolo: 'admin' }, progetto)).toBe('admin')
  })

  it('nessun altro: membri, manager, closer, setter, un altro coach; nessuno in un progetto senza cliente', () => {
    for (const ruolo of ['coach', 'editor', 'nutrizione', 'dev', 'closer', 'setter']) {
      expect(chiVedeLaCartella({ id: ALTRO, ruolo }, progetto), ruolo).toBeNull()
    }
    expect(chiVedeLaCartella({ id: COACH, ruolo: 'coach' }, { client_id: ID, coach_id: null })).toBeNull()
    expect(chiVedeLaCartella({ id: COACH, ruolo: 'coach' }, { client_id: null, coach_id: COACH })).toBeNull()
    expect(chiVedeLaCartella({ id: ALTRO, ruolo: 'admin' }, { client_id: null, coach_id: null })).toBeNull()
  })

  it('le azioni prendono solo il cliente: lo schema non accetta altro per decidere chi può', () => {
    expect(cartellaClienteSchema.safeParse({ client_id: 'progetto-123' }).success).toBe(false)
    expect(cartellaClienteSchema.parse({ client_id: ID, coach: true, progetto_id: ID })).toEqual({ client_id: ID })
    expect(cartellaDriveSchema.parse({ client_id: ID, url: 'drive.google.com/drive/folders/x', chi: 'admin' })).toEqual({
      client_id: ID,
      url: 'https://drive.google.com/drive/folders/x',
    })
  })
})
