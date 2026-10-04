import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { chiusuraClienteSchema, MOTIVO_CHIUSURA_MAX } from '@/lib/validation/chiusura'

const CLIENTE = '00000000-0000-4000-8000-000000000001'

describe('«Non rinnova»: lo schema del foglio e della server action', () => {
  it('oggi, con un motivo: il motivo senza spazi attorno', () => {
    expect(chiusuraClienteSchema.parse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo: '  Si allena da solo  ' })).toEqual({
      client_id: CLIENTE,
      chiuso_il: oggiRoma(),
      motivo: 'Si allena da solo',
    })
  })

  it('il motivo è facoltativo: vuoto, null o assente diventano null', () => {
    for (const motivo of ['', '   ', null, undefined]) {
      expect(chiusuraClienteSchema.parse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo }).motivo).toBeNull()
    }
  })

  it('al massimo 500 caratteri di motivo', () => {
    const ok = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo: 'x'.repeat(MOTIVO_CHIUSURA_MAX) })
    expect(ok.success).toBe(true)
    const troppo = chiusuraClienteSchema.safeParse({
      client_id: CLIENTE,
      chiuso_il: oggiRoma(),
      motivo: 'x'.repeat(MOTIVO_CHIUSURA_MAX + 1),
    })
    expect(troppo.success ? null : troppo.error.issues[0]?.message).toBe('Al massimo 500 caratteri')
  })

  it('un giorno passato sì, il futuro mai, una data scritta male nemmeno', () => {
    expect(chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: aggiungiGiorni(oggiRoma(), -40) }).success).toBe(true)
    const futuro = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: aggiungiGiorni(oggiRoma(), 1) })
    expect(futuro.success ? null : futuro.error.issues[0]?.message).toBe('Il giorno non può essere nel futuro')
    const scritta = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: '05/10/2026' })
    expect(scritta.success ? null : scritta.error.issues.map((i) => i.message)).toEqual(['Scegli il giorno'])
  })
})
