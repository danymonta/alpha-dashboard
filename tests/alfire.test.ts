import { asSchema, type ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ARGOMENTI_GUIDA, GUIDA } from '@/lib/alfire/guida'
import { SCRITTURE, STRUMENTI, isScrittura, strumentiConsentiti } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { azioneDistruttiva, riassuntoScrittura } from '@/lib/alfire/riassunto'
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
  chiudiCliente: vi.fn(),
  archiviaCliente: vi.fn(),
  togliDallArchivio: vi.fn(),
  creaCliente: vi.fn(),
  eliminaCliente: vi.fn(),
  interrompiPercorso: vi.fn(),
  anteprimaInterruzione: vi.fn(),
  riapriCliente: vi.fn(),
  sospendiCliente: vi.fn(),
  riattivaCliente: vi.fn(),
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
    for (const ruolo of ['coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      expect(strumentiConsentiti(ruolo, 'admin'), ruolo).not.toContain('fissa_call')
    }
  })

  it('un collaboratore non riceve mai strumenti sui soldi dei clienti, i costi o i compensi altrui', () => {
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      const suoi = strumentiConsentiti(ruolo, 'employee')
      for (const s of SOLDI) expect(suoi, `${ruolo} → ${s}`).not.toContain(s)
    }
    // the closer's only money: his own sales and their cash-ins (section 6)
    for (const ruolo of ['setter', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
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

  it('il business coach (22/10/2026): le letture dell’admin e nessuna scrittura, a ogni livello', () => {
    for (const livello of ['admin', 'manager', 'employee', null] as const) {
      const suoi = strumentiConsentiti('business_coach', livello)
      for (const s of SCRITTURE) expect(suoi, `${livello} → ${s}`).not.toContain(s)
      expect(suoi, String(livello)).not.toContain('miei_task')
      expect(suoi, String(livello)).not.toContain('mio_tempo')
      expect(suoi, String(livello)).not.toContain('mie_giornate')
      expect(suoi, String(livello)).not.toContain('miei_numeri')
    }
    expect([...strumentiConsentiti('business_coach', 'employee')].sort()).toEqual(
      [
        'guida',
        'proponi_risposte',
        ...SOLDI.filter((s) => !isScrittura(s)),
        'metriche_setting',
        'commenti_marketing',
        'call_periodo',
        'progetti',
        'progetto_dettaglio',
        'tempo_team',
      ].sort(),
    )
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

  const task = (id: string, titolo: string, assegnatari: string[], extra: Record<string, unknown> = {}) => ({
    id,
    titolo,
    progetto_id: 'p',
    assegnatari,
    stato: 'da_fare',
    created_by: ALTRO,
    ...extra,
  })
  // the card names the project: 13 clients have a «Revisione video» (03/10/2026)
  const progetti = [{ id: 'p', nome: 'Reel settembre' }]

  it('tra più task con lo stesso titolo chiude quello assegnato a me, e dice quale', async () => {
    const strumenti = strumentiDi('coach', 'employee', {
      v_pm_task: [task('a', 'Script DM', [ALTRO]), task('b', 'Script DM', [ALTRO, IO])],
      v_pm_progetti: progetti,
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
      v_pm_task: [task('a', 'Script DM', [ALTRO], { created_by: IO }), task('b', 'Script DM reel', [IO])],
      v_pm_progetti: progetti,
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

  it('«non rinnova» e «riapri»: la scheda dice cosa succede, col bottone di sempre', () => {
    const chiudi = { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: '2026-10-04', motivo: 'Si allena da solo' }
    expect(riassuntoScrittura('cliente', chiudi)).toEqual({
      titolo: 'Mario Rossi non rinnova: lo chiudo',
      dettagli: ['Chiuso dal 04/10/2026', 'Motivo: Si allena da solo'],
    })
    expect(riassuntoScrittura('cliente', { azione: 'chiudi', cliente: 'Mario Rossi' }).dettagli).toEqual(['Chiuso da oggi'])
    expect(riassuntoScrittura('cliente', { azione: 'riapri', cliente: 'Mario Rossi' }).titolo).toBe('Riapro il cliente Mario Rossi')
    // reversible: "Conferma", never a red button
    expect(azioneDistruttiva('cliente', chiudi)).toBeNull()
    expect(azioneDistruttiva('cliente', { azione: 'riapri', cliente: 'Mario Rossi' })).toBeNull()
  })

  it('«sospendi» e «riattiva»: la scheda dice cosa succede, col bottone di sempre', () => {
    const sospendi = { azione: 'sospendi', cliente: 'Mario Rossi', sospeso_il: '2026-10-10', motivo: 'Viaggio di lavoro' }
    expect(riassuntoScrittura('cliente', sospendi)).toEqual({
      titolo: 'Sospendo Mario Rossi',
      dettagli: ['Sospeso dal 10/10/2026', 'Motivo: Viaggio di lavoro'],
    })
    expect(riassuntoScrittura('cliente', { azione: 'sospendi', cliente: 'Mario Rossi' }).dettagli).toEqual(['Sospeso da oggi'])
    expect(riassuntoScrittura('cliente', { azione: 'riattiva', cliente: 'Mario Rossi' }).titolo).toBe('Riattivo il cliente Mario Rossi')
    // reversible: "Conferma", never a red button
    expect(azioneDistruttiva('cliente', sospendi)).toBeNull()
    expect(azioneDistruttiva('cliente', { azione: 'riattiva', cliente: 'Mario Rossi' })).toBeNull()
  })

  it('«archivia come ex cliente» e «togli dall’archivio»: col bottone di sempre, si torna indietro', () => {
    const archivia = { azione: 'archivia', cliente: 'Mario Rossi' }
    expect(riassuntoScrittura('cliente', archivia)).toEqual({
      titolo: 'Archivio Mario Rossi come ex cliente',
      dettagli: ['Archiviato da oggi'],
    })
    expect(riassuntoScrittura('cliente', { azione: 'togli_archivio', cliente: 'Mario Rossi' })).toEqual({
      titolo: 'Tolgo Mario Rossi dall’archivio',
      dettagli: ['Torna tra i clienti chiusi'],
    })
    expect(azioneDistruttiva('cliente', archivia)).toBeNull()
    expect(azioneDistruttiva('cliente', { azione: 'togli_archivio', cliente: 'Mario Rossi' })).toBeNull()
  })
})

describe('prompt e guida', () => {
  it('il prompt resta corto e porta data, nome e ruolo', () => {
    const p = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-27' })
    expect(p).toContain('2026-09-27')
    expect(p).toContain('Dany')
    expect(p).toContain('margine operativo')
    // the free tier counts tokens: a few hundred words at most (the time line and the weekday
    // came on 03/10/2026; a coach's prompt has no Economics lines and stays shorter)
    expect(p.split(/\s+/).length).toBeLessThan(400)
    expect(promptAlfire({ nome: 'Marco', ruolo: 'coach', oggi: '2026-09-27' }).split(/\s+/).length).toBeLessThan(330)
  })

  it('il prompt dice il giorno della settimana e da quando conta la settimana (03/10/2026)', () => {
    const p = promptAlfire({ nome: 'Marco', ruolo: 'coach', oggi: '2026-10-03' })
    expect(p).toContain('Oggi è sabato 03/10/2026 (2026-10-03, Europe/Rome); la settimana è iniziata lunedì 2026-09-28.')
    expect(promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-28' })).toContain('la settimana è iniziata lunedì 2026-09-28.')
    expect(promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-10-04' })).toContain('Oggi è domenica 04/10/2026 (2026-10-04, Europe/Rome); la settimana è iniziata lunedì 2026-09-28.')
    // the tools take ISO dates, the answers the Italian way
    expect(p).toContain('negli strumenti le date sono sempre AAAA-MM-GG')
  })

  it('il tempo è per tutti; vendite, rate e margine solo per i ruoli di Economics', () => {
    for (const ruolo of ['admin', 'setter', 'closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      const p = promptAlfire({ nome: 'X', ruolo, oggi: '2026-10-03' })
      // writing is always one's own; the admin reads the others' time with tempo_team, never refuses it (03/10/2026)
      if (ruolo === 'admin') {
        expect(p).toContain('Tempo: si scrive solo il proprio; degli altri si legge con tempo_team.')
        expect(p).not.toContain('Tempo, solo di chi chatta')
      } else {
        expect(p, ruolo).toContain('Tempo, solo di chi chatta')
        expect(p, ruolo).not.toContain('tempo_team')
        // a manager sees the others' time on his project's Tempo tab (section 18): Alfire says where, never "you cannot see it"
        expect(p, ruolo).toContain('quello degli altri Alfire non lo legge: chi gestisce un progetto lo vede nella sua scheda Tempo')
        expect(p, ruolo).not.toContain('il tempo degli altri non li vede')
      }
      expect(p, ruolo).toContain('senza durata = chiedi quanto tempo, non completarlo')
      const economics = ['admin', 'setter', 'closer'].includes(ruolo)
      for (const parola of ['Nuovo cliente = vendita', 'euro']) {
        if (economics) expect(p, `${ruolo}: ${parola}`).toContain(parola)
        else expect(p, `${ruolo}: ${parola}`).not.toContain(parola)
      }
      // each line to who has its tools: the setter has no registra_vendita, rata or cliente, only the admin reads the margin
      expect(p.includes('registra_vendita'), ruolo).toBe(ruolo === 'admin' || ruolo === 'closer')
      expect(p.includes('rata, azione incassa'), ruolo).toBe(ruolo === 'admin' || ruolo === 'closer')
      expect(p.includes('cliente crea'), ruolo).toBe(ruolo === 'admin')
      expect(p.includes('margine operativo'), ruolo).toBe(ruolo === 'admin')
      expect(p.includes('soldi dei clienti, vendite e provvigioni non li vede'), ruolo).toBe(!economics)
      expect(p, ruolo).not.toContain('null')
      // a link that is everybody's page, never Incassi
      expect(p, ruolo).not.toContain('/payments')
    }
  })

  it('il prompt dell’area Marketing (1.32.0): video editor e marketing sanno del calendario, gli altri no', () => {
    const riga =
      'Nell’area Marketing c’è il calendario dei contenuti (reel e caroselli): per ora Alfire non lo legge e non lo scrive, ma con la guida spiega come funziona. I DM e i nomi dei lead non li vede.'
    for (const ruolo of ['editor', 'marketing'] as const) {
      const p = promptAlfire({ nome: 'X', ruolo, oggi: '2026-10-09' })
      expect(p, ruolo).toContain(riga)
      expect(p, ruolo).toContain('soldi dei clienti, vendite e provvigioni non li vede')
    }
    for (const ruolo of ['admin', 'setter', 'closer', 'coach', 'nutrizione', 'dev'] as const) {
      expect(promptAlfire({ nome: 'X', ruolo, oggi: '2026-10-09' }), ruolo).not.toContain('area Marketing')
    }
    expect(promptAlfire({ nome: 'Giulia', ruolo: 'marketing', oggi: '2026-10-09' })).toContain(
      'Parli con Giulia, ruolo marketing (contenuti Instagram: il calendario dei reel e dei caroselli).',
    )
    expect(promptAlfire({ nome: 'X', ruolo: 'marketing', oggi: '2026-10-09' }).split(/\s+/).length).toBeLessThan(360)
  })

  it('il prompt dice cosa è un nuovo cliente e cosa è una rata', () => {
    const p = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-29' })
    expect(p).toContain('Nuovo cliente = vendita di tipo nuovo')
    expect(p).toContain('I numeri del closer contano solo i nuovi clienti')
    // the same four parts as the overview: renewals are not "clienti già entrati"
    expect(p).toContain('rate di clienti già entrati = rate di vendite nuove firmate prima del periodo')
    expect(p).not.toContain('rinnovo e upsell = clienti già entrati')
  })

  it('il prompt: i soldi di setter e closer, solo i loro e come li mostra l’app (03/10/2026)', () => {
    const setter = promptAlfire({ nome: 'Loris', ruolo: 'setter', oggi: '2026-10-03' })
    expect(setter).toContain('I soldi del setter, solo suoi: miei_numeri')
    expect(setter).toContain('miei_clienti (i clienti che ha portato: pagato, rate e provvigione di ogni incasso; con da/a gli incassi del periodo e il loro totale)')
    // a read's limit, never a write's: the setter still writes handles and notes (fissa_call, aggiorna_report)
    expect(setter).toContain('In lettura i suoi clienti non hanno contatti, metodo di pagamento né note delle vendite; mai vendite o provvigioni di altri.')
    expect(setter).not.toContain('Mai contatti, metodo o note')
    expect(setter).not.toContain('mie_vendite')
    const closer = promptAlfire({ nome: 'Lorenzo', ruolo: 'closer', oggi: '2026-10-03' })
    expect(closer).toContain('I soldi del closer, solo suoi: mie_vendite (le vendite che ha chiuso: incassato, da incassare con il totale, rate)')
    expect(closer).toContain('Mai vendite di altri closer.')
    // registra_vendita and rata still take contacts, payment method and notes from him
    expect(closer).not.toMatch(/Mai contatti|metodo o note/)
    expect(closer).not.toContain('miei_clienti')
    for (const p of [setter, closer]) expect(p).toContain('mie_giornate')
    // the closer's numbers of every setter (07/10/2026): the setter's Closer page, never his own numbers
    expect(setter).toContain('I numeri del closer sulle call di tutti i setter, non suoi: giornate_closer.')
    for (const ruolo of ['admin', 'closer', 'coach'] as const) {
      expect(promptAlfire({ nome: 'X', ruolo, oggi: '2026-10-07' }), ruolo).not.toContain('giornate_closer')
    }
    // the admin reads everything with his own tools; his own day as the closer he is (mie_giornate) says so in
    // its description, not in the prompt (the free tier counts every word); the Projects area's roles no money at all
    for (const ruolo of ['admin', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      const p = promptAlfire({ nome: 'X', ruolo, oggi: '2026-10-03' })
      for (const nome of ['miei_clienti', 'mie_vendite', 'mie_giornate']) expect(p, `${ruolo}: ${nome}`).not.toContain(nome)
    }
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
    // the client's Drive folder: the admin and the coach of his project, picked by who manages it (05/10/2026)
    expect(GUIDA.permessi).toContain('La cartella Drive di un cliente la vedono e la cambiano solo l’admin e il coach del progetto di quel cliente')
    // what Alfire itself may write, per role
    expect(GUIDA.alfire).toContain('Conferma')
    expect(GUIDA.alfire).toContain('Mai: team')
    // renamed on the client sheet
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a], a).not.toContain('Registra rinnovo')
  })
})
