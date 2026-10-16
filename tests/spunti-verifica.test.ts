import { describe, expect, it } from 'vitest'

import { chiaveNome } from '@/lib/marketing/analisi/verifica'
import { preparaFonti } from '@/lib/marketing/spunti/fonti'
import type { SpuntiModello } from '@/lib/marketing/spunti/schema'
import { citazioneLunga, verificaSpunti } from '@/lib/marketing/spunti/verifica'

const GREZZO = {
  note_team: true,
  reel: [{ ref: 'R1', pubblicato: '03/10', name: 'Reel', gancio: 'x', verdetto: 'spingere', sintesi: 's', cosa_ha_funzionato: [] }],
  dm: { temi: [{ ref: 'D1', tema: 'Poco tempo', quanti: 7, in_target: 3, con_call: 1, tendenza: 'stabile' }, { ref: 'D2', tema: 'Altro', quanti: 1, in_target: 0, con_call: 0, tendenza: 'nuovo' }] },
  setter: { scale: null, note: [{ ref: 'S1', quando: 'prima', domanda: 'd', testo: 'Molti uomini non hanno tempo la sera perché tornano tardi dal lavoro', k: 'g1' }] },
  closer: { motivi: [{ ref: 'K1', quando: 'prima', esito: 'persa', qualificata: true, motivo: 'Deve sentire la compagna', note: null, k: 'a' }] },
  call: { analisi: [{ ref: 'C1', quando: 'prima', chiusa: false, k: 'a', in_target: 'si', obiezioni: [], pain: [], desideri: [], gia_provato: [], domande: [], sapeva: [], sorprese: [], spunti_contenuto: [] }] },
  in_calendario: [{ name: 'Già in calendario', modello: 'reel', reel_type: null, format: null, status: 'not_started' }],
  fatti: [{ ref: 'F1', testo: 'Questa settimana 31 lead dai reel, 14 in target' }],
  da_oscurare: ['marco gentili'],
}
const F = preparaFonti(GREZZO, chiaveNome)

const voce = (rif: string[], testo = 'Una cosa') => ({ testo, perche: 'Perché sì', rif })
const idea = (n: number, extra: Record<string, unknown> = {}) => ({
  modello: 'reel' as const, nasce_da: 'tema' as const, fase: 'consapevolezza' as const, name: `Idea ${n}`, reel_type: 'Education', format: 'Show&Tell',
  gancio: 'Ho solo quaranta minuti la sera', messaggio: 'Si può.', script: { hook: 'Ho solo 40 minuti', righe: ['a', 'b'], cta: 'Salvalo' }, perche: 'Perché', rif: ['R1'], ...extra,
})
function m(extra: Partial<SpuntiModello> = {}): SpuntiModello {
  return {
    in_breve: 'Una settimana buona.', cosa_funziona: [voce(['R1'])],
    temi: [{ tema: 'Poco tempo', cosa_dicono: 'Chiedono se bastano 40 minuti.', fonti: ['contenuti'], tendenza: 'stabile', rif: ['D1', 'S1'] }],
    obiezioni: [], domande: [], mantieni: [], cambia: [], potenzia: [], idee: [idea(1), idea(2), idea(3), idea(4), idea(5)], ...extra,
  }
}

describe('verificaSpunti', () => {
  it('un brief valido passa, con i fatti citati', () => {
    const r = verificaSpunti(m({ cosa_funziona: [voce(['R1', 'F1'])] }), F)!
    expect(r.dati.idee).toHaveLength(5)
    expect(r.dati.fatti.F1).toBe('Questa settimana 31 lead dai reel, 14 in target')
    expect(r.dati.fatti.R1).toContain('Reel del 03/10')
  })
  it('le fonti di un tema si ricalcolano dai riferimenti', () => {
    const r = verificaSpunti(m(), F)!
    expect(r.dati.temi[0].fonti.sort()).toEqual(['dm', 'setting'])
  })
  it('un riferimento che non è stato mandato, o di un tipo non ammesso, toglie la voce', () => {
    const r = verificaSpunti(m({ cosa_funziona: [voce(['R9']), voce(['D1']), voce(['R1'])] }), F)!
    expect(r.dati.cosa_funziona).toHaveLength(1)
    expect(r.conteggi.riferimenti).toBe(2)
  })
  it('sotto le 3 fonti un tema se ne va: un solo giorno di note non è una tendenza', () => {
    const r = verificaSpunti(m({ temi: [{ tema: 'Un solo giorno', cosa_dicono: 'Chiede una cosa.', fonti: ['setting'], tendenza: 'nuovo', rif: ['S1'] }] }), F)!
    expect(r.dati.temi).toHaveLength(0)
    expect(r.conteggi.soglia).toBe(1)
  })
  it('un tema dei DM pesa le sue chat; una call conta una volta anche col motivo e l’analisi', () => {
    expect(verificaSpunti(m({ temi: [{ tema: 'Tempo', cosa_dicono: 'Tempo.', fonti: ['dm'], tendenza: 'nuovo', rif: ['D1'] }] }), F)!.dati.temi).toHaveLength(1)
    expect(verificaSpunti(m({ temi: [{ tema: 'Compagna', cosa_dicono: 'Parlarne.', fonti: ['call'], tendenza: 'nuovo', rif: ['K1', 'C1'] }] }), F)!.dati.temi).toHaveLength(0)
    expect(verificaSpunti(m({ temi: [{ tema: 'Piccolo', cosa_dicono: 'Poco.', fonti: ['dm'], tendenza: 'nuovo', rif: ['D2'] }] }), F)!.dati.temi).toHaveLength(0)
  })
  it('una cifra che non è in nessun fatto né nell’ICP toglie la voce; negli script restano', () => {
    const r = verificaSpunti(m({ temi: [{ tema: 'Tempo', cosa_dicono: 'Ne parla il 777 % dei lead.', fonti: ['dm'], tendenza: 'nuovo', rif: ['D1'] }], idee: [idea(1, { script: { hook: '3 errori da evitare', righe: ['a'], cta: 'b' } }), ...[2, 3, 4, 5].map((n) => idea(n))] }), F)!
    expect(r.dati.temi).toHaveLength(0)
    expect(r.conteggi.cifre).toBe(1)
    expect(r.dati.idee[0].script.hook).toBe('3 errori da evitare')
  })
  it('un pezzo lungo tra virgolette che non è dell’ICP toglie il tema', () => {
    expect(citazioneLunga('Dicono «non riesco mai a trovare il tempo giusto»')).toBe(true)
    expect(citazioneLunga('Dicono «non ho tempo»')).toBe(false)
    expect(citazioneLunga('«Sono nella forma peggiore che abbia mai avuto»')).toBe(false)
    const r = verificaSpunti(m({ temi: [{ tema: 'Tempo', cosa_dicono: 'Dicono «non riesco mai a trovare il tempo giusto per me».', fonti: ['dm'], tendenza: 'nuovo', rif: ['D1'] }] }), F)!
    expect(r.dati.temi).toHaveLength(0)
    expect(r.conteggi.virgolette).toBe(1)
  })
  it('otto parole copiate da una nota tolgono la voce', () => {
    const r = verificaSpunti(m({ cosa_funziona: [voce(['R1'], 'Molti uomini non hanno tempo la sera perché tornano tardi dal lavoro'), voce(['R1'])] }), F)!
    expect(r.dati.cosa_funziona).toHaveLength(1)
    expect(r.conteggi.copie).toBe(1)
  })
  it('nomi, importi, link e trattini lunghi', () => {
    const r = verificaSpunti(m({ in_breve: 'Come dice Marco Gentili, costa 1.500 € — vedi http://esempio.test.' }), F)!
    expect(r.dati.in_breve).not.toMatch(/Marco|Gentili|1\.500|http|—/)
  })
  it('le idee: un’etichetta di Notion sbagliata, un Name già in calendario o senza riferimenti le tolgono', () => {
    const r = verificaSpunti(
      m({ idee: [idea(1, { reel_type: 'Inventato' }), idea(2, { format: 'Formato Inventato' }), idea(3, { name: 'Già in calendario' }), idea(4, { rif: ['R9'] }), idea(5), idea(6, { format: null, modello: 'carousel' })] }),
      F,
    )!
    expect(r.dati.idee.map((i) => i.name)).toEqual(['Idea 5', 'Idea 6'])
    expect(r.dati.idee[0]).toMatchObject({ reel_type: 'education', format: 'show_and_tell' })
    expect(r.dati.idee[1]).toMatchObject({ modello: 'carousel', format: null })
  })
  it('al massimo 8 idee, il gancio al massimo 12 parole', () => {
    const r = verificaSpunti(m({ idee: Array.from({ length: 12 }, (_, i) => idea(i + 1, { gancio: 'uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici' })) }), F)!
    expect(r.dati.idee).toHaveLength(8)
    expect(r.dati.idee[0].gancio.split(' ')).toHaveLength(12)
  })
  it('senza riassunto e senza idee il brief fallisce', () => {
    expect(verificaSpunti(m({ in_breve: ' ', idee: [] }), F)).toBeNull()
  })
})
