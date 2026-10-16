import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CAMPI_CALL, CAMPI_CALL_CLOSER, CAMPI_CALL_SETTER } from '@/app/(app)/calls/scheda-call'

// 1.37.0: the setter's page no longer receives the link of the recording (a Fathom share link could
// show the whole call, price included) nor the performance (how the closer led it), which used to
// reach his browser as props of the pencil sheet.
describe('le colonne della scheda della call', () => {
  const colonne = (s: string) => s.split(',').map((c) => c.trim())
  it('quelle del setter non hanno il link della registrazione né la performance', () => {
    for (const s of [CAMPI_CALL, CAMPI_CALL_SETTER]) {
      expect(colonne(s)).not.toContain('link_registrazione')
      expect(colonne(s)).not.toContain('performance')
      expect(s).not.toContain('call_registrazioni')
      expect(s).not.toContain('call_valutazioni')
      expect(s).not.toContain('call_analisi(')
    }
  })
  it('il setter legge «Dalla call» e i suoi spunti', () => {
    expect(CAMPI_CALL_SETTER).toContain('call_analisi_setter(')
    expect(CAMPI_CALL_SETTER).toContain('call_spunti_setter(spunti)')
  })
  it('quelle del closer hanno il link, la performance, la registrazione, l’analisi e la valutazione', () => {
    const c = colonne(CAMPI_CALL_CLOSER)
    expect(c).toContain('link_registrazione')
    expect(c).toContain('performance')
    expect(CAMPI_CALL_CLOSER).toContain('registrazione:call_registrazioni(')
    expect(CAMPI_CALL_CLOSER).toContain('analisi:call_analisi(')
    expect(CAMPI_CALL_CLOSER).toContain('valutazione:call_valutazioni(')
  })
})
