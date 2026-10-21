import { describe, expect, it } from 'vitest'

import {
  STATI_VISTA,
  avanzamentoPercorso,
  etichettaPercorsoVendita,
  ordinaElenco,
  prossimaRata,
  testoMetodi,
  testoMeseSettimana,
  testoPercorso,
  testoRata,
  testoRatePagate,
  vistaDa,
  type RataElenco,
  type RigaElenco,
} from '@/lib/clienti/elenco'

const rata = (numero: number, stato: RataElenco['stato'], scadenza: string, extra: Partial<RataElenco> = {}): RataElenco => ({
  numero,
  scadenza,
  importo_previsto: 500,
  stato,
  incassato_il: null,
  importo_incassato: null,
  metodo: null,
  in_ritardo: false,
  ...extra,
})

function riga(extra: Partial<RigaElenco> = {}): RigaElenco {
  return {
    client_id: 'c1',
    nome: 'Mario',
    cognome: 'Rossi',
    stato: 'attivo',
    sale_id: 's1',
    prodotto: 'Percorso Alpha 6 mesi',
    tipo: 'nuovo',
    numero_percorso: 1,
    data_inizio: '2026-09-01',
    data_fine: '2027-02-28',
    mese: 2,
    mesi_totali: 6,
    settimana: 8,
    settimane_totali: 26,
    valore_contratto: 1500,
    incassato: 500,
    da_incassare: 1000,
    in_ritardo: 0,
    rate_totali: 3,
    rate_incassate: 1,
    prossima_scadenza: '2026-11-01',
    prossimo_importo: 500,
    metodi: ['bonifico'],
    contratto_url: null,
    cartella_url: null,
    ltv: 1500,
    sospeso_il: null,
    chiuso_il: null,
    rate: [],
    ...extra,
  }
}

describe('Clienti: le schede e gli stati che elencano', () => {
  it('attivi sono attivo, in scadenza e da iniziare; sospesi e chiusi uno stato solo', () => {
    expect(STATI_VISTA.attivi).toEqual(['attivo', 'in_scadenza', 'da_iniziare'])
    expect(STATI_VISTA.sospesi).toEqual(['sospeso'])
    // an ex cliente (archived) stays among the filters of «Tutti»
    expect(STATI_VISTA.chiusi).toEqual(['chiuso'])
  })

  it('senza ?vista= si apre «Attivi»; un vecchio link con lo stato o la ricerca è «Tutti»', () => {
    expect(vistaDa(undefined)).toBe('attivi')
    expect(vistaDa('sospesi')).toBe('sospesi')
    expect(vistaDa('chiusi')).toBe('chiusi')
    expect(vistaDa('tutti')).toBe('tutti')
    expect(vistaDa('boh')).toBe('attivi')
    expect(vistaDa(undefined, 'ex_cliente')).toBe('tutti')
    expect(vistaDa(undefined, undefined, 'rossi')).toBe('tutti')
    // the card named wins over the old parameters
    expect(vistaDa('attivi', 'ex_cliente')).toBe('attivi')
  })
})

describe('Clienti: le parole del percorso', () => {
  it('«Mese 2 di 6 · Settimana 8 di 26»; senza mese (percorso non iniziato) niente', () => {
    expect(testoMeseSettimana(riga())).toBe('Mese 2 di 6 · Settimana 8 di 26')
    expect(testoMeseSettimana(riga({ mese: null, settimana: null }))).toBeNull()
  })

  it('un percorso in corso dice mese, settimana e fino a quando, con la barra', () => {
    const t = testoPercorso(riga(), '2026-10-21')
    expect(t.principale).toBe('Mese 2 di 6 · Settimana 8 di 26')
    expect(t.dettaglio).toBe('Fino al 28/02/2027')
    expect(t.avanzamento).toBeGreaterThan(0.2)
    expect(t.avanzamento).toBeLessThan(0.3)
  })

  it('un percorso che non è iniziato dice quando inizia, senza barra', () => {
    const t = testoPercorso(riga({ stato: 'da_iniziare', data_inizio: '2026-11-12', mese: null, settimana: null }), '2026-10-21')
    expect(t.principale).toBe('Inizia il 12/11/2026')
    expect(t.avanzamento).toBeNull()
  })

  it('un chiuso dice il giorno della chiusura, senza barra', () => {
    const t = testoPercorso(riga({ stato: 'chiuso', chiuso_il: '2026-10-04' }), '2026-10-21')
    expect(t.principale).toBe('Chiuso il 04/10/2026')
    expect(t.dettaglio).toBe('Percorso: fino al 28/02/2027')
    expect(t.avanzamento).toBeNull()
  })

  it('un percorso finito dice «Finito il»', () => {
    expect(testoPercorso(riga({ data_fine: '2026-10-01' }), '2026-10-21').dettaglio).toBe('Finito il 01/10/2026')
  })

  it('l’avanzamento va da 0 a 1 e non esce mai', () => {
    const r = { data_inizio: '2026-10-01', data_fine: '2026-10-10' }
    expect(avanzamentoPercorso(r, '2026-09-20')).toBe(0)
    expect(avanzamentoPercorso(r, '2026-10-05')).toBe(0.5)
    expect(avanzamentoPercorso(r, '2026-12-01')).toBe(1)
  })

  it('l’etichetta della vendita ha le parole dello storico', () => {
    expect(etichettaPercorsoVendita('nuovo', 1)).toBe('Primo percorso')
    expect(etichettaPercorsoVendita('nuovo', 2)).toBe('Nuovo percorso')
    expect(etichettaPercorsoVendita('rinnovo', 2)).toBe('Rinnovo 1')
    expect(etichettaPercorsoVendita('rinnovo', 3)).toBe('Rinnovo 2')
    expect(etichettaPercorsoVendita('rinnovo', 1)).toBe('Rinnovo')
    expect(etichettaPercorsoVendita('upsell', 2)).toBe('Upsell')
  })
})

describe('Clienti: come paga e le rate da saldare', () => {
  it('i metodi nelle parole dell’app, senza ripetizioni e senza niente se non ha pagato', () => {
    expect(testoMetodi(['bonifico', 'stripe'])).toBe('Bonifico, Stripe')
    expect(testoMetodi([])).toBeNull()
  })

  it('«1 di 3 rate pagate», il pagamento unico e il tutto pagato', () => {
    expect(testoRatePagate({ rate_totali: 3, rate_incassate: 1 })).toBe('1 di 3 rate pagate')
    expect(testoRatePagate({ rate_totali: 3, rate_incassate: 3 })).toBe('Tutte le 3 rate pagate')
    expect(testoRatePagate({ rate_totali: 1, rate_incassate: 0 })).toBe('Pagamento unico')
    expect(testoRatePagate({ rate_totali: 1, rate_incassate: 1 })).toBe('Pagamento unico pagato')
  })

  it('la prossima rata è la prima da incassare per scadenza, anche una fallita; niente se è tutto pagato', () => {
    const rate = [
      rata(1, 'incassata', '2026-09-01', { incassato_il: '2026-09-01', importo_incassato: 500, metodo: 'bonifico' }),
      rata(3, 'prevista', '2026-11-01'),
      rata(2, 'fallita', '2026-10-01'),
    ]
    expect(prossimaRata({ rate })?.numero).toBe(2)
    expect(prossimaRata({ rate: [rate[0]] })).toBeNull()
    expect(testoRata({ numero: 2 }, 3)).toBe('Rata 2 di 3')
  })
})

describe('Clienti: l’ordine di ogni scheda', () => {
  const a = riga({ client_id: 'a', nome: 'Anna', cognome: 'Verdi', data_fine: '2027-01-31', sospeso_il: '2026-10-01', chiuso_il: '2026-09-01' })
  const b = riga({ client_id: 'b', nome: 'Bruno', cognome: 'Neri', data_fine: '2026-11-15', sospeso_il: '2026-10-15', chiuso_il: '2026-10-10' })
  const c = riga({ client_id: 'c', nome: 'Carla', cognome: 'Bianchi', data_fine: '2026-11-15', sospeso_il: null, chiuso_il: null })

  it('gli attivi: chi finisce prima in alto, a parità per nome', () => {
    // b and c end the same day: Bruno before Carla
    expect(ordinaElenco([a, b, c], 'attivi').map((r) => r.client_id)).toEqual(['b', 'c', 'a'])
  })

  it('i sospesi: la sospensione più recente in alto, senza data in fondo', () => {
    expect(ordinaElenco([a, b, c], 'sospesi').map((r) => r.client_id)).toEqual(['b', 'a', 'c'])
  })

  it('i chiusi: la chiusura più recente in alto', () => {
    expect(ordinaElenco([a, b, c], 'chiusi').map((r) => r.client_id)).toEqual(['b', 'a', 'c'])
  })

  it('non cambia l’elenco ricevuto', () => {
    const originale = [a, b, c]
    ordinaElenco(originale, 'attivi')
    expect(originale.map((r) => r.client_id)).toEqual(['a', 'b', 'c'])
  })
})
