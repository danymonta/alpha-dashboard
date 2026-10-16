import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { dettagliCallSchema, normalizzaHandle, nuovaCallSchema } from '@/lib/validation/call'

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

describe('handle Instagram', () => {
  it('normalizza chiocciola, maiuscole e spazi', () => {
    expect(normalizzaHandle(' @Marco.Bianchi ')).toBe('@marco.bianchi')
    expect(normalizzaHandle('marco_b')).toBe('@marco_b')
    expect(normalizzaHandle('@@marco')).toBe('@marco')
  })

  it('un campo vuoto non è un handle', () => {
    expect(normalizzaHandle('   ')).toBeNull()
    expect(nuovaCallSchema.parse({ ...valida, instagram_handle: '' }).instagram_handle).toBeNull()
  })

  it('rifiuta caratteri che Instagram non ammette', () => {
    expect(nuovaCallSchema.safeParse({ ...valida, instagram_handle: '@marco-bianchi' }).success).toBe(false)
  })
})

describe('schema Nuova call', () => {
  it('accetta una call completa', () => {
    expect(nuovaCallSchema.safeParse(valida).success).toBe(true)
  })

  it('pretende nome, ora e closer', () => {
    const esito = nuovaCallSchema.safeParse({ ...valida, nome: ' ', ora: '', closer_id: '' })
    expect(esito.success).toBe(false)
    const campi = esito.success ? [] : esito.error.issues.map((i) => i.path[0])
    expect(campi).toEqual(expect.arrayContaining(['nome', 'ora', 'closer_id']))
  })

  it('accetta una call registrata in ritardo, fino a 7 giorni fa', () => {
    expect(nuovaCallSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, -7) }).success).toBe(true)
  })

  it('ferma le date assurde', () => {
    expect(nuovaCallSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, -8) }).success).toBe(false)
    expect(nuovaCallSchema.safeParse({ ...valida, data: aggiungiGiorni(oggi, 181) }).success).toBe(false)
  })

  it('rifiuta un’ora impossibile', () => {
    expect(nuovaCallSchema.safeParse({ ...valida, ora: '25:00' }).success).toBe(false)
  })

  it('rifiuta una fonte che non esiste nell’enum', () => {
    expect(nuovaCallSchema.safeParse({ ...valida, fonte: 'tiktok' }).success).toBe(false)
  })
})

describe('link della registrazione nella matita', () => {
  const link = (v: string | null) => dettagliCallSchema.parse({ link_registrazione: v }).link_registrazione

  it('un link di Fathom si salva nella forma unica, come dal foglio dell’esito', () => {
    expect(link('https://www.fathom.video/share/AbC123?tab=summary')).toBe('https://fathom.video/share/AbC123')
    expect(link('http://fathom.video/calls/123456/')).toBe('https://fathom.video/calls/123456')
    expect(link('https://fathom.video/share/AbC123')).toBe('https://fathom.video/share/AbC123')
  })

  it('un altro indirizzo resta com’è, e un campo vuoto lo toglie', () => {
    expect(link('https://esempio.test/registrazione?x=1')).toBe('https://esempio.test/registrazione?x=1')
    expect(link('  ')).toBeNull()
    expect(link(null)).toBeNull()
    expect(() => link('fathom.video/share/x')).toThrow()
  })
})
