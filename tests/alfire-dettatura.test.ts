import { describe, expect, it } from 'vitest'

import {
  INTERVALLO_PARZIALE_MS,
  avvisoTrascrizione,
  dopoParziale,
  serveParziale,
  sospendeParziali,
  unisciTesto,
  type StatoParziali,
} from '@/lib/alfire/dettatura'

const inizio: StatoParziali = { ultimoInvio: 0, pezziInviati: 0, inVolo: false, sospesi: false, falliti: 0 }

describe('testo in diretta mentre si detta: quando parte una trascrizione parziale', () => {
  it('circa ogni 2 secondi, con almeno un secondo nuovo di audio', () => {
    // one piece a second: at 1 s too early, at 2 s the first partial
    expect(serveParziale(inizio, 1000, 1)).toBe(false)
    expect(serveParziale(inizio, INTERVALLO_PARZIALE_MS, 2)).toBe(true)
    const dopoIlPrimo = { ...inizio, ultimoInvio: 2000, pezziInviati: 2 }
    expect(serveParziale(dopoIlPrimo, 3000, 3)).toBe(false)
    expect(serveParziale(dopoIlPrimo, 4000, 4)).toBe(true)
  })

  it('mai due insieme: finché una è in volo si aspetta', () => {
    expect(serveParziale({ ...inizio, inVolo: true }, 10_000, 10)).toBe(false)
  })

  it('niente audio nuovo, niente richiesta', () => {
    expect(serveParziale({ ...inizio, ultimoInvio: 2000, pezziInviati: 4 }, 9000, 4)).toBe(false)
  })

  it('un browser che non dà pezzi prima dello stop non manda parziali: resta il vocale di sempre', () => {
    expect(serveParziale(inizio, 60_000, 0)).toBe(false)
  })

  it('dopo un limite raggiunto, per quel vocale basta parziali: il testo finale ha la precedenza', () => {
    expect(serveParziale({ ...inizio, sospesi: true }, 10_000, 10)).toBe(false)
    for (const s of [401, 413, 429, 503]) expect(sospendeParziali(s), String(s)).toBe(true)
    // a single failure does not stop the live text
    for (const s of [400, 422, 500, 502]) expect(sospendeParziali(s), String(s)).toBe(false)
  })
})

describe('testo in diretta: dopo la risposta di una parziale', () => {
  const inVolo = { ...inizio, inVolo: true }

  it('un 429 ferma subito le parziali di quel vocale', () => {
    const dopo = dopoParziale(inVolo, 429)
    expect(dopo).toMatchObject({ inVolo: false, sospesi: true })
    expect(serveParziale(dopo, 60_000, 60)).toBe(false)
  })

  it('un errore qualsiasi si salta, due di fila fermano le parziali (audio che il fornitore non legge)', () => {
    const uno = dopoParziale(inVolo, 502)
    expect(uno).toMatchObject({ inVolo: false, sospesi: false, falliti: 1 })
    const due = dopoParziale({ ...uno, inVolo: true }, 502)
    expect(due).toMatchObject({ sospesi: true, falliti: 2 })
    // the network down counts the same
    expect(dopoParziale(dopoParziale(inVolo, null), null).sospesi).toBe(true)
  })

  it('una parziale riuscita azzera il conto: errori sparsi non fermano il testo in diretta', () => {
    let stato = dopoParziale(inVolo, 502)
    stato = dopoParziale(stato, 200)
    expect(stato).toMatchObject({ falliti: 0, sospesi: false })
    stato = dopoParziale(stato, 500)
    expect(stato).toMatchObject({ falliti: 1, sospesi: false })
  })

  it('una volta ferme restano ferme, anche se poi una risposta va bene', () => {
    expect(dopoParziale({ ...inizio, sospesi: true }, 200).sospesi).toBe(true)
  })
})

describe('testo in diretta: se la trascrizione finale non riesce', () => {
  it('con testo in diretta nella casella l’avviso dice che può mancare la fine', () => {
    const avviso = avvisoTrascrizione('Limite gratuito della voce raggiunto. Riprova tra poco o scrivi.', true)
    expect(avviso).toMatch(/^Limite gratuito della voce raggiunto\./)
    expect(avviso).toMatch(/solo il testo in diretta, forse incompleto: controllalo prima di inviarlo\.$/)
  })

  it('senza testo in diretta resta l’avviso di sempre', () => {
    expect(avvisoTrascrizione('Trascrizione non riuscita. Riprova.', false)).toBe('Trascrizione non riuscita. Riprova.')
  })
})

describe('testo in diretta: cosa c’è nella casella', () => {
  it('quello che era già scritto resta, il dettato va dopo', () => {
    expect(unisciTesto('Domanda:', 'quanto ho incassato?')).toBe('Domanda: quanto ho incassato?')
    expect(unisciTesto('Domanda:  ', ' quanto ho incassato? ')).toBe('Domanda: quanto ho incassato?')
    expect(unisciTesto('', 'quanto ho incassato?')).toBe('quanto ho incassato?')
    expect(unisciTesto('   ', 'quanto')).toBe('quanto')
  })

  it('il testo finale sostituisce quello in diretta: si parte sempre da ciò che c’era prima del tocco', () => {
    const prima = 'Domanda:'
    const inDiretta = unisciTesto(prima, 'Quanto ho')
    const finale = unisciTesto(prima, 'Quanto ho incassato questo mese?')
    expect(inDiretta).toBe('Domanda: Quanto ho')
    expect(finale).toBe('Domanda: Quanto ho incassato questo mese?')
    expect(finale.match(/Quanto/g)).toHaveLength(1)
  })

  it('una parziale vuota (silenzio all’inizio) lascia la casella com’era', () => {
    expect(unisciTesto('Domanda:', '')).toBe('Domanda:')
    expect(unisciTesto('Domanda:', '   ')).toBe('Domanda:')
  })
})
