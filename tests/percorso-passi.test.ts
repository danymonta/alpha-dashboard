import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { leggiBlocco, testoDaCopiare, ULTIMO_PASSO_SERVITO } from '@/lib/percorso/blocchi'
import { leggiPercorso, passoDaFare } from '@/lib/percorso/letture'
import { primoPassoDelCliente, staAlCliente } from '@/lib/percorso/nodi'
import { avanzaPassoSchema, progressoVideoSchema } from '@/lib/validation/percorso'

/*
 * The client's side of release B2: the pairs (step, action) the page sends, the fields of
 * percorso_cliente() read into the page's shapes, the step in the client's hands, the text of
 * the presentation to copy.
 */

const ID = '0b0b0000-0000-4000-8000-000000000001'
const ID2 = '0b0b0000-0000-4000-8000-000000000002'

describe('le coppie del rilascio B2', () => {
  it.each([
    { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-20', ora: '18:00' } },
    { passo: 'community', azione: 'username', dati: { username: '@mario_rossi' } },
    { passo: 'community', azione: 'richiesta_inviata' },
    { passo: 'community', azione: 'presentato' },
    { passo: 'obiettivo', azione: 'visto' },
    { passo: 'test', azione: 'spunta', dati: { voce: ID } },
    { passo: 'programma', azione: 'completa' },
  ])('$passo/$azione passa', (invio) => {
    expect(avanzaPassoSchema.safeParse(invio).success).toBe(true)
  })

  it.each([
    { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '20/11/2026', ora: '18:00' } },
    { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-20', ora: '25:00' } },
    { passo: 'community', azione: 'username', dati: { username: '' } },
    { passo: 'test', azione: 'spunta', dati: { voce: 'x' } },
    { passo: 'programma', azione: 'spunta' },
    { passo: 'obiettivo', azione: 'completa' },
  ])('$passo/$azione con dati sbagliati non passa', (invio) => {
    expect(avanzaPassoSchema.safeParse(invio).success).toBe(false)
  })

  it('un video consegnato dal coach: la consegna al posto del blocco, mai tutti e due', () => {
    const base = { durata: 120, intervalli: [[0, 10]] }
    expect(progressoVideoSchema.safeParse({ ...base, consegna: ID }).success).toBe(true)
    expect(progressoVideoSchema.safeParse({ ...base, consegna: ID, blocco: ID2 }).success).toBe(false)
  })
})

describe('il passo in mano al cliente', () => {
  const passo = (chiave: string, attore: 'cliente' | 'team', stato: string) => ({ chiave, attore, stato })

  it('i suoi passi aperti; il programma solo una volta consegnato', () => {
    expect(staAlCliente(passo('community', 'cliente', 'in_corso'))).toBe(true)
    expect(staAlCliente(passo('prenotazione', 'cliente', 'inviato'))).toBe(false)
    expect(staAlCliente(passo('test', 'cliente', 'in_attesa_team'))).toBe(false)
    expect(staAlCliente(passo('call', 'team', 'disponibile'))).toBe(false)
    expect(staAlCliente(passo('programma', 'team', 'in_attesa_team'))).toBe(false)
    expect(staAlCliente(passo('programma', 'team', 'disponibile'))).toBe(true)
    expect(
      primoPassoDelCliente([passo('call', 'team', 'disponibile'), passo('community', 'cliente', 'disponibile')])?.chiave,
    ).toBe('community')
  })

  it('tutti gli step sono serviti', () => {
    expect(ULTIMO_PASSO_SERVITO).toBeNull()
  })
})

describe('il documento della pagina con i campi del rilascio B2', () => {
  const documento = {
    cliente: { nome: 'Mario' },
    percorso: { stato: 'in_corso', giorno_zero: '2026-11-12T10:00:00Z', completato_il: null },
    nodi: [],
    passi: [
      { chiave: 'call', titolo: 'Call di onboarding', nodo: 'call_onboarding', attore: 'team', stato: 'disponibile', blocchi: [] },
      { chiave: 'programma', titolo: 'Il tuo programma', nodo: 'inizio_percorso', attore: 'team', stato: 'disponibile', blocchi: [] },
      {
        chiave: 'test',
        titolo: 'Settimana test',
        nodo: 'settimana_test',
        attore: 'cliente',
        stato: 'fatto',
        blocchi: [{ id: ID, tipo: 'voce', titolo: 'Foto', spuntata: true }],
      },
    ],
    team: [],
    consensi: [],
    stima: { data: '2026-11-14', giorni: 0, quasi: false, base: 'iniziato', cose_da_fare: 0, video_mancanti: [] },
    in_attesa: false,
    call: { giorno: '2026-11-19', ora: '18:00', inizio: '2026-11-19T17:00:00Z', durata_minuti: 30, stato: 'prenotata', meet_url: 'https://meet.google.com/abc-defg-hij' },
    checkpoint: { giorno: '2026-12-20', ora: '18:00', inizio: '2026-12-20T17:00:00Z', durata_minuti: 30, stato: 'prenotata', meet_url: 'https://evil.example/x' },
    consegne: [
      { id: ID, tipo: 'video', titolo: 'Come leggere la scheda', youtube_id: 'AbCdEfGhIjK', obbligatoria: true, video: { percentuale: 40, visto: false } },
      { id: ID2, tipo: 'pdf', titolo: 'Il modello alimentare', url: 'https://drive.google.com/file/x' },
      { id: ID2, tipo: 'link', titolo: 'Senza https', url: 'http://example.com' },
      { id: ID2, tipo: 'video', titolo: 'Senza id', youtube_id: 'corto' },
    ],
    community: { username: 'mario_rossi', richiesta_inviata_il: '2026-11-14T10:00:00Z', presentato_il: null },
    link_community: 'https://t.me/+abc',
    link_prenotazione: null,
    gruppo_privato_url: 'javascript:alert(1)',
    attesa_team: { passo: 'programma', cosa: 'Ivan sta preparando il tuo programma.', chi: { nome: 'Ivan', ruolo: 'Coach', foto_url: null } },
    lanciato: false,
    dopo_lancio: [{ id: ID, tipo: 'pulsante', titolo: 'Apri Yazio', url: 'https://www.yazio.com/it' }],
  }

  it('call, consegne, community, link, attesa e dopo il lancio', () => {
    const p = leggiPercorso(documento)!
    expect(p.call).toMatchObject({ giorno: '2026-11-19', ora: '18:00', stato: 'prenotata', meetUrl: 'https://meet.google.com/abc-defg-hij' })
    // a link that is not Google Meet never reaches the button
    expect(p.checkpoint?.meetUrl).toBeNull()
    expect(p.consegne.map((c) => [c.tipo, c.titolo])).toEqual([
      ['video', 'Come leggere la scheda'],
      ['pdf', 'Il modello alimentare'],
    ])
    expect(p.consegne[0]!.video).toEqual({ percentuale: 40, visto: false })
    expect(p.community).toEqual({ username: 'mario_rossi', richiestaInviataIl: '2026-11-14T10:00:00Z', presentatoIl: null })
    expect(p.linkCommunity).toBe('https://t.me/+abc')
    expect(p.linkPrenotazione).toBeNull()
    expect(p.gruppoPrivatoUrl).toBeNull()
    expect(p.attesaTeam).toEqual({ passo: 'programma', cosa: 'Ivan sta preparando il tuo programma.', chi: { nome: 'Ivan', ruolo: 'Coach', fotoUrl: null } })
    expect(p.lanciato).toBe(false)
    expect(p.dopoLancio).toHaveLength(1)
    expect(passoDaFare(p)?.chiave).toBe('programma')
    const voce = p.passi.find((x) => x.chiave === 'test')!.blocchi![0]!
    expect(voce).toMatchObject({ tipo: 'voce', spuntata: true })
  })

  it('un documento senza i campi del rilascio B2 resta leggibile', () => {
    const p = leggiPercorso({ ...documento, call: undefined, consegne: undefined, community: undefined, attesa_team: 'x', dopo_lancio: null })!
    expect(p.call).toBeNull()
    expect(p.consegne).toEqual([])
    expect(p.community).toBeNull()
    expect(p.attesaTeam).toBeNull()
    expect(p.dopoLancio).toEqual([])
  })
})

describe('la presentazione da copiare', () => {
  it('il nome al posto dei segnaposto, senza i segni del Markdown', () => {
    const corpo = 'Ciao a tutti, sono [il tuo nome].\n\n**Chi sono:** \n\n**Il mio obiettivo a 6 mesi:** '
    expect(testoDaCopiare(corpo, 'Mario')).toBe('Ciao a tutti, sono Mario.\n\nChi sono:\n\nIl mio obiettivo a 6 mesi:')
    expect(testoDaCopiare('Sono [Nome]', '')).toBe('Sono [Nome]')
  })

  it('una voce senza spunta si legge non spuntata', () => {
    expect(leggiBlocco({ id: ID, tipo: 'voce', titolo: 'Foto' })).toMatchObject({ spuntata: false })
  })
})
