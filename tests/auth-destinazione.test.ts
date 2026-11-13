import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ COOKIE_SESSIONE: /^sb-.+-auth-token(\.\d+)?$/ }))

import { destinazioneCliente, destinazioneTeam, destinazioneUtente } from '@/lib/auth/destinazione'
import { indirizzoRifiuto, verificaDopoLogin } from '@/lib/auth/dopo-login'

/*
 * The one place that decides where an authenticated user goes (release B1a,
 * docs/onboarding/rilascio-b.md, «Autenticazione»): every outcome, the profile that wins,
 * and the database not answering, which never signs anybody out.
 */

type Risposta = { data: unknown; error: { code: string } | null }

function finto(profilo: Risposta, account: Risposta, utente: Record<string, unknown> | null = { id: 'u1', app_metadata: {} }) {
  const signOut = vi.fn(async () => ({ error: null }))
  const db = {
    auth: { getUser: async () => ({ data: { user: utente } }), signOut },
    from: (tabella: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => (tabella === 'profiles' ? profilo : account) }),
      }),
    }),
  }
  return { db, signOut }
}

const nessuno: Risposta = { data: null, error: null }
const rotto: Risposta = { data: null, error: { code: '57014' } }
const cookieStore = { getAll: () => [{ name: 'sb-x-auth-token', value: 'v' }], delete: vi.fn() }

describe('destinazioneUtente: ogni esito', () => {
  it('team: il profilo attivo va al da sicuro, o alla sua pagina', async () => {
    const { db } = finto({ data: { ruolo: 'setter', attivo: true }, error: null }, nessuno)
    expect(await destinazioneUtente(db as never, { id: 'u1' })).toEqual({ esito: 'team', vai: '/today', ruolo: 'setter' })
    expect(await destinazioneUtente(db as never, { id: 'u1' }, '/setting?da=2026-10-01')).toMatchObject({ vai: '/setting?da=2026-10-01' })
    // the client's area is not for the team, another site never
    expect(await destinazioneUtente(db as never, { id: 'u1' }, '/percorso')).toMatchObject({ vai: '/today' })
    expect(await destinazioneUtente(db as never, { id: 'u1' }, '//altro.it')).toMatchObject({ vai: '/today' })
  })

  it('il profilo vince se ci fossero tutti e due', async () => {
    const { db } = finto(
      { data: { ruolo: 'admin', attivo: true }, error: null },
      { data: { client_id: 'c1', stato: 'attivo' }, error: null },
    )
    expect(await destinazioneUtente(db as never, { id: 'u1' })).toMatchObject({ esito: 'team', vai: '/' })
  })

  it('disattivato', async () => {
    const { db } = finto({ data: { ruolo: 'closer', attivo: false }, error: null }, nessuno)
    expect(await destinazioneUtente(db as never, { id: 'u1' })).toEqual({ esito: 'disattivato' })
  })

  it('cliente attivo e sospeso: /percorso, il da solo dentro /percorso', async () => {
    for (const stato of ['attivo', 'sospeso'] as const) {
      const { db } = finto(nessuno, { data: { client_id: 'c1', stato }, error: null })
      expect(await destinazioneUtente(db as never, { id: 'u1' }, '/onboarding')).toEqual({
        esito: 'cliente',
        vai: '/percorso',
        stato,
        clientId: 'c1',
      })
      expect(await destinazioneUtente(db as never, { id: 'u1' }, '/percorso/consensi')).toMatchObject({ vai: '/percorso/consensi' })
    }
  })

  it('chiuso, nessuno, errore', async () => {
    expect(await destinazioneUtente(finto(nessuno, { data: { client_id: 'c1', stato: 'chiuso' }, error: null }).db as never, { id: 'u1' })).toEqual({ esito: 'chiuso' })
    expect(await destinazioneUtente(finto(nessuno, nessuno).db as never, { id: 'u1' })).toEqual({ esito: 'nessuno' })
    expect(await destinazioneUtente(finto(rotto, nessuno).db as never, { id: 'u1' })).toEqual({ esito: 'errore' })
    expect(await destinazioneUtente(finto(nessuno, rotto).db as never, { id: 'u1' })).toEqual({ esito: 'errore' })
  })

  it('le destinazioni del cliente e del team', () => {
    expect(destinazioneCliente(null)).toBe('/percorso')
    expect(destinazioneCliente('/percorsoaltro')).toBe('/percorso')
    expect(destinazioneCliente('/percorso?x=1')).toBe('/percorso?x=1')
    expect(destinazioneTeam('/', 'closer')).toBe('/calls')
  })
})

describe('verificaDopoLogin', () => {
  it('con errore niente uscita: si va dove si andava, la pagina mostra «Riprova»', async () => {
    const { db, signOut } = finto(rotto, nessuno)
    expect(await verificaDopoLogin(db as never, cookieStore as never, '/setting')).toEqual({ ok: true, vai: '/setting' })
    const cliente = finto(rotto, nessuno, { id: 'u1', app_metadata: { tipo: 'cliente' } })
    expect(await verificaDopoLogin(cliente.db as never, cookieStore as never, '/setting')).toEqual({ ok: true, vai: '/percorso' })
    expect(signOut).not.toHaveBeenCalled()
    expect(cliente.signOut).not.toHaveBeenCalled()
  })

  it('un cliente entra senza uscire dagli altri dispositivi', async () => {
    const { db, signOut } = finto(nessuno, { data: { client_id: 'c1', stato: 'attivo' }, error: null })
    expect(await verificaDopoLogin(db as never, cookieStore as never, '/')).toEqual({ ok: true, vai: '/percorso' })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('disattivato, chiuso, nessuno: fuori, solo da questo browser', async () => {
    const casi = [
      [finto({ data: { ruolo: 'setter', attivo: false }, error: null }, nessuno), 'disattivato'],
      [finto(nessuno, { data: { client_id: 'c1', stato: 'chiuso' }, error: null }), 'percorso-concluso'],
      [finto(nessuno, nessuno), 'accesso-negato'],
    ] as const
    for (const [{ db, signOut }, motivo] of casi) {
      expect(await verificaDopoLogin(db as never, cookieStore as never)).toEqual({ ok: false, motivo })
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    }
  })

  it('senza utente: callback', async () => {
    const { db } = finto(nessuno, nessuno, null)
    expect(await verificaDopoLogin(db as never, cookieStore as never)).toEqual({ ok: false, motivo: 'callback' })
  })

  it('dove porta un rifiuto', () => {
    expect(indirizzoRifiuto('percorso-concluso')).toBe('/accesso-negato?motivo=percorso-concluso')
    expect(indirizzoRifiuto('disattivato')).toBe('/login?errore=disattivato')
  })
})
