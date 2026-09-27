import { describe, expect, it } from 'vitest'

import { fineDopoMesi, stessoGiornoTraMesi } from '@/lib/date'
import { eliminazioneBloccata, frasiAnteprima } from '@/lib/eliminazione'
import { leggiPianoPredefinito, prodottoSchema } from '@/lib/validation/anagrafiche'
import { nuovaRataSchema, nuovaVenditaSchema, PERSONALIZZATO } from '@/lib/validation/vendita'

const CLIENTE = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'

// Saverio: a yearly renewal at 2.500 €, 3 × 500 then, three months later, 3 × 333,33
const saverio = {
  client_id: CLIENTE,
  tipo: 'rinnovo',
  product_id: PERSONALIZZATO,
  prodotto_personalizzato: 'Annuale',
  valore_contratto: '2.500',
  numero_rate: '1',
  data_vendita: '2026-05-10',
  data_inizio: '2026-05-10',
  data_fine: '2027-05-09',
  piano: 'personalizzato',
  rate: [
    { scadenza: '2026-05-10', importo: '500' },
    { scadenza: '2026-06-10', importo: '500' },
    { scadenza: '2026-07-10', importo: '500' },
    { scadenza: '2026-10-10', importo: '333,33' },
    { scadenza: '2026-11-10', importo: '333,33' },
    { scadenza: '2026-12-10', importo: '333,34' },
  ],
  note: '',
}

describe('vendita personalizzata', () => {
  it('accetta un percorso fuori catalogo con il suo piano scritto a mano', () => {
    const v = nuovaVenditaSchema.parse(saverio)
    expect(v.product_id).toBe(PERSONALIZZATO)
    expect(v.prodotto_personalizzato).toBe('Annuale')
    expect(v.rate.map((r) => r.importo)).toEqual([500, 500, 500, 333.33, 333.33, 333.34])
  })

  it('rilegge il proprio output senza cambiarlo', () => {
    const v = nuovaVenditaSchema.parse(saverio)
    expect(nuovaVenditaSchema.parse(v)).toEqual(v)
  })

  it('chiede il nome del percorso e la sua fine', () => {
    const esito = nuovaVenditaSchema.safeParse({ ...saverio, prodotto_personalizzato: '', data_fine: '' })
    expect(esito.success).toBe(false)
    const campi = esito.error!.issues.map((i) => i.path[0])
    expect(campi).toContain('prodotto_personalizzato')
    expect(campi).toContain('data_fine')
  })

  it('non accetta una fine prima dell’inizio', () => {
    const esito = nuovaVenditaSchema.safeParse({ ...saverio, data_fine: '2026-05-01' })
    expect(esito.error?.issues.map((i) => i.message)).toContain('La fine viene dopo l’inizio')
  })

  it('con il piano personalizzato vuole almeno una rata', () => {
    const esito = nuovaVenditaSchema.safeParse({ ...saverio, rate: [] })
    expect(esito.error?.issues.map((i) => i.message)).toContain('Aggiungi almeno una rata')
  })

  it('una rata aggiunta a mano vuole scadenza e importo positivo', () => {
    const sale_id = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'
    expect(nuovaRataSchema.parse({ sale_id, scadenza: '2026-08-10', importo: '100,50' }).importo).toBe(100.5)
    expect(nuovaRataSchema.safeParse({ sale_id, scadenza: '2026-08-10', importo: '0' }).success).toBe(false)
    expect(nuovaRataSchema.safeParse({ sale_id, scadenza: '', importo: '100' }).success).toBe(false)
  })
})

describe('date del piano', () => {
  it('lo stesso giorno tra n mesi si ferma a fine mese, come Postgres', () => {
    expect(stessoGiornoTraMesi('2026-01-31', 1)).toBe('2026-02-28')
    expect(stessoGiornoTraMesi('2026-05-10', 5)).toBe('2026-10-10')
    expect(stessoGiornoTraMesi('2026-11-30', 3)).toBe('2027-02-28')
  })

  it('un percorso di n mesi finisce il giorno prima', () => {
    expect(fineDopoMesi('2026-05-10', 12)).toBe('2027-05-09')
    expect(fineDopoMesi('2026-01-01', 3)).toBe('2026-03-31')
  })
})

describe('piano abituale del prodotto', () => {
  const base = { nome: 'Annuale', durata_mesi: '12', prezzo_listino: '2.500', attivo: true }

  it('senza righe vale "rate uguali"', () => {
    expect(prodottoSchema.parse({ ...base, piano_predefinito: [] }).piano_predefinito).toBeNull()
    expect(prodottoSchema.parse(base).piano_predefinito).toBeNull()
  })

  it('trasforma mesi e importi digitati', () => {
    const p = prodottoSchema.parse({
      ...base,
      piano_predefinito: [
        { mese: '0', importo: '500' },
        { mese: '4', importo: '333,33' },
      ],
    })
    expect(p.piano_predefinito).toEqual([
      { mese: 0, importo: 500 },
      { mese: 4, importo: 333.33 },
    ])
    expect(prodottoSchema.parse(p)).toEqual(p)
  })

  it('legge dal database solo un piano valido', () => {
    expect(leggiPianoPredefinito([{ mese: 0, importo: 500 }])).toEqual([{ mese: 0, importo: 500 }])
    expect(leggiPianoPredefinito([])).toBeNull()
    expect(leggiPianoPredefinito('rotto')).toBeNull()
    expect(leggiPianoPredefinito(null)).toBeNull()
  })
})

describe('anteprima delle eliminazioni', () => {
  it('un reparto con progetti non si elimina e lo dice', () => {
    const dati = { progetti: 2, modelli: 1 }
    expect(eliminazioneBloccata('reparto', dati)).toBe(true)
    expect(frasiAnteprima('reparto', dati)[0]).toContain('2 progetti')
    expect(eliminazioneBloccata('reparto', { progetti: 0, modelli: 1 })).toBe(false)
  })

  it('un cliente si porta dietro vendite, rate e incassato', () => {
    const frasi = frasiAnteprima('cliente', { vendite: 1, rate: 3, incassato: '1.000,00 €' })
    expect(frasi[0]).toBe('Si eliminano anche 1 vendita e 3 rate, con 1.000,00 € già incassati.')
    // nothing cashed yet: no "0,00 € già incassati"
    expect(frasiAnteprima('cliente', { vendite: 1, rate: 1, incassato: '0,00\u00a0€' })[0]).toBe('Si eliminano anche 1 vendita e 1 rata.')
  })

  it('una persona: cosa sparisce, cosa resta senza nome', () => {
    const frasi = frasiAnteprima('persona', { report: 1, regole: 1, vendite: 4 })
    expect(frasi[0]).toBe('Si eliminano anche: 1 report giornaliero, 1 regola provvigionale.')
    expect(frasi[1]).toBe('Restano, senza il suo nome come setter o closer: 4 vendite.')
    expect(frasi.at(-1)).toContain('nuovo invito')
  })

  it('nessuna frase vuota quando non c’è niente da contare', () => {
    expect(frasiAnteprima('prodotto', { vendite: 0, call: 0 })).toEqual([])
    expect(frasiAnteprima('lead', {})).toEqual([])
  })
})
