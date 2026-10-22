import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Who taps: the action reads the profile
const sessione = vi.hoisted(() => ({ ruolo: 'admin', attivo: true }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => ({ id: 'p1', ...sessione })) }))

// A fake PostgREST client: the RPC calls recorded, every call takes the next answer in line
type Errore = { code?: string; message: string }
const db = vi.hoisted(() => {
  const stato = {
    risposte: [] as { data: unknown; error: Errore | null }[],
    chiamate: [] as [string, unknown][],
  }
  const client = {
    rpc: (nome: string, args: unknown) => {
      stato.chiamate.push([nome, args])
      return Promise.resolve(stato.risposte.shift() ?? { data: 'esecuzione-1', error: null })
    },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db.client) }))
// the service role writes the step address (salvaUrlPasso): recorded apart from the session's calls
const servizio = vi.hoisted(() => ({ chiamate: [] as [string, unknown][], errore: null as { code: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (nome: string, args: unknown) => {
      servizio.chiamate.push([nome, args])
      return Promise.resolve({ data: null, error: servizio.errore })
    },
  }),
}))

const log = vi.spyOn(console, 'error').mockImplementation(() => {})

import { revalidatePath } from 'next/cache'

import { aggiornaDati } from '@/app/(app)/insight/actions'
import { AGGIORNA, AGGIORNA_SETTER, erroreRichiesta, FRASI_RICHIESTA, SOLO_AGGIORNA } from '@/lib/insight/parole'
import { URL_PASSO_MANCANTE } from '@/lib/validation/insight'

const URL_LOCALE = 'http://host.docker.internal:3200/api/cron/insight'

/** Words the setter must never read: costs, keys, variables, technical errors, the scheduler. */
const MAI_AL_SETTER = /ANTHROPIC|APP_URL|INSIGHT_URL_PASSO|Vercel|\$|costo|token|chiave|pianificatore|Indirizzo|boom|XX000/i

beforeEach(() => {
  for (const nome of ['VERCEL_ENV', 'ANTHROPIC_API_KEY', 'INSIGHT_URL_PASSO', 'NEXT_PUBLIC_APP_URL']) vi.stubEnv(nome, '')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-prova')
  vi.stubEnv('INSIGHT_URL_PASSO', URL_LOCALE)
  sessione.ruolo = 'admin'
  sessione.attivo = true
  db.stato.risposte = []
  db.stato.chiamate = []
  servizio.chiamate = []
  servizio.errore = null
  log.mockClear()
  vi.mocked(revalidatePath).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('aggiornaDati: chi può', () => {
  it.each(['admin', 'setter'])('%s attivo: il server scrive l’indirizzo, la sessione chiede l’aggiornamento', async (ruolo) => {
    sessione.ruolo = ruolo
    expect(await aggiornaDati()).toEqual({ ok: true, esecuzione: 'esecuzione-1' })
    expect(servizio.chiamate).toEqual([['insight_imposta_url', { p_url: URL_LOCALE }]])
    // no argument: the session never chooses the address, and nothing says who asked
    expect(db.stato.chiamate).toEqual([['insight_richiedi', undefined]])
    expect(vi.mocked(revalidatePath).mock.calls.map((c) => c[0])).toEqual(['/insight'])
  })

  it.each(['closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'])(
    '%s: non arriva né al service role né al database',
    async (ruolo) => {
      sessione.ruolo = ruolo
      expect(await aggiornaDati()).toEqual({ ok: false, errore: SOLO_AGGIORNA })
      expect(servizio.chiamate).toEqual([])
      expect(db.stato.chiamate).toEqual([])
    },
  )

  it('un setter disattivato nemmeno', async () => {
    sessione.ruolo = 'setter'
    sessione.attivo = false
    expect(await aggiornaDati()).toEqual({ ok: false, errore: 'Sessione scaduta. Rientra e riprova.' })
    expect(servizio.chiamate).toEqual([])
    expect(db.stato.chiamate).toEqual([])
  })

  it('in locale coi passi manuali l’aggiornamento aspetta chi lo guida, senza indirizzo', async () => {
    sessione.ruolo = 'setter'
    vi.stubEnv('INSIGHT_URL_PASSO', 'manuale')
    expect((await aggiornaDati()).ok).toBe(true)
    expect(servizio.chiamate).toEqual([])
    expect(db.stato.chiamate).toEqual([['insight_richiedi', undefined]])
  })

  it('nessun log porta la persona', async () => {
    sessione.ruolo = 'setter'
    servizio.errore = { code: 'XX000' }
    await aggiornaDati()
    for (const riga of log.mock.calls.flat()) expect(String(riga)).not.toMatch(/p1|setter|Loris/)
  })
})

describe('aggiornaDati: le parole', () => {
  it('senza ANTHROPIC_API_KEY: all’admin il nome della chiave, al setter solo che l’Insight non è attivo', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA.chiaveMancante })
    sessione.ruolo = 'setter'
    expect(await aggiornaDati()).toEqual({ ok: false, errore: 'L’Insight non è attivo: avvisa Dany.' })
    expect(db.stato.chiamate).toEqual([])
  })

  it('senza un indirizzo valido: all’admin APP_URL, al setter una frase generica', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://dashboard.percorsoalpha.com')
    expect(await aggiornaDati()).toEqual({ ok: false, errore: URL_PASSO_MANCANTE })
    sessione.ruolo = 'setter'
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA_SETTER.nonRiuscito })
    expect(servizio.chiamate).toEqual([])
    expect(db.stato.chiamate).toEqual([])
  })

  it('l’indirizzo che non si salva: all’admin lo dice, al setter la frase generica', async () => {
    servizio.errore = { code: 'XX000' }
    expect(await aggiornaDati()).toEqual({ ok: false, errore: 'Indirizzo dell’app non salvato. Riprova.' })
    sessione.ruolo = 'setter'
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA_SETTER.nonRiuscito })
    expect(db.stato.chiamate).toEqual([])
  })

  it('le due frasi del database arrivano uguali al setter e all’admin', async () => {
    for (const ruolo of ['admin', 'setter']) {
      sessione.ruolo = ruolo
      for (const frase of Object.values(FRASI_RICHIESTA)) {
        db.stato.risposte.push({ data: null, error: { code: '22023', message: frase } })
        expect(await aggiornaDati()).toEqual({ ok: false, errore: frase })
      }
    }
    expect(FRASI_RICHIESTA.limite).toBe('Hai già aggiornato 8 volte oggi: riprova domani.')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un altro errore: all’admin il testo del database o «non avviato», al setter la frase generica', async () => {
    db.stato.risposte.push({ data: null, error: { code: '22023', message: 'Una frase nuova del database.' } })
    expect(await aggiornaDati()).toEqual({ ok: false, errore: 'Una frase nuova del database.' })
    db.stato.risposte.push({ data: null, error: { code: 'XX000', message: 'boom' } })
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA.nonAvviato })
    sessione.ruolo = 'setter'
    db.stato.risposte.push({ data: null, error: { code: '22023', message: 'Una frase nuova del database.' } })
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA_SETTER.nonRiuscito })
    db.stato.risposte.push({ data: null, error: { code: 'XX000', message: 'boom' } })
    expect(await aggiornaDati()).toEqual({ ok: false, errore: AGGIORNA_SETTER.nonRiuscito })
    // the account turned off while the page was open
    db.stato.risposte.push({ data: null, error: { code: '42501', message: 'qualunque' } })
    expect(await aggiornaDati()).toEqual({ ok: false, errore: SOLO_AGGIORNA })
  })

  it('le parole del setter non dicono mai costi, chiavi, variabili o errori tecnici', () => {
    for (const frase of [...Object.values(AGGIORNA_SETTER), ...Object.values(FRASI_RICHIESTA), SOLO_AGGIORNA, AGGIORNA.fatto]) {
      expect(frase).not.toMatch(MAI_AL_SETTER)
      expect(frase).not.toMatch(/[—–]/)
    }
    expect(AGGIORNA_SETTER).toEqual({
      inCorso: 'Aggiornamento avviato: il recap arriva tra pochi minuti, puoi chiudere la pagina.',
      nonAttivo: 'L’Insight non è attivo: avvisa Dany.',
      nonRiuscito: 'Aggiornamento non riuscito: riprova più tardi o avvisa Dany.',
    })
    // the same mapping, outside the action
    expect(erroreRichiesta({ code: 'P0001', message: 'x' }, false)).toBe(AGGIORNA_SETTER.nonRiuscito)
  })
})
