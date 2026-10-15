import { describe, expect, it } from 'vitest'

import { applicaFiltro, attendeRisposta, CHIAVI_FILTRO, contaFiltro, eFiltro, FILTRI } from '@/lib/insight/filtri'
import type { LeadRecap, NonLeadRecap } from '@/lib/insight/recap'

// The five numbers of the Insight (1.35.0), with the three counts Dany had
// corrected (D8, D9). Every chat is invented.

type Lead = Pick<LeadRecap, 'target' | 'stage' | 'last_from' | 'status'> & { id: string }

function lead(id: string, campi: Partial<Lead> = {}): Lead {
  return { id, target: 'da verificare', stage: '', status: '', last_from: 'alpha', ...campi }
}

describe('attendeRisposta (D8): the lead wrote last, and is not lost or gone', () => {
  it('only when the last message is the lead’s', () => {
    expect(attendeRisposta(lead('a', { last_from: 'lead', stage: 'pitch' }))).toBe(true)
    // «attende risposta» written by the model while *we* wait: not an alert any more
    expect(attendeRisposta(lead('b', { last_from: 'alpha', status: 'messaggio inviato alle 19:10, attende risposta' }))).toBe(false)
  })

  it('never for a lost lead or one who left, whatever the case or spaces', () => {
    expect(attendeRisposta(lead('c', { last_from: 'lead', stage: 'perso' }))).toBe(false)
    expect(attendeRisposta(lead('d', { last_from: 'lead', stage: ' Uscita ' }))).toBe(false)
    expect(attendeRisposta(lead('e', { last_from: 'lead', stage: 'call prenotata' }))).toBe(true)
  })
})

describe('contaFiltro and applicaFiltro', () => {
  const leads = [
    lead('marco', { target: 'si', last_from: 'lead', stage: 'call proposta' }),
    lead('luca', { target: 'si', stage: 'Call prenotata' }),
    lead('andrea', { stage: 'qualificazione', last_from: 'lead' }),
    lead('paolo', { target: 'no', stage: 'perso', last_from: 'lead' }),
    lead('giorgio', { target: 'no', stage: 'uscita' }),
    lead('ivan', { target: 'no', stage: 'chiuso' }),
    lead('fabio', { status: 'attende risposta', last_from: 'alpha' }),
  ]
  const nonLeads: NonLeadRecap[] = [{ username: 'amico.inventato', reason: 'Amico.' }]

  it('«Chat attive» counts the leads and the chats that are not leads, as the artifact', () => {
    expect(contaFiltro('tutte', leads, nonLeads)).toBe(8)
    expect(contaFiltro('tutte', [], [])).toBe(0)
  })

  it('«Lead in target»: target sì only', () => {
    expect(contaFiltro('target', leads, nonLeads)).toBe(2)
  })

  it('«Attendono risposta» with the rule of D8 (the artifact counted «attende» in the status)', () => {
    expect(contaFiltro('attesa', leads, nonLeads)).toBe(2)
    expect(applicaFiltro('attesa', leads).map((l) => l.id)).toEqual(['marco', 'andrea'])
  })

  it('«Call prenotate»: the stage says it, in any case', () => {
    expect(applicaFiltro('call', leads).map((l) => l.id)).toEqual(['luca'])
  })

  it('«Chiusi / persi» also counts «uscita» (D9: the artifact said 0 while the summary said 7)', () => {
    expect(applicaFiltro('persi', leads).map((l) => l.id)).toEqual(['paolo', 'giorgio', 'ivan'])
    const usciti = Array.from({ length: 7 }, (_, i) => lead(`u${i}`, { stage: 'uscita' }))
    expect(contaFiltro('persi', usciti, [])).toBe(7)
  })

  it('applicaFiltro keeps the order and never the non-leads', () => {
    expect(applicaFiltro('tutte', leads).map((l) => l.id)).toEqual(leads.map((l) => l.id))
  })
})

describe('FILTRI: the artifact’s labels', () => {
  it('in the artifact’s order, the alert only on «Attendono risposta»', () => {
    expect(CHIAVI_FILTRO.map((k) => FILTRI[k].etichetta)).toEqual([
      'Chat attive',
      'Lead in target',
      'Attendono risposta',
      'Call prenotate',
      'Chiusi / persi',
    ])
    expect(FILTRI.tutte.titolo).toBe('Tutte le chat attive')
    expect(CHIAVI_FILTRO.filter((k) => FILTRI[k].allarme)).toEqual(['attesa'])
  })

  it('eFiltro', () => {
    expect(eFiltro('persi')).toBe(true)
    expect(eFiltro('altro')).toBe(false)
    expect(eFiltro(undefined)).toBe(false)
  })
})
