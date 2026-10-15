import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { candidatiRiattivazione, CANDIDATI_MAX, giorniDiSilenzio, passoDiSilenzio } from '@/lib/insight/candidati'
import { cartaLead, cartaNonLead, chatFinta, msg, statoFinto } from './fixture-insight'

// The leads to reactivate (1.35.0): who is a candidate, the days of silence,
// the step, the order and the cap. Invented chats only.

const OGGI = '2026-10-14'

/** A chat whose last message is `giorni` Rome days before OGGI, at 12:00 in Rome. */
function ferma(giorni: number, extra: Parameters<typeof chatFinta>[0] = {}) {
  const giorno = new Date(Date.parse(`${OGGI}T10:00:00Z`) - giorni * 86_400_000).toISOString()
  return chatFinta({ messaggi: [msg('lead', giorno, 'Ciao, mi interessa il percorso'), msg('alpha', giorno, 'Che obiettivo hai?')], ...extra })
}

function candidati(chat: ReturnType<typeof ferma>[], op: Partial<Parameters<typeof candidatiRiattivazione>[0]> = {}) {
  return candidatiRiattivazione({ chat, delGiorno: new Set(), schede: [], statoLead: [], oggi: OGGI, ...op })
}

describe('giorni di silenzio e passo', () => {
  it('conta i giorni di Roma, non le 24 ore', () => {
    // 23:30 in Rome on the 13th (21:30 UTC): one day, though less than 24 hours ago
    expect(giorniDiSilenzio('2026-10-13T21:30:00Z', OGGI)).toBe(1)
    // 00:30 in Rome on the 14th (22:30 UTC of the 13th): today
    expect(giorniDiSilenzio('2026-10-13T22:30:00Z', OGGI)).toBe(0)
    expect(giorniDiSilenzio(null, OGGI)).toBeNull()
    expect(giorniDiSilenzio('non è una data', OGGI)).toBeNull()
  })

  it('attraversa la fine dell’ora legale del 25/10/2026 senza perdere un giorno', () => {
    // the last message on Saturday 24/10 at 23:00 in Rome (21:00 UTC, still summer time)
    expect(giorniDiSilenzio('2026-10-24T21:00:00Z', '2026-10-25')).toBe(1)
    expect(giorniDiSilenzio('2026-10-24T21:00:00Z', '2026-11-03')).toBe(10)
    // and the start of summer time, 29/03/2026
    expect(giorniDiSilenzio('2026-03-28T22:30:00Z', '2026-03-29')).toBe(1)
  })

  it('passo 1 fino a 4 giorni, 2 da 5 a 9, 3 da 10', () => {
    expect([1, 4, 5, 9, 10, 14].map(passoDiSilenzio)).toEqual([1, 1, 2, 2, 3, 3])
  })
})

describe('candidatiRiattivazione', () => {
  it('prende le chat ferme da 1 a 14 giorni, fuori dalle chat di oggi', () => {
    const oggi = ferma(0)
    const ieri = ferma(1)
    const quattordici = ferma(14)
    const quindici = ferma(15)
    const delGiorno = ferma(3)
    const out = candidati([oggi, ieri, quattordici, quindici, delGiorno], { delGiorno: new Set([delGiorno.conversazione_id]) })
    expect(out.map((c) => c.conversazione_id).sort()).toEqual([ieri.conversazione_id, quattordici.conversazione_id].sort())
    expect(out.find((c) => c.conversazione_id === quattordici.conversazione_id)).toMatchObject({ giorni_silenzio: 14, passo: 3 })
    expect(out.find((c) => c.conversazione_id === ieri.conversazione_id)).toMatchObject({ giorni_silenzio: 1, passo: 1 })
  })

  it('mai un non lead, un minore di 14 anni, un perso, un no contatto, un cliente o un lead perso nell’app', () => {
    const nonLead = ferma(3, { non_lead: true, messaggi: [] })
    const minore = ferma(3, { minore_14: true, messaggi: [] })
    const perso = ferma(3)
    const noContatto = ferma(3)
    const cliente = ferma(3)
    const persoApp = ferma(3)
    const cartaNon = ferma(3)
    const nonRiattivare = ferma(3)
    const buono = ferma(3)
    const out = candidati([nonLead, minore, perso, noContatto, cliente, persoApp, cartaNon, nonRiattivare, buono], {
      schede: [
        cartaLead(perso.conversazione_id, { stage: 'perso' }),
        cartaLead(noContatto.conversazione_id, { no_contatto: true }),
        cartaNonLead(cartaNon.conversazione_id),
        // Claude said «do not reactivate» on the last reactivation card
        { tipo: 'riattivazione', chiave: nonRiattivare.conversazione_id, impronta: 'c'.repeat(64), dati: { tipo: 'non_lead', reason: 'Cliente.' } },
      ],
      statoLead: [statoFinto(cliente.username as string, { cliente: true }), statoFinto(persoApp.username as string, { stato_lead: 'perso' })],
    })
    expect(out.map((c) => c.conversazione_id)).toEqual([buono.conversazione_id])
  })

  it('una riattivazione rifiutata vale finché non arriva una scheda di riattivazione più recente', () => {
    const chat = ferma(4)
    const out = candidati([chat], {
      schede: [
        { tipo: 'riattivazione', chiave: chat.conversazione_id, impronta: 'c'.repeat(64), dati: { tipo: 'non_lead', reason: 'Cliente.' } },
        cartaLead(chat.conversazione_id, {}, 'riattivazione'),
      ],
    })
    expect(out.map((c) => c.conversazione_id)).toEqual([chat.conversazione_id])
  })

  it('prima i lead in target, poi da verificare, poi no; dentro, i più silenziosi prima', () => {
    const siPoco = ferma(2)
    const siTanto = ferma(9)
    const daVerificare = ferma(12)
    const no = ferma(13)
    const senzaScheda = ferma(5, { ultimo_target: 'si' })
    const out = candidati([no, daVerificare, siPoco, siTanto, senzaScheda], {
      schede: [
        cartaLead(siPoco.conversazione_id, { target: 'si' }),
        cartaLead(siTanto.conversazione_id, { target: 'si' }),
        cartaLead(daVerificare.conversazione_id, { target: 'da verificare' }),
        cartaLead(no.conversazione_id, { target: 'no' }),
      ],
    })
    expect(out.map((c) => c.conversazione_id)).toEqual([
      siTanto.conversazione_id,
      senzaScheda.conversazione_id,
      siPoco.conversazione_id,
      daVerificare.conversazione_id,
      no.conversazione_id,
    ])
  })

  it('al massimo 20', () => {
    const chat = Array.from({ length: 30 }, (_, i) => ferma(1 + (i % 14)))
    const out = candidati(chat)
    expect(out).toHaveLength(CANDIDATI_MAX)
    // the longest silent are kept
    expect(Math.min(...out.map((c) => c.giorni_silenzio))).toBeGreaterThanOrEqual(Math.min(...chat.map((c) => giorniDiSilenzio(c.ultimo_il, OGGI) as number)))
    expect(out[0].giorni_silenzio).toBe(14)
  })
})
