import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { MOTIVO_SOSPENSIONE_MAX, riattivaClienteSchema, sospensioneClienteSchema } from '@/lib/validation/sospensione'

const CLIENTE = '00000000-0000-4000-8000-000000000001'

describe('«Sospendi»: lo schema del foglio e della server action', () => {
  it('oggi, con un motivo: il motivo senza spazi attorno', () => {
    expect(
      sospensioneClienteSchema.parse({ client_id: CLIENTE, sospeso_il: oggiRoma(), motivo: '  Viaggio di lavoro  ' }),
    ).toEqual({ client_id: CLIENTE, sospeso_il: oggiRoma(), motivo: 'Viaggio di lavoro' })
  })

  it('il motivo è facoltativo: vuoto, null o assente diventano null', () => {
    for (const motivo of ['', '   ', null, undefined]) {
      expect(sospensioneClienteSchema.parse({ client_id: CLIENTE, sospeso_il: oggiRoma(), motivo }).motivo).toBeNull()
    }
  })

  it('al massimo 500 caratteri di motivo', () => {
    const ok = sospensioneClienteSchema.safeParse({ client_id: CLIENTE, sospeso_il: oggiRoma(), motivo: 'x'.repeat(MOTIVO_SOSPENSIONE_MAX) })
    expect(ok.success).toBe(true)
    const troppo = sospensioneClienteSchema.safeParse({
      client_id: CLIENTE,
      sospeso_il: oggiRoma(),
      motivo: 'x'.repeat(MOTIVO_SOSPENSIONE_MAX + 1),
    })
    expect(troppo.success ? null : troppo.error.issues[0]?.message).toBe('Al massimo 500 caratteri')
  })

  it('un giorno passato sì, il futuro mai, una data scritta male nemmeno', () => {
    expect(sospensioneClienteSchema.safeParse({ client_id: CLIENTE, sospeso_il: aggiungiGiorni(oggiRoma(), -40) }).success).toBe(true)
    const futuro = sospensioneClienteSchema.safeParse({ client_id: CLIENTE, sospeso_il: aggiungiGiorni(oggiRoma(), 1) })
    expect(futuro.success ? null : futuro.error.issues[0]?.message).toBe('Il giorno non può essere nel futuro')
    const scritta = sospensioneClienteSchema.safeParse({ client_id: CLIENTE, sospeso_il: '10/10/2026' })
    expect(scritta.success ? null : scritta.error.issues.map((i) => i.message)).toEqual(['Scegli il giorno'])
  })

  it('«Riattiva» vuole solo un cliente valido', () => {
    expect(riattivaClienteSchema.safeParse({ client_id: CLIENTE }).success).toBe(true)
    expect(riattivaClienteSchema.safeParse({ client_id: 'non-un-uuid' }).success).toBe(false)
  })
})
