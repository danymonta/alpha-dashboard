import { describe, expect, it } from 'vitest'

import type { PunteggioModello } from '@/lib/marketing/punteggio/schema'
import { PESI, type TipoPunteggio } from '@/lib/marketing/punteggio/tabelle'
import {
  citazioneTrovata,
  contaParole,
  flagDelCodice,
  normalizza,
  senzaElenchi,
  senzaEmoji,
  verificaPunteggio,
  type ContestoPunteggio,
  type FontiPunteggio,
} from '@/lib/marketing/punteggio/verifica'

// The strict layer and the final check of the score: pure, no network.

const PARLATO = 'Niente sbarra? Nessun problema. Ti faccio vedere tre modi per allenare la schiena con quello che hai in casa.\nIl primo è il tavolo. Salva il video e provalo stasera.'
const FONTI: FontiPunteggio = { parlato: PARLATO, didascalia: 'Scrivimi METODO.', testoSchermo: ['ZERO ATTREZZI'] }
const CONTESTO: ContestoPunteggio = { tipoDichiarato: 'mof', durataSecondi: 42 }
const OPZIONI = { parole: new Set(['loris']), note: [] as string[][] }

function modello(extra: Partial<PunteggioModello> = {}, tipo: TipoPunteggio = 'mof'): PunteggioModello {
  return {
    tipo: tipo === 'tof' ? 'REEL_TOF' : tipo === 'bof' ? 'REEL_BOF' : 'REEL_MOF',
    motivo_classificazione: 'Insegna tre modi.',
    hook: { testo: 'Niente sbarra? Nessun problema.', cita_icp: true, categoria: 'Educational' },
    criteri: PESI[tipo].map((v) => ({
      id: v.id,
      voto: 8,
      citazione: 'Ti faccio vedere tre modi per allenare la schiena',
      motivazione: 'Promessa mantenuta.',
      correzione: 'Nessuna.',
    })),
    penalita: [],
    violazioni_formali: [],
    segnalazioni: [],
    punti_di_forza: ['Parte subito.'],
    problemi_prioritari: [{ criterio: 'H', problema: 'Non dice il risultato.' }],
    confronto_benchmark: null,
    rifacimento: {
      istruzioni: ['Aprire col risultato.'],
      hook_alternativi: [
        { testo: 'Schiena forte senza sbarra, con tre oggetti.', categoria: 'Educational', perche_funziona: 'Dice il risultato.' },
        { testo: 'Se lavori seduto, la schiena si allena così.', categoria: 'Domanda', perche_funziona: 'Chiama in causa l’ICP.' },
        { testo: 'Il tavolo batte la sbarra, ecco perché.', categoria: 'Mito', perche_funziona: 'Smonta un mito.' },
      ],
      script_riscritto: 'Hook: Schiena forte senza sbarra. (Dany al tavolo)\nBody: Il primo è il tavolo.\nCTA: Provalo stasera.',
      caption_riscritta: 'Scrivimi METODO.',
      punteggio_atteso: 90,
    },
    ...extra,
  }
}

function esegui(m: PunteggioModello, f: Partial<FontiPunteggio> = {}, c: Partial<ContestoPunteggio> = {}) {
  return verificaPunteggio(m, { ...FONTI, ...f }, { ...CONTESTO, ...c }, OPZIONI)
}

describe('le citazioni', () => {
  const fonte = normalizza(PARLATO)
  it('letterali, senza badare a maiuscole, accenti e punteggiatura', () => {
    expect(citazioneTrovata('NIENTE SBARRA Nessun problema', fonte)).toBe(true)
    expect(citazioneTrovata('il primo e il tavolo', fonte)).toBe(true)
    expect(citazioneTrovata('provalo stasera', fonte)).toBe(true)
  })
  it('a cavallo di due righe', () => {
    expect(citazioneTrovata('quello che hai in casa. Il primo è il tavolo', fonte)).toBe(true)
  })
  it('con i puntini: ogni pezzo deve esserci', () => {
    expect(citazioneTrovata('Ti faccio vedere … in casa', fonte)).toBe(true)
    expect(citazioneTrovata('Ti faccio vedere ... un pezzo che non c’è', fonte)).toBe(false)
  })
  it('una frase inventata o vuota no', () => {
    expect(citazioneTrovata('Una frase che nel reel non esiste', fonte)).toBe(false)
    expect(citazioneTrovata('', fonte)).toBe(false)
    expect(citazioneTrovata('…', fonte)).toBe(false)
  })
})

describe('il punteggio', () => {
  it('i numeri li calcola il codice dai voti e dalle tabelle del tipo', () => {
    const r = esegui(modello())!
    expect(r.dati.tipo).toBe('mof')
    expect(r.dati.tipo_origine).toBe('dichiarato')
    expect(r.dati.criteri.map((c) => c.id)).toEqual(PESI.mof.map((v) => v.id))
    // everything 8, CF 10: 98 x 0.8 + 2 = 80.4
    expect(r.dati.totale_grezzo).toBe(80.4)
    expect(r.dati.totale).toBe(80)
    expect(r.dati.fascia).toBe('pubblicare_dopo_ritocchi')
    expect(r.dati.criteri.find((c) => c.id === 'CF')).toMatchObject({ voto_modello: 8, voto: 10 })
  })

  it('il tipo dichiarato dal calendario vince su quello di Claude; senza, vale il suo (dedotto)', () => {
    const dichiarato = esegui(modello({}, 'mof'), {}, { tipoDichiarato: 'tof' })
    // the answer carries the MOF criteria: the TOF ones are missing, so it cannot become a score
    expect(dichiarato).toBeNull()
    const tof = esegui(modello({}, 'tof'), {}, { tipoDichiarato: 'tof' })!
    expect(tof.dati.tipo).toBe('tof')
    const dedotto = esegui(modello({}, 'bof'), {}, { tipoDichiarato: null })!
    expect(dedotto.dati.tipo).toBe('bof')
    expect(dedotto.dati.tipo_origine).toBe('dedotto')
  })

  it('un criterio mancante o un tipo che non c’è: la risposta non diventa un punteggio', () => {
    const m = modello()
    expect(esegui({ ...m, criteri: m.criteri.slice(1) })).toBeNull()
    expect(esegui({ ...m, tipo: 'STORY_DIRETTA' }, {}, { tipoDichiarato: null })).toBeNull()
  })

  it('una citazione che non è nel contenuto cade, il criterio resta «citazione non trovata»', () => {
    const m = modello()
    m.criteri[0].citazione = 'Una frase che nel reel non esiste'
    const r = esegui(m)!
    expect(r.dati.criteri[0]).toMatchObject({ id: 'H', citazione: null, citazione_trovata: false, voto: 8 })
    expect(r.dati.criteri[1].citazione_trovata).toBe(true)
    expect(r.dati.criteri[1].citazione).toBe('Ti faccio vedere tre modi per allenare la schiena')
  })

  it('una citazione vuota poggia su un’assenza: nessuna citazione, ma non è «non trovata»', () => {
    const m = modello()
    m.criteri[7].citazione = ''
    expect(esegui(m)!.dati.criteri[7]).toMatchObject({ citazione: null, citazione_trovata: true })
  })
})

describe('le penalità', () => {
  it('il trattino lungo, l’emoji e la frase vietata li vede il codice, qualunque cosa dica Claude', () => {
    const f = { parlato: 'Non è solo fisico. È sicurezza personale. Una cosa — due cose 💪', didascalia: '' }
    const r = esegui(modello(), f)!
    expect(r.dati.penalita.map((p) => p.flag).sort()).toEqual(['EMOJI', 'EM_DASH', 'FRASE_VIETATA'])
    expect(r.dati.penalita.every((p) => p.da === 'codice')).toBe(true)
    expect(r.dati.penalita_totali).toBe(-23)
    expect(r.dati.violazioni_formali).toBe(3)
    expect(r.dati.criteri.find((c) => c.id === 'CF')!.voto).toBe(4)
    // 80.4 - 23 = 57: the cap of 80 for three formal violations does not bind here (tabelle.test.ts has the case where it does)
    expect(r.dati.limiti_applicati).toEqual([])
  })

  it('un flag di Claude con la riga nel contenuto vale; senza la riga cade; NO_CTA_BOF non ha riga', () => {
    const m = modello({
      penalita: [
        { flag: 'GERGO', riga: 'tiri il petto verso l’alto' },
        { flag: 'PROMESSA_IRREALISTICA', riga: 'Risultati garantiti in sette giorni' },
      ],
    })
    const r = esegui(m, { parlato: PARLATO + ' tiri il petto verso l’alto' })!
    expect(r.dati.penalita.map((p) => p.flag)).toEqual(['GERGO'])
    expect(r.dati.penalita[0]).toMatchObject({ valore: -3, da: 'claude', riga: 'tiri il petto verso l’alto' })
    expect(r.scartate).toBeGreaterThanOrEqual(1)

    const bof = modello({ penalita: [{ flag: 'NO_CTA_BOF', riga: '' }] }, 'bof')
    const e = esegui(bof, {}, { tipoDichiarato: 'bof' })!
    expect(e.dati.penalita).toEqual([expect.objectContaining({ flag: 'NO_CTA_BOF', valore: -10 })])
    expect(e.dati.criteri.find((c) => c.id === 'CT')!.voto).toBe(2)
  })

  it('i flag del codice che Claude prova a dare da solo non entrano senza una prova nel testo', () => {
    const m = modello({ penalita: [{ flag: 'EM_DASH' as never, riga: 'qualcosa' }, { flag: 'HARD_CTA_TOF', riga: 'Salva il video' }] })
    const r = esegui(m)!
    expect(r.dati.penalita).toEqual([])
  })

  it('la lunghezza: oltre il 30% sopra il limite del tipo', () => {
    expect(flagDelCodice(FONTI, { tipoDichiarato: null, durataSecondi: 78 }, 'mof')).toEqual([])
    expect(flagDelCodice(FONTI, { tipoDichiarato: null, durataSecondi: 79 }, 'mof').map((x) => x.flag)).toEqual(['LUNGHEZZA_ECCESSIVA'])
    expect(flagDelCodice(FONTI, { tipoDichiarato: null, durataSecondi: 100 }, 'tof')).toEqual([])
    expect(flagDelCodice(FONTI, { tipoDichiarato: null, durataSecondi: 118 }, 'tof').map((x) => x.flag)).toEqual(['LUNGHEZZA_ECCESSIVA'])
    expect(flagDelCodice(FONTI, { tipoDichiarato: null, durataSecondi: null }, 'mof')).toEqual([])
  })

  it('le altre violazioni formali contano solo con la loro riga nel contenuto', () => {
    const m = modello({ violazioni_formali: [{ descrizione: 'Usa la parola prezzo', riga: 'Ti faccio vedere tre modi' }, { descrizione: 'x', riga: 'non c’è' }] })
    const r = esegui(m)!
    expect(r.dati.violazioni_formali).toBe(1)
    expect(r.dati.altre_violazioni_formali).toHaveLength(1)
    expect(r.dati.criteri.find((c) => c.id === 'CF')!.voto).toBe(8)
  })
})

describe('l’hook', () => {
  it('le parole le conta il codice: oltre 15 il voto è al massimo 5', () => {
    const lungo = 'uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici'
    const r = esegui(modello({ hook: { testo: lungo, cita_icp: true, categoria: 'Shock' } }))!
    expect(r.dati.hook.parole).toBe(16)
    expect(r.dati.criteri[0]).toMatchObject({ id: 'H', voto_modello: 8, voto: 5 })
  })
  it('senza posta in gioco dell’ICP al massimo 6', () => {
    const r = esegui(modello({ hook: { testo: 'Ciao ragazzi', cita_icp: false, categoria: 'Shock' } }))!
    expect(r.dati.criteri[0].voto).toBe(6)
  })
  it('un hook non scritto: le prime parole del parlato', () => {
    const r = esegui(modello({ hook: { testo: '', cita_icp: true, categoria: 'Shock' } }))!
    expect(r.dati.hook.parole).toBe(12)
  })
  it('contaParole', () => {
    expect(contaParole('  Niente   sbarra? — Nessun problema. ')).toBe(4)
    expect(contaParole('')).toBe(0)
  })
})

describe('le priorità', () => {
  it('l’impatto lo calcola il codice (i punti che restano), in ordine; un criterio a 10 non è un problema', () => {
    const m = modello({
      problemi_prioritari: [
        { criterio: 'H', problema: 'L’hook.' },
        { criterio: 'EV', problema: 'Il valore.' },
        { criterio: 'CF', problema: 'La forma.' },
        { criterio: 'EV', problema: 'Ancora il valore.' },
        { criterio: 'ST', problema: 'Un criterio che nel MOF non c’è.' },
      ],
    })
    const r = esegui(m)!
    expect(r.dati.problemi_prioritari.map((p) => [p.ordine, p.criterio, p.impatto_punti])).toEqual([
      [1, 'EV', 5],
      [2, 'H', 4],
    ])
  })
})

describe('il rifacimento', () => {
  it('gli hook alternativi: meno di 10 parole, di una categoria della guida, al massimo 3', () => {
    const m = modello()
    m.rifacimento.hook_alternativi[1].testo = 'Uno due tre quattro cinque sei sette otto nove dieci undici dodici'
    m.rifacimento.hook_alternativi[2].categoria = 'Inventata'
    const r = esegui(m)!
    expect(r.dati.rifacimento.hook_alternativi.map((h) => h.testo)).toEqual(['Schiena forte senza sbarra, con tre oggetti.'])
    expect(r.scartate).toBe(2)
  })
  it('nove parole vanno, dieci no', () => {
    const m = modello()
    m.rifacimento.hook_alternativi = [
      { testo: 'Uno due tre quattro cinque sei sette otto nove', categoria: 'Shock', perche_funziona: 'x' },
      { testo: 'Uno due tre quattro cinque sei sette otto nove dieci', categoria: 'Shock', perche_funziona: 'x' },
    ]
    expect(esegui(m)!.dati.rifacimento.hook_alternativi).toHaveLength(1)
  })
  it('lo script: niente elenchi puntati, niente emoji, niente trattini lunghi, niente cifre di denaro', () => {
    const m = modello()
    m.rifacimento.script_riscritto = 'Hook: forte — davvero 💪\n- primo punto\n* secondo punto\nBody: costa 1.500 € al mese.\nCTA: provalo.'
    const r = esegui(m)!
    const s = r.dati.rifacimento.script_riscritto
    expect(s).not.toMatch(/[–—]/)
    expect(s).not.toMatch(/💪/u)
    expect(s).not.toMatch(/^\s*[-*•]\s/m)
    expect(s).not.toMatch(/€|\d\.\d{3}/)
    expect(s).toContain('primo punto')
    expect(s.split('\n')).toHaveLength(5)
    expect(r.conteggi.trattini).toBeGreaterThan(0)
    expect(r.conteggi.importi).toBe(1)
  })
  it('i nomi del team o dei lead non passano', () => {
    const m = modello()
    m.criteri[0].motivazione = 'Come ha detto Loris, funziona.'
    expect(esegui(m)!.dati.criteri[0].motivazione).toBe('Come ha detto un lead, funziona.')
  })
  it('il punteggio atteso: mai sotto l’attuale, mai sopra quello che si può guadagnare', () => {
    const basso = esegui(modello({ rifacimento: { ...modello().rifacimento, punteggio_atteso: 10 } }))!
    expect(basso.dati.rifacimento.punteggio_atteso).toBe(basso.dati.totale)
    const alto = esegui(modello({ rifacimento: { ...modello().rifacimento, punteggio_atteso: 500 } }))!
    expect(alto.dati.rifacimento.punteggio_atteso).toBe(100)
    const pieno = modello()
    pieno.criteri.forEach((c) => (c.voto = 10))
    pieno.rifacimento.punteggio_atteso = 500
    expect(esegui(pieno)!.dati.rifacimento.punteggio_atteso).toBe(100)
  })
})

describe('le segnalazioni', () => {
  it('senza caption: «Caption non valutata» e la Caption vale 5', () => {
    const r = esegui(modello(), { didascalia: '' })!
    expect(r.dati.segnalazioni).toContain('Caption non valutata')
    expect(r.dati.criteri.find((c) => c.id === 'CA')!.voto).toBe(5)
  })
  it('numero da verificare e classificazione dubbia, con la nota', () => {
    const r = esegui(
      modello({ segnalazioni: [{ tipo: 'NUMERO_INCOERENTE', nota: 'Dice 90 kg invece di 85.' }, { tipo: 'CLASSIFICAZIONE_DUBBIA', nota: '' }, { tipo: 'INVENTATA' as never, nota: 'x' }] }),
    )!
    expect(r.dati.segnalazioni).toEqual(['Numero da verificare: Dice 90 kg invece di 85.', 'Classificazione dubbia'])
  })
})

describe('piccole funzioni', () => {
  it('senzaEmoji e senzaElenchi', () => {
    expect(senzaEmoji('forte 💪🔥 e basta ✅')).toBe('forte  e basta ')
    expect(senzaEmoji('1° e à, ì')).toBe('1° e à, ì')
    expect(senzaElenchi('- a\n  * b\n• c\nd - e')).toBe('a\nb\nc\nd - e')
  })
})
