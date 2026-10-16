import { describe, expect, it } from 'vitest'

import type { AnalisiCallModello } from '@/lib/call/analisi/schema'
import { paroleDiNote, verificaAnalisiCall, type ContestoVerifica } from '@/lib/call/analisi/verifica'
import { paroleDaOscurare } from '@/lib/marketing/analisi/oscura'

function modello(extra: Partial<AnalisiCallModello> = {}): AnalisiCallModello {
  return {
    riassunto: 'Il lead lavora molto e ha poco tempo la sera.',
    esito_letto: 'follow_up',
    lead: {
      in_target: 'si', segnali: [{ testo: 'Racconta un passato sportivo', verso: 'in_target' }],
      punto_a: 'Si vede lontano dalla forma di un tempo.', punto_b: 'Tornare fit.',
      pain: ['maglia', 'giudizio', 'eta', 'altro'], desideri: ['fit_non_grosso'], gia_provato: ['palestra'],
      frasi: ['Ho dato priorità assoluta al lavoro e non ho avuto più tempo per niente di tutto il resto della mia vita quotidiana'],
      minorenne: false,
    },
    obiezioni: [
      { categoria: 'prezzo_cassa', sintesi: 'Pesa il costo.', gestita: 'si', risposta: 'Flusso mese per mese.', minuto: '21:10', momento: 'chiusura' },
      { categoria: 'condizioni_personali', sintesi: 'Descrive la sua situazione.', gestita: 'no', risposta: null, minuto: '99:00', momento: 'subito' },
    ],
    domande: ['Quanto tempo serve?'],
    convinto_da: ['La storia di Dany'],
    motivo_proposto: 'Deve decidere con la compagna.',
    setting: { sapeva: ['percorso_a_casa', 'percorso_a_casa'], sorprese: ['Non pensava servisse una sbarra', 'Pensava costasse 3000 euro'], spunti_setter: ['Chiedi le sere libere.'] },
    prossimi_passi: [{ cosa: 'Sentire la compagna', quando: 'giovedì', chi: 'lead' }],
    momenti: [{ minuto: '21:10', etichetta: 'obiezione' }, { minuto: '58:00', etichetta: 'decisione' }],
    performance: { criteri: { scoperta: 'si', obiettivo: 'si', presentazione: 'in_parte', obiezioni: 'si', chiusura: 'no' }, perche: ['a', 'b'], funzionato: [], da_provare: [] },
    spunti_contenuto: [{ idea: 'Sera in 40 minuti', perche: 'Il tempo torna' }],
    ...extra,
  }
}

const contesto = (extra: Partial<ContestoVerifica> = {}): ContestoVerifica => ({
  esito: 'follow_up', durataSecondi: 1800, parole: paroleDaOscurare(['Marco Gentili', '@marco_r']), note: [], quotaParlato: 0.42, ...extra,
})

describe('strato rigido', () => {
  it('tronca le lunghezze e i conteggi, non rifiuta', () => {
    const r = verificaAnalisiCall(modello({ riassunto: 'x'.repeat(2000) }), contesto())
    expect(r.ok && r.dati.riassunto.length).toBe(700)
    expect(r.ok && r.dati.lead.pain).toHaveLength(3)
    expect(r.ok && r.dati.lead.frasi[0].split(' ').length).toBeLessThanOrEqual(20)
  })
  it('un minuto oltre la durata se ne va, uno dentro resta', () => {
    const r = verificaAnalisiCall(modello(), contesto())
    if (!r.ok) throw new Error('no')
    expect(r.dati.momenti).toEqual([{ minuto: '21:10', etichetta: 'obiezione' }])
    expect(r.dati.obiezioni.map((o) => o.minuto)).toEqual(['21:10', null])
  })
  it('il motivo proposto solo se la call non ha chiuso, «convinto da» solo se ha chiuso', () => {
    const nonChiusa = verificaAnalisiCall(modello(), contesto({ esito: 'follow_up' }))
    expect(nonChiusa.ok && nonChiusa.dati.motivo_proposto).toBe('Deve decidere con la compagna.')
    expect(nonChiusa.ok && nonChiusa.dati.convinto_da).toEqual([])
    const chiusa = verificaAnalisiCall(modello(), contesto({ esito: 'chiusa' }))
    expect(chiusa.ok && chiusa.dati.motivo_proposto).toBeNull()
    expect(chiusa.ok && chiusa.dati.convinto_da).toEqual(['La storia di Dany'])
  })
  it('senza riassunto fallisce', () => {
    expect(verificaAnalisiCall(modello({ riassunto: '   ' }), contesto())).toEqual({ ok: false, motivo: 'senza_riassunto' })
  })
  it('il livello lo calcola il codice e la quota di parlato viene dal codice', () => {
    const r = verificaAnalisiCall(modello(), contesto())
    expect(r.ok && r.dati.valutazione.livello_proposto).toBe('discreta')
    expect(r.ok && r.dati.valutazione.quota_parlato).toBe(0.42)
  })
  it('un lead minorenne si segnala', () => {
    const m = modello()
    m.lead.minorenne = true
    const r = verificaAnalisiCall(m, contesto())
    expect(r.ok && r.minorenne).toBe(true)
  })
})

describe('controllo finale', () => {
  it('nomi, handle, link e importi', () => {
    const r = verificaAnalisiCall(
      modello({ riassunto: 'Marco Gentili (@marco_r) costa 1.500 € e vuole http://esempio.test/x tornare in forma.' }),
      contesto(),
    )
    if (!r.ok) throw new Error('no')
    expect(r.dati.riassunto).not.toMatch(/Marco|Gentili|@marco|1\.500|http/)
    expect(r.dati.riassunto).toContain('il prezzo')
    expect(r.conteggi.nomi + r.conteggi.handle).toBeGreaterThan(0)
  })
  it('la voce che parla di salute esce intera, la frase del riassunto anche', () => {
    const r = verificaAnalisiCall(
      modello({
        riassunto: 'Il lead lavora molto. Ha un’ernia al disco. Vuole tornare in forma.',
        domande: ['Quanto tempo serve?', 'Posso allenarmi con l’ernia?'],
        lead: { ...modello().lead, segnali: [{ testo: 'Fa controlli medici', verso: 'in_target' }, { testo: 'Parla di emozioni', verso: 'in_target' }] },
      }),
      contesto(),
    )
    if (!r.ok) throw new Error('no')
    expect(r.dati.riassunto).toBe('Il lead lavora molto. Vuole tornare in forma.')
    expect(r.dati.domande).toEqual(['Quanto tempo serve?'])
    expect(r.dati.lead.segnali.map((s) => s.testo)).toEqual(['Parla di emozioni'])
    expect(r.conteggi.salute).toBe(3)
  })
  it('«pectus» e «petto incavato» in un testo sulla persona diventano «il petto»', () => {
    const r = verificaAnalisiCall(modello({ riassunto: 'Teme il pectus e il petto incavato.', domande: ['Il petto incavato migliora?'] }), contesto())
    if (!r.ok) throw new Error('no')
    expect(r.dati.riassunto).toBe('Teme il petto e il petto.')
    expect(r.dati.domande).toEqual(['Il petto migliora?'])
  })
  it('otto parole di fila copiate dalle note tolgono la voce', () => {
    const nota = 'Deve decidere insieme alla compagna e ha poco tempo la sera'
    const r = verificaAnalisiCall(modello({ domande: ['Deve decidere insieme alla compagna e ha poco tempo la sera', 'Altro'] }), contesto({ note: paroleDiNote([nota]) }))
    if (!r.ok) throw new Error('no')
    expect(r.dati.domande).toEqual(['Altro'])
    expect(r.conteggi.copie).toBe(1)
  })
  it('il trattino lungo diventa una virgola', () => {
    const r = verificaAnalisiCall(modello({ riassunto: 'Lavora molto — poco tempo.' }), contesto())
    expect(r.ok && r.dati.riassunto).toBe('Lavora molto, poco tempo.')
  })
})

describe('quello che legge il setter: il lead, nessuna cifra', () => {
  it('niente cifre, «condizioni personali» senza sintesi, doppioni tolti', () => {
    const r = verificaAnalisiCall(modello(), contesto())
    if (!r.ok) throw new Error('no')
    // an amount is out («il prezzo», no figure); a surprise with a digit would be out as well
    expect(r.dati.setter.sorprese).toEqual(['Non pensava servisse una sbarra', 'Pensava costasse il prezzo'])
    expect(r.dati.setter.sapeva).toEqual(['percorso_a_casa'])
    expect(r.dati.setter.obiezioni).toEqual([
      { categoria: 'prezzo_cassa', sintesi: 'Pesa il costo.' },
      { categoria: 'condizioni_personali', sintesi: null },
    ])
  })
  it('gli spunti per il setter sono a parte, mai nella valutazione del closer', () => {
    const r = verificaAnalisiCall(modello(), contesto())
    if (!r.ok) throw new Error('no')
    expect(r.dati.spunti_setter).toEqual(['Chiedi le sere libere.'])
    expect(JSON.stringify(r.dati.valutazione)).not.toContain('sere libere')
    expect(JSON.stringify(r.dati.setter)).not.toContain('sere libere')
  })
})
