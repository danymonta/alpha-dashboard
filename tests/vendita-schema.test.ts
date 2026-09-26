import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { nuovaVenditaSchema } from '@/lib/validation/vendita'

const oggi = oggiRoma()
const PRODOTTO = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const CLIENTE = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'

const daCall = {
  call_id: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
  client_id: null,
  nome: 'Marco',
  cognome: 'Bianchi',
  email: '',
  telefono: '',
  instagram_handle: 'marco_b',
  tipo: 'nuovo',
  product_id: PRODOTTO,
  valore_contratto: '2.400,00',
  numero_rate: '3',
  data_vendita: oggi,
  data_inizio: oggi,
  note: '',
}

describe('schema Nuova vendita', () => {
  it('trasforma i valori digitati in numeri e normalizza i contatti', () => {
    const v = nuovaVenditaSchema.parse(daCall)
    expect(v.valore_contratto).toBe(2400)
    expect(v.numero_rate).toBe(3)
    expect(v.email).toBeNull()
    expect(v.instagram_handle).toBe('@marco_b')
  })

  it('rilegge il proprio output senza cambiarlo (client e server usano lo stesso schema)', () => {
    const v = nuovaVenditaSchema.parse(daCall)
    expect(nuovaVenditaSchema.parse(v)).toEqual(v)
  })

  it('un cliente nuovo ha bisogno del nome e di una vendita di tipo nuovo', () => {
    const esito = nuovaVenditaSchema.safeParse({ ...daCall, nome: '', tipo: 'rinnovo' })
    expect(esito.success).toBe(false)
    const campi = esito.success ? [] : esito.error.issues.map((i) => i.path[0])
    expect(campi).toEqual(expect.arrayContaining(['nome', 'tipo']))
  })

  it('un cliente esistente può rinnovare senza ridare i suoi dati', () => {
    const v = nuovaVenditaSchema.parse({ ...daCall, call_id: null, client_id: CLIENTE, nome: '', tipo: 'rinnovo' })
    expect(v.tipo).toBe('rinnovo')
  })

  it('pretende un valore positivo e ferma gli zeri di troppo', () => {
    for (const valore_contratto of ['', '0', 'abc', '250.000']) {
      expect(nuovaVenditaSchema.safeParse({ ...daCall, valore_contratto }).success).toBe(false)
    }
  })

  it('limita il numero di rate', () => {
    expect(nuovaVenditaSchema.safeParse({ ...daCall, numero_rate: '0' }).success).toBe(false)
    expect(nuovaVenditaSchema.safeParse({ ...daCall, numero_rate: '25' }).success).toBe(false)
  })

  it('una vendita non può essere datata nel futuro', () => {
    const domani = aggiungiGiorni(oggi, 1)
    expect(nuovaVenditaSchema.safeParse({ ...daCall, data_vendita: domani, data_inizio: domani }).success).toBe(false)
  })

  it('l’inizio del percorso deve stare vicino alla vendita', () => {
    expect(nuovaVenditaSchema.safeParse({ ...daCall, data_inizio: aggiungiGiorni(oggi, 30) }).success).toBe(true)
    expect(nuovaVenditaSchema.safeParse({ ...daCall, data_inizio: aggiungiGiorni(oggi, 200) }).success).toBe(false)
  })

  it('rifiuta un’email sbagliata', () => {
    expect(nuovaVenditaSchema.safeParse({ ...daCall, email: 'marco@' }).success).toBe(false)
  })
})
