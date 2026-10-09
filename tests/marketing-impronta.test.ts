import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { BOZZA_REEL } from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'

// The values on the right were measured in Postgres (select md5(...)) on
// 09/10/2026: the fingerprint the page computes is the one
// salva_sezione_contenuto compares, over the same UTF-8 bytes.
describe('improntaTesto, come md5(coalesce(testo, \'\')) di Postgres', () => {
  it('una sezione vuota è l’md5 della stringa vuota', () => {
    expect(improntaTesto(null)).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(improntaTesto('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('accenti, virgolette basse ed emoji: gli stessi byte di Postgres', () => {
    expect(improntaTesto('Perché è già così: «più» 💡')).toBe('465a453a306c56fa16dcd69f29f96a9b')
  })

  it('la bozza di un reel nuovo, con gli a capo e i puntini', () => {
    expect(improntaTesto(BOZZA_REEL)).toBe('f97c7dda7ed3c701d7b9b95b28101b40')
  })
})
