import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { inviaTempoTeam } from '@/lib/email/tempo-team-invio'

const RIEPILOGO = {
  da: '2026-10-12',
  a: '2026-10-18',
  minuti: 90,
  voci: 2,
  persone: [{ nome: 'Anna', minuti: 90, voci: 2, progetti: [], altri_progetti: 0, altri_progetti_minuti: 0 }],
}

function dbFinto(risposta: { data: unknown; error: { message: string } | null }) {
  const chiamate: { nome: string; args: Record<string, unknown> }[] = []
  return {
    chiamate,
    db: {
      rpc: async (nome: string, args: Record<string, unknown>) => {
        chiamate.push({ nome, args })
        return nome === 'riepilogo_tempo_team' ? risposta : { data: true, error: null }
      },
    } as never,
  }
}

describe('la mail del tempo del team del lunedì', () => {
  const admin = [{ id: 'a1', email: 'dany@example.com' }]
  const settimana = { da: '2026-10-12', a: '2026-10-18' }

  it('manda una mail con la settimana come chiave e salva la copia in app', async () => {
    vi.stubEnv('RESEND_API_KEY', 'k')
    vi.stubEnv('EMAIL_MITTENTE', 'Alpha <a@example.com>')
    const { db, chiamate } = dbFinto({ data: RIEPILOGO, error: null })
    const invia = vi.fn().mockResolvedValue({ inviata: true })
    const esito = await inviaTempoTeam({ db, settimana, admin, urlApp: 'https://dashboard.percorsoalpha.com', invia })
    expect(esito).toBe('inviato')
    expect(chiamate[0]).toEqual({ nome: 'riepilogo_tempo_team', args: { p_da: '2026-10-12', p_a: '2026-10-18' } })
    expect(invia).toHaveBeenCalledWith(expect.objectContaining({ a: ['dany@example.com'], idempotenza: 'tempo-team/2026-10-12/2026-10-18' }))
    const notifica = chiamate.find((c) => c.nome === 'notifiche_registra')
    expect(notifica?.args).toMatchObject({ p_tipo: 'tempo_team', p_destinatari: ['a1'], p_email_inviata: true, p_chiave: 'tempo-team/2026-10-12/2026-10-18' })
    vi.unstubAllEnvs()
  })

  it('senza email configurata la copia in app c\'è lo stesso', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { db, chiamate } = dbFinto({ data: RIEPILOGO, error: null })
    const invia = vi.fn()
    const esito = await inviaTempoTeam({ db, settimana, admin, urlApp: 'https://x.example.com', invia })
    expect(esito).toBe('non inviato')
    expect(invia).not.toHaveBeenCalled()
    expect(chiamate.find((c) => c.nome === 'notifiche_registra')?.args).toMatchObject({ p_email_inviata: false })
    vi.unstubAllEnvs()
  })

  it('se i numeri non arrivano non manda niente e lo dice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, chiamate } = dbFinto({ data: null, error: { message: 'no' } })
    const invia = vi.fn()
    expect(await inviaTempoTeam({ db, settimana, admin, urlApp: 'https://x.example.com', invia })).toBe('non riuscito')
    expect(invia).not.toHaveBeenCalled()
    expect(chiamate.find((c) => c.nome === 'notifiche_registra')).toBeUndefined()
    vi.restoreAllMocks()
  })
})
