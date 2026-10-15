import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { ChatSalvata, ContestoApp, SchedaSalvata } from '@/lib/insight/contratti'
import { schedaMancante, schedaMinore } from '@/lib/insight/esegui'
import { leggiRecap, RECAP_MAX_BYTE } from '@/lib/insight/recap'
import {
  AVVISI_UNIONE,
  MOTIVO_MINORE_CHIUSO,
  SERVE_DANY_MINORE,
  SITUAZIONE_MINORE,
  uniscRecap,
  type OpUnione,
} from '@/lib/insight/unione'
import type { SintesiVerificata } from '@/lib/insight/verifica'
import { cartaLead, cartaNonLead, chatFinta, msg, postFinto, statoFinto, voceAgendaFinta } from './fixture-insight'

// The recap document of a day and channel (1.35.0). Invented chats only.

const generatoCon = { modello: 'claude-sonnet-5-5', effort: 'medium', versione_prompt: '2026-10-14.1', servito_da_fallback: false }

const sintesi: SintesiVerificata = {
  headline: 'Giornata buona: lead_finto_tema chiede del tempo.',
  themes: [{ theme: 'Tempo', insight: 'Hanno poco tempo.', temi: ['poco tempo'] }],
  posts: [],
  keep: ['Reel sul tempo.'],
  change: [],
  boost: [],
  setting_tips: ['Chiedi l’obiettivo.'],
  ideas: [{ hook: 'Due ore bastano', format: 'Reel', why: 'Parole dei lead.' }],
  note: '',
}

function op(extra: Partial<OpUnione>): OpUnione {
  return {
    canale: 'instagram',
    giorno: '2026-10-14',
    generatoIl: '2026-10-14T16:45:00.000Z',
    chat: [],
    schede: [],
    candidati: [],
    sintesi,
    contesto: { agenda: [], stato_lead: [] },
    contenuti: [],
    escluse: 0,
    avvisi: [],
    generatoCon,
    ...extra,
  }
}

const inAttesa = () => [msg('alpha', '2026-10-14T08:00:00.000Z', 'Che obiettivo hai?'), msg('lead', '2026-10-14T09:00:00.000Z', 'Perdere la pancia')]

describe('identity, messages and times only from code', () => {
  it('the name is the profile\'s, or the lead\'s own only when he wrote it; the age only when he wrote it', () => {
    const conProfilo = chatFinta({ messaggi: inAttesa() })
    const senzaProfilo = chatFinta({ nome: null, messaggi: [msg('lead', '2026-10-14T09:00:00.000Z', 'Sono Gino, ho 31 anni')] })
    const inventato = chatFinta({ nome: null, messaggi: [msg('lead', '2026-10-14T09:00:00.000Z', 'ciao')] })
    const doc = uniscRecap(
      op({
        chat: [conProfilo, senzaProfilo, inventato],
        schede: [
          cartaLead(conProfilo.conversazione_id, { nome_dal_lead: 'Altro', age: '40' }),
          cartaLead(senzaProfilo.conversazione_id, { nome_dal_lead: 'Gino', age: '31' }),
          cartaLead(inventato.conversazione_id, { nome_dal_lead: 'Pippo', age: '22' }),
        ],
      }),
    )
    const per = (c: ChatSalvata) => doc.leads.find((l) => l.conversation_id === c.conversazione_id)!
    expect(per(conProfilo)).toMatchObject({ name: conProfilo.nome, username: conProfilo.username, age: '' })
    expect(per(senzaProfilo)).toMatchObject({ name: 'Gino', age: '31' })
    expect(per(inventato)).toMatchObject({ name: '', age: '' })
    expect(per(conProfilo).last_from).toBe('lead')
    expect(per(conProfilo).last_message_at).toBe('2026-10-14T09:00:00.000Z')
    expect(per(conProfilo).messages).toEqual([
      { from: 'alpha', time: '14/10 10:00', text: 'Che obiettivo hai?', at: '2026-10-14T08:00:00.000Z' },
      { from: 'lead', time: '14/10 11:00', text: 'Perdere la pancia', at: '2026-10-14T09:00:00.000Z' },
    ])
  })

  it('every message has `at`, and the page reads the document', () => {
    const chats = [chatFinta({ messaggi: inAttesa() }), chatFinta()]
    const doc = uniscRecap(op({ chat: chats, schede: chats.map((c) => cartaLead(c.conversazione_id)) }))
    expect(doc.leads.flatMap((l) => l.messages).every((m) => /^\d{4}-\d{2}-\d{2}T/u.test(m.at))).toBe(true)
    expect(leggiRecap(JSON.parse(JSON.stringify(doc)))).not.toBeNull()
  })
})

describe('the counts of code (D8, D9) and the summary', () => {
  it('«attende risposta · » only when the lead has the last word; awaiting and lost with «uscita»', () => {
    const attende = chatFinta({ messaggi: inAttesa() })
    const nostro = chatFinta({ messaggi: [msg('lead', '2026-10-14T08:00:00.000Z', 'ciao'), msg('alpha', '2026-10-14T09:00:00.000Z', 'dimmi')] })
    const uscita = chatFinta({ messaggi: inAttesa() })
    const perso = chatFinta()
    const nonLead = chatFinta()
    const doc = uniscRecap(
      op({
        chat: [attende, nostro, uscita, perso, nonLead],
        schede: [
          cartaLead(attende.conversazione_id, { status: 'chiede info', target: 'si' }),
          cartaLead(nostro.conversazione_id, { status: 'attende risposta', stage: 'call prenotata' }),
          cartaLead(uscita.conversazione_id, { stage: 'uscita', status: 'chiusa' }),
          cartaLead(perso.conversazione_id, { stage: 'perso' }),
          cartaNonLead(nonLead.conversazione_id),
        ],
      }),
    )
    const per = (c: ChatSalvata) => doc.leads.find((l) => l.conversation_id === c.conversazione_id)!
    expect(per(attende).status).toBe('attende risposta · chiede info')
    expect(per(nostro).status).toBe('attende risposta')
    expect(per(uscita).status).toBe('chiusa')
    expect(doc.summary).toEqual({ conversations: 5, leads_in_target: 1, awaiting_reply: 1, calls_booked: 1, lost: 2 })
    expect(doc.non_leads).toEqual([{ username: nonLead.username, name: nonLead.nome, reason: 'Account di un brand.' }])
  })

  it('a lead with a call in the app counts as booked', () => {
    const c = chatFinta({ username: 'lead_con_call' })
    const doc = uniscRecap(
      op({
        chat: [c],
        schede: [cartaLead(c.conversazione_id)],
        contesto: { agenda: [voceAgendaFinta({ username: 'lead_con_call' })], stato_lead: [] },
      }),
    )
    expect(doc.summary.calls_booked).toBe(1)
  })

  it('the excluded chats are only a number', () => {
    expect(uniscRecap(op({ escluse: 2 })).escluse).toBe(2)
  })
})

describe('placeholders and partial recaps', () => {
  it('a chat whose analysis failed keeps identity and chat, never invented content', () => {
    const c = chatFinta({ messaggi: inAttesa() })
    const doc = uniscRecap(op({ chat: [c], schede: [schedaMancante('lead', c.conversazione_id, 'refusal:general_harms')] }))
    expect(doc.leads[0]).toMatchObject({
      analisi_mancante: true,
      priority: 'media',
      target: 'da verificare',
      status: 'attende risposta · analisi non disponibile',
      next_action: 'Apri la chat: questa conversazione non è stata analizzata.',
      suggested_message: '',
    })
    expect(doc.leads[0].messages).toHaveLength(2)
    expect(doc.stato).toBe('parziale')
    expect(doc.avvisi).toContain(AVVISI_UNIONE.parziale(1))
  })

  it('without the sintesi: the code headline and the warning', () => {
    const c = chatFinta({ messaggi: inAttesa() })
    const doc = uniscRecap(op({ chat: [c], schede: [cartaLead(c.conversazione_id, { target: 'si' })], sintesi: null }))
    expect(doc.headline).toBe('Verdetto non disponibile: la sintesi non è riuscita. 1 chat, 1 in target, 1 attendono risposta.')
    expect(doc.avvisi).toContain(AVVISI_UNIONE.sintesi)
    expect(doc.content.themes).toEqual([])
  })

  it('the run\'s warnings stay, once each', () => {
    const doc = uniscRecap(op({ avvisi: ['Messenger non raggiungibile.', 'Messenger non raggiungibile.'] }))
    expect(doc.avvisi).toEqual(['Messenger non raggiungibile.'])
    expect(doc.stato).toBe('completo')
  })
})

describe('the final check on the cards', () => {
  it('a foreign link removes the message, a style violation is to recheck', () => {
    const a = chatFinta({ messaggi: inAttesa() })
    const b = chatFinta({ messaggi: inAttesa() })
    const doc = uniscRecap(
      op({
        chat: [a, b],
        schede: [
          cartaLead(a.conversazione_id, { suggested_message: 'Guarda https://esempio.test/offerta' }),
          cartaLead(b.conversazione_id, { suggested_message: 'Dany ti risponde. Che obiettivo hai?' }),
        ],
      }),
    )
    const per = (c: ChatSalvata) => doc.leads.find((l) => l.conversation_id === c.conversazione_id)!
    expect(per(a)).toMatchObject({ suggested_message: '', next_action: 'Messaggio non mostrato: link diverso dal Calendly. Scrivilo a mano.' })
    expect(per(b).da_ricontrollare).toBe('Dany in terza persona')
    expect(per(b).suggested_message).toBe('Dany ti risponde.\nChe obiettivo hai?')
  })

  it('an objection with its reply', () => {
    const c = chatFinta({ messaggi: inAttesa() })
    const doc = uniscRecap(
      op({ chat: [c], schede: [cartaLead(c.conversazione_id, { objection: { text: 'Non ho tempo', suggested_reply: 'Capisco che il tempo sia poco.' } })] }),
    )
    expect(doc.objections).toEqual([{ username: c.username, name: c.nome, text: 'Non ho tempo', suggested_reply: 'Capisco che il tempo sia poco.' }])
  })
})

describe('origins and source from code (D26)', () => {
  const reel = postFinto('ReelDany01', '2026-10-03T09:00:00.000Z', { didascalia: 'Due ore a settimana. Scrivimi "ALPHA" in DM.' })

  it('a shared reel, a keyword, a story without a post', () => {
    const condivisione = chatFinta({ origine_tipo: 'condivisione', origine_shortcode: 'ReelDany01', origine_il: '2026-10-13T10:00:00.000Z', origine_giorno: '2026-10-13' })
    const parola = chatFinta({
      messaggi: [msg('lead', '2026-10-13T10:00:00.000Z', 'ALPHA')],
      origine_tipo: 'parola_chiave',
      origine_shortcode: 'ReelDany01',
      origine_il: '2026-10-13T10:00:00.000Z',
      origine_giorno: '2026-10-13',
    })
    const storia = chatFinta({ origine_tipo: 'storia', origine_shortcode: null, origine_il: '2026-10-13T10:00:00.000Z', origine_giorno: '2026-10-13' })
    const doc = uniscRecap(
      op({ chat: [condivisione, parola, storia], schede: [condivisione, parola, storia].map((c) => cartaLead(c.conversazione_id)), contenuti: [reel] }),
    )
    const per = (c: ChatSalvata) => doc.leads.find((l) => l.conversation_id === c.conversazione_id)!
    expect(per(condivisione).origine).toEqual({
      tipo: 'condivisione',
      shortcode: 'ReelDany01',
      permalink: 'https://www.instagram.com/reel/ReelDany01/',
      data: '03/10',
      tipo_post: 'reel',
      hook: 'Due ore a settimana.',
    })
    expect(per(condivisione).source).toBe('reel del 03/10 condiviso in DM')
    expect(per(parola).origine?.parola).toBe('ALPHA')
    expect(per(parola).source).toBe('parola chiave «ALPHA» (reel del 03/10)')
    expect(per(storia).source).toBe('risposta a una storia')
    expect(doc.content.storie).toEqual({ dm: 1, target: 0 })
  })

  it('the post Claude found becomes a `testo` origin', () => {
    const c = chatFinta({ messaggi: [msg('lead', '2026-10-13T10:00:00.000Z', 'ho visto il video sulle due ore')] })
    const doc = uniscRecap(op({ chat: [c], schede: [cartaLead(c.conversazione_id, { post_shortcode: 'ReelDany01' })], contenuti: [reel] }))
    expect(doc.leads[0].source).toBe('dal testo: reel del 03/10')
    expect(doc.content.posts[0]).toMatchObject({ shortcode: 'ReelDany01', dm: 1 })
  })
})

describe('under 14 (D25)', () => {
  it('while he has the last word: a card without messages, blanked, with the closure', () => {
    const c = chatFinta({ messaggi: [msg('alpha', '2026-10-14T08:00:00.000Z', 'Quanti anni hai?'), msg('lead', '2026-10-14T09:00:00.000Z', 'ho 13 anni, vivo con mia madre')] })
    const doc = uniscRecap(
      op({
        chat: [c],
        schede: [
          cartaLead(c.conversazione_id, {
            fascia_eta: 'sotto_14',
            age: '13',
            situation: 'vive con mia madre',
            pain: 'si vede magro',
            topics: ['magrezza'],
            suggested_message: 'Grazie davvero per avermi scritto!\nTi lascio i miei contenuti gratuiti 💪',
            objection: { text: 'non ho soldi', suggested_reply: 'ok' },
          }),
        ],
      }),
    )
    expect(doc.leads[0]).toMatchObject({
      minore_14: true,
      messages: [],
      situation: SITUAZIONE_MINORE,
      pain: '',
      topics: [],
      priority: 'alta',
      target: 'no',
      stage: 'uscita',
      needs_dany: SERVE_DANY_MINORE,
      suggested_message: 'Grazie davvero per avermi scritto!\nTi lascio i miei contenuti gratuiti 💪',
    })
    expect(doc.objections).toEqual([])
    expect(JSON.stringify(doc)).not.toContain('mia madre')
    expect(doc.summary.awaiting_reply).toBe(0)
  })

  it('a proposal to an under-14 lead is never shown', () => {
    const c = chatFinta({ messaggi: [msg('lead', '2026-10-14T09:00:00.000Z', 'ho 12 anni')] })
    const doc = uniscRecap(op({ chat: [c], schede: [cartaLead(c.conversazione_id, { age: '12', suggested_message: 'Fissiamo una videochiamata?' })] }))
    expect(doc.leads[0]).toMatchObject({ minore_14: true, suggested_message: '' })
  })

  it('once our message is the last: out of the leads', () => {
    const c = chatFinta({ minore_14: true, messaggi: [], ultimo_da: 'alpha', ultimo_il: '2026-10-14T10:00:00.000Z' })
    const doc = uniscRecap(op({ chat: [c], schede: [schedaMinore(c.conversazione_id, 'Grazie! 💪')] }))
    expect(doc.leads).toEqual([])
    expect(doc.non_leads).toEqual([{ username: c.username, name: c.nome, reason: MOTIVO_MINORE_CHIUSO }])
  })

  it('a later run: the last closure from code, no text of his', () => {
    const c = chatFinta({ minore_14: true, messaggi: [], ultimo_da: 'lead', ultimo_il: '2026-10-14T10:00:00.000Z' })
    const doc = uniscRecap(op({ chat: [c], schede: [schedaMinore(c.conversazione_id, 'Grazie davvero! 💪')] }))
    expect(doc.leads[0]).toMatchObject({ minore_14: true, messages: [], suggested_message: 'Grazie davvero! 💪' })
  })
})

describe('reactivation and agenda', () => {
  it('a candidate with its card: days of silence and step from code', () => {
    const c = chatFinta({ ultimo_il: '2026-10-07T10:00:00.000Z', messaggi: [msg('alpha', '2026-10-07T10:00:00.000Z', 'Ti mando il link')] })
    const doc = uniscRecap(
      op({
        chat: [c],
        candidati: [{ conversazione_id: c.conversazione_id, giorni_silenzio: 7, passo: 2 }],
        schede: [cartaLead(c.conversazione_id, { suggested_message: 'Ciao!\nTi lascio un consiglio.' }, 'riattivazione')],
      }),
    )
    expect(doc.leads).toEqual([])
    expect(doc.reactivate[0]).toMatchObject({ conversation_id: c.conversazione_id, days_silent: 7, step: 2, suggested_message: 'Ciao!\nTi lascio un consiglio.' })
  })

  it('the agenda from the app with the model\'s cards, the no-show floor, Messenger, a missing card', () => {
    const conCarta = voceAgendaFinta({ no_show_precedenti: 1, programmata_il: '2026-10-14T17:30:00.000Z' })
    const senzaCarta = voceAgendaFinta({ giorno: 'domani', programmata_il: '2026-10-15T16:00:00.000Z' })
    const inAttesaConferma = voceAgendaFinta({ stato: 'riprogrammata' })
    const ieri = voceAgendaFinta({ giorno: 'ieri', stato: 'no_show', programmata_il: '2026-10-13T17:00:00.000Z' })
    const contesto: ContestoApp = { agenda: [conCarta, senzaCarta, inAttesaConferma, ieri], stato_lead: [] }
    const schede: SchedaSalvata[] = [
      { tipo: 'agenda', chiave: conCarta.call_id, impronta: 'c'.repeat(64), dati: { status: 'confermata', note: 'ok', suggested_message: 'Ci vediamo alle 19:30 💪', user_id: '777' } },
      { tipo: 'show_up', chiave: ieri.call_id, impronta: 'd'.repeat(64), dati: { note: 'Non c’era.', suggested_message: 'Ti va di fissare un altro momento?' } },
    ]
    const doc = uniscRecap(op({ contesto, schede }))
    expect(doc.agenda).toEqual([
      {
        call_id: conCarta.call_id,
        day: 'oggi',
        time: '19:30',
        name: conCarta.nome,
        username: conCarta.username,
        meet_link: '',
        status: 'a rischio',
        note: 'ok',
        suggested_message: 'Ci vediamo alle 19:30 💪',
        channel: 'Messenger',
        user_id: '777',
      },
      { call_id: senzaCarta.call_id, day: 'domani', time: '18:00', name: senzaCarta.nome, username: senzaCarta.username, meet_link: '', status: 'da verificare', note: '', suggested_message: '' },
    ])
    expect(doc.show_up).toEqual([
      { call_id: ieri.call_id, day: 'ieri', time: '19:00', name: ieri.nome, username: ieri.username, outcome: 'no-show', note: 'Non c’era.', suggested_message: 'Ti va di fissare un altro momento?' },
    ])
    expect(doc.avvisi).toContain(AVVISI_UNIONE.agenda)
    expect(JSON.stringify(doc.agenda)).not.toMatch(/closer|importo|note_closer/u)
  })
})

describe('agenda without the lead\'s chat', () => {
  it('the model\'s status is not trusted: «da verificare»; with the chat it is', () => {
    const senza = voceAgendaFinta({ username: 'nessuna_chat' })
    const con = voceAgendaFinta({ username: 'con_chat' })
    const c = chatFinta({ username: 'con_chat' })
    const carte: SchedaSalvata[] = [senza, con].map((v) => ({
      tipo: 'agenda',
      chiave: v.call_id,
      impronta: 'f'.repeat(64),
      dati: { status: 'confermata', note: '', suggested_message: 'Ci vediamo alle 19:30 💪', user_id: null },
    }))
    const doc = uniscRecap(op({ chat: [c], schede: carte, contesto: { agenda: [senza, con], stato_lead: [] } }))
    expect(doc.agenda?.map((a) => [a.username, a.status])).toEqual([
      ['nessuna_chat', 'da verificare'],
      ['con_chat', 'confermata'],
    ])
  })
})

describe('content, Messenger and size', () => {
  it('themes counted by code, names out of the content', () => {
    const c = chatFinta({ username: 'lead_finto_tema', ultimo_il: '2026-10-13T10:00:00.000Z', messaggi: [msg('lead', '2026-10-13T10:00:00.000Z', 'poco tempo')] })
    const doc = uniscRecap(op({ chat: [c], schede: [cartaLead(c.conversazione_id, { topics: ['poco tempo'], target: 'si' })] }))
    expect(doc.content.themes).toEqual([{ theme: 'Tempo', insight: 'Hanno poco tempo.', count: 1, target_count: 1, calls: 0, trend: 'in crescita' }])
    expect(doc.headline).toBe('Giornata buona: un lead chiede del tempo.')
    expect(doc.content.period).toBe('Ultimi 14 giorni (dal 01/10 al 14/10)')
    expect(doc.content.based_on).toBe(1)
  })

  it('the Messenger document has no posts, no stories, no agenda', () => {
    const c = chatFinta({ canale: 'messenger', username: null, utente_id: '42' })
    const doc = uniscRecap(op({ canale: 'messenger', chat: [c], schede: [cartaLead(c.conversazione_id)], contenuti: [postFinto('ReelDany01', '2026-10-13T09:00:00.000Z')] }))
    expect(doc.content.posts).toEqual([])
    expect(doc.content.storie).toBeUndefined()
    expect('agenda' in doc).toBe(false)
    expect(doc.leads[0]).toMatchObject({ user_id: '42' })
    expect(doc.leads[0].username).toBeUndefined()
  })

  it('over 400 KB: the low-priority and reactivation chats keep their last 8 messages', () => {
    const lunghi = Array.from({ length: 20 }, (_, i) => msg(i % 2 ? 'alpha' : 'lead', `2026-10-14T0${Math.floor(i / 10)}:${String(i % 60).padStart(2, '0')}:00.000Z`, 'x'.repeat(1_200)))
    const chats = Array.from({ length: 25 }, () => chatFinta({ messaggi: lunghi }))
    const doc = uniscRecap(op({ chat: chats, schede: chats.map((c) => cartaLead(c.conversazione_id, { priority: 'bassa' })) }))
    expect(doc.leads.every((l) => l.messages.length === 8)).toBe(true)
    expect(doc.avvisi).toContain(AVVISI_UNIONE.ridotto)
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBeLessThan(RECAP_MAX_BYTE)
  })

  it('a lead state of the app never reaches the document', () => {
    const c = chatFinta({ username: 'lead_cliente' })
    const doc = uniscRecap(op({ chat: [c], schede: [cartaLead(c.conversazione_id)], contesto: { agenda: [], stato_lead: [statoFinto('lead_cliente', { cliente: true })] } }))
    expect(JSON.stringify(doc)).not.toMatch(/"cliente"|ha_call|prossima_call/u)
  })
})
