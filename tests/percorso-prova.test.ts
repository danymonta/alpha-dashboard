import { describe, expect, it } from 'vitest'

import {
  RISPOSTE_DI_PROVA,
  aggiungiAllegato,
  aspettaUnVideo,
  avanza,
  azioneTeam,
  azioneTeamDovuta,
  inviaQuestionario,
  percorsoDi,
  progressoVideo,
  salvaQuestionario,
  segnaVideoVisti,
  statoIniziale,
  vaiA,
  type DatiProva,
  type StatoProva,
} from '@/lib/percorso/prova'
import { risposteComplete } from '@/lib/validation/questionario'

const ORA = new Date('2026-11-13T10:00:00Z')

const VIDEO = '10000000-0000-4000-8000-000000000001'
const REGOLA_1 = '10000000-0000-4000-8000-000000000002'
const REGOLA_2 = '10000000-0000-4000-8000-000000000003'
const VOCE_1 = '10000000-0000-4000-8000-000000000004'
const VOCE_2 = '10000000-0000-4000-8000-000000000005'

function def(ordine: number, chiave: string, nodo: string, attore: 'cliente' | 'team', sbloccaDopo: string[], sblocco: 'automatico' | 'team' = 'automatico') {
  return { chiave, titolo: chiave, nodo, ordine, attore, sblocco, sbloccaDopo }
}

/** Flow v1 as the seed of 20261108090000 and 20261109090100 has it. */
const DATI: DatiProva = {
  nomeCompleto: 'Mario Prova',
  email: 'mario.prova@example.test',
  passi: [
    def(1, 'benvenuto', 'benvenuto', 'cliente', []),
    def(2, 'regole', 'benvenuto', 'cliente', ['benvenuto']),
    def(3, 'questionario', 'questionario', 'cliente', ['regole']),
    def(4, 'prenotazione', 'call_prenotata', 'cliente', ['questionario']),
    def(5, 'community', 'community', 'cliente', ['prenotazione']),
    def(6, 'call', 'call_onboarding', 'team', ['prenotazione']),
    def(7, 'obiettivo', 'call_onboarding', 'cliente', ['call'], 'team'),
    def(8, 'test', 'settimana_test', 'cliente', ['obiettivo']),
    def(9, 'programma', 'inizio_percorso', 'team', ['test'], 'team'),
  ],
  blocchi: [
    { id: VIDEO, pagina: 'passo', passo: 'benvenuto', tipo: 'video', titolo: 'Benvenuto', corpo: null, youtube_id: 'abcdefghijk', url: null, obbligatorio: true },
    { id: REGOLA_1, pagina: 'passo', passo: 'regole', tipo: 'regola', titolo: 'Regola 1', corpo: null, youtube_id: null, url: null, obbligatorio: false },
    { id: REGOLA_2, pagina: 'passo', passo: 'regole', tipo: 'regola', titolo: 'Regola 2', corpo: null, youtube_id: null, url: null, obbligatorio: false },
    { id: VOCE_1, pagina: 'passo', passo: 'test', tipo: 'voce', titolo: 'Voce 1', corpo: null, youtube_id: null, url: null, obbligatorio: false },
    { id: VOCE_2, pagina: 'passo', passo: 'test', tipo: 'voce', titolo: 'Voce 2', corpo: null, youtube_id: null, url: null, obbligatorio: false },
    {
      id: '10000000-0000-4000-8000-000000000006',
      pagina: 'dopo_lancio',
      passo: null,
      tipo: 'pulsante',
      titolo: 'Coach Plus',
      corpo: null,
      youtube_id: null,
      url: 'https://example.test/coach-plus',
      obbligatorio: false,
    },
  ],
  team: [{ incarico: 'coach', ruolo: 'Coach', nome: 'Ivan Rossi', fotoUrl: null }],
  versioneConsenso: '2026-11-13',
  linkCommunity: 'https://t.me/+prova',
  linkPrenotazione: 'https://calendar.app.google/prova',
  giorni: { call: 3, test: 7, programma: 2 },
}

function ok(e: { ok: true; stato: StatoProva } | { ok: false; errore: string }): StatoProva {
  if (!e.ok) throw new Error(e.errore)
  return e.stato
}

function stati(s: StatoProva) {
  return Object.fromEntries(Object.entries(s.passi).map(([k, p]) => [k, p.stato]))
}

describe('Prova del percorso: il motore', () => {
  it('parte come un cliente appena registrato: solo il benvenuto è aperto', () => {
    const s = statoIniziale(DATI, ORA)
    expect(stati(s)).toMatchObject({ benvenuto: 'disponibile', regole: 'bloccato', questionario: 'bloccato' })
    const p = percorsoDi(DATI, s, ORA)
    expect(p.nome).toBe('Mario')
    expect(p.nodi[0]).toMatchObject({ chiave: 'benvenuto', stato: 'attuale' })
    expect(p.passi.find((x) => x.chiave === 'regole')?.blocchi).toBeNull()
    expect(p.stima).toMatchObject({ base: 'call_non_prenotata', giorni: 12 })
  })

  it('il benvenuto vuole il video al 90%, come video_progresso', () => {
    let s = statoIniziale(DATI, ORA)
    expect(avanza(DATI, s, { passo: 'benvenuto', azione: 'completa' }, ORA)).toEqual({
      ok: false,
      errore: 'Guarda il video fino in fondo prima di andare avanti.',
    })
    const sotto = progressoVideo(DATI, s, { blocco: VIDEO, durata: 100, intervalli: [[0, 89]] }, ORA)
    expect(sotto.ok && sotto.stato.visto).toBe(false)
    s = sotto.ok ? sotto.stato.stato : s
    expect(stati(s).benvenuto).toBe('in_corso')
    const sopra = progressoVideo(DATI, s, { blocco: VIDEO, durata: 100, intervalli: [[89, 90]] }, ORA)
    expect(sopra.ok && sopra.stato).toMatchObject({ percentuale: 90, visto: true })
    s = sopra.ok ? sopra.stato.stato : s
    s = ok(avanza(DATI, s, { passo: 'benvenuto', azione: 'completa' }, ORA))
    expect(stati(s)).toMatchObject({ benvenuto: 'fatto', regole: 'disponibile' })
  })

  it('un video ancora segnaposto non ferma la prova: il benvenuto si completa subito', () => {
    const conSegnaposto: DatiProva = {
      ...DATI,
      blocchi: DATI.blocchi.map((b) => (b.id === VIDEO ? { ...b, youtube_id: 'XXXXXXXXXXX' } : b)),
    }
    const s = statoIniziale(conSegnaposto, ORA)
    const video = percorsoDi(conSegnaposto, s, ORA).passi.find((x) => x.chiave === 'benvenuto')?.blocchi?.[0]
    expect(video).toMatchObject({ tipo: 'video', video: { visto: true } })
    const dopo = ok(avanza(conSegnaposto, s, { passo: 'benvenuto', azione: 'completa' }, ORA))
    expect(stati(dopo)).toMatchObject({ benvenuto: 'fatto', regole: 'disponibile' })
  })

  it('le regole vogliono tutte le spunte e il consenso nella versione in vigore', () => {
    let s = ok(avanza(DATI, segnaVideoVisti(DATI, statoIniziale(DATI, ORA)), { passo: 'benvenuto', azione: 'completa' }, ORA))
    expect(avanza(DATI, s, { passo: 'regole', azione: 'accetta', dati: { regole: [REGOLA_1], consenso_salute: '2026-11-13' } }, ORA)).toEqual({
      ok: false,
      errore: 'Spunta tutte le regole per andare avanti.',
    })
    expect(
      avanza(DATI, s, { passo: 'regole', azione: 'accetta', dati: { regole: [REGOLA_1, REGOLA_2], consenso_salute: '2026-11-12' } }, ORA),
    ).toMatchObject({ ok: false })
    s = ok(avanza(DATI, s, { passo: 'regole', azione: 'accetta', dati: { regole: [REGOLA_1, REGOLA_2], consenso_salute: '2026-11-13' } }, ORA))
    expect(stati(s).questionario).toBe('disponibile')
    expect(s.consenso?.versione).toBe('2026-11-13')
  })

  it('il questionario: senza consenso no, una versione vecchia è «cambiato», incompleto dice cosa manca', () => {
    const aperto = vaiA(DATI, statoIniziale(DATI, ORA), 'questionario', ORA)
    expect(stati(aperto).questionario).toBe('disponibile')
    expect(salvaQuestionario(DATI, { ...aperto, consenso: null }, { risposte: {}, schermata: 1, versione: 0 }, ORA)).toMatchObject({
      ok: false,
      errore: 'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.',
    })
    const salvato = salvaQuestionario(DATI, aperto, { risposte: { email: 'a@b.it' }, schermata: 1, versione: 0 }, ORA)
    expect(salvato).toMatchObject({ ok: true, esito: 'salvato', versione: 1 })
    const s = salvato.ok ? salvato.stato : aperto
    expect(stati(s).questionario).toBe('in_corso')
    expect(salvaQuestionario(DATI, s, { risposte: {}, schermata: 1, versione: 0 }, ORA)).toMatchObject({ ok: true, esito: 'cambiato' })
    const incompleto = inviaQuestionario(DATI, s, 1, ORA)
    expect(incompleto.ok).toBe(false)
    expect(!incompleto.ok && incompleto.mancanti?.length).toBeGreaterThan(20)

    expect(risposteComplete(RISPOSTE_DI_PROVA)).toBe(true)
    const pieno = salvaQuestionario(DATI, s, { risposte: RISPOSTE_DI_PROVA, schermata: 4, versione: 1 }, ORA)
    const dopo = pieno.ok ? pieno.stato : s
    const inviato = inviaQuestionario(DATI, dopo, 2, ORA)
    expect(inviato).toMatchObject({ ok: true, esito: 'inviato' })
    expect(inviato.ok && stati(inviato.stato)).toMatchObject({ questionario: 'fatto', prenotazione: 'disponibile' })
    expect(inviato.ok && aggiungiAllegato(DATI, inviato.stato, { campo: 'attrezzatura', nome: 'a.jpg', tipo: 'image/jpeg', byte: 10 })).toMatchObject({
      ok: false,
      errore: 'Il questionario è già stato inviato.',
    })
  })

  it('la prenotazione va da oggi a 60 giorni e manda il passo al coach', () => {
    const s = vaiA(DATI, statoIniziale(DATI, ORA), 'prenotazione', ORA)
    expect(avanza(DATI, s, { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-12', ora: '18:00' } }, ORA)).toEqual({
      ok: false,
      errore: 'Il giorno della call va da oggi a 60 giorni.',
    })
    expect(avanza(DATI, s, { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2027-01-13', ora: '18:00' } }, ORA)).toMatchObject({ ok: false })
    const prenotato = ok(avanza(DATI, s, { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-15', ora: '18:00' } }, ORA))
    expect(stati(prenotato).prenotazione).toBe('inviato')
    const p = percorsoDi(DATI, prenotato, ORA)
    expect(p.call).toMatchObject({ giorno: '2026-11-15', ora: '18:00', stato: 'da_confermare', meetUrl: null })
    // the client does not wait for the coach (1.84.0): the community opens at once, the call waits for the confirmation
    expect(stati(prenotato)).toMatchObject({ community: 'disponibile', call: 'bloccato' })
    expect(p.inAttesa).toBe(false)
    expect(azioneTeamDovuta(prenotato)).toBe('conferma_call')
    expect(avanza(DATI, prenotato, { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-15', ora: '18:00' } }, ORA)).toEqual({
      ok: false,
      errore: 'Il tuo team sta controllando questo passo: ti avvisiamo quando tocca a te.',
    })
  })

  it('l’ordine degli sblocchi: la prenotazione apre la community, la call confermata apre la call; l’obiettivo lo apre solo il team', () => {
    let s = vaiA(DATI, statoIniziale(DATI, ORA), 'prenotazione', ORA)
    s = ok(avanza(DATI, s, { passo: 'prenotazione', azione: 'prenotato', dati: { giorno: '2026-11-15', ora: '18:00' } }, ORA))
    s = ok(azioneTeam(DATI, s, 'conferma_call', ORA))
    expect(stati(s)).toMatchObject({ prenotazione: 'fatto', community: 'disponibile', call: 'disponibile', obiettivo: 'bloccato' })
    expect(percorsoDi(DATI, s, ORA).call?.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//)
    expect(azioneTeam(DATI, s, 'obiettivo', ORA)).toMatchObject({ ok: false, errore: 'Prima segna la call di onboarding come svolta.' })
    s = ok(azioneTeam(DATI, s, 'call_svolta', ORA))
    expect(stati(s)).toMatchObject({ call: 'fatto', obiettivo: 'bloccato' })
    expect(azioneTeamDovuta(s)).toBe('obiettivo')
    s = ok(azioneTeam(DATI, s, 'obiettivo', ORA))
    expect(stati(s).obiettivo).toBe('disponibile')
  })

  it('la community in tre passi: username, richiesta, presentazione', () => {
    let s = vaiA(DATI, statoIniziale(DATI, ORA), 'community', ORA)
    expect(avanza(DATI, s, { passo: 'community', azione: 'richiesta_inviata' }, ORA)).toEqual({
      ok: false,
      errore: 'Prima scrivi il tuo username di Telegram.',
    })
    expect(avanza(DATI, s, { passo: 'community', azione: 'username', dati: { username: 'ab' } }, ORA)).toMatchObject({ ok: false })
    s = ok(avanza(DATI, s, { passo: 'community', azione: 'username', dati: { username: '@Mario_Prova' } }, ORA))
    expect(s.username).toBe('mario_prova')
    expect(avanza(DATI, s, { passo: 'community', azione: 'presentato' }, ORA)).toMatchObject({ ok: false })
    s = ok(avanza(DATI, s, { passo: 'community', azione: 'richiesta_inviata' }, ORA))
    s = ok(avanza(DATI, s, { passo: 'community', azione: 'presentato' }, ORA))
    expect(stati(s).community).toBe('fatto')
  })

  it('la settimana test con le voci, poi il programma consegnato, visto, e il lancio', () => {
    let s = vaiA(DATI, statoIniziale(DATI, ORA), 'test', ORA)
    expect(stati(s).test).toBe('disponibile')
    s = ok(avanza(DATI, s, { passo: 'test', azione: 'spunta', dati: { voce: VOCE_1 } }, ORA))
    expect(stati(s).test).toBe('in_corso')
    expect(percorsoDi(DATI, s, ORA).stima?.cose_da_fare).toBe(1)
    s = ok(avanza(DATI, s, { passo: 'test', azione: 'spunta', dati: { voce: VOCE_2 } }, ORA))
    expect(stati(s).test).toBe('in_attesa_team')
    s = ok(azioneTeam(DATI, s, 'test', ORA))
    expect(stati(s)).toMatchObject({ test: 'fatto', programma: 'in_attesa_team' })
    s = ok(azioneTeam(DATI, s, 'programma', ORA))
    expect(stati(s).programma).toBe('disponibile')
    expect(aspettaUnVideo(DATI, s)).toBe(true)
    expect(avanza(DATI, s, { passo: 'programma', azione: 'completa' }, ORA)).toEqual({
      ok: false,
      errore: 'Guarda i video obbligatori prima di andare avanti.',
    })
    const p = percorsoDi(DATI, s, ORA)
    expect(p.consegne).toHaveLength(1)
    expect(p.checkpoint).toMatchObject({ ora: '18:00', stato: 'prenotata' })
    s = ok(avanza(DATI, segnaVideoVisti(DATI, s), { passo: 'programma', azione: 'completa' }, ORA))
    const lanciato = percorsoDi(DATI, s, ORA)
    expect(lanciato.lanciato).toBe(true)
    expect(lanciato.stato).toBe('completato')
    expect(lanciato.dopoLancio.map((b) => b.tipo)).toEqual(['pulsante'])
    expect(lanciato.nodi.every((n) => n.stato === 'completato')).toBe(true)
  })

  it('«Vai allo step» porta fino al razzo e non torna mai indietro', () => {
    const fine = vaiA(DATI, statoIniziale(DATI, ORA), 'lancio', ORA)
    expect(percorsoDi(DATI, fine, ORA).lanciato).toBe(true)
    expect(vaiA(DATI, fine, 'benvenuto', ORA)).toBe(fine)
  })

  it('un passo fuori dall’elenco o in un altro stato si rifiuta come il database', () => {
    const s = statoIniziale(DATI, ORA)
    expect(avanza(DATI, s, { passo: 'regole', azione: 'accetta', dati: { regole: [], consenso_salute: 'x' } }, ORA)).toEqual({
      ok: false,
      errore: 'Questo passo non è ancora disponibile.',
    })
    expect(avanza(DATI, s, { passo: 'nessuno', azione: 'x' }, ORA)).toMatchObject({ ok: false })
  })
})
