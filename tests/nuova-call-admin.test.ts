import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { vociNav } from '@/lib/nav'
import { nuovaCallAdminSchema, nuovaCallSchema } from '@/lib/validation/call'

const oggi = oggiRoma()
const valida = {
  nome: 'Marco Bianchi',
  instagram_handle: '@marco.bianchi',
  fonte: 'dm_inbound',
  tipo: 'discovery',
  data: oggi,
  ora: '15:30',
  closer_id: '11111111-1111-4111-8111-111111111111',
}
const LORIS = '22222222-2222-4222-8222-222222222222'

describe('Nuova call dell’admin', () => {
  it('sceglie il setter; senza, resta vuoto e il database mette lui', () => {
    expect(nuovaCallAdminSchema.parse({ ...valida, setter_id: LORIS }).setter_id).toBe(LORIS)
    expect(nuovaCallAdminSchema.parse(valida).setter_id).toBeNull()
    expect(nuovaCallAdminSchema.safeParse({ ...valida, setter_id: 'loris' }).success).toBe(false)
  })

  it('aggiunge una call già fatta, fino a un anno fa; il setter solo fino a 7 giorni', () => {
    const unMeseFa = aggiungiGiorni(oggi, -30)
    expect(nuovaCallAdminSchema.safeParse({ ...valida, data: unMeseFa }).success).toBe(true)
    expect(nuovaCallSchema.safeParse({ ...valida, data: unMeseFa }).success).toBe(false)
    expect(nuovaCallAdminSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, -366) }).success).toBe(true)
    expect(nuovaCallAdminSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, -367) }).success).toBe(false)
  })

  it('il futuro ha lo stesso limite per tutti: sei mesi', () => {
    expect(nuovaCallAdminSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, 180) }).success).toBe(true)
    expect(nuovaCallAdminSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, 181) }).success).toBe(false)
  })

  it('fonte e ora restano obbligatorie anche per lui', () => {
    const esito = nuovaCallAdminSchema.safeParse({ ...valida, fonte: undefined, ora: '' })
    expect(esito.success).toBe(false)
    const campi = esito.success ? [] : esito.error.issues.map((i) => i.path[0])
    expect(campi).toEqual(expect.arrayContaining(['fonte', 'ora']))
  })
})

describe('navigazione dell’admin', () => {
  it('resta a 4 voci principali, con le call a un tocco (Nuova call è il bottone della pagina)', () => {
    const { principali } = vociNav('admin')
    expect(principali).toHaveLength(4)
    expect(principali.map((v) => v.href)).toContain('/calls')
  })

  it('il closer non ha "Nuova call"', () => {
    const { principali, altre } = vociNav('closer')
    expect([...principali, ...altre].map((v) => v.href)).not.toContain('/calls/new')
  })
})
