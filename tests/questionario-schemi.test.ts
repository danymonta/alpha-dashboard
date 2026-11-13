import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DOMANDE, SCHERMATE, domandeDi, rispostaInParole, schermataDi } from '@/lib/percorso/questionario'
import {
  CATTIVE_ABITUDINI,
  LIVELLI_ATTIVITA,
  MINUTI_GIORNO,
  OBBLIGATORIE,
  nomeFilePulito,
  preparaAllegatoSchema,
  risposteComplete,
  risposteMancanti,
  risposteValide,
  soloValide,
  type Risposte,
} from '@/lib/validation/questionario'

/*
 * The questionnaire (release B1b): the rule of the answers with the same examples as
 * supabase/tests/114_questionario.sql (onboarding_risposte_valide, _mancanti, _complete), the
 * questions and the options of Dany's Google form, no rule on the age.
 */

/** Every question answered, invented: pg_temp.completo() of the pgTAP. */
const COMPLETO: Risposte = {
  nome_cognome: 'Carla Centoquattordici',
  email: 'carla@example.test',
  telefono: '+39 333 000 0114',
  altezza_peso: { altezza: 168, peso: 61.5 },
  data_nascita: '1996-03-21',
  occupazione: 'Magazziniera',
  storia_allenamento: 'Nuoto da ragazza, poi niente',
  giorni_settimana: 3,
  minuti_giorno: '30_40',
  infortuni: 'Nessuno',
  attrezzatura: 'Una sbarra e due elastici',
  massimali: { piegamenti: 8, trazioni: 'non_lo_so', dip: 0 },
  esercizi_difficolta: 'Fatico con le trazioni, mi riescono gli squat',
  importanza_tecnica: 'Molto',
  ore_sonno: 'Sette',
  livello_attivita: 'attivo',
  organizzazione_giornata: 'Lavoro dalle 8 alle 17',
  seguito_alimentazione: 'no',
  conoscenza_alimentazione: 'Abbastanza',
  cattive_abitudini: { scelte: ['sonno', 'stimolanti'], altro: '' },
  obiettivo_principale: 'Fare la prima trazione',
  perche_noi: 'I video sul canale',
  obiettivi_3_6_mesi: 'Cinque trazioni',
  successo: 'Allenarmi con costanza',
  pronto: 'si',
  note: '',
}

const senza = (r: Record<string, unknown>, ...chiavi: string[]) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !chiavi.includes(k)))

describe('le risposte: le stesse regole di onboarding_risposte_valide', () => {
  it('nessuna risposta è valida (si sta ancora compilando)', () => {
    expect(risposteValide({})).toBe(true)
  })
  it('tutte le domande del modulo, risposte: complete', () => {
    expect(risposteComplete(COMPLETO)).toBe(true)
    expect(risposteMancanti(COMPLETO)).toEqual([])
  })
  it('una chiave che non è una domanda del modulo no', () => {
    expect(risposteValide({ peso_ideale: '70' })).toBe(false)
  })
  it('un elenco o null no', () => {
    expect(risposteValide([])).toBe(false)
    expect(risposteValide(null)).toBe(false)
  })
  it('una scelta fuori dalle opzioni del modulo no, quelle del modulo sì', () => {
    expect(risposteValide({ minuti_giorno: '45_60' })).toBe(false)
    expect(risposteValide({ minuti_giorno: '20_30' })).toBe(true)
    expect(risposteValide({ minuti_giorno: '90_120' })).toBe(true)
  })
  it('il livello si salva con la sua chiave, non con l’etichetta', () => {
    expect(risposteValide({ livello_attivita: 'Sedentario' })).toBe(false)
    expect(risposteValide({ livello_attivita: 'sedentario' })).toBe(true)
    expect(risposteValide({ livello_attivita: 'molto_attivo' })).toBe(true)
  })
  it('i giorni: un intero da 1 a 7', () => {
    expect(risposteValide({ giorni_settimana: 8 })).toBe(false)
    expect(risposteValide({ giorni_settimana: 2.5 })).toBe(false)
    expect(risposteValide({ giorni_settimana: '3' })).toBe(false)
    expect(risposteValide({ giorni_settimana: 1 })).toBe(true)
    expect(risposteValide({ giorni_settimana: 7 })).toBe(true)
  })
  it('altezza e peso nei loro intervalli', () => {
    expect(risposteValide({ altezza_peso: { altezza: 119 } })).toBe(false)
    expect(risposteValide({ altezza_peso: { peso: 76.55 } })).toBe(false)
    expect(risposteValide({ altezza_peso: { vita: 80 } })).toBe(false)
    expect(risposteValide({ altezza_peso: { altezza: 230, peso: 35 } })).toBe(true)
    expect(risposteValide({ altezza_peso: { altezza: 175, peso: 72.3 } })).toBe(true)
  })
  it('i massimali: un numero da 0 a 200 o «non lo so»', () => {
    expect(risposteValide({ massimali: { piegamenti: 'tanti' } })).toBe(false)
    expect(risposteValide({ massimali: { dip: 201 } })).toBe(false)
    expect(risposteValide({ massimali: { squat: 10 } })).toBe(false)
  })
  it('le cattive abitudini: senza ripetizioni, solo quelle del modulo', () => {
    expect(risposteValide({ cattive_abitudini: { scelte: ['fumo', 'fumo'] } })).toBe(false)
    expect(risposteValide({ cattive_abitudini: { scelte: ['zucchero'] } })).toBe(false)
  })
  it('sì e no: solo le chiavi', () => {
    expect(risposteValide({ seguito_alimentazione: 'forse' })).toBe(false)
    expect(risposteValide({ pronto: true })).toBe(false)
  })
  it('un testo oltre 2.000 caratteri no, 2.000 sì', () => {
    expect(risposteValide({ note: 'a'.repeat(2001) })).toBe(false)
    expect(risposteValide({ note: 'a'.repeat(2000) })).toBe(true)
  })
  it('un’email non valida no', () => {
    expect(risposteValide({ email: 'non è una email' })).toBe(false)
  })
  it('una data che non esiste o scritta in un altro modo no', () => {
    expect(risposteValide({ data_nascita: '2026-02-30' })).toBe(false)
    expect(risposteValide({ data_nascita: '21/03/1996' })).toBe(false)
  })
  it('nessun controllo sull’età: 16 anni o 76, il questionario si invia', () => {
    expect(risposteComplete({ ...COMPLETO, data_nascita: '2010-06-01' })).toBe(true)
    expect(risposteComplete({ ...COMPLETO, data_nascita: '1950-06-01' })).toBe(true)
  })
  it('cattive abitudini e note restano facoltative', () => {
    expect(risposteComplete(senza(COMPLETO, 'cattive_abitudini', 'note'))).toBe(true)
  })
  it('le domande che mancano, nell’ordine del questionario', () => {
    expect(risposteMancanti({ ...senza(COMPLETO, 'massimali'), telefono: '   ', pronto: null })).toEqual([
      'telefono',
      'massimali',
      'pronto',
    ])
  })
  it('altezza e peso vanno insieme', () => {
    expect(risposteMancanti({ ...COMPLETO, altezza_peso: { altezza: 170 } })).toEqual(['altezza_peso'])
  })
  it('soloValide tiene le risposte giuste e lascia quelle che non reggono', () => {
    expect(soloValide({ ...COMPLETO, email: 'mario@', peso_ideale: 70, giorni_settimana: 9 })).toEqual(
      senza(COMPLETO, 'email', 'giorni_settimana'),
    )
  })
})

describe('le domande del modulo Google', () => {
  it('le 26 domande, nell’ordine del modulo, in 4 schermate', () => {
    expect(DOMANDE).toHaveLength(26)
    expect(SCHERMATE.map((s) => s.titolo)).toEqual(['Chi sei', 'Allenamento', 'Stile di vita', 'Obiettivi'])
    expect(domandeDi(1).map((d) => d.chiave)).toEqual(['nome_cognome', 'email', 'telefono', 'altezza_peso', 'data_nascita', 'occupazione'])
    expect(domandeDi(2).map((d) => d.chiave)).toEqual([
      'storia_allenamento',
      'giorni_settimana',
      'minuti_giorno',
      'infortuni',
      'attrezzatura',
      'massimali',
      'esercizi_difficolta',
      'importanza_tecnica',
    ])
    expect(domandeDi(3).map((d) => d.chiave)).toEqual([
      'ore_sonno',
      'livello_attivita',
      'organizzazione_giornata',
      'seguito_alimentazione',
      'conoscenza_alimentazione',
      'cattive_abitudini',
    ])
    expect(domandeDi(4).map((d) => d.chiave)).toEqual([
      'obiettivo_principale',
      'perche_noi',
      'obiettivi_3_6_mesi',
      'successo',
      'pronto',
      'note',
    ])
  })

  it('i testi delle domande sono quelli del modulo, con i refusi corretti', () => {
    const testo = Object.fromEntries(DOMANDE.map((d) => [d.chiave, d.testo]))
    expect(testo.telefono).toBe('Numero di telefono (dove ti darò supporto 24/7) (Telegram)')
    expect(testo.altezza_peso).toBe('Altezza / Peso (a digiuno)')
    expect(testo.giorni_settimana).toBe('Quanti giorni a settimana puoi dedicare all’allenamento?')
    expect(testo.ore_sonno).toBe('Quante ore dormi al giorno circa?')
    expect(testo.cattive_abitudini).toBe('Quali cattive abitudini hai di quelle elencate qui sotto?')
    expect(testo.obiettivo_principale).toBe('Il tuo obiettivo N°1 (Più specifico sei e meglio è)')
    expect(testo.massimali).toBe('Massimo numero di ripetizioni nei seguenti esercizi: piegamenti, trazioni, dip')
    for (const t of Object.values(testo)) expect(t).not.toMatch(/Sedetario|abidutini|Quanto ore/)
  })

  it('le opzioni del modulo, una per valore salvato', () => {
    const opzioni = (chiave: string) => {
      const d = DOMANDE.find((x) => x.chiave === chiave)
      return d && 'opzioni' in d ? d.opzioni : []
    }
    expect(opzioni('giorni_settimana').map((o) => o.etichetta)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(opzioni('minuti_giorno').map((o) => o.valore)).toEqual([...MINUTI_GIORNO])
    expect(opzioni('minuti_giorno').map((o) => o.etichetta)).toEqual([
      '20-30 minuti',
      '30-40 minuti',
      '40-60 minuti',
      '60-90 minuti',
      '90-120 minuti',
    ])
    expect(opzioni('livello_attivita').map((o) => o.valore)).toEqual([...LIVELLI_ATTIVITA])
    expect(opzioni('livello_attivita').map((o) => o.etichetta)).toEqual(['Sedentario', 'Attivo', 'Molto attivo'])
    // label and detail together are the option of the form, word for word
    expect(opzioni('livello_attivita').map((o) => `${o.etichetta} ${o.dettaglio}`)).toEqual([
      'Sedentario (meno di 2h a settimana di esercizio fisico e/o meno di 10.000 passi al giorno)',
      'Attivo (meno di 5h a settimana di attività fisica e/o circa 10.000 passi al giorno)',
      'Molto attivo (più di 5h a settimana di esercizio fisico) ps: escluse le attività lavorative di routine',
    ])
    expect(opzioni('cattive_abitudini').map((o) => o.valore)).toEqual([...CATTIVE_ABITUDINI])
    expect(opzioni('cattive_abitudini').map((o) => o.etichetta)).toEqual([
      'Fumo',
      'Bere alcol',
      'Scarsa motivazione e autostima',
      'Abuso di stimolanti (caffeina, redbull, monster)',
      'Dormire meno di 6 ore a notte',
    ])
    expect(opzioni('pronto').map((o) => o.etichetta)).toEqual(['Sì', 'No'])
    expect(opzioni('seguito_alimentazione').map((o) => o.etichetta)).toEqual(['Sì', 'No'])
  })

  it('le obbligatorie sono le domande senza «facoltativa», e la migration ha le stesse chiavi', () => {
    expect(OBBLIGATORIE.map(([k]) => k)).toEqual(DOMANDE.filter((d) => !d.facoltativa).map((d) => d.chiave))
    const sql = readFileSync('supabase/migrations/20261109100000_questionario.sql', 'utf8')
    for (const d of DOMANDE) expect(sql).toContain(`'${d.chiave}'`)
  })

  it('nessuna domanda sull’età oltre alla data di nascita', () => {
    expect(DOMANDE.filter((d) => /età|anni/i.test(d.testo))).toEqual([])
  })

  it('la prima schermata con una risposta che manca', () => {
    expect(schermataDi(['pronto'])).toBe(4)
    expect(schermataDi(['massimali', 'pronto'])).toBe(2)
    expect(schermataDi([])).toBeNull()
  })

  it('le risposte in parole, come le legge l’admin', () => {
    const d = (k: string) => DOMANDE.find((x) => x.chiave === k)!
    expect(rispostaInParole(d('altezza_peso'), { altezza: 168, peso: 61.5 })).toBe('168 cm · 61,5 kg')
    expect(rispostaInParole(d('massimali'), { piegamenti: 8, trazioni: 'non_lo_so', dip: 0 })).toBe(
      'Piegamenti: 8 · Trazioni: non lo so · Dip: 0',
    )
    expect(rispostaInParole(d('livello_attivita'), 'attivo')).toBe('Attivo')
    expect(rispostaInParole(d('giorni_settimana'), 3)).toBe('3')
    expect(rispostaInParole(d('data_nascita'), '1996-03-21')).toBe('21/03/1996')
    expect(rispostaInParole(d('cattive_abitudini'), { scelte: ['fumo'], altro: 'Troppi dolci' })).toBe('Fumo · Troppi dolci')
    expect(rispostaInParole(d('note'), '   ')).toBeNull()
  })
})

describe('i file', () => {
  it('foto e PDF fino a 10 MB, nei tre campi', () => {
    expect(preparaAllegatoSchema.safeParse({ campo: 'attrezzatura', nome: 'sbarra.jpg', tipo: 'image/jpeg', byte: 1000 }).success).toBe(true)
    expect(preparaAllegatoSchema.safeParse({ campo: 'attrezzatura', nome: 'x.html', tipo: 'text/html', byte: 1000 }).success).toBe(false)
    expect(preparaAllegatoSchema.safeParse({ campo: 'foto_fisico', nome: 'x.jpg', tipo: 'image/jpeg', byte: 1000 }).success).toBe(false)
    expect(
      preparaAllegatoSchema.safeParse({ campo: 'piano_alimentare', nome: 'p.pdf', tipo: 'application/pdf', byte: 10 * 1024 * 1024 + 1 })
        .success,
    ).toBe(false)
    expect(preparaAllegatoSchema.safeParse({ campo: 'vecchia_scheda', nome: '../a.pdf', tipo: 'application/pdf', byte: 9 }).success).toBe(false)
  })
  it('il nome si pulisce: niente barre né caratteri di controllo, al massimo 120', () => {
    expect(nomeFilePulito('../cartella\\foto.jpg')).toBe('.. cartella foto.jpg')
    expect(nomeFilePulito('a\u0000b.pdf')).toBe('a b.pdf')
    const lungo = nomeFilePulito(`${'x'.repeat(200)}.pdf`)
    expect(lungo).toHaveLength(120)
    expect(lungo.endsWith('.pdf')).toBe(true)
  })
})
