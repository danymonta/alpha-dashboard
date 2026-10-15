import { describe, expect, it } from 'vitest'

import { ETICHETTA_MOTIVO, fraseAggiornato } from '@/lib/marketing/parole-post'

describe('fraseAggiornato', () => {
  const base = { letti: 52, collegati: 3, proposti: 5 }
  it('senza numeri la frase di prima', () => {
    expect(fraseAggiornato(base)).toBe('Aggiornato: 52 post letti, 3 collegati da soli, 5 proposte da controllare.')
  })
  it('i singolari', () => {
    expect(fraseAggiornato({ letti: 1, collegati: 1, proposti: 1 })).toBe('Aggiornato: 1 post letto, 1 collegato da solo, 1 proposta da controllare.')
  })
  it('i post con i numeri', () => {
    expect(fraseAggiornato({ ...base, metriche: 41 })).toBe('Aggiornato: 52 post letti, 3 collegati da soli, 5 proposte da controllare, numeri di 41 post.')
    expect(fraseAggiornato({ ...base, metriche: 1 })).toContain('numeri di 1 post.')
    expect(fraseAggiornato({ ...base, metriche: 0 })).toBe('Aggiornato: 52 post letti, 3 collegati da soli, 5 proposte da controllare.')
  })
  it('il permesso mancante lo dice e vince', () => {
    expect(fraseAggiornato({ ...base, metriche: 4, permesso: false })).toBe('Aggiornato: 52 post letti, 3 collegati da soli, 5 proposte da controllare; statistiche non attive.')
  })
  it('il motivo «parlato simile» ha le sue parole', () => {
    expect(ETICHETTA_MOTIVO.parlato_simile).toBe('parlato simile')
  })
})
