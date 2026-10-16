import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { compatta, comeTesto, minutiSecondi, quotaParlato, secondiDa } from '@/lib/fathom/trascrizione'

const closer = { speaker: { display_name: 'Dany Montagnolo', matched_calendar_invitee_email: 'dany@alpha.test' } }
const lead = { speaker: { display_name: 'Marco Rossi', matched_calendar_invitee_email: 'marco@esempio.test' } }
const ignoto = { speaker: { display_name: null, matched_calendar_invitee_email: null } }

describe('trascrizione compatta', () => {
  it('legge i tempi in secondi e li riscrive mm:ss', () => {
    expect(secondiDa('00:12:30')).toBe(750)
    expect(secondiDa('01:02:03')).toBe(3723)
    expect(secondiDa('??')).toBe(0)
    expect(minutiSecondi(3723)).toBe('62:03')
  })
  it('chi parla: il closer dall’email, il lead dall’invitato, gli altri senza nome', () => {
    const s = compatta(
      [
        { ...closer, text: 'Ciao', timestamp: '00:00:05' },
        { ...lead, text: 'Buongiorno', timestamp: '00:00:20' },
        { ...ignoto, text: 'Rumore', timestamp: '00:00:40' },
      ],
      { email: 'DANY@alpha.test', nome: 'Dany Montagnolo' },
    )
    expect(s.map((x) => x.chi)).toEqual(['closer', 'lead', 'altro'])
  })
  it('il closer anche dal nome, quando l’email non combacia', () => {
    const s = compatta([{ speaker: { display_name: 'Dany M.', matched_calendar_invitee_email: null }, text: 'Ciao', timestamp: '00:00:01' }], { email: 'altra@x.test', nome: 'Dany Montagnolo' })
    expect(s[0].chi).toBe('closer')
  })
  it('unisce i segmenti consecutivi dello stesso parlante e salta i vuoti', () => {
    const s = compatta(
      [
        { ...lead, text: 'Uno', timestamp: '00:00:01' },
        { ...lead, text: '  ', timestamp: '00:00:02' },
        { ...lead, text: 'Due', timestamp: '00:00:03' },
        { ...closer, text: 'Tre', timestamp: '00:00:09' },
      ],
      { email: 'dany@alpha.test' },
    )
    expect(s).toHaveLength(2)
    expect(s[0]).toMatchObject({ chi: 'lead', testo: 'Uno Due', t: '00:01' })
  })
  it('la quota di parlato del closer: ogni tratto dura fino al successivo, l’ultimo fino alla fine', () => {
    const s = compatta(
      [
        { ...closer, text: 'a', timestamp: '00:00:00' },
        { ...lead, text: 'b', timestamp: '00:00:30' },
        { ...closer, text: 'c', timestamp: '00:01:00' },
      ],
      { email: 'dany@alpha.test' },
    )
    expect(quotaParlato(s, 90)).toBe(0.667)
    expect(quotaParlato(s.slice(0, 1), 90)).toBeNull()
  })
  it('come testo: una riga per tratto; oltre il limite taglia il centro e lo dice', () => {
    const s = compatta([{ ...closer, text: 'x'.repeat(500), timestamp: '00:00:00' }, { ...lead, text: 'y'.repeat(500), timestamp: '00:01:00' }], { email: 'dany@alpha.test' })
    expect(comeTesto(s).testo.split('\n')[0]).toMatch(/^\[00:00\] Closer: x+$/)
    const tagliato = comeTesto(s, 400)
    expect(tagliato.tagliata).toBe(true)
    expect(tagliato.testo).toContain('tagliata per la lunghezza')
  })
  it('l’email dei parlanti non esce mai nel testo', () => {
    const s = compatta([{ ...lead, text: 'Ciao', timestamp: '00:00:01' }], { email: 'dany@alpha.test' })
    expect(JSON.stringify(s)).not.toContain('@')
  })
})
