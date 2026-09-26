import { describe, expect, it } from 'vitest'

import { REPORT_VUOTO, reportGiornalieroSchema } from '@/lib/validation/report'

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
