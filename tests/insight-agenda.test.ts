import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { chatDellaCall, chiaviStatoLead, contestoApp, esitoShowUp, scheletriAgenda, statiLead, vociAgenda } from '@/lib/insight/agenda'
import { uniscRecap } from '@/lib/insight/unione'
import { chatFinta, msg, voceAgendaFinta } from './fixture-insight'

// The Insight's agenda from the app's calls (1.35.0, D3): the rows of
// insight_agenda(), the skeletons, the outcomes of yesterday, the floor after
// a no-show and the Messenger chats found by name. Invented calls only.

const ADESSO = new Date('2026-10-14T15:00:00.000Z')

describe('vociAgenda', () => {
  it('tiene solo le colonne dell’agenda: mai note, importi, contatti o il closer', () => {
    const [voce] = vociAgenda([
      {
        giorno: 'oggi',
        call_id: 'c1',
        programmata_il: '2026-10-14T17:30:00+00:00',
        lead_id: 'l1',
        nome: 'Lead Finto',
        username: 'lead.finto',
        fonte: 'dm_inbound',
        stato: 'programmata',
        esito: null,
        di_follow_up: false,
        volte_spostata: 1,
        no_show_precedenti: 0,
        // what a careless function could give: never kept
        note: 'nota del setter',
        note_closer: 'nota del closer',
        importo_proposto: 1500,
        email: 'lead@esempio.test',
        closer_id: 'x',
        closer_nome: 'Closer Finto',
      },
    ])
    expect(Object.keys(voce).sort()).toEqual(
      ['call_id', 'di_follow_up', 'esito', 'fonte', 'giorno', 'lead_id', 'no_show_precedenti', 'nome', 'programmata_il', 'stato', 'username', 'volte_spostata'].sort(),
    )
    expect(voce.programmata_il).toBe('2026-10-14T17:30:00.000Z')
    expect(JSON.stringify(voce)).not.toMatch(/nota|1500|esempio\.test|Closer/)
  })

  it('scarta le righe senza giorno, call, ora o stato, le cancellate, e un handle non valido', () => {
    const voci = vociAgenda([
      { giorno: 'dopodomani', call_id: 'a', programmata_il: '2026-10-16T10:00:00Z', stato: 'programmata' },
      { giorno: 'oggi', call_id: '', programmata_il: '2026-10-14T10:00:00Z', stato: 'programmata' },
      { giorno: 'oggi', call_id: 'b', programmata_il: 'mai', stato: 'programmata' },
      { giorno: 'oggi', call_id: 'c', programmata_il: '2026-10-14T10:00:00Z', stato: 'cancellata' },
      { giorno: 'oggi', call_id: 'd', programmata_il: '2026-10-14T10:00:00Z', stato: 'programmata', username: 'Non Valido!' },
      null,
      'riga',
    ])
    expect(voci.map((v) => v.call_id)).toEqual(['d'])
    expect(voci[0].username).toBeNull()
  })

  it('contesto_app riletto dal database: solo le sue due liste', () => {
    expect(contestoApp(null)).toBeNull()
    expect(contestoApp({ agenda: 'x', stato_lead: [] })).toBeNull()
    const c = contestoApp({ agenda: [], stato_lead: [{ chiave: 'lead.finto', per: 'username', cliente: true, ha_call: false, note: 'mai' }] })
    expect(c?.stato_lead).toEqual([
      {
        chiave: 'lead.finto',
        per: 'username',
        stato_lead: null,
        fonte: null,
        prossima_call_il: null,
        prossima_call_stato: null,
        ultimo_esito: null,
        no_show_precedenti: 0,
        cliente: true,
        ha_call: false,
      },
    ])
    expect(statiLead([{ chiave: 'x', per: 'altro' }])).toEqual([])
  })
})

describe('scheletri dell’agenda', () => {
  it('gli esiti di ieri: presentato, no-show, da verificare con la sua nota', () => {
    expect(esitoShowUp({ stato: 'svolta' })).toBe('presentato')
    expect(esitoShowUp({ stato: 'no_show' })).toBe('no-show')
    const { show_up } = scheletriAgenda([
      voceAgendaFinta({ giorno: 'ieri', call_id: 's1', stato: 'svolta', programmata_il: '2026-10-13T16:00:00Z' }),
      voceAgendaFinta({ giorno: 'ieri', call_id: 's2', stato: 'no_show', programmata_il: '2026-10-13T17:00:00Z' }),
      voceAgendaFinta({ giorno: 'ieri', call_id: 's3', stato: 'programmata', programmata_il: '2026-10-13T18:00:00Z' }),
      voceAgendaFinta({ giorno: 'ieri', call_id: 's4', stato: 'riprogrammata', programmata_il: '2026-10-13T19:00:00Z' }),
    ])
    expect(show_up.map((s) => [s.call_id, s.outcome, s.note])).toEqual([
      ['s1', 'presentato', ''],
      ['s2', 'no-show', ''],
      ['s3', 'da verificare', 'Esito non ancora registrato dal closer.'],
      ['s4', 'da verificare', 'In attesa di conferma.'],
    ])
    // the time in Rome
    expect(show_up[0].time).toBe('18:00')
  })

  it('oggi e domani: mai le call in attesa di conferma, ordinate per ora, senza link Meet', () => {
    const { agenda } = scheletriAgenda([
      voceAgendaFinta({ giorno: 'domani', call_id: 'b', programmata_il: '2026-10-15T08:00:00Z' }),
      voceAgendaFinta({ giorno: 'oggi', call_id: 'a', programmata_il: '2026-10-14T17:30:00Z' }),
      voceAgendaFinta({ giorno: 'oggi', call_id: 'r', stato: 'riprogrammata', programmata_il: '2026-10-14T18:00:00Z' }),
    ])
    expect(agenda.map((a) => [a.call_id, a.day, a.time])).toEqual([
      ['a', 'oggi', '19:30'],
      ['b', 'domani', '10:00'],
    ])
    expect(agenda.every((a) => a.meet_link === '' && a.status === 'da verificare')).toBe(true)
    expect(JSON.stringify(agenda)).not.toMatch(/closer|importo|email|telefono/i)
  })

  it('un no show precedente porta la call almeno «a rischio»; senza chat resta «da verificare»', () => {
    const conChat = chatFinta({ username: 'lead_agenda_x', messaggi: [msg('lead', '2026-10-14T08:00:00Z', 'Ci vediamo stasera')] })
    const voce = voceAgendaFinta({ call_id: 'k1', username: 'lead_agenda_x', no_show_precedenti: 1 })
    const senza = voceAgendaFinta({ call_id: 'k2', username: 'nessuna_chat', no_show_precedenti: 1 })
    const doc = uniscRecap({
      canale: 'instagram',
      giorno: '2026-10-14',
      generatoIl: ADESSO.toISOString(),
      chat: [conChat],
      schede: [
        { tipo: 'agenda', chiave: 'k1', impronta: 'd'.repeat(64), dati: { status: 'confermata', note: '', suggested_message: 'Ci vediamo alle 19:30.', user_id: null } },
        { tipo: 'agenda', chiave: 'k2', impronta: 'e'.repeat(64), dati: { status: 'confermata', note: '', suggested_message: 'Ci vediamo alle 19:30.', user_id: null } },
      ],
      candidati: [],
      sintesi: null,
      contesto: { agenda: [voce, senza], stato_lead: [] },
      contenuti: [],
      escluse: 0,
      avvisi: [],
      generatoCon: { modello: 'claude-sonnet-5-5', effort: 'medium', versione_prompt: 'x', servito_da_fallback: false },
    })
    expect(doc.agenda?.find((a) => a.call_id === 'k1')?.status).toBe('a rischio')
    expect(doc.agenda?.find((a) => a.call_id === 'k2')?.status).toBe('da verificare')
  })
})

describe('le chat delle call', () => {
  const giulio = chatFinta({ canale: 'messenger', username: null, utente_id: '2468013579', nome: 'Giulio Finto' })
  const omonimo1 = chatFinta({ canale: 'messenger', username: null, utente_id: '2468013580', nome: 'Mario Doppio' })
  const omonimo2 = chatFinta({ canale: 'messenger', username: null, utente_id: '2468013581', nome: 'mario doppio ' })
  const ig = chatFinta({ username: 'luca.finto' })

  it('Instagram per handle, Messenger per nome esatto di una sola chat', () => {
    expect(chatDellaCall({ username: 'luca.finto', nome: 'Luca' }, [ig, giulio])).toBe(ig)
    expect(chatDellaCall({ username: null, nome: '  giulio finto ' }, [ig, giulio])).toBe(giulio)
    // two Messenger chats with the same name: none
    expect(chatDellaCall({ username: null, nome: 'Mario Doppio' }, [omonimo1, omonimo2])).toBeNull()
    expect(chatDellaCall({ username: null, nome: 'Giulio' }, [giulio])).toBeNull()
  })

  it('le chiavi per lo stato dei lead: handle di Instagram e nomi di Messenger normalizzati, senza doppioni', () => {
    expect(chiaviStatoLead([ig, ig, giulio, omonimo1, omonimo2, { canale: 'instagram', username: null, nome: 'X' }])).toEqual({
      username: ['luca.finto'],
      nomi: ['giulio finto', 'mario doppio'],
    })
  })
})
