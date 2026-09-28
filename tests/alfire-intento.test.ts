import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { serveScrivere } from '@/lib/alfire/intento'

const utente = (text: string): UIMessage => ({ id: text, role: 'user', parts: [{ type: 'text', text }] })

describe('gli strumenti di scrittura viaggiano solo quando servono', () => {
  it.each([
    'Mario Rossi ha pagato 500 € in contanti',
    'registra una vendita annuale a 2.500 euro',
    'segna incassata la rata di Luca',
    'sposta la call di domani alle 18',
    'Loris ha versato 250',
    'aggiungi 20 DM al report di oggi',
  ])('scrive: %s', (testo) => {
    expect(serveScrivere([utente(testo)])).toBe(true)
  })

  it.each(['quanto ho incassato questo mese?', 'chi è in ritardo con le rate?', 'come funziona la pipeline?'])(
    'legge soltanto: %s',
    (testo) => {
      expect(serveScrivere([utente(testo)])).toBe(false)
    },
  )

  it('una scrittura in attesa di conferma tiene gli strumenti anche se la domanda non ne parla', () => {
    const inAttesa: UIMessage = {
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-registra_costo',
          toolCallId: 't1',
          state: 'approval-responded',
          input: { descrizione: 'Canva', importo: 12 },
          approval: { id: 'x', approved: true },
        } as never,
      ],
    }
    expect(serveScrivere([utente('grazie'), inAttesa])).toBe(true)
  })
})
