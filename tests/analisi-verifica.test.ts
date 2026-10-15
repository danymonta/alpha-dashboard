import { describe, expect, it } from 'vitest'

import { paroleDaOscurare, paroleNormalizzate } from '@/lib/marketing/analisi/oscura'
import type { AnalisiModello, SchedaVisivaModello } from '@/lib/marketing/analisi/schema'
import { chiaveNome, LIMITI, verificaAnalisi, verificaScheda } from '@/lib/marketing/analisi/verifica'

// The strict layer and the final check of what Claude writes (1.36.0, D20): lengths cut and never refused,
// names, amounts and links out, labels turned into values, refs turned back into ids. Invented names.

const PAROLE = paroleDaOscurare(['Gustavo Rossiniello', '@gustavo.rossi81'])
const NIENTE = { parole: new Set<string>(), note: [] }
const CON_NOMI = { parole: PAROLE, note: [] }

function scheda(extra: Partial<SchedaVisivaModello> = {}): SchedaVisivaModello {
  return {
    sintesi_visiva: 'Un uomo spiega tre esercizi in cucina.',
    gancio: { livello: 'forte', cosa_si_vede: 'Mezzo busto.', parole: 'Niente sbarra? Nessun problema.', testo_a_schermo: 'ZERO ATTREZZI', perche: 'Promette subito.', alternativa: 'Ti basta un tavolo.' },
    sequenza: [
      { da: 0, a: 3, cosa_si_vede: 'Il gancio.', testo_a_schermo: null },
      { da: 3, a: 20, cosa_si_vede: 'Il primo esercizio.', testo_a_schermo: 'Il tavolo' },
      { da: 90, a: 95, cosa_si_vede: 'Fuori dal reel.', testo_a_schermo: null },
    ],
    ritmo: { livello: 'medio', osservazione: 'Scorre.', calo: { secondo: 14, cosa: 'La spiegazione si allunga.' } },
    testo_a_schermo: { leggibile: 'si', sopra_il_volto: false, osservazione: 'Si legge.' },
    cta: { presente: true, testo: 'Salva il video.', secondo: 38, osservazione: 'Tardi.', proposta: 'Salvalo stasera.' },
    produzione: { luce: 'buona', audio: 'chiaro', inquadratura: 'Fissa.', osservazione: 'Pulita.' },
    ambiente: ['casa', 'cucina', 'sbarra', 'esterno', 'palestra'],
    icp: { aderenza: 'alta', leve_usate: ['poco tempo'], leve_mancanti: ['la schiena'], frase_del_cliente: 'Non ho tempo.', rischio: null },
    script: { segue: 'si', differenze: 'Nessuna.' },
    classificazione: { reel_type: 'Education', format: 'Raw Talking Head' },
    ...extra,
  }
}

describe('verificaScheda', () => {
  it('i tratti fuori dal reel si scartano, i secondi si arrotondano, le etichette diventano valori', () => {
    const r = verificaScheda(scheda(), { durata: 42.5, collegato: true }, NIENTE)
    expect(r?.dati.sequenza.map((t) => [t.da, t.a])).toEqual([[0, 3], [3, 20]])
    expect(r?.dati.classificazione).toEqual({ reel_type: 'education', format: 'raw_talking_head' })
    expect(r?.dati.script).toEqual({ segue: 'si', differenze: 'Nessuna.' })
  })

  it('una etichetta che non è di Notion è null; lo script c’è solo se il reel è collegato; al massimo 4 ambienti', () => {
    const r = verificaScheda(scheda({ classificazione: { reel_type: 'Educazione', format: null } }), { durata: 42, collegato: false }, NIENTE)
    expect(r?.dati.classificazione).toEqual({ reel_type: null, format: null })
    expect(r?.dati.script).toBeNull()
    expect(r?.dati.ambiente).toHaveLength(4)
  })

  it('senza la durata nota i tratti restano; secondo del calo fuori dal reel è null', () => {
    const r = verificaScheda(scheda({ ritmo: { livello: 'medio', osservazione: 'x', calo: { secondo: 300, cosa: 'y' } } }), { durata: 42, collegato: true }, NIENTE)
    expect(r?.dati.ritmo.calo).toEqual({ secondo: null, cosa: 'y' })
    expect(verificaScheda(scheda(), { durata: null, collegato: true }, NIENTE)?.dati.sequenza).toHaveLength(3)
  })

  it('lunghezze tagliate, mai rifiutate; una scheda senza sintesi sì', () => {
    const lunga = 'a'.repeat(2000)
    const r = verificaScheda(scheda({ sintesi_visiva: lunga }), { durata: 42, collegato: true }, NIENTE)
    expect([...(r?.dati.sintesi_visiva ?? '')].length).toBe(LIMITI.sintesiVisiva)
    expect(r?.dati.sintesi_visiva.endsWith('…')).toBe(true)
    expect(verificaScheda(scheda({ sintesi_visiva: '   ' }), { durata: 42, collegato: true }, NIENTE)).toBeNull()
  })

  it('nomi e importi tolti da ogni testo, e contati', () => {
    const r = verificaScheda(
      scheda({ sintesi_visiva: 'Gustavo mostra un percorso da 1.500 €.', gancio: { ...scheda().gancio, perche: 'Guarda @gustavo.rossi81 — subito.' } }),
      { durata: 42, collegato: true },
      CON_NOMI,
    )
    expect(r?.dati.sintesi_visiva).toBe('un lead mostra un percorso da il prezzo.')
    expect(r?.dati.gancio.perche).toBe('Guarda un account, subito.')
    expect(r?.conteggi.nomi).toBe(1)
    expect(r?.conteggi.handle).toBe(1)
    expect(r?.conteggi.importi).toBe(1)
    expect(r?.conteggi.trattini).toBe(1)
  })
})

function analisi(extra: Partial<AnalisiModello> = {}): AnalisiModello {
  return {
    perche_verdetto: 'Views ×1,4 della mediana.',
    sintesi: 'Un reel chiaro.',
    cosa_ha_funzionato: ['Gancio chiaro.', 'Testo leggibile.', 'Esempi in casa.', 'Luce buona.', 'Quinta voce da tagliare.'],
    da_migliorare: [
      { cosa: 'Bassa.', come: 'Poco.', priorita: 'bassa' },
      { cosa: 'Alta.', come: 'Molto.', priorita: 'alta' },
      { cosa: 'Media.', come: 'Così.', priorita: 'media' },
    ],
    dai_lead: null,
    collegamento: null,
    idee: [1, 2, 3].map((n) => ({
      tipo: 'seguito' as const,
      name: `Idea numero ${n}`,
      reel_type: 'Education',
      format: 'Split',
      gancio: 'Uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici',
      messaggio: 'Il messaggio.',
      script: { hook: 'Un gancio', righe: ['Riga 1', 'Riga 2'], cta: 'Salvalo' },
      perche: 'Perché sì.',
    })),
    ...extra,
  }
}

const CONTESTO = { candidati: [{ ref: 'C1', contenuto_id: 'id-uno' }, { ref: 'C2', contenuto_id: 'id-due' }], idee: { quante: 2, tipo: 'seguito' as const }, nomiInCalendario: new Set<string>() }

describe('verificaAnalisi', () => {
  it('tronca il numero (4 voci, 5 miglioramenti, le idee chieste) e mette prima le priorità alte', () => {
    const r = verificaAnalisi(analisi(), CONTESTO, NIENTE)
    expect(r?.dati.cosa_ha_funzionato).toHaveLength(4)
    expect(r?.dati.da_migliorare.map((x) => x.priorita)).toEqual(['alta', 'media', 'bassa'])
    expect(r?.dati.idee).toHaveLength(2)
  })

  it('le etichette diventano valori, il gancio è di al massimo 12 parole', () => {
    const r = verificaAnalisi(analisi(), CONTESTO, NIENTE)
    expect(r?.dati.idee[0]).toMatchObject({ reel_type: 'education', format: 'split' })
    expect(r?.dati.idee[0].gancio.split(' ')).toHaveLength(12)
  })

  it('un Format che non è di Notion scarta l’idea; un Reel Type no; il Format null resta', () => {
    const r = verificaAnalisi(
      analisi({ idee: [{ ...analisi().idee[0], format: 'Formato Inventato' }, { ...analisi().idee[1], reel_type: 'Boh' }, { ...analisi().idee[2], format: null }] }),
      { ...CONTESTO, idee: { quante: 3, tipo: 'seguito' } },
      NIENTE,
    )
    expect(r?.dati.idee.map((i) => i.name)).toEqual(['Idea numero 3'])
    expect(r?.dati.idee[0].format).toBeNull()
  })

  it('un’idea già in calendario (stesso Name senza accenti né maiuscole) si scarta; due uguali nella stessa risposta una sola', () => {
    const r = verificaAnalisi(
      analisi({ idee: [analisi().idee[0], { ...analisi().idee[0], name: 'IDEA NUMERO 1' }, analisi().idee[1]] }),
      { ...CONTESTO, idee: { quante: 3, tipo: 'seguito' }, nomiInCalendario: new Set([chiaveNome('Idea numero 2')]) },
      NIENTE,
    )
    expect(r?.dati.idee.map((i) => i.name)).toEqual(['Idea numero 1'])
  })

  it('il collegamento: solo un ref mandato, tradotto nell’id; uno inventato no', () => {
    const buono = verificaAnalisi(analisi({ collegamento: { ref: 'C2', sicurezza: 'alta', perche: 'Lo script corrisponde.' } }), CONTESTO, NIENTE)
    expect(buono?.dati.collegamento).toEqual({ contenuto_id: 'id-due', sicurezza: 'alta', perche: 'Lo script corrisponde.' })
    const falso = verificaAnalisi(analisi({ collegamento: { ref: 'C9', sicurezza: 'alta', perche: 'Mai mandato.' } }), CONTESTO, NIENTE)
    expect(falso?.dati.collegamento).toBeNull()
    const senzaMotivo = verificaAnalisi(analisi({ collegamento: { ref: 'C1', sicurezza: 'bassa', perche: '   ' } }), CONTESTO, NIENTE)
    expect(senzaMotivo?.dati.collegamento).toBeNull()
  })

  it('senza sintesi e senza idee fallisce; solo le idee o solo la sintesi no', () => {
    expect(verificaAnalisi(analisi({ sintesi: ' ', idee: [] }), CONTESTO, NIENTE)).toBeNull()
    expect(verificaAnalisi(analisi({ sintesi: ' ' }), CONTESTO, NIENTE)?.dati.idee).toHaveLength(2)
    expect(verificaAnalisi(analisi({ idee: [] }), CONTESTO, NIENTE)?.dati.sintesi).toBe('Un reel chiaro.')
  })

  it('nomi, handle, importi e link tolti anche dalle idee', () => {
    const r = verificaAnalisi(
      analisi({
        sintesi: 'Gustavo ha scritto.',
        idee: [{ ...analisi().idee[0], perche: 'Lo chiede @gustavo.rossi81 per 99 euro, vedi https://esempio.test/a' }],
      }),
      CONTESTO,
      CON_NOMI,
    )
    expect(r?.dati.sintesi).toBe('un lead ha scritto.')
    expect(r?.dati.idee[0].perche).toBe('Lo chiede un account per il prezzo, vedi')
  })

  it('con le note del team: una voce che copia 8 parole di una nota si toglie; senza le note no', () => {
    const nota = paroleNormalizzate('Molti non hanno tempo la sera perché tornano tardi dal lavoro')
    const copiata = analisi({ cosa_ha_funzionato: ['Il gancio funziona.', 'Molti non hanno tempo la sera perché tornano tardi dal lavoro e basta'] })
    const con = verificaAnalisi(copiata, CONTESTO, { parole: new Set(), note: [nota] })
    expect(con?.dati.cosa_ha_funzionato).toEqual(['Il gancio funziona.'])
    expect(con?.scartate).toBe(1)
    const senza = verificaAnalisi(copiata, CONTESTO, NIENTE)
    expect(senza?.dati.cosa_ha_funzionato).toHaveLength(2)
  })

  it('i trattini lunghi e medi diventano virgole in ogni testo', () => {
    const r = verificaAnalisi(analisi({ sintesi: 'Funziona — e anche molto – bene.' }), CONTESTO, NIENTE)
    expect(r?.dati.sintesi).toBe('Funziona, e anche molto, bene.')
  })
})
