import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { clienteSchema, modificaCostoSchema } from '@/lib/validation/anagrafiche'
import { modificaCallSchema } from '@/lib/validation/call'
import { modificaIncassoSchema } from '@/lib/validation/incasso'
import { modificaLeadSchema } from '@/lib/validation/lead'
import { modificaPagamentoProvvigioneSchema } from '@/lib/validation/provvigione'
import { correzioneReportSchema } from '@/lib/validation/report'
import { modificaRegolaSchema } from '@/lib/validation/team'
import { modificaVenditaSchema } from '@/lib/validation/vendita'

const ID = '0b6d2c1e-7d3a-4f7e-9a51-3c1d2b4e5f60'
const ALTRO_ID = '1c7e3d2f-8e4b-4a8f-8b62-4d2e3c5f6a71'
const oggi = oggiRoma()

/** The client sends the schema's output; the server parses it again with the same schema. */
function rilegge(schema: ZodTypeAny, input: unknown) {
  const primo = schema.parse(input)
  expect(schema.parse(primo)).toEqual(primo)
  return primo
}

function errore(schema: ZodTypeAny, input: unknown) {
  const esito = schema.safeParse(input)
  expect(esito.success).toBe(false)
  return esito.success ? '' : esito.error.issues[0].message
}

describe('modifica del lead', () => {
  it('normalizza handle e note, e rilegge il proprio output', () => {
    expect(rilegge(modificaLeadSchema, { id: ID, nome: ' Marco ', instagram_handle: '@Marco.B ', fonte: 'referral', note: '  ' }))
      .toEqual({ id: ID, nome: 'Marco', instagram_handle: '@marco.b', fonte: 'referral', note: null })
  })
})

describe('modifica della call', () => {
  const base = { call_id: ID, tipo: 'strategy', data: oggi, ora: '18:30', closer_id: ALTRO_ID, note: '' }

  it('legge l’importo all’italiana e svuota i campi vuoti', () => {
    const v = rilegge(modificaCallSchema, {
      ...base,
      dettagli: { link_registrazione: '', performance: null, prodotto_proposto_id: '', importo_proposto: '1.500' },
    })
    expect(v.dettagli).toEqual({
      link_registrazione: null,
      performance: null,
      prodotto_proposto_id: null,
      importo_proposto: 1500,
      note_closer: null,
    })
    expect(v.note).toBeNull()
  })

  it('due note: quelle del setter fuori, quelle del closer nei dettagli', () => {
    const v = rilegge(modificaCallSchema, {
      ...base,
      note: ' Vuole essere chiamato dopo le 18 ',
      dettagli: { note_closer: ' Vuole la versione da 3 mesi ' },
    })
    expect(v.note).toBe('Vuole essere chiamato dopo le 18')
    expect(v.dettagli?.note_closer).toBe('Vuole la versione da 3 mesi')
    expect(errore(modificaCallSchema, { ...base, note: 'x'.repeat(1001) })).toBe('Al massimo 1000 caratteri')
    expect(errore(modificaCallSchema, { ...base, dettagli: { note_closer: 'x'.repeat(2001) } })).toBe('Al massimo 2000 caratteri')
  })

  it('un importo illeggibile è un errore, non un campo svuotato', () => {
    expect(errore(modificaCallSchema, { ...base, dettagli: { importo_proposto: 'mille' } })).toMatch(/importo/)
  })

  it('il link vuole https', () => {
    expect(errore(modificaCallSchema, { ...base, dettagli: { link_registrazione: 'fathom.video/x' } })).toMatch(/https/)
    expect(rilegge(modificaCallSchema, { ...base, dettagli: { link_registrazione: 'https://fathom.video/share/x' } }).dettagli)
      .toMatchObject({ link_registrazione: 'https://fathom.video/share/x' })
  })

  it('si può correggere una call passata, non una tra un anno', () => {
    rilegge(modificaCallSchema, { ...base, data: aggiungiGiorni(oggi, -90) })
    expect(errore(modificaCallSchema, { ...base, data: aggiungiGiorni(oggi, 365) })).toMatch(/6 mesi/)
  })

  it('il setter non manda i dettagli', () => {
    expect(rilegge(modificaCallSchema, base).dettagli).toBeUndefined()
  })
})

describe('correzione del report', () => {
  const report = {
    id: ID,
    dm_outbound: 40,
    dm_inbound: 3,
    conversazioni: 12,
    call_proposte: 2,
    discovery_prenotate: 1,
    discovery_svolte: 0,
    call_qualificate: 0,
    strategy_prenotate: 0,
    follow_up: 9,
    contenuto_pubblicato: true,
    note: '',
  }

  it('rilegge il proprio output', () => {
    expect(rilegge(correzioneReportSchema, report).note).toBeNull()
  })

  it('un numero negativo non passa', () => {
    expect(errore(correzioneReportSchema, { ...report, follow_up: -1 })).toMatch(/negativo/)
  })
})

describe('modifica del cliente', () => {
  it('owner vuoti diventano null', () => {
    expect(
      rilegge(clienteSchema, { id: ID, nome: 'Luca', setter_id: '', closer_id: ALTRO_ID, fonte: null }),
    ).toMatchObject({ setter_id: null, closer_id: ALTRO_ID, fonte: null })
  })
})

describe('modifica della vendita', () => {
  const vendita = {
    id: ID,
    tipo: 'nuovo',
    product_id: ALTRO_ID,
    valore_contratto: '2.400,50',
    data_vendita: '2026-07-01',
    data_inizio: '2026-07-01',
    data_fine: '2026-12-31',
    setter_id: '',
    closer_id: ALTRO_ID,
    note: '',
  }

  it('legge il valore all’italiana e rilegge il proprio output', () => {
    expect(rilegge(modificaVenditaSchema, vendita)).toMatchObject({ valore_contratto: 2400.5, setter_id: null, note: null })
  })

  it('la fine del percorso viene dopo l’inizio', () => {
    expect(errore(modificaVenditaSchema, { ...vendita, data_fine: '2026-06-30' })).toMatch(/dopo l’inizio/)
  })
})

describe('correzioni economiche', () => {
  it('un incasso corretto non va nel futuro', () => {
    rilegge(modificaIncassoSchema, { payment_id: ID, incassato_il: oggi, importo: '750', metodo: null })
    expect(errore(modificaIncassoSchema, { payment_id: ID, incassato_il: aggiungiGiorni(oggi, 1), importo: '750' })).toMatch(/futuro/)
  })

  it('un costo corretto segue le regole di un costo nuovo', () => {
    rilegge(modificaCostoSchema, { id: ID, data: oggi, categoria: 'software', descrizione: 'Hosting', importo: '89', ricorrente: true })
  })

  it('un pagamento di provvigione si riferisce a un mese intero', () => {
    const pagamento = { id: ID, periodo: '2026-07-01', importo: '187,50', pagato_il: '2026-08-25', metodo: 'paypal', note: '' }
    expect(rilegge(modificaPagamentoProvvigioneSchema, pagamento).importo).toBe(187.5)
    expect(errore(modificaPagamentoProvvigioneSchema, { ...pagamento, periodo: '2026-07-15' })).toMatch(/mese/)
  })

  it('una regola resta in punti percentuali fino all’azione, e finisce dopo l’inizio', () => {
    const regola = { id: ID, percentuale: '7,5', applica_a: ['nuovo'], valida_dal: '2026-07-01', valida_al: '' }
    expect(rilegge(modificaRegolaSchema, regola)).toMatchObject({ percentuale: 7.5, valida_al: null })
    expect(errore(modificaRegolaSchema, { ...regola, valida_al: '2026-06-30' })).toMatch(/dopo l’inizio/)
  })
})
