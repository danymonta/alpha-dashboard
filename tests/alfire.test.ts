import { asSchema, type ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ARGOMENTI_GUIDA, GUIDA } from '@/lib/alfire/guida'
import { SCRITTURE, STRUMENTI, isScrittura, strumentiConsentiti } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { riassuntoScrittura } from '@/lib/alfire/riassunto'
import { strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'

// The tools run the same server actions as the forms: stand-ins here, so the
// test sees what a tool would write without Next or a database.
const azioni = vi.hoisted(() => ({
  fissaCall: vi.fn<(input: unknown) => Promise<{ ok: true; leadEsistente: boolean }>>(async () => ({
    ok: true,
    leadEsistente: false,
  })),
  modificaCall: vi.fn<(input: unknown) => Promise<{ ok: true }>>(async () => ({ ok: true })),
  completaTask: vi.fn<(input: unknown) => Promise<{ ok: true }>>(async () => ({ ok: true })),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/app/(app)/calls/actions', () => ({ modificaCall: azioni.modificaCall }))
vi.mock('@/app/(app)/calls/new/actions', () => ({ fissaCall: azioni.fissaCall }))
vi.mock('@/app/(app)/progetti/[id]/actions', () => ({ aggiungiTask: vi.fn(), completaTask: azioni.completaTask }))
vi.mock('@/app/(app)/clients/actions', () => ({ aggiornaCliente: vi.fn(), creaCliente: vi.fn() }))
vi.mock('@/app/(app)/expenses/actions', () => ({ aggiungiCosto: vi.fn(), modificaCosto: vi.fn() }))
vi.mock('@/app/(app)/progetti/actions', () => ({ creaProgetto: vi.fn() }))
vi.mock('@/app/(app)/sales/[id]/actions', () => ({ modificaRata: vi.fn(), modificaVendita: vi.fn(), segnaIncassata: vi.fn() }))
vi.mock('@/app/(app)/sales/new/actions', () => ({ registraVendita: vi.fn() }))
vi.mock('@/app/(app)/today/actions', () => ({ salvaReportGiornaliero: vi.fn() }))

const IO = '00000000-0000-4000-8000-000000000001'
const ALTRO = '00000000-0000-4000-8000-000000000002'
const CALL = '00000000-0000-4000-8000-000000000003'

/** A read-only Supabase stand-in: every query on a table answers with its rows. */
function supabaseFinto(righe: Record<string, unknown[]>) {
  return {
    from(tabella: string) {
      const dati = righe[tabella] ?? []
      const query: Record<string, unknown> = {
        maybeSingle: async () => ({ data: dati[0] ?? null, error: null }),
        single: async () => ({ data: dati[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve({ data: dati, error: null }).then(ok, ko),
      }
      for (const metodo of ['select', 'eq', 'neq', 'in', 'ilike', 'contains', 'order', 'limit', 'gte', 'lt', 'lte']) {
        query[metodo] = () => query
      }
      return query
    },
  }
}

function strumentiDi(ruolo: AppRole, livello: LivelloPm, righe: Record<string, unknown[]> = {}): ToolSet {
  const profilo = { id: IO, nome: 'Chi chatta', ruolo, attivo: true } as Profilo
  return strumentiAlfire(supabaseFinto(righe) as never, profilo, livello)
}

async function esegui(strumenti: ToolSet, nome: string, input: Record<string, unknown>) {
  const execute = strumenti[nome]?.execute
  if (!execute) throw new Error(`${nome} non c’è`)
  return execute(input as never, { toolCallId: 'prova', messages: [] } as never)
}

/** What the model reads about a tool: description and JSON schema of its input. */
async function comeLoVedeIlModello(strumenti: ToolSet, nome: string) {
  const t = strumenti[nome]
  return JSON.stringify({ descrizione: t.description, input: await asSchema(t.inputSchema).jsonSchema })
}

// Tools that read a client's money, costs, margin or other people's pay
const SOLDI = [
  'numeri_periodo',
  'cash_per_mese',
  'da_incassare',
  'cerca_clienti',
  'rate_cliente',
  'vendite_periodo',
  'provvigioni',
  'costi_periodo',
  'modifica_vendita',
  'modifica_rata',
  'modifica_costo',
]

describe('strumenti di Alfire per ruolo', () => {
  it('l’admin ha tutto tranne gli strumenti del setter', () => {
    const admin = strumentiConsentiti('admin', 'admin')
    for (const s of SOLDI) expect(admin).toContain(s)
    expect(admin).toContain('crea_cliente')
    expect(admin).toContain('crea_progetto')
    expect(admin).not.toContain('aggiorna_report')
  })

  it('un collaboratore non riceve mai strumenti sui soldi dei clienti, i costi o i compensi altrui', () => {
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      const suoi = strumentiConsentiti(ruolo, 'employee')
      for (const s of SOLDI) expect(suoi, `${ruolo} → ${s}`).not.toContain(s)
      expect(suoi).not.toContain('segna_incassata')
      expect(suoi).not.toContain('registra_costo')
    }
  })

  it('il setter ha i suoi numeri, il report e le call', () => {
    expect(strumentiConsentiti('setter', 'employee')).toEqual(
      expect.arrayContaining(['miei_numeri', 'aggiorna_report', 'fissa_call', 'call_periodo', 'guida']),
    )
  })

  it('al setter nessuno strumento offre la strategy call: fissa solo discovery', async () => {
    const setter = strumentiDi('setter', 'employee')
    for (const nome of Object.keys(setter)) {
      expect(await comeLoVedeIlModello(setter, nome), nome).not.toMatch(/strategy/i)
    }
    expect(await comeLoVedeIlModello(setter, 'fissa_call')).not.toContain('"tipo"')
    expect(await comeLoVedeIlModello(setter, 'modifica_call')).not.toContain('"tipo"')
    // the report asks what the form asks, strategy_prenotate included no more
    expect(await comeLoVedeIlModello(setter, 'aggiorna_report')).toContain('"follow_up"')
    // admin and closer can still correct the type: the history has strategy calls
    expect(await comeLoVedeIlModello(strumentiDi('admin', 'admin'), 'modifica_call')).toContain('strategy')
    expect(await comeLoVedeIlModello(strumentiDi('closer', 'employee'), 'modifica_call')).toContain('strategy')
  })

  it('crea progetti solo chi li gestisce', () => {
    expect(strumentiConsentiti('coach', 'employee')).not.toContain('crea_progetto')
    expect(strumentiConsentiti('coach', 'manager')).toContain('crea_progetto')
    expect(strumentiConsentiti('coach', 'employee')).toContain('aggiungi_task')
  })

  it('ogni scrittura è uno strumento esistente e passa dalla conferma', () => {
    for (const s of SCRITTURE) expect(Object.keys(STRUMENTI)).toContain(s)
    expect(isScrittura('crea_cliente')).toBe(true)
    expect(isScrittura('numeri_periodo')).toBe(false)
  })
})

describe('scritture di Alfire per il setter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fissa_call scrive sempre una discovery call', async () => {
    const setter = strumentiDi('setter', 'employee', { profiles: [{ id: ALTRO, nome: 'Dany', ruolo: 'admin' }] })
    await esegui(setter, 'fissa_call', {
      nome: 'Luca Neri',
      fonte: 'dm_inbound',
      tipo: 'strategy',
      data: '2026-09-30',
      ora: '15:00',
    })
    expect(azioni.fissaCall).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'discovery', closer_id: ALTRO }))
  })

  it('modifica_call del setter lascia il tipo com’è, anche se gli arriva strategy', async () => {
    const righe = {
      calls: [{ tipo: 'discovery', programmata_il: '2026-09-30T13:00:00Z', closer_id: ALTRO, note: null }],
    }
    await esegui(strumentiDi('setter', 'employee', righe), 'modifica_call', { call_id: CALL, lead: 'Luca', tipo: 'strategy' })
    expect(azioni.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'discovery' }))
    // the admin can still correct it
    await esegui(strumentiDi('admin', 'admin', righe), 'modifica_call', { call_id: CALL, lead: 'Luca', tipo: 'strategy' })
    expect(azioni.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'strategy' }))
  })
})

describe('completa_task: quale task chiude', () => {
  beforeEach(() => vi.clearAllMocks())

  const task = (id: string, titolo: string, assegnatari: string[]) => ({ id, titolo, progetto_id: 'p', assegnatari })

  it('tra più task con lo stesso titolo chiude quello assegnato a me, e dice quale', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM', [ALTRO]), task('b', 'Script DM', [ALTRO, IO])],
    })
    const esito = await esegui(strumenti, 'completa_task', { titolo: 'script dm', completato: true })
    expect(azioni.completaTask).toHaveBeenCalledWith({ id: 'b', completato: true })
    expect(esito).toMatchObject({ fatto: true, task: 'Script DM' })
  })

  it('con titoli solo simili non tira a indovinare, anche se uno è mio', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM lancio', [ALTRO]), task('b', 'Script DM reel', [IO])],
    })
    const esito = await esegui(strumenti, 'completa_task', { titolo: 'Script DM', completato: true })
    expect(azioni.completaTask).not.toHaveBeenCalled()
    expect(esito).toMatchObject({ errore: expect.stringMatching(/^Più task possibili/) })
  })

  it('un titolo esatto vince sui simili', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM', [ALTRO]), task('b', 'Script DM reel', [IO])],
    })
    const esito = await esegui(strumenti, 'completa_task', { titolo: 'Script DM', completato: true })
    expect(azioni.completaTask).toHaveBeenCalledWith({ id: 'a', completato: true })
    expect(esito).toMatchObject({ task: 'Script DM' })
  })
})

describe('scheda di conferma', () => {
  it('dice cosa verrà scritto, in italiano', () => {
    const r = riassuntoScrittura('registra_costo', {
      descrizione: 'Abbonamento Canva',
      importo: 12.99,
      categoria: 'software',
      data: '2026-09-27',
      ricorrente: true,
    })
    expect(r.titolo).toBe('Registro il costo «Abbonamento Canva»')
    expect(r.dettagli.join(' | ').replace(/ /g, ' ')).toBe(
      '12,99 € | Categoria: software | Data: 27/09/2026 | Ricorrente ogni mese',
    )
  })

  it('il report: somma o sostituisce, e lo dice', () => {
    const aggiungi = riassuntoScrittura('aggiorna_report', { modalita: 'aggiungi', dm_outbound: 20, conversazioni: 5 })
    expect(aggiungi.titolo).toBe('Aggiungo al report di oggi')
    expect(aggiungi.dettagli).toEqual(['+20 DM outbound', '+5 conversazioni'])
    const imposta = riassuntoScrittura('aggiorna_report', { modalita: 'imposta', data: '2026-09-26', dm_inbound: 3 })
    expect(imposta.titolo).toBe('Imposto il report di 26/09/2026')
  })

  it('il report non parla più di strategy call', () => {
    const r = riassuntoScrittura('aggiorna_report', { modalita: 'aggiungi', follow_up: 4, strategy_prenotate: 2 })
    expect(r.dettagli).toEqual(['+4 follow up'])
  })

  it('cliente, incasso, call, progetto, task', () => {
    expect(riassuntoScrittura('crea_cliente', { nome: 'Mario', cognome: 'Rossi', fonte: 'dm_inbound' }).titolo).toBe(
      'Creo il cliente Mario Rossi',
    )
    expect(riassuntoScrittura('segna_incassata', { cliente: 'Saverio', payment_id: 'x' }).dettagli).toContain('Incassata oggi')
    const call = riassuntoScrittura('fissa_call', { nome: 'Luca', tipo: 'strategy', data: '2026-09-30', ora: '15:00' })
    expect(call.titolo).toBe('Fisso una call con Luca')
    expect(call.dettagli.slice(0, 2)).toEqual(['Discovery call', '30/09/2026 alle 15:00'])
    expect(riassuntoScrittura('crea_progetto', { nome: 'Lancio', reparto: 'DM Setter' }).dettagli).toEqual(['Reparto: DM Setter'])
    expect(riassuntoScrittura('aggiungi_task', { titolo: 'Script DM', progetto: 'Lancio' }).titolo).toBe('Aggiungo il task «Script DM»')
  })
})

describe('scheda di conferma: vendite e modifiche', () => {
  it('la vendita di Loris Lo Presti: annuale, pagato tutto subito in contanti', () => {
    const r = riassuntoScrittura('registra_vendita', {
      cliente: 'Loris Lo Presti',
      tipo: 'nuovo',
      prodotto: 'Annuale',
      valore: 2500,
      data_vendita: '2026-09-12',
      data_inizio: '2026-09-28',
      durata_mesi: 12,
      rate: [{ scadenza: '2026-09-12', importo: 2500, incassata_il: '2026-09-12', metodo: 'contanti' }],
      setter: 'io',
      closer: 'io',
    })
    expect(r.titolo).toBe('Registro la vendita a Loris Lo Presti')
    const dettagli = r.dettagli.map((d) => d.replace(/\u00a0/g, ' '))
    expect(dettagli).toEqual([
      'Nuovo cliente: Annuale, 2.500,00 €',
      'Firmata 12/09/2026, inizio 28/09/2026, 12 mesi',
      'Piano: 2.500,00 € il 12/09/2026',
      'Incassata 12/09/2026: 2.500,00 € in contanti',
      'Setter: io',
      'Closer: io',
    ])
  })

  it('una modifica elenca solo i campi che cambiano', () => {
    const r = riassuntoScrittura('modifica_cliente', { cliente: 'Loris Lo Presti', setter: 'io', closer: 'io' })
    expect(r.titolo).toBe('Correggo il cliente Loris Lo Presti')
    expect(r.dettagli).toEqual(['Setter: io', 'Closer: io'])
    const v = riassuntoScrittura('modifica_vendita', { cliente: 'Saverio', valore: 2500, data_fine: '2027-09-27' })
    expect(v.dettagli.map((d) => d.replace(/\u00a0/g, ' '))).toEqual(['Valore: 2.500,00 €', 'Fine: 27/09/2027'])
  })
})

describe('prompt e guida', () => {
  it('il prompt resta corto e porta data, nome e ruolo', () => {
    const p = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-27' })
    expect(p).toContain('2026-09-27')
    expect(p).toContain('Dany')
    expect(p).toContain('margine operativo')
    // the free tier counts tokens: a few hundred words at most
    expect(p.split(/\s+/).length).toBeLessThan(330)
  })

  it('ogni argomento della guida ha un testo', () => {
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a].length).toBeGreaterThan(40)
  })
})
