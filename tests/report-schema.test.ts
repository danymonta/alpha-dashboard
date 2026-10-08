import { describe, expect, it } from 'vitest'

import { REPORT_VUOTO, chiaveValoriSalvati, reportGiornalieroSchema, valoriDaRiga } from '@/lib/validation/report'

const valido = { data: '2026-09-26', ...REPORT_VUOTO, dm_outbound: 35 }

describe('schema del report giornaliero', () => {
  it('accetta un report completo', () => {
    expect(reportGiornalieroSchema.safeParse(valido).success).toBe(true)
  })

  it('rifiuta numeri negativi e decimali', () => {
    expect(reportGiornalieroSchema.safeParse({ ...valido, dm_inbound: -1 }).success).toBe(false)
    expect(reportGiornalieroSchema.safeParse({ ...valido, dm_inbound: 2.5 }).success).toBe(false)
  })

  it('ferma gli errori di battitura evidenti', () => {
    expect(reportGiornalieroSchema.safeParse({ ...valido, dm_outbound: 30000 }).success).toBe(false)
  })

  it('non accetta un setter_id dal client: il server lo prende dalla sessione', () => {
    const parsed = reportGiornalieroSchema.parse({ ...valido, setter_id: 'qualcun-altro' })
    expect(parsed).not.toHaveProperty('setter_id')
  })

  it('trasforma una nota vuota in null', () => {
    expect(reportGiornalieroSchema.parse({ ...valido, note: '   ' }).note).toBeNull()
  })

  it('rifiuta una data inesistente', () => {
    expect(reportGiornalieroSchema.safeParse({ ...valido, data: '2026-02-30' }).success).toBe(false)
  })
})

describe('i valori come li salva il database (una risposta persa riconosciuta, Oggi)', () => {
  const schermo = { ...REPORT_VUOTO, dm_outbound: 11, note: '   ', cosa_frenava: '' }

  it('quello che il form ha mandato e la riga che il database ne ha scritto danno la stessa chiave', () => {
    // a blank text is saved as null; the row carries more columns than the form
    const riga = { ...REPORT_VUOTO, dm_outbound: 11, note: null, cosa_frenava: null, updated_at: 'x', dm_totali: 11 }
    expect(chiaveValoriSalvati(schermo)).toBe(chiaveValoriSalvati(valoriDaRiga(riga)))
    // an answer left out is the same as no answer
    expect(chiaveValoriSalvati({ ...schermo, lead_in_target: undefined })).toBe(chiaveValoriSalvati(schermo))
  })

  it('un numero, un testo o una risposta diversi danno una chiave diversa', () => {
    const base = chiaveValoriSalvati(schermo)
    expect(chiaveValoriSalvati({ ...schermo, dm_outbound: 12 })).not.toBe(base)
    expect(chiaveValoriSalvati({ ...schermo, note: 'ciao' })).not.toBe(base)
    expect(chiaveValoriSalvati({ ...schermo, lead_in_target: 'pochi' })).not.toBe(base)
    expect(chiaveValoriSalvati({ ...schermo, contenuto_pubblicato: true })).not.toBe(base)
  })

  it('valori non validi non hanno chiave: un salvataggio così non arriva mai', () => {
    expect(chiaveValoriSalvati({ ...schermo, dm_outbound: -1 })).toBeNull()
  })

  it('valoriDaRiga prende solo i campi del form', () => {
    const riga = { ...REPORT_VUOTO, dm_outbound: 3, updated_at: '2026-10-08T10:00:00+00:00', dm_totali: 3 }
    expect(valoriDaRiga(riga)).toEqual({ ...REPORT_VUOTO, dm_outbound: 3 })
  })
})
