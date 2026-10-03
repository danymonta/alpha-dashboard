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

  // the team tracking time by voice (03/10/2026): on the free plan these must keep the write tools
  it.each([
    'Tracciami 30 minuti su Rossi, revisione video',
    'Ho lavorato 2 ore su Sergio Bellini',
    'Ci ho messo 45 min per la scheda',
    'Ieri dalle 9 alle 10:30 ho fatto la call di check',
    'Oggi 1h30 su programmazione alimentare',
    'mezz’ora di assistenza chat a Moretti',
    'Fai partire il timer su Moretti',
    'Stoppa il timer',
    'Spegni il timer, ho finito',
    'Spunta la call di onboarding di Rossi',
    'Annota nel progetto di Rossi che vuole cambiare orario',
    'Rimuovi la voce di ieri',
  ])('scrive: %s', (testo) => {
    expect(conversazioneScrive([utente(testo)])).toBe(true)
  })

  // dictated: the amounts come in letters (03/10/2026), and a correction can come without a verb
  it.each([
    'due ore',
    'Tre ore e mezza sulla programmazione di Mele',
    'un quarto d’ora',
    'un quarto d ora di assistenza chat',
    'tre quarti d’ora',
    'tre quarti',
    'venti minuti',
    'quarantacinque minuti sulla revisione video',
    'ventitré minuti',
    'trentotto minuti',
    'una ora',
    'un oretta su Rossetti',
    'giovedì dalle nove alle dieci e mezza assistenza chat Umberto Rossetti',
    'ieri sera dall’una alle due',
    'la revisione video di martedì su Umberto Rossetti era per Tiziano Mele',
    'erano su Moretti, non su Bellini',
    // more of the team's words (03/10/2026)
    'un’ora e venti',
    'un paio d’ore',
    'un paio di ore sulla programmazione',
    'una ventina di minuti',
    'inizia a contare il tempo',
    'parti col cronometro',
    'basta, ho finito',
    'quella di martedì va su Tiziano Mele',
  ])('scrive, detto a voce: %s', (testo) => {
    expect(conversazioneScrive([utente(testo)])).toBe(true)
  })

  it('«ho fatto la revisione video» → «quanto tempo?» → «due ore»: la risposta riporta la scrittura', () => {
    expect(conversazioneScrive([utente('Ho fatto la revisione video di Tiziano Mele')])).toBe(false)
    expect(
      conversazioneScrive([
        utente('Ho fatto la revisione video di Tiziano Mele'),
        alfire('Quanto tempo ci hai messo?'),
        utente('due ore'),
      ]),
    ).toBe(true)
  })

  it.each([
    'Quanto ho lavorato ieri?',
    'Quali task ho aperti?',
    'Quanto tempo ho fatto questa settimana?',
    'Su quali clienti lavoro?',
    'Quante ore ho fatto a settembre?',
    'Due domande: chi è il coach di Rossetti?',
    'Su cosa ho lavorato giovedì?',
  ])(
    'legge soltanto: %s',
    (testo) => {
      expect(conversazioneScrive([utente(testo)])).toBe(false)
    },
  )
})
