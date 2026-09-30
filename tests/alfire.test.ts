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
vi.mock('@/app/(app)/calls/actions', () => ({ modificaCall: azioni.modificaCall, registraEsito: vi.fn(), eliminaCall: vi.fn() }))
vi.mock('@/app/(app)/calls/new/actions', () => ({ fissaCall: azioni.fissaCall }))
vi.mock('@/app/(app)/progetti/[id]/actions', () => ({
  aggiungiTask: vi.fn(),
  completaTask: azioni.completaTask,
  aggiungiMembro: vi.fn(),
  eliminaLista: vi.fn(),
  eliminaProgetto: vi.fn(),
  eliminaTask: vi.fn(),
  modificaProgetto: vi.fn(),
  modificaTask: vi.fn(),
  salvaLista: vi.fn(),
  togliMembro: vi.fn(),
}))
vi.mock('@/app/(app)/progetti/[id]/note/actions', () => ({ aggiungiNota: vi.fn(), eliminaNota: vi.fn(), modificaNota: vi.fn() }))
vi.mock('@/app/(app)/tempo/actions', () => ({
  avviaTimer: vi.fn(),
  eliminaTempo: vi.fn(),
  fermaTimer: vi.fn(),
  modificaTempo: vi.fn(),
  registraTempo: vi.fn(),
}))
vi.mock('@/app/(app)/clients/actions', () => ({
  aggiornaCliente: vi.fn(),
  creaCliente: vi.fn(),
  eliminaCliente: vi.fn(),
  interrompiPercorso: vi.fn(),
  anteprimaInterruzione: vi.fn(),
}))
vi.mock('@/app/(app)/expenses/actions', () => ({
  aggiungiCosto: vi.fn(),
  modificaCosto: vi.fn(),
  eliminaCosto: vi.fn(),
  copiaRicorrenti: vi.fn(),
}))
vi.mock('@/app/(app)/progetti/actions', () => ({ creaProgetto: vi.fn() }))
vi.mock('@/app/(app)/sales/[id]/actions', () => ({
  aggiungiRata: vi.fn(),
  annullaIncasso: vi.fn(),
  eliminaRata: vi.fn(),
  eliminaVendita: vi.fn(),
  modificaIncasso: vi.fn(),
  modificaRata: vi.fn(),
  modificaVendita: vi.fn(),
  registraRimborso: vi.fn(),
  segnaFallita: vi.fn(),
  segnaIncassata: vi.fn(),
}))
vi.mock('@/app/(app)/sales/new/actions', () => ({ registraVendita: vi.fn() }))
vi.mock('@/app/(app)/today/actions', () => ({ salvaReportGiornaliero: vi.fn() }))
vi.mock('@/app/(app)/leads/actions', () => ({ aggiornaStatoLead: vi.fn(), eliminaLead: vi.fn(), modificaLead: vi.fn() }))
vi.mock('@/app/(app)/setting/actions', () => ({ aggiungiReport: vi.fn(), correggiReport: vi.fn(), eliminaReport: vi.fn() }))
vi.mock('@/app/(app)/commissions/actions', () => ({
  eliminaPagamentoProvvigione: vi.fn(),
  modificaPagamentoProvvigione: vi.fn(),
  registraPagamentoProvvigione: vi.fn(),
}))
vi.mock('@/app/(app)/settings/commissions/actions', () => ({
  chiudiRegola: vi.fn(),
  eliminaRegola: vi.fn(),
  modificaRegola: vi.fn(),
  nuovaRegola: vi.fn(),
}))
vi.mock('@/app/(app)/settings/products/actions', () => ({ cambiaAttivoProdotto: vi.fn(), eliminaProdotto: vi.fn(), salvaProdotto: vi.fn() }))
vi.mock('@/app/actions/obiettivi', () => ({ salvaObiettivi: vi.fn() }))
vi.mock('@/app/actions/eliminazione', () => ({ anteprimaEliminazione: vi.fn() }))

const IO = '00000000-0000-4000-8000-000000000001'
const ALTRO = '00000000-0000-4000-8000-000000000002'
const CALL = '00000000-0000-4000-8000-000000000003'

/** A read-only Supabase stand-in: every query on a table (or rpc) answers with its rows. */
function supabaseFinto(righe: Record<string, unknown[]>) {
  function risposta(nome: string) {
    const dati = righe[nome] ?? []
    const query: Record<string, unknown> = {
      maybeSingle: async () => ({ data: dati[0] ?? null, error: null }),
      single: async () => ({ data: dati[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve({ data: dati, error: null }).then(ok, ko),
    }
    for (const metodo of ['select', 'eq', 'neq', 'in', 'ilike', 'or', 'is', 'not', 'contains', 'order', 'limit', 'gte', 'lt', 'lte']) {
      query[metodo] = () => query
    }
    return query
  }
  return { from: risposta, rpc: risposta }
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

// Tools on a client's money, costs, margin or other people's pay
const SOLDI = [
  'numeri_periodo',
  'cash_per_mese',
  'da_incassare',
  'cerca_clienti',
  'rate_cliente',
  'vendite_periodo',
  'provvigioni',
  'costi_periodo',
  'cliente',
  'vendita',
  'costo',
  'pagamento_provvigione',
  'regola_provvigione',
  'obiettivi_mese',
  'prodotto',
]

describe('strumenti di Alfire per ruolo', () => {
  it('l’admin ha tutto, report dei setter e call comprese', () => {
    const admin = strumentiConsentiti('admin', 'admin')
    for (const s of SOLDI) expect(admin).toContain(s)
    expect(admin).toEqual(expect.arrayContaining(['rata', 'registra_vendita', 'progetto', 'aggiorna_report', 'lead', 'call']))
    // Dany is admin, closer and at times setter (29/09/2026)
    expect(admin).toContain('fissa_call')
    // the setter's own numbers are the setter's
    expect(admin).not.toContain('miei_numeri')
  })

  it('il closer non fissa call: le fissano il setter e l’admin', () => {
    expect(strumentiConsentiti('closer', 'employee')).not.toContain('fissa_call')
    for (const ruolo of ['coach', 'editor', 'nutrizione', 'dev'] as const) {
      expect(strumentiConsentiti(ruolo, 'admin'), ruolo).not.toContain('fissa_call')
    }
  })

  it('un collaboratore non riceve mai strumenti sui soldi dei clienti, i costi o i compensi altrui', () => {
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      const suoi = strumentiConsentiti(ruolo, 'employee')
      for (const s of SOLDI) expect(suoi, `${ruolo} → ${s}`).not.toContain(s)
    }
    // the closer's only money: his own sales and their cash-ins (section 6)
    for (const ruolo of ['setter', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      expect(strumentiConsentiti(ruolo, 'employee'), ruolo).not.toContain('rata')
      expect(strumentiConsentiti(ruolo, 'employee'), ruolo).not.toContain('registra_vendita')
    }
  })

  it('il setter ha i suoi numeri, il report, le call e i suoi lead', () => {
    expect(strumentiConsentiti('setter', 'employee')).toEqual(
      expect.arrayContaining(['miei_numeri', 'aggiorna_report', 'fissa_call', 'call', 'lead', 'call_periodo', 'guida']),
    )
  })

  it('al setter nessuno strumento offre la strategy call: fissa solo discovery', async () => {
    const setter = strumentiDi('setter', 'employee')
    for (const nome of Object.keys(setter)) {
      expect(await comeLoVedeIlModello(setter, nome), nome).not.toMatch(/strategy/i)
    }
    expect(await comeLoVedeIlModello(setter, 'fissa_call')).not.toContain('"tipo"')
    // the setter books for himself: no setter to choose
    expect(await comeLoVedeIlModello(setter, 'fissa_call')).not.toContain('"setter"')
    expect(await comeLoVedeIlModello(setter, 'call')).not.toContain('"tipo"')
    // the report asks what the form asks, strategy_prenotate included no more
    const report = await comeLoVedeIlModello(setter, 'aggiorna_report')
    expect(report).toContain('"follow_up"')
    // held and qualified are the closer's, recorded on each call (29/09/2026)
    expect(report).not.toMatch(/discovery_svolte|call_qualificate|svolt|qualific/i)
    // admin and closer can still correct the type: the history has strategy calls
    expect(await comeLoVedeIlModello(strumentiDi('admin', 'admin'), 'call')).toContain('strategy')
    expect(await comeLoVedeIlModello(strumentiDi('closer', 'employee'), 'call')).toContain('strategy')
  })

  it('crea progetti solo chi li gestisce', () => {
    expect(strumentiConsentiti('coach', 'employee')).not.toContain('progetto')
    expect(strumentiConsentiti('coach', 'manager')).toContain('progetto')
    expect(strumentiConsentiti('coach', 'employee')).toContain('task')
  })

  it('ogni scrittura è uno strumento esistente e passa dalla conferma', () => {
    for (const s of SCRITTURE) expect(Object.keys(STRUMENTI)).toContain(s)
    expect(isScrittura('cliente')).toBe(true)
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
    // the setter never chooses who set the call
    expect(azioni.fissaCall).toHaveBeenCalledWith(expect.objectContaining({ setter_id: null }))
  })

  it('la call del setter tiene il tipo com’è, anche se gli arriva strategy', async () => {
    const righe = {
      calls: [{ id: CALL, tipo: 'discovery', programmata_il: '2026-09-30T13:00:00Z', closer_id: ALTRO, note: null }],
    }
    const modifica = { azione: 'modifica', call_id: CALL, lead: 'Luca', tipo: 'strategy' }
    await esegui(strumentiDi('setter', 'employee', righe), 'call', modifica)
    expect(azioni.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'discovery' }))
    // the admin can still correct it
    await esegui(strumentiDi('admin', 'admin', righe), 'call', modifica)
    expect(azioni.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'strategy' }))
  })
})

describe('fissa_call dell’admin', () => {
  beforeEach(() => vi.clearAllMocks())

  const SETTER = '00000000-0000-4000-8000-000000000004'
  const team = {
    profiles: [
      { id: IO, nome: 'Dany Montagnolo', ruolo: 'admin' },
      { id: ALTRO, nome: 'Lorenzo Closer', ruolo: 'closer' },
      { id: SETTER, nome: 'Loris Setter', ruolo: 'setter' },
    ],
  }
  const chiamata = { nome: 'Luca Neri', fonte: 'dm_inbound', data: '2026-09-25', ora: '15:00' }

  it('sceglie il setter; il tipo resta discovery', async () => {
    const admin = strumentiDi('admin', 'admin', team)
    expect(await comeLoVedeIlModello(admin, 'fissa_call')).toContain('"setter"')
    expect(await comeLoVedeIlModello(admin, 'fissa_call')).not.toContain('"tipo"')
  })

  it('senza setter né closer: li fa lui, anche per una call già fatta', async () => {
    await esegui(strumentiDi('admin', 'admin', team), 'fissa_call', chiamata)
    expect(azioni.fissaCall).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'discovery', data: '2026-09-25', setter_id: IO, closer_id: IO }),
    )
  })

  it('per il setter nominato, con il closer nominato', async () => {
    const esito = await esegui(strumentiDi('admin', 'admin', team), 'fissa_call', {
      ...chiamata,
      setter: 'Loris',
      closer: 'Lorenzo',
    })
    expect(azioni.fissaCall).toHaveBeenCalledWith(expect.objectContaining({ setter_id: SETTER, closer_id: ALTRO }))
    expect(esito).toMatchObject({ fatto: true, setter: 'Loris Setter', closer: 'Lorenzo Closer' })
  })

  it('un setter che non c’è: non scrive e dice chi c’è', async () => {
    const esito = await esegui(strumentiDi('admin', 'admin', team), 'fissa_call', { ...chiamata, setter: 'Lorenzo' })
    expect(azioni.fissaCall).not.toHaveBeenCalled()
    expect(esito).toMatchObject({ errore: 'Setter non trovato. Possibili: io, Loris Setter' })
  })
})

describe('letture dell’admin: il cash in quattro parti', () => {
  const metriche = {
    cash_incassato: 6950,
    cash_nuovi_clienti: 800,
    cash_rate_precedenti: 5050,
    cash_rinnovo: 1100,
    cash_upsell: 0,
    revenue_nuovi: 1500,
    valore_medio_nuovo: 1500,
    cash_per_dm: 2.5,
    revenue_per_dm: 4.69,
    cash_per_call_svolta: 200,
    provvigioni_maturate: 292.5,
    costi: 1200,
    show_rate: 0.8,
    close_rate: 0.25,
    tasso_rinnovo: null,
  }

  it('numeri_periodo dà le quattro parti del cash e gli indicatori sui soli nuovi clienti, dal SQL', async () => {
    const admin = strumentiDi('admin', 'admin', {
      kpi_periodo: [{ chiave: 'cash_incassato', valore: 6950, precedente: 5000, delta: 0.39 }],
      metriche_periodo: [metriche],
      funnel_periodo: [],
    })
    const esito = await esegui(admin, 'numeri_periodo', { da: '2026-09-01', a: '2026-09-30' })
    expect(esito).toMatchObject({
      cash_in_4_parti: { nuovi_clienti_del_periodo: 800, rate_di_clienti_gia_entrati: 5050, rinnovi: 1100, upsell: 0 },
      solo_nuovi_clienti: { valore_medio: 1500, cash_per_dm: 2.5, revenue_per_dm: 4.69, cash_per_call_svolta: 200 },
      provvigioni_maturate: 292.5,
      costi: 1200,
    })
    const descrizione = await comeLoVedeIlModello(admin, 'cash_per_mese')
    expect(descrizione).toContain('rate_precedenti')
    expect(descrizione).toContain('nuovi_clienti')
  })

  it('vendite_periodo dà davvero incassato e da incassare, letti da v_vendite', async () => {
    const VENDITA = '00000000-0000-4000-8000-000000000009'
    const admin = strumentiDi('admin', 'admin', {
      sales: [
        {
          id: VENDITA,
          tipo: 'rinnovo',
          data_vendita: '2026-09-10',
          valore_contratto: 1500,
          numero_rate: 3,
          prodotto_personalizzato: null,
          cliente: { nome: 'Mario', cognome: 'Rossi' },
          prodotto: { nome: 'Percorso Alpha 3 mesi' },
        },
      ],
      v_vendite: [{ sale_id: VENDITA, incassato: 500, da_incassare: 1000, rate_in_ritardo: 0 }],
    })
    const esito = await esegui(admin, 'vendite_periodo', { da: '2026-09-01', a: '2026-09-30' })
    expect(esito).toMatchObject({
      vendite: [{ cliente: 'Mario Rossi', tipo: 'rinnovo', valore: 1500, incassato: 500, da_incassare: 1000, setter: null }],
    })
  })

  it('vendite e clienti dicono chi ha portato il cliente e chi ha chiuso: mai i clienti dell’admin contati come del setter', async () => {
    const vendita = (id: string, setter: string | null) => ({
      id,
      tipo: 'nuovo',
      data_vendita: '2026-09-10',
      valore_contratto: 1500,
      numero_rate: 3,
      prodotto_personalizzato: null,
      cliente: { nome: 'Mario', cognome: id },
      prodotto: null,
      setter: setter ? { nome: setter } : null,
      closer: { nome: 'Dany' },
    })
    const admin = strumentiDi('admin', 'admin', {
      // a client Loris brought, and one Dany brought himself (section 8)
      sales: [vendita('a', 'Loris'), vendita('b', 'Dany')],
      v_vendite: [],
      v_clienti: [{ client_id: 'c1', nome: 'Mario', cognome: 'Rossi', stato: 'attivo', setter_id: ALTRO, closer_id: IO }],
      profiles: [
        { id: IO, nome: 'Dany' },
        { id: ALTRO, nome: 'Loris' },
      ],
    })
    expect(await esegui(admin, 'vendite_periodo', { da: '2026-09-01', a: '2026-09-30' })).toMatchObject({
      vendite: [
        { cliente: 'Mario a', setter: 'Loris', closer: 'Dany' },
        { cliente: 'Mario b', setter: 'Dany', closer: 'Dany' },
      ],
    })
    const clienti = (await esegui(admin, 'cerca_clienti', { testo: 'Rossi' })) as { clienti: Record<string, unknown>[] }
    expect(clienti.clienti).toEqual([expect.objectContaining({ nome: 'Mario', setter: 'Loris', closer: 'Dany' })])
    // names, never the ids the model must not show
    expect(clienti.clienti[0]).not.toHaveProperty('setter_id')
    expect(clienti.clienti[0]).not.toHaveProperty('closer_id')
  })
})

describe('task completa: quale task chiude', () => {
  beforeEach(() => vi.clearAllMocks())

  const task = (id: string, titolo: string, assegnatari: string[]) => ({ id, titolo, progetto_id: 'p', assegnatari })

  it('tra più task con lo stesso titolo chiude quello assegnato a me, e dice quale', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM', [ALTRO]), task('b', 'Script DM', [ALTRO, IO])],
    })
    const esito = await esegui(strumenti, 'task', { azione: 'completa', titolo: 'script dm' })
    expect(azioni.completaTask).toHaveBeenCalledWith({ id: 'b', completato: true })
    expect(esito).toMatchObject({ fatto: true, task: 'Script DM' })
  })

  it('con titoli solo simili non tira a indovinare, anche se uno è mio', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM lancio', [ALTRO]), task('b', 'Script DM reel', [IO])],
    })
    const esito = await esegui(strumenti, 'task', { azione: 'completa', titolo: 'Script DM' })
    expect(azioni.completaTask).not.toHaveBeenCalled()
    expect(esito).toMatchObject({ errore: expect.stringMatching(/^Più task possibili/) })
  })

  it('un titolo esatto vince sui simili', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM', [ALTRO]), task('b', 'Script DM reel', [IO])],
    })
    const esito = await esegui(strumenti, 'task', { azione: 'completa', titolo: 'Script DM' })
    expect(azioni.completaTask).toHaveBeenCalledWith({ id: 'a', completato: true })
    expect(esito).toMatchObject({ task: 'Script DM' })
  })
})

describe('scheda di conferma', () => {
  it('dice cosa verrà scritto, in italiano', () => {
    const r = riassuntoScrittura('costo', {
      azione: 'registra',
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

  it('la call fissata dall’admin per un setter dice per chi è', () => {
    const r = riassuntoScrittura('fissa_call', {
      nome: 'Luca Neri',
      fonte: 'dm_inbound',
      data: '2026-09-25',
      ora: '15:00',
      setter: 'Loris',
    })
    expect(r.dettagli).toEqual([
      'Discovery call',
      '25/09/2026 alle 15:00',
      'Fonte: dm inbound',
      'Setter: Loris',
      'Closer: l’admin',
    ])
    // the setter's own call: no setter line
    expect(riassuntoScrittura('fissa_call', { nome: 'Luca', data: '2026-09-30', ora: '15:00' }).dettagli.join()).not.toContain(
      'Setter',
    )
  })

  it('cliente, incasso, call, progetto, task', () => {
    expect(riassuntoScrittura('cliente', { azione: 'crea', nome: 'Mario', cognome: 'Rossi', fonte: 'dm_inbound' }).titolo).toBe(
      'Creo il cliente Mario Rossi',
    )
    expect(riassuntoScrittura('rata', { azione: 'incassa', cliente: 'Saverio', payment_id: 'x' }).dettagli).toContain('Incassata oggi')
    const call = riassuntoScrittura('fissa_call', { nome: 'Luca', tipo: 'strategy', data: '2026-09-30', ora: '15:00' })
    expect(call.titolo).toBe('Fisso una call con Luca')
    expect(call.dettagli.slice(0, 2)).toEqual(['Discovery call', '30/09/2026 alle 15:00'])
    expect(riassuntoScrittura('progetto', { azione: 'crea', nome: 'Lancio', reparto: 'DM Setter' }).dettagli).toEqual([
      'Reparto: DM Setter',
    ])
    expect(riassuntoScrittura('task', { azione: 'aggiungi', titolo: 'Script DM', progetto: 'Lancio' }).titolo).toBe(
      'Aggiungo il task «Script DM»',
    )
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
    const r = riassuntoScrittura('cliente', { azione: 'modifica', cliente: 'Loris Lo Presti', setter: 'io', closer: 'io' })
    expect(r.titolo).toBe('Correggo il cliente Loris Lo Presti')
    expect(r.dettagli).toEqual(['Setter: io', 'Closer: io'])
    const v = riassuntoScrittura('vendita', { azione: 'modifica', cliente: 'Saverio', valore: 2500, data_fine: '2027-09-27' })
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

  it('il prompt dice cosa è un nuovo cliente e cosa è una rata', () => {
    const p = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-29' })
    expect(p).toContain('Nuovo cliente = vendita di tipo nuovo')
    expect(p).toContain('I numeri del closer contano solo i nuovi clienti')
    // the same four parts as the overview: renewals are not "clienti già entrati"
    expect(p).toContain('rate di clienti già entrati = rate di vendite nuove firmate prima del periodo')
    expect(p).not.toContain('rinnovo e upsell = clienti già entrati')
  })

  it('il prompt: mai i dati di chi chatta al posto di quelli di un altro (30/09/2026)', () => {
    for (const ruolo of ['admin', 'setter', 'closer', 'coach'] as const) {
      const p = promptAlfire({ nome: 'Dany', ruolo, oggi: '2026-09-30' })
      expect(p, ruolo).toContain(
        'o dati di un’altra persona che nessuno strumento legge, dillo senza strade alternative, mai con i dati di chi chatta; all’admin indica la pagina.',
      )
    }
  })

  it('la guida dice che l’admin chiede ad Alfire il tempo del team, con i limiti della pagina', () => {
    expect(GUIDA.progetti).toContain('l’admin lo chiede anche ad Alfire')
    // the guide is read by every role: no real collaborator's name as the example (section 17)
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a], a).not.toMatch(/Loris|Lorenzo/)
    expect(GUIDA.alfire).toContain('il tempo del team, come Tempo › Team (/tempo/team)')
    expect(GUIDA.alfire).toContain('mai i timer accesi')
    expect(GUIDA.alfire).toContain('Alfire non li dà mai per quelli di un altro')
  })

  it('ogni argomento della guida ha un testo', () => {
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a].length).toBeGreaterThan(40)
  })

  it('la guida racconta quello che c’è nell’app dal 29/09/2026', () => {
    expect(GUIDA.panoramica).toContain('rate di clienti già entrati')
    expect(GUIDA.panoramica).toContain('solo i nuovi clienti')
    expect(GUIDA.call).toContain('Compila la giornata')
    expect(GUIDA.call).toContain('l’admin da Le mie call')
    expect(GUIDA.clienti).toContain('Ha rinnovato')
    expect(GUIDA.clienti).toContain('Storico percorsi')
    // the setter does see his new clients' payments and his commission on each
    expect(GUIDA.permessi).not.toContain('mai quanto paga un cliente')
    expect(GUIDA.permessi).toContain('provvigione su ogni incasso')
    // what Alfire itself may write, per role
    expect(GUIDA.alfire).toContain('Conferma')
    expect(GUIDA.alfire).toContain('Mai: team')
    // renamed on the client sheet
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a], a).not.toContain('Registra rinnovo')
  })
})
