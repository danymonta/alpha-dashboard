import { describe, expect, it } from 'vitest'

import { linkSenzaPrenotazione } from '@/lib/insight/calendly'
import type { LeadRecap } from '@/lib/insight/recap'

const OGGI = '2026-11-10'
const CAL = 'https://calendly.com/danielemontagnolo/coaching-call'

function lead(username: string, campi: Partial<LeadRecap> = {}): LeadRecap {
  return {
    conversation_id: `c-${username}`,
    username,
    name: username.toUpperCase(),
    age: '',
    priority: 'media',
    target: 'si',
    stage: 'proposta call',
    status: '',
    situation: 'Ha chiesto come funziona',
    pain: '',
    next_action: '',
    suggested_message: 'Ehi, sei riuscito a dare un’occhiata?',
    suggested_message_alt: '',
    alt_condition: '',
    needs_dany: '',
    flow: 'inbound',
    source: '',
    topics: [],
    last_from: 'alpha',
    last_message_at: '2026-11-08T18:00:00Z',
    messages: [],
    ...campi,
  } as LeadRecap
}

const msg = (from: 'lead' | 'alpha', text: string, at: string) => ({ from, text, at, time: '' })

describe('Calendly mandato, call non prenotata (1.75.0)', () => {
  it('prende chi ha ricevuto il link dei nostri messaggi, con i giorni da allora', () => {
    const righe = linkSenzaPrenotazione(
      {
        leads: [
          lead('mario', { messages: [msg('lead', 'ok dimmi', '2026-11-07T10:00:00Z'), msg('alpha', `Prenota qui ${CAL}`, '2026-11-07T10:05:00Z')] }),
          lead('luca', { messages: [msg('alpha', 'Ciao!', '2026-11-09T10:00:00Z')] }),
        ],
        reactivate: [],
      },
      OGGI,
    )
    expect(righe.map((r) => r.username)).toEqual(['mario'])
    expect(righe[0]).toMatchObject({ chiave: 'mario', giorni: 3, ultimo_da_lead: false, messaggio: 'Ehi, sei riuscito a dare un’occhiata?' })
  })

  it('non prende un link mandato dal lead, né chi ha già prenotato, è perso o è un minore', () => {
    const conLink = [msg('alpha', CAL, '2026-11-09T10:00:00Z')]
    const righe = linkSenzaPrenotazione(
      {
        leads: [
          lead('a', { messages: [msg('lead', CAL, '2026-11-09T10:00:00Z')] }),
          lead('b', { stage: 'call prenotata', messages: conLink }),
          lead('c', { stage: 'perso', messages: conLink }),
          lead('d', { minore_14: true, messages: conLink }),
        ],
        reactivate: [],
      },
      OGGI,
    )
    expect(righe).toEqual([])
  })

  it('vale anche lo stage «calendly inviato» senza il messaggio in vista, in fondo', () => {
    const righe = linkSenzaPrenotazione(
      {
        leads: [lead('x', { stage: 'calendly inviato' })],
        reactivate: [
          { ...lead('y', { messages: [msg('alpha', CAL, '2026-11-01T10:00:00Z'), msg('lead', 'ci penso', '2026-11-02T09:00:00Z')] }), days_silent: 8, step: 2 },
        ],
      },
      OGGI,
    )
    expect(righe.map((r) => [r.username, r.giorni, r.ultimo_da_lead])).toEqual([
      ['y', 9, true],
      ['x', null, false],
    ])
  })

  it('una chat che sta sia nelle chat del giorno sia da riattivare compare una volta', () => {
    const l = lead('z', { messages: [msg('alpha', CAL, '2026-11-09T10:00:00Z')] })
    expect(linkSenzaPrenotazione({ leads: [l], reactivate: [{ ...l, days_silent: 1, step: 1 }] }, OGGI)).toHaveLength(1)
  })
})
