import { describe, expect, it } from 'vitest'

import { chiaveNome } from '@/lib/marketing/analisi/verifica'
import { preparaFonti } from '@/lib/marketing/spunti/fonti'

const GREZZO = {
  periodo: 'dal 15/09 al 12/10/2026',
  settimana: 'dal 06/10 al 12/10/2026',
  note_team: true,
  reel: [{ ref: 'R1', pubblicato: '03/10', name: 'Reel con Marco Gentili', reel_type: 'education', format: 'show_and_tell', gancio: 'Ho 40 minuti', verdetto: 'spingere', sintesi: 'Funziona', cosa_ha_funzionato: ['Gancio concreto'], aderenza_icp: 'alta', lead_dm: 3, lead_in_target: 2 }],
  dm: { temi: [{ ref: 'D1', tema: 'Poco tempo la sera', quanti: 7, in_target: 6, con_call: 2, tendenza: 'in_aumento' }, { ref: 'D2', tema: 'Ha un’ernia al disco', quanti: 3, in_target: 1, con_call: 0, tendenza: 'stabile' }] },
  setter: { scale: { lead_in_target: 'circa_meta' }, note: [
    { ref: 'S1', quando: 'questa_settimana', domanda: 'cosa frenava', testo: 'Marco Gentili non ha tempo. Ha un’ernia.', k: 'g1' },
    { ref: 'S2', quando: 'prima', domanda: 'cosa frenava', testo: 'Ha un’ernia al disco', k: 'g2' },
  ] },
  closer: { motivi: [{ ref: 'K1', quando: 'prima', esito: 'persa', qualificata: true, motivo: 'Prezzo di 1.500 € alto', note: null, k: 'c1' }] },
  call: { analisi: [{ ref: 'C1', quando: 'prima', chiusa: false, k: 'c1', in_target: 'si', arriva_da: null,
    obiezioni: [{ categoria: 'condizioni_personali', sintesi: 'SENTINELLA-CONDIZIONI' }, { categoria: 'tempo', sintesi: 'Poco tempo' }],
    pain: ['maglia'], desideri: ['fit_non_grosso'], gia_provato: ['palestra'], domande: ['Basta una sbarra?'], sapeva: ['percorso_a_casa'], sorprese: [], spunti_contenuto: [{ idea: 'Sera in 40 minuti', perche: 'Il tempo' }] }] },
  in_calendario: [{ name: 'Idea già presa', modello: 'reel', reel_type: 'education', format: null, status: 'not_started' }],
  fatti: [{ ref: 'F1', testo: 'Reel del 03/10: 3 lead dai DM, 2 in target' }],
  da_oscurare: ['marco gentili'],
}

describe('preparaFonti', () => {
  const f = preparaFonti(GREZZO, chiaveNome)
  const testo = JSON.stringify(f.perClaude)

  it('nomi e importi fuori, etichette italiane al posto dei valori', () => {
    expect(testo).not.toMatch(/Gentili|Marco/)
    expect(testo).not.toContain('1.500')
    expect(testo).toContain('Education')
    expect(testo).toContain('Show&Tell')
    expect(testo).not.toContain('"education"')
    expect(testo).toContain('Togliersi la maglia davanti agli altri')
    expect(testo).toContain('Tempo')
  })
  it('i nomi delle etichette sono quelli di adesso: una creata dalla persona arriva col suo nome, una sparita no', () => {
    const grezzo = {
      ...GREZZO,
      reel: [{ ...GREZZO.reel[0], reel_type: 'case_study', format: 'meme_sparito' }],
      in_calendario: [{ ...GREZZO.in_calendario[0], reel_type: 'education', format: 'meme' }],
    }
    const nomi = { reel_type: { case_study: 'Case study', education: 'Educational' }, formato: { meme: 'Meme' } }
    const g = preparaFonti(grezzo, chiaveNome, nomi).perClaude as {
      contenuti: { reel: { reel_type: string | null; format: string | null }[] }
      in_calendario: { reel_type: string | null; format: string | null }[]
    }
    expect(g.contenuti.reel[0]).toMatchObject({ reel_type: 'Case study', format: null })
    expect(g.in_calendario[0]).toMatchObject({ reel_type: 'Educational', format: 'Meme' })
  })
  it('una voce che parla di salute esce intera o a frase; «condizioni personali» senza sintesi', () => {
    expect(testo).not.toMatch(/ernia/)
    expect(testo).not.toContain('SENTINELLA-CONDIZIONI')
    expect(f.rifInviati.has('D2')).toBe(false)
    expect(f.rifInviati.has('S2')).toBe(false)
    expect(f.rifInviati.has('S1')).toBe(true)
  })
  it('le chiavi nascoste non partono; i pesi sì, sul server', () => {
    expect(testo).not.toContain('"k"')
    expect(f.pesi.get('D1')).toEqual({ n: 7, k: null })
    expect(f.pesi.get('S1')).toEqual({ n: 1, k: 'g1' })
    // a call counts once: the reason of the closer and its analysis share the key
    expect(f.pesi.get('K1')?.k).toBe(f.pesi.get('C1')?.k)
    expect(f.pesi.get('R1')?.n).toBe(0)
  })
  it('i numeri ammessi sono quelli dei fatti e dell’ICP', () => {
    expect(f.numeriAmmessi.has('3')).toBe(true)
    expect(f.numeriAmmessi.has('777')).toBe(false)
    expect(f.numeriAmmessi.has('40')).toBe(true)
  })
  it('i Name già nel calendario si ricordano', () => {
    expect(f.nomiInCalendario.has(chiaveNome('Idea già presa'))).toBe(true)
  })
  it('le fonti dichiarate sono numeri e booleani', () => {
    expect(f.riepilogo).toEqual({ reel_analizzati: 1, dm: true, setting: true, call: true, note_team: true })
  })
  it('senza niente da cui scrivere i dati sono insufficienti', () => {
    expect(preparaFonti({ ...GREZZO, reel: [], dm: { temi: [] }, setter: { note: [] }, closer: { motivi: [] }, call: { analisi: [] } }, chiaveNome).insufficienti).toBe(true)
    expect(f.insufficienti).toBe(false)
  })
  it('con le note del team spente non resta niente di loro', () => {
    const spente = preparaFonti({ ...GREZZO, note_team: false, dm: { temi: [] }, setter: { scale: null, note: [] }, closer: { motivi: [] }, call: { analisi: [] } }, chiaveNome)
    expect(JSON.stringify(spente.perClaude)).not.toContain('"testo":"Poco')
    expect(spente.riepilogo).toMatchObject({ dm: false, setting: false, call: false, note_team: false })
  })
})
