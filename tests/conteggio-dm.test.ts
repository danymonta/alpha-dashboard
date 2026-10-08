import { describe, expect, it } from 'vitest'

import {
  contaChat,
  contaGiornoDm,
  contieneLinkCall,
  giornoRoma,
  inizioGiornoRoma,
  normalizzaUsername,
  type ChatDm,
  type MessaggioDm,
} from '@/lib/setting/conteggio-dm'

// Invented chats. October before the 25th: Rome is UTC+2, so 18:30 UTC is
// 20:30 in Rome. Instants written as Meta writes them ("+0000").
const D = '2026-10-07'
const LINK = 'https://calendly.com/danielemontagnolo/coaching-call'

function meta(utc: string) {
  return `${utc}:00+0000`
}
/** One of ours, at a UTC instant 'YYYY-MM-DDTHH:MM'. */
function n(utc: string, calendly = false): MessaggioDm {
  return { created_time: meta(utc), nostro: true, calendly }
}
/** One of the lead's. */
function l(utc: string, calendly = false): MessaggioDm {
  return { created_time: meta(utc), nostro: false, calendly }
}
function chat(messaggi: MessaggioDm[], extra: Partial<ChatDm> = {}): ChatDm {
  return { messaggi, letti: messaggi.length, ...extra }
}

describe('dm_outbound', () => {
  it('chat intera, primo messaggio nostro, inviato nel giorno', () => {
    expect(contaChat(chat([n('2026-10-07T08:00')]), D)).toMatchObject({ dm_outbound: 1, dm_inbound: 0, attiva: true })
  })

  it('il giorno prima non conta oggi, e oggi non conta il giorno prima', () => {
    const c = chat([n('2026-10-06T08:00'), n('2026-10-07T08:00')])
    expect(contaChat(c, D).dm_outbound).toBe(0)
    expect(contaChat(c, '2026-10-06').dm_outbound).toBe(1)
  })

  it('doppio messaggio di apertura nello stesso giorno: un outbound, nessun follow up', () => {
    expect(contaChat(chat([n('2026-10-07T08:00'), n('2026-10-07T08:01')]), D)).toMatchObject({
      dm_outbound: 1,
      follow_up: 0,
      conversazioni: 0,
    })
  })

  it('chat incompleta (20 messaggi letti): il primo messaggio non si conosce, niente outbound', () => {
    const c = chat([n('2026-10-07T08:00')], { letti: 20 })
    expect(contaChat(c, D)).toMatchObject({ dm_outbound: 0, incerta: true })
    // 19 letti: la chat è intera
    expect(contaChat({ ...c, letti: 19 }, D)).toMatchObject({ dm_outbound: 1, incerta: false })
  })
})

describe('dm_inbound', () => {
  it('apre il lead, la nostra prima risposta è nel giorno', () => {
    expect(contaChat(chat([l('2026-10-07T09:00'), n('2026-10-07T09:10')]), D)).toMatchObject({
      dm_inbound: 1,
      dm_outbound: 0,
      // la prima risposta a una chat inbound nuova è l'inbound, non una conversazione
      conversazioni: 0,
    })
  })

  it('inbound aperto il giorno prima con risposta il giorno dopo: conta nel giorno della risposta', () => {
    const c = chat([l('2026-10-06T20:00'), n('2026-10-07T07:00')])
    expect(contaChat(c, D).dm_inbound).toBe(1)
    expect(contaChat(c, '2026-10-06').dm_inbound).toBe(0)
  })

  it('più messaggi del lead prima della risposta: un inbound, nessuna conversazione', () => {
    const c = chat([l('2026-10-07T09:00'), l('2026-10-07T09:01'), l('2026-10-07T09:02'), n('2026-10-07T10:00')])
    expect(contaChat(c, D)).toMatchObject({ dm_inbound: 1, conversazioni: 0 })
  })

  it('il lead scrive e noi non rispondiamo: niente', () => {
    expect(contaChat(chat([l('2026-10-07T09:00')]), D)).toMatchObject({ dm_inbound: 0, attiva: true })
  })

  it('chat incompleta che inizia col lead: niente inbound', () => {
    expect(contaChat(chat([l('2026-10-07T09:00'), n('2026-10-07T09:10')], { letti: 20 }), D).dm_inbound).toBe(0)
  })
})

describe('follow_up', () => {
  it('un nostro messaggio subito dopo un nostro di un giorno precedente', () => {
    expect(contaChat(chat([n('2026-10-04T08:00'), n('2026-10-07T08:00')]), D)).toMatchObject({
      follow_up: 1,
      dm_outbound: 0,
    })
  })

  it('se il lead ha risposto in mezzo non è un follow up', () => {
    expect(contaChat(chat([n('2026-10-05T08:00'), l('2026-10-06T08:00'), n('2026-10-07T08:00')]), D)).toMatchObject({
      follow_up: 0,
      conversazioni: 1,
    })
  })

  it('al massimo uno per chat e per giorno', () => {
    const c = chat([n('2026-10-03T08:00'), n('2026-10-05T08:00'), n('2026-10-07T08:00'), n('2026-10-07T19:00')])
    expect(contaChat(c, D).follow_up).toBe(1)
    expect(contaChat(c, '2026-10-05').follow_up).toBe(1)
  })

  it('conta anche in una chat incompleta (non serve il primo messaggio)', () => {
    expect(contaChat(chat([n('2026-10-04T08:00'), n('2026-10-07T08:00')], { letti: 20 }), D).follow_up).toBe(1)
  })
})

describe('conversazioni', () => {
  it('risposta del lead la sera prima, nostra risposta dopo la mezzanotte', () => {
    // 21:50 UTC del 06/10 = 23:50 a Roma del 06/10; 22:10 UTC = 00:10 del 07/10
    const c = chat([n('2026-10-06T10:00'), l('2026-10-06T21:50'), n('2026-10-06T22:10')])
    expect(contaChat(c, D)).toMatchObject({ conversazioni: 1, follow_up: 0 })
    expect(contaChat(c, '2026-10-06').conversazioni).toBe(0)
  })

  it('la risposta del lead di due giorni prima non fa una conversazione oggi', () => {
    expect(contaChat(chat([n('2026-10-04T10:00'), l('2026-10-05T10:00'), n('2026-10-07T08:00')]), D).conversazioni).toBe(0)
  })

  it('il lead risponde con più messaggi di fila: è la sua risposta, conta', () => {
    const c = chat([n('2026-10-06T10:00'), l('2026-10-07T11:00'), l('2026-10-07T11:01'), n('2026-10-07T12:00')])
    expect(contaChat(c, D).conversazioni).toBe(1)
  })

  it('una volta sola per chat, anche con tanti scambi', () => {
    const c = chat([
      n('2026-10-07T08:00'),
      l('2026-10-07T08:05'),
      n('2026-10-07T08:10'),
      l('2026-10-07T08:15'),
      n('2026-10-07T08:20'),
    ])
    expect(contaChat(c, D)).toMatchObject({ dm_outbound: 1, conversazioni: 1 })
  })

  it('inbound: la seconda risposta nostra è una conversazione', () => {
    const c = chat([l('2026-10-07T08:00'), n('2026-10-07T08:05'), l('2026-10-07T08:10'), n('2026-10-07T08:20')])
    expect(contaChat(c, D)).toMatchObject({ dm_inbound: 1, conversazioni: 1 })
  })

  it("in una chat letta a metà, i messaggi del lead in testa non dicono a cosa rispondono", () => {
    expect(contaChat(chat([l('2026-10-07T08:00'), n('2026-10-07T08:05')], { letti: 20 }), D).conversazioni).toBe(0)
  })
})

describe('call_proposte', () => {
  it('un nostro messaggio col link della call nel giorno', () => {
    expect(contaChat(chat([n('2026-10-06T08:00'), l('2026-10-06T09:00'), n('2026-10-07T08:00', true)]), D).call_proposte).toBe(1)
  })

  it('il link mandato dal lead non conta', () => {
    expect(contaChat(chat([n('2026-10-06T08:00'), l('2026-10-07T09:00', true)]), D).call_proposte).toBe(0)
  })

  it('due link nella stessa chat: una call proposta', () => {
    expect(contaChat(chat([n('2026-10-07T08:00', true), n('2026-10-07T18:00', true)]), D).call_proposte).toBe(1)
  })

  it('il link del giorno prima non conta oggi', () => {
    expect(contaChat(chat([n('2026-10-06T08:00', true), l('2026-10-07T08:00')]), D).call_proposte).toBe(0)
  })

  it('riconosce il link di Dany, non un altro calendly', () => {
    expect(contieneLinkCall(`Ecco il link: ${LINK}`)).toBe(true)
    expect(contieneLinkCall('calendly.com/DanieleMontagnolo/30min')).toBe(true)
    expect(contieneLinkCall('https://calendly.com/altro-coach/call')).toBe(false)
    expect(contieneLinkCall(undefined)).toBe(false)
  })
})

describe('giorni a Roma', () => {
  it('ordine cronologico anche se Meta dà prima i più recenti', () => {
    const c = chat([n('2026-10-07T08:00'), l('2026-10-06T21:00'), n('2026-10-06T20:00')])
    expect(contaChat(c, D)).toMatchObject({ dm_outbound: 0, conversazioni: 1 })
    expect(contaChat(c, '2026-10-06').dm_outbound).toBe(1)
  })

  it("cambio dell'ora (25/10/2026): mezzanotte a Roma è alle 22 UTC prima, alle 23 UTC dopo", () => {
    expect(inizioGiornoRoma('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(inizioGiornoRoma('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(inizioGiornoRoma('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(inizioGiornoRoma('2026-03-30').toISOString()).toBe('2026-03-29T22:00:00.000Z')

    const giorno = '2026-10-25'
    // 23:59 del 24/10 (ora legale): non è del 25
    expect(contaChat(chat([n('2026-10-24T21:59')]), giorno).dm_outbound).toBe(0)
    // 00:30 del 25/10 (ancora ora legale)
    expect(contaChat(chat([n('2026-10-24T22:30')]), giorno).dm_outbound).toBe(1)
    // 23:59 del 25/10 (ora solare): ancora del 25, il giorno dura 25 ore
    expect(contaChat(chat([n('2026-10-25T22:59')]), giorno).dm_outbound).toBe(1)
    // 00:00 del 26/10
    expect(contaChat(chat([n('2026-10-25T23:00')]), giorno).dm_outbound).toBe(0)
    expect(giornoRoma('2026-10-25T23:00:00+0000')).toBe('2026-10-26')
  })

  it('un messaggio senza un istante valido non conta', () => {
    const c = chat([{ created_time: 'ieri', nostro: true, calendly: true }, l('2026-10-07T08:00')])
    expect(contaChat(c, D)).toMatchObject({ dm_outbound: 0, dm_inbound: 0, call_proposte: 0 })
    expect(giornoRoma('ieri')).toBeNull()
  })
})

describe('il giorno intero', () => {
  it('somma le chat, una volta per chat e per voce', () => {
    const chats: ChatDm[] = [
      chat([n('2026-10-07T08:00'), n('2026-10-07T08:01')]), // outbound
      chat([n('2026-10-07T09:00')], { username: 'marco_fit' }), // outbound
      chat([l('2026-10-06T20:00'), n('2026-10-07T07:00')]), // inbound
      chat([n('2026-10-02T08:00'), n('2026-10-07T10:00', true)], { letti: 20 }), // follow up, call, incerta
      chat([n('2026-10-06T10:00'), l('2026-10-06T21:50'), n('2026-10-07T06:00', true)]), // conversazione, call
      chat([n('2026-10-06T10:00'), l('2026-10-06T11:00')]), // niente nel giorno: non è tra le lette
    ]
    expect(contaGiornoDm(chats, D)).toEqual({
      dm_outbound: 2,
      dm_inbound: 1,
      follow_up: 1,
      conversazioni: 1,
      call_proposte: 2,
      chat_lette: 5,
      chat_incerte: 1,
    })
  })

  it('una chat letta fino al limite solo dopo il giorno è incerta: i suoi messaggi del giorno possono essere usciti dai 20', () => {
    const dopo = chat([n('2026-10-08T08:00'), l('2026-10-08T08:05')], { letti: 20 })
    expect(contaChat(dopo, D)).toMatchObject({ attiva: true, incerta: true, dm_outbound: 0 })
    expect(contaGiornoDm([dopo], D)).toMatchObject({ chat_lette: 1, chat_incerte: 1 })
    // intera, senza messaggi del giorno: non è del giorno
    expect(contaChat({ ...dopo, letti: 2 }, D)).toMatchObject({ attiva: false, incerta: false })
    // letta fino al limite ma solo prima del giorno: non è del giorno
    expect(contaChat(chat([n('2026-10-05T08:00')], { letti: 20 }), D).attiva).toBe(false)
  })

  it('una chat esclusa non conta mai, nemmeno tra le lette', () => {
    const chats: ChatDm[] = [
      chat([n('2026-10-07T08:00', true)], { username: '@Loris_Explore' }),
      chat([n('2026-10-07T08:00')], { username: 'gianni.prova', letti: 20 }),
    ]
    const esclusi = new Set(['loris_explore', 'gianni.prova'])
    expect(contaGiornoDm(chats, D, esclusi)).toEqual({
      dm_outbound: 0,
      dm_inbound: 0,
      follow_up: 0,
      conversazioni: 0,
      call_proposte: 0,
      chat_lette: 0,
      chat_incerte: 0,
    })
    // senza esclusioni contano
    expect(contaGiornoDm(chats, D)).toMatchObject({ dm_outbound: 1, call_proposte: 1, chat_lette: 2, chat_incerte: 1 })
  })

  it('nessuna chat: tutto a zero', () => {
    expect(contaGiornoDm([], D)).toEqual({
      dm_outbound: 0,
      dm_inbound: 0,
      follow_up: 0,
      conversazioni: 0,
      call_proposte: 0,
      chat_lette: 0,
      chat_incerte: 0,
    })
  })

  it('username come li tiene il database', () => {
    expect(normalizzaUsername(' @Marco_Fit ')).toBe('marco_fit')
    expect(normalizzaUsername('nome con spazi')).toBeNull()
    expect(normalizzaUsername(null)).toBeNull()
  })
})
