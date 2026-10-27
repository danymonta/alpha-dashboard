import { describe, expect, it } from 'vitest'

import { abbinaRiunioni, eDiVendita, nomeNellaRiunione, parole, type CallDaAbbinare } from '@/lib/fathom/abbina'
import { leggiRiunionePerAbbinamento, type RiunionePerAbbinamento } from '@/lib/fathom/riunione'

// Everything here is invented: no real meeting, person or link.
function riunione(id: number, titolo: string, quando: string, invitati: { name?: string; email?: string }[] = []): RiunionePerAbbinamento {
  const r = leggiRiunionePerAbbinamento({
    recording_id: id,
    url: `https://fathom.video/calls/${id + 1000}`,
    share_url: null,
    title: titolo,
    created_at: quando,
    recording_start_time: quando,
    recording_end_time: new Date(Date.parse(quando) + 30 * 60_000).toISOString(),
    scheduled_start_time: null,
    calendar_invitees: invitati,
  })
  if (!r) throw new Error('riunione non letta')
  return r
}

function call(id: string, quando: string, nome: string | null, handle: string | null = null): CallDaAbbinare {
  return { id, programmata_il: quando, lead_nome: nome, lead_handle: handle }
}

describe('parole e nomi', () => {
  it('toglie accenti, maiuscole e le parole di Dany', () => {
    expect(parole('Nicolò Soldà and Daniele Montagnolo')).toEqual(['nicolo', 'solda'])
  })
  it('riconosce tutto il nome, una parola o niente', () => {
    expect(nomeNellaRiunione({ lead_nome: 'Marco Bianchi', lead_handle: null }, 'Marco Bianchi and Dany')).toBe('forte')
    expect(nomeNellaRiunione({ lead_nome: 'Marco Bianchi', lead_handle: null }, 'Marco & Dany - Discovery Call')).toBe('debole')
    expect(nomeNellaRiunione({ lead_nome: 'Marco', lead_handle: 'm.bianchi_92' }, 'Impromptu Google Meet Meeting bianchi')).toBe('debole')
    expect(nomeNellaRiunione({ lead_nome: 'Luca Verdi', lead_handle: null }, 'Paolo Neri and Dany')).toBeNull()
  })
  it('legge i nomi e l’email degli invitati, solo in memoria', () => {
    const r = riunione(1, 'Sales call 1:1', '2026-10-20T18:00:00Z', [{ name: 'Ospite', email: 'pietro.rossetti@esempio.test' }])
    expect(nomeNellaRiunione({ lead_nome: 'Pietro Rossetti', lead_handle: null }, r.nomi)).toBe('forte')
  })
  it('scarta le riunioni che non sono di vendita', () => {
    expect(eDiVendita({ titolo: 'Fabio & Dany | ONBOARDING' })).toBe(false)
    expect(eDiVendita({ titolo: 'Fabio Testimonianza 5 mesi' })).toBe(false)
    expect(eDiVendita({ titolo: 'Fabio & Dany Checkpoint Percorso' })).toBe(false)
    expect(eDiVendita({ titolo: 'Fabio Gialli and Daniele Montagnolo' })).toBe(true)
  })
})

describe('abbinaRiunioni', () => {
  const calls = [
    call('c1', '2026-10-20T18:00:00Z', 'Marco Bianchi'),
    call('c2', '2026-10-21T19:00:00Z', 'Luca'),
    call('c3', '2026-10-22T17:00:00Z', 'Pietro Rossetti'),
  ]

  it('collega per nome e orario, una registrazione per call', () => {
    const riunioni = [
      riunione(10, 'Marco Bianchi and Daniele Montagnolo', '2026-10-20T18:04:00Z'),
      riunione(11, 'Luca & Dany - Discovery Call', '2026-10-21T19:10:00Z'),
      riunione(12, 'Altra persona and Dany', '2026-10-22T17:00:00Z'),
    ]
    const scelte = abbinaRiunioni(calls, riunioni)
    expect(scelte.map((s) => [s.call_id, s.riunione.recording_id, s.certo])).toEqual([
      ['c1', 10, true],
      ['c2', 11, true],
    ])
  })

  it('mai per solo orario, mai una riunione di un cliente', () => {
    const riunioni = [
      riunione(20, 'Impromptu Google Meet Meeting', '2026-10-22T17:00:00Z'),
      riunione(21, 'Pietro Rossetti & Dany | ONBOARDING', '2026-10-22T17:05:00Z'),
    ]
    expect(abbinaRiunioni(calls, riunioni)).toEqual([])
  })

  it('un nome a metà vale solo vicino all’orario', () => {
    const lontana = riunione(30, 'Bianchi call', '2026-10-20T23:30:00Z')
    expect(abbinaRiunioni([calls[0]], [lontana])).toEqual([])
    const vicina = riunione(31, 'Bianchi call', '2026-10-20T19:30:00Z')
    expect(abbinaRiunioni([calls[0]], [vicina]).map((s) => s.certo)).toEqual([false])
  })

  it('con due riunioni dello stesso lead sceglie la più vicina; una già usata resta fuori', () => {
    const riunioni = [
      riunione(40, 'Marco Bianchi and Dany', '2026-10-21T18:00:00Z'),
      riunione(41, 'Marco Bianchi and Dany', '2026-10-20T18:20:00Z'),
    ]
    expect(abbinaRiunioni([calls[0]], riunioni)[0]?.riunione.recording_id).toBe(41)
    expect(abbinaRiunioni([calls[0]], riunioni, new Set([41]))[0]?.riunione.recording_id).toBe(40)
  })

  it('una riunione annullata viene dopo una vera', () => {
    const riunioni = [
      riunione(50, 'Canceled: Marco Bianchi and Dany', '2026-10-20T18:00:00Z'),
      riunione(51, 'Marco Bianchi and Dany', '2026-10-20T20:00:00Z'),
    ]
    expect(abbinaRiunioni([calls[0]], riunioni)[0]?.riunione.recording_id).toBe(51)
  })

  it('due lead con lo stesso nome: ognuno la sua, per orario', () => {
    const omonimi = [call('a', '2026-10-20T18:00:00Z', 'Luca'), call('b', '2026-10-21T18:00:00Z', 'Luca')]
    const riunioni = [riunione(60, 'Luca and Dany', '2026-10-21T18:02:00Z'), riunione(61, 'Luca and Dany', '2026-10-20T18:01:00Z')]
    const scelte = Object.fromEntries(abbinaRiunioni(omonimi, riunioni).map((s) => [s.call_id, s.riunione.recording_id]))
    expect(scelte).toEqual({ a: 61, b: 60 })
  })
})
