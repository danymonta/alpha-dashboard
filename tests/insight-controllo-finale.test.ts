import { describe, expect, it } from 'vitest'

import type { SchedaSalvata } from '@/lib/insight/contratti'
import {
  applicaCorrezioni,
  CALENDLY,
  controllaMessaggio,
  daCorreggere,
  linkEstranei,
  messaggioNonMostrato,
  MOTIVI_SICUREZZA,
  normalizzaMessaggio,
  oscuraNomi,
  VIOLAZIONI_STILE,
} from '@/lib/insight/controllo-finale'

// The final check of every suggested message (1.35.0). Invented texts only.

const lead = { dove: 'lead' as const }

describe('normalizations', () => {
  it('the long and medium dash become a comma, between digits a hyphen', () => {
    expect(normalizzaMessaggio('Ciao — come va – tutto bene').testo).toBe('Ciao, come va, tutto bene')
    expect(normalizzaMessaggio('Dai 5–10 minuti').testo).toBe('Dai 5-10 minuti')
  })

  it('«fammi un attimo» becomes «dammi un attimo», with its capital', () => {
    expect(normalizzaMessaggio('Fammi un attimo e ti scrivo').testo).toBe('Dammi un attimo e ti scrivo')
    expect(normalizzaMessaggio('ok fammi un attimo').testo).toBe('ok dammi un attimo')
  })

  it('a new line after every sentence, never inside the Calendly link', () => {
    expect(normalizzaMessaggio('Grazie. Ti scrivo dopo! A presto 🤝').testo).toBe('Grazie.\nTi scrivo dopo!\nA presto 🤝')
    expect(normalizzaMessaggio(`Ecco il link: ${CALENDLY}. Fammi sapere`).testo).toContain(CALENDLY)
    expect(normalizzaMessaggio('Grazie. 💪').testo).toBe('Grazie. 💪')
    expect(normalizzaMessaggio('Grazie. 💪 Ci vediamo').testo).toBe('Grazie.\n💪 Ci vediamo')
  })

  it('counts what it changed', () => {
    expect(normalizzaMessaggio('Ciao — ok').normalizzazioni).toBe(1)
    expect(normalizzaMessaggio('Ciao').normalizzazioni).toBe(0)
  })
})

describe('safety: the message is removed', () => {
  it('a link other than the Calendly', () => {
    expect(controllaMessaggio('Guarda qui: https://esempio.test/offerta', lead).sicurezza).toBe(MOTIVI_SICUREZZA.link)
    expect(controllaMessaggio('Scrivimi su www.altrosito.it', lead).sicurezza).toBe(MOTIVI_SICUREZZA.link)
    expect(controllaMessaggio('Vai su esempio.com/x', lead).sicurezza).toBe(MOTIVI_SICUREZZA.link)
    expect(controllaMessaggio(`Ecco il link: ${CALENDLY}`, lead).sicurezza).toBeNull()
    expect(linkEstranei(`${CALENDLY}/ e calendly.com/danielemontagnolo/coaching-call.`)).toEqual([])
    expect(linkEstranei('https://calendly.com/altro/call')).toEqual(['https://calendly.com/altro/call'])
  })

  it('a price, from the ICP or anywhere else', () => {
    expect(controllaMessaggio('Il percorso costa 1.500 € in tutto', lead).sicurezza).toBe(MOTIVI_SICUREZZA.prezzo)
    expect(controllaMessaggio('Sono 300 euro al mese', lead).sicurezza).toBe(MOTIVI_SICUREZZA.prezzo)
  })

  const qualifica =
    'Visto che hai 16 anni, una cosa importante prima di andare avanti.\nIl percorso 1-1 con me è un investimento di 100 euro al mese, con un piano di allenamento personalizzato fatto da me per arrivare a mettere massa.\nÈ una cosa che potresti valutare insieme ai tuoi genitori?'

  it('«100 euro al mese» passes only in the qualification of a minor between 14 and 17 (C6)', () => {
    expect(controllaMessaggio(qualifica, { dove: 'lead', fascia_eta: '14_17' }).sicurezza).toBeNull()
    expect(controllaMessaggio(qualifica, { dove: 'lead', fascia_eta: 'maggiorenne' }).sicurezza).toBe(MOTIVI_SICUREZZA.prezzo)
    expect(controllaMessaggio(qualifica, { dove: 'lead', fascia_eta: 'ignota' }).sicurezza).toBe(MOTIVI_SICUREZZA.prezzo)
  })

  it('a price of the ICP never passes, not even for a minor (N10)', () => {
    expect(controllaMessaggio(`${qualifica}\nIn tutto sono 1.500 €.`, { dove: 'lead', fascia_eta: '14_17' }).sicurezza).toBe(MOTIVI_SICUREZZA.prezzo)
  })

  it('any proposal to a lead under 14', () => {
    expect(controllaMessaggio('Fissiamo una videochiamata?', { dove: 'lead', fascia_eta: 'sotto_14' }).sicurezza).toBe(MOTIVI_SICUREZZA.minore)
    expect(controllaMessaggio('Grazie per avermi scritto!\nTi lascio i miei contenuti gratuiti 💪', { dove: 'lead', fascia_eta: 'sotto_14' }).sicurezza).toBeNull()
  })

  it('the sentence the card shows', () => {
    expect(messaggioNonMostrato(MOTIVI_SICUREZZA.link)).toBe('Messaggio non mostrato: link diverso dal Calendly. Scrivilo a mano.')
  })
})

describe('style: sent back once, then «Da ricontrollare»', () => {
  const stile = (t: string, c = lead) => controllaMessaggio(t, c).stile

  it('Dany in the third person, but «Sono Dany» is fine', () => {
    expect(stile('Dany ti risponde domani')).toContain(VIOLAZIONI_STILE.terzaPersona)
    expect(stile('Sono Dany, faccio il coach')).not.toContain(VIOLAZIONI_STILE.terzaPersona)
  })

  it('more than one question, except a second one that asks the age', () => {
    expect(stile('Che obiettivo hai? Ti alleni già?')).toContain(VIOLAZIONI_STILE.domande)
    expect(stile('Che obiettivo stai cercando di raggiungere?\nE mi diresti anche quanti anni hai?')).toEqual([])
    expect(stile('Ti andrebbe?')).toEqual([])
  })

  it('the Calendly and «Ti andrebbe?» together, «Capito» as opener, «60 minuti», «oggi o domani»', () => {
    expect(stile(`Ti andrebbe? ${CALENDLY}`)).toContain(VIOLAZIONI_STILE.calendlyEPitch)
    expect(stile('Capito, allora ti dico')).toContain(VIOLAZIONI_STILE.capito)
    expect(stile('La call dura 60 minuti')).toContain(VIOLAZIONI_STILE.sessantaMinuti)
    expect(stile('Fissiamo una videochiamata oggi o domani')).toContain(VIOLAZIONI_STILE.oggiODomani)
  })

  it('a time of day: never to a lead without a call; in the agenda and with a booked call it is fine', () => {
    expect(stile('Ci sentiamo alle 18')).toContain(VIOLAZIONI_STILE.orario)
    expect(stile('Ci vediamo alle 18:30', { dove: 'agenda' } as never)).toEqual([])
    expect(stile('Ci vediamo alle 18:30', { dove: 'lead', conCall: true } as never)).toEqual([])
  })

  it('an empty message is nothing to check', () => {
    expect(controllaMessaggio('  ', lead)).toEqual({ testo: '', sicurezza: null, stile: [], normalizzazioni: 0 })
  })
})

describe('names out of the content', () => {
  it('usernames and profile names become «un lead», whole words, any case, with or without @', () => {
    expect(oscuraNomi('Come dice @marco_inventato e anche Marco Inventato', ['marco_inventato', 'Marco Inventato'])).toBe(
      'Come dice un lead e anche un lead',
    )
    expect(oscuraNomi('Il tema marcone resta', ['marco'])).toBe('Il tema marcone resta')
    expect(oscuraNomi('Ugo dice ciao', ['Ugo'])).toBe('Ugo dice ciao')
  })
})

describe('the correction step', () => {
  const carta = (chiave: string, dati: Record<string, unknown>, tipo: SchedaSalvata['tipo'] = 'lead'): SchedaSalvata => ({ tipo, chiave, impronta: 'x'.repeat(64), dati })

  it('sends back only style violations, never the unsafe messages', () => {
    const schede = [
      carta('conv-1', { tipo: 'lead', suggested_message: 'Che obiettivo hai? Ti alleni già?', suggested_message_alt: '', objection: { text: '', suggested_reply: '' }, stage: 'obiettivi' }),
      carta('conv-2', { tipo: 'lead', suggested_message: 'Guarda https://esempio.test', suggested_message_alt: '', objection: { text: '', suggested_reply: '' } }),
      carta('call-1', { status: 'confermata', note: '', suggested_message: 'Dany ti aspetta alle 18' }, 'agenda'),
      carta('conv-3', { tipo: 'non_lead', reason: 'spam' }),
    ]
    const testi = daCorreggere(schede)
    expect(testi.map((t) => [t.tipo, t.chiave, t.campo])).toEqual([
      ['lead', 'conv-1', 'suggested_message'],
      ['agenda', 'call-1', 'agenda'],
    ])
    expect(testi[0].violazioni).toEqual([VIOLAZIONI_STILE.domande])
  })

  it('puts the corrected texts back on their cards', () => {
    const schede = [
      carta('conv-1', { tipo: 'lead', suggested_message: 'A? B?', objection: { text: 'tempo', suggested_reply: 'R? S?' } }),
      carta('call-1', { suggested_message: 'x' }, 'agenda'),
    ]
    const corrette = applicaCorrezioni(schede, [
      { tipo: 'lead', chiave: 'conv-1', campo: 'suggested_message', testo: 'A?' },
      { tipo: 'lead', chiave: 'conv-1', campo: 'suggested_reply', testo: 'R?' },
      { tipo: 'agenda', chiave: 'call-1', campo: 'agenda', testo: 'y' },
    ])
    expect(corrette[0].dati).toMatchObject({ suggested_message: 'A?', objection: { text: 'tempo', suggested_reply: 'R?' } })
    expect(corrette[1].dati).toMatchObject({ suggested_message: 'y' })
    expect(schede[0].dati).toMatchObject({ suggested_message: 'A? B?' })
  })
})
