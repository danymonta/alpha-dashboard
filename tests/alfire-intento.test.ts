import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { conversazioneScrive } from '@/lib/alfire/intento'

function utente(testo: string): UIMessage {
  return { id: testo, role: 'user', parts: [{ type: 'text', text: testo }] }
}
function alfire(testo: string): UIMessage {
  return { id: `a-${testo}`, role: 'assistant', parts: [{ type: 'text', text: testo }] }
}

describe('sul piano gratuito, la conversazione chiede di scrivere?', () => {
  it('la chat di Dany del 29/09: dopo la richiesta, «Ci sei?» scrive ancora', () => {
    expect(
      conversazioneScrive([
        utente('Mio cliente Raffaele Ferrara mi ha pagato l’ultima rata da 400, inseriscilo come incasso'),
        alfire('Ho letto le rate del cliente'),
        utente('Ci sei?'),
      ]),
    ).toBe(true)
  })

  it('un importo in euro basta', () => {
    expect(conversazioneScrive([utente('Canva 12,99 €')])).toBe(true)
  })

  it('una chat che legge soltanto no', () => {
    expect(conversazioneScrive([utente('Quanto ho incassato questo mese?'), alfire('6.950 €'), utente('E il mese scorso?')])).toBe(
      false,
    )
  })

  it('una domanda sull’obiettivo legge soltanto; impostarlo scrive', () => {
    expect(conversazioneScrive([utente('Quanto manca all’obiettivo di questo mese?')])).toBe(false)
    expect(conversazioneScrive([utente('Imposta l’obiettivo di ottobre a 5 nuovi clienti')])).toBe(true)
  })

  it('una scrittura in attesa di conferma tiene gli strumenti', () => {
    const scheda: UIMessage = {
      id: 'x',
      role: 'assistant',
      parts: [{ type: 'tool-costo', toolCallId: 'c1', state: 'approval-requested', input: {}, approval: { id: 'a1' } } as never],
    }
    expect(conversazioneScrive([utente('sì'), scheda])).toBe(true)
  })
})
