import { readFileSync } from 'node:fs'

import { asSchema, type ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSEGUENZE } from '@/lib/alfire/conseguenze'
import { strumentiConsentiti } from '@/lib/alfire/permessi'
import { azioneDistruttiva, riassuntoScrittura } from '@/lib/alfire/riassunto'
import { anteprimaScrittura, strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'

// Every write goes through the server action of the app's own form: stand-ins
// here record what Alfire would write, without Next or a database.
const a = vi.hoisted(() => {
  const ok = () => vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(async () => ({ ok: true }))
  return {
    modificaCall: ok(),
    registraEsito: ok(),
    eliminaCall: ok(),
    fissaCall: ok(),
    aggiornaStatoLead: ok(),
    eliminaLead: ok(),
    modificaLead: ok(),
    aggiungiReport: ok(),
    correggiReport: ok(),
    eliminaReport: ok(),
    salvaReportGiornaliero: ok(),
    aggiornaCliente: ok(),
    creaCliente: ok(),
    eliminaCliente: ok(),
    interrompiPercorso: ok(),
    anteprimaInterruzione: ok(),
    aggiungiCosto: ok(),
    modificaCosto: ok(),
    eliminaCosto: ok(),
    copiaRicorrenti: ok(),
    aggiungiRata: ok(),
    annullaIncasso: ok(),
    eliminaRata: ok(),
    eliminaVendita: ok(),
    modificaIncasso: ok(),
    modificaRata: ok(),
    modificaVendita: ok(),
    registraRimborso: ok(),
    segnaFallita: ok(),
    segnaIncassata: ok(),
    registraVendita: ok(),
    registraPagamentoProvvigione: ok(),
    modificaPagamentoProvvigione: ok(),
    eliminaPagamentoProvvigione: ok(),
    nuovaRegola: ok(),
    chiudiRegola: ok(),
    modificaRegola: ok(),
    eliminaRegola: ok(),
    salvaObiettivi: ok(),
    salvaProdotto: ok(),
    cambiaAttivoProdotto: ok(),
    eliminaProdotto: ok(),
    creaProgetto: ok(),
    aggiungiMembro: ok(),
    togliMembro: ok(),
    aggiungiTask: ok(),
    completaTask: ok(),
    eliminaLista: ok(),
    eliminaProgetto: ok(),
    eliminaTask: ok(),
    modificaProgetto: ok(),
    modificaTask: ok(),
    salvaLista: ok(),
    aggiungiNota: ok(),
    eliminaNota: ok(),
    modificaNota: ok(),
    avviaTimer: ok(),
    eliminaTempo: ok(),
    fermaTimer: ok(),
    modificaTempo: ok(),
    registraTempo: ok(),
    anteprimaEliminazione: vi.fn<(tipo: string, id: string) => Promise<Record<string, unknown>>>(async () => ({
      ok: true,
      dati: {},
    })),
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/app/(app)/calls/actions', () => ({ modificaCall: a.modificaCall, registraEsito: a.registraEsito, eliminaCall: a.eliminaCall }))
vi.mock('@/app/(app)/calls/new/actions', () => ({ fissaCall: a.fissaCall }))
vi.mock('@/app/(app)/leads/actions', () => ({
  aggiornaStatoLead: a.aggiornaStatoLead,
  eliminaLead: a.eliminaLead,
  modificaLead: a.modificaLead,
}))
vi.mock('@/app/(app)/setting/actions', () => ({
  aggiungiReport: a.aggiungiReport,
  correggiReport: a.correggiReport,
  eliminaReport: a.eliminaReport,
}))
vi.mock('@/app/(app)/today/actions', () => ({ salvaReportGiornaliero: a.salvaReportGiornaliero }))
vi.mock('@/app/(app)/clients/actions', () => ({
  aggiornaCliente: a.aggiornaCliente,
  creaCliente: a.creaCliente,
  eliminaCliente: a.eliminaCliente,
  interrompiPercorso: a.interrompiPercorso,
  anteprimaInterruzione: a.anteprimaInterruzione,
}))
vi.mock('@/app/(app)/expenses/actions', () => ({
  aggiungiCosto: a.aggiungiCosto,
  modificaCosto: a.modificaCosto,
  eliminaCosto: a.eliminaCosto,
  copiaRicorrenti: a.copiaRicorrenti,
}))
vi.mock('@/app/(app)/sales/[id]/actions', () => ({
  aggiungiRata: a.aggiungiRata,
  annullaIncasso: a.annullaIncasso,
  eliminaRata: a.eliminaRata,
  eliminaVendita: a.eliminaVendita,
  modificaIncasso: a.modificaIncasso,
  modificaRata: a.modificaRata,
  modificaVendita: a.modificaVendita,
  registraRimborso: a.registraRimborso,
  segnaFallita: a.segnaFallita,
  segnaIncassata: a.segnaIncassata,
}))
vi.mock('@/app/(app)/sales/new/actions', () => ({ registraVendita: a.registraVendita }))
vi.mock('@/app/(app)/commissions/actions', () => ({
  registraPagamentoProvvigione: a.registraPagamentoProvvigione,
  modificaPagamentoProvvigione: a.modificaPagamentoProvvigione,
  eliminaPagamentoProvvigione: a.eliminaPagamentoProvvigione,
}))
vi.mock('@/app/(app)/settings/commissions/actions', () => ({
  nuovaRegola: a.nuovaRegola,
  chiudiRegola: a.chiudiRegola,
  modificaRegola: a.modificaRegola,
  eliminaRegola: a.eliminaRegola,
}))
vi.mock('@/app/actions/obiettivi', () => ({ salvaObiettivi: a.salvaObiettivi }))
vi.mock('@/app/(app)/settings/products/actions', () => ({
  salvaProdotto: a.salvaProdotto,
  cambiaAttivoProdotto: a.cambiaAttivoProdotto,
  eliminaProdotto: a.eliminaProdotto,
}))
vi.mock('@/app/(app)/progetti/actions', () => ({ creaProgetto: a.creaProgetto }))
vi.mock('@/app/(app)/progetti/[id]/actions', () => ({
  aggiungiMembro: a.aggiungiMembro,
  togliMembro: a.togliMembro,
  aggiungiTask: a.aggiungiTask,
  completaTask: a.completaTask,
  eliminaLista: a.eliminaLista,
  eliminaProgetto: a.eliminaProgetto,
  eliminaTask: a.eliminaTask,
  modificaProgetto: a.modificaProgetto,
  modificaTask: a.modificaTask,
  salvaLista: a.salvaLista,
}))
vi.mock('@/app/(app)/progetti/[id]/note/actions', () => ({
  aggiungiNota: a.aggiungiNota,
  eliminaNota: a.eliminaNota,
  modificaNota: a.modificaNota,
}))
vi.mock('@/app/(app)/tempo/actions', () => ({
  avviaTimer: a.avviaTimer,
  eliminaTempo: a.eliminaTempo,
  fermaTimer: a.fermaTimer,
  modificaTempo: a.modificaTempo,
  registraTempo: a.registraTempo,
}))
vi.mock('@/app/actions/eliminazione', () => ({ anteprimaEliminazione: a.anteprimaEliminazione }))

// ---------------------------------------------------------------------------
// A small Supabase that filters like PostgREST: the resolvers find rows the
// way they would in the database (RLS aside). Every eq is written down, so a
// test can check that a query was narrowed to the user.
// ---------------------------------------------------------------------------
type Riga = Record<string, unknown>

function simile(valore: unknown, schema: string): boolean {
  const regex = schema
    .split('%')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${regex}$`, 'i').test(String(valore ?? ''))
}

/** Like Postgres: a date that does not exist (2026-09-31) is an error, not an empty answer. */
function dataInesistente(v: unknown): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v))
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCMonth() !== Number(m[2]) - 1
}

function supabaseFinto(tabelle: Record<string, Riga[]>, registro: string[] = [], rotte: string[] = []) {
  function query(nome: string) {
    let righe = [...(tabelle[nome] ?? [])]
    // a table in `rotte` answers every query with an error
    let errore: { message: string } | null = rotte.includes(nome) ? { message: 'connessione persa' } : null
    const q: Record<string, unknown> = {}
    const filtra = (f: (r: Riga) => boolean) => {
      righe = righe.filter(f)
      return q
    }
    const confronta = (v: unknown, f: (r: Riga) => boolean) => {
      if (dataInesistente(v)) errore = { message: 'date/time field value out of range' }
      return filtra(f)
    }
    Object.assign(q, {
      select: () => q,
      order: () => q,
      eq: (c: string, v: unknown) => {
        registro.push(`${nome}.${c}=${String(v)}`)
        return filtra((r) => r[c] === v)
      },
      neq: (c: string, v: unknown) => filtra((r) => r[c] !== v),
      in: (c: string, vs: unknown[]) => filtra((r) => vs.includes(r[c])),
      ilike: (c: string, s: string) => filtra((r) => simile(r[c], s)),
      or: (espressione: string) =>
        filtra((r) =>
          espressione.split(',').some((parte) => {
            const [c, op, ...resto] = parte.split('.')
            return op === 'ilike' && simile(r[c], resto.join('.'))
          }),
        ),
      gte: (c: string, v: string) => confronta(v, (r) => String(r[c]) >= v),
      gt: (c: string, v: string) => confronta(v, (r) => String(r[c]) > v),
      lte: (c: string, v: string) => confronta(v, (r) => String(r[c]) <= v),
      lt: (c: string, v: string) => confronta(v, (r) => String(r[c]) < v),
      is: (c: string, v: unknown) => filtra((r) => (r[c] ?? null) === v),
      not: (c: string, _op: string, v: unknown) => filtra((r) => (r[c] ?? null) !== v),
      contains: (c: string, vs: unknown[]) => filtra((r) => vs.every((v) => ((r[c] as unknown[]) ?? []).includes(v))),
      limit: (n: number) => {
        righe = righe.slice(0, n)
        return q
      },
      maybeSingle: async () => (errore ? { data: null, error: errore } : { data: righe[0] ?? null, error: null }),
      single: async () =>
        errore ? { data: null, error: errore } : { data: righe[0] ?? null, error: righe[0] ? null : { message: 'nessuna riga' } },
      then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve(errore ? { data: null, error: errore } : { data: righe, error: null }).then(ok, ko),
    })
    return q
  }
  return { from: query, rpc: query }
}

const IO = '00000000-0000-4000-8000-000000000001'
const LORENZO = '00000000-0000-4000-8000-000000000002'
const LORIS = '00000000-0000-4000-8000-000000000004'
const MARIO = 'c0000000-0000-4000-8000-000000000001'
const LUCA_ROSSI = 'c0000000-0000-4000-8000-000000000002'
const VENDITA = '50000000-0000-4000-8000-000000000001'
const RATA = (n: number) => `90000000-0000-4000-8000-00000000000${n}`
const CALL = 'ca000000-0000-4000-8000-000000000001'
const LEAD_NERI = '1e000000-0000-4000-8000-000000000001'
const LEAD_BIANCHI = '1e000000-0000-4000-8000-000000000002'
const PROGETTO = 'b0000000-0000-4000-8000-000000000001'
const LISTA = 'b1000000-0000-4000-8000-000000000001'

function rata(n: number, stato: string, extra: Riga = {}): Riga {
  return {
    payment_id: RATA(n),
    sale_id: VENDITA,
    client_id: MARIO,
    cliente: 'Mario Rossi',
    tipo: 'nuovo',
    numero_rata: n,
    scadenza: `2026-0${n}-10`,
    importo_previsto: 500,
    stato,
    incassato_il: null,
    importo_incassato: null,
    metodo: null,
    ...extra,
  }
}

/** The world the tools see: a few rows per table, as RLS would return them to the admin. */
function mondo(): Record<string, Riga[]> {
  return {
    profiles: [
      { id: IO, nome: 'Dany Montagnolo', ruolo: 'admin', attivo: true },
      { id: LORENZO, nome: 'Lorenzo Closer', ruolo: 'closer', attivo: true },
      { id: LORIS, nome: 'Loris Setter', ruolo: 'setter', attivo: true },
    ],
    clients: [
      {
        id: MARIO,
        nome: 'Mario',
        cognome: 'Rossi',
        email: null,
        telefono: '+39 111 111 1111',
        instagram_handle: null,
        fonte: 'referral',
        setter_id: null,
        closer_id: IO,
        note: null,
      },
      { id: LUCA_ROSSI, nome: 'Luca', cognome: 'Rossi', fonte: 'dm_inbound', setter_id: LORIS, closer_id: IO, note: null },
    ],
    sales: [
      {
        id: VENDITA,
        client_id: MARIO,
        tipo: 'nuovo',
        product_id: null,
        prodotto_personalizzato: 'Annuale',
        valore_contratto: 1500,
        numero_rate: 3,
        data_vendita: '2026-01-10',
        data_inizio: '2026-01-10',
        data_fine: '2027-01-09',
        setter_id: null,
        closer_id: IO,
        note: null,
        prodotto: null,
      },
    ],
    v_rate: [
      rata(1, 'incassata', { incassato_il: '2026-01-10', importo_incassato: 500, metodo: 'bonifico' }),
      rata(2, 'prevista'),
      rata(3, 'prevista'),
    ],
    v_vendite: [{ sale_id: VENDITA, data_vendita: '2026-01-10', rate_totali: 3, totale_piano: 1500, valore_contratto: 1500 }],
    expenses: [
      { id: 'e1', data: '2026-08-12', categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true },
      { id: 'e2', data: '2026-09-12', categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true },
    ],
    leads: [
      { id: LEAD_NERI, nome: 'Luca Neri', instagram_handle: '@luca.neri', fonte: 'dm_inbound', stato: 'call_fissata', note: null },
      { id: LEAD_BIANCHI, nome: 'Luca Bianchi', instagram_handle: '@lucab', fonte: 'dm_outbound', stato: 'follow_up', note: null },
    ],
    calls: [
      {
        id: CALL,
        lead_id: LEAD_NERI,
        tipo: 'discovery',
        programmata_il: '2026-09-28T13:00:00Z',
        stato: 'svolta',
        esito: 'follow_up',
        qualificata: true,
        closer_id: IO,
        setter_id: LORIS,
        note: null,
        link_registrazione: null,
        performance: null,
        prodotto_proposto_id: null,
        lead: { nome: 'Luca Neri', stato: 'call_fissata' },
      },
    ],
    call_pitch: [{ call_id: CALL, importo_proposto: 1500 }],
    commission_rules: [
      { id: 'r1', profile_id: LORIS, percentuale: 0.05, applica_a: ['nuovo'], valida_dal: '2026-01-01', valida_al: null },
    ],
    commission_payouts: [
      { id: 'p1', profile_id: LORIS, periodo: '2026-09-01', importo: 150, pagato_il: '2026-09-20', metodo: 'bonifico', note: null },
    ],
    obiettivi_mese: [{ mese: '2026-10-01', cash: 8000, nuovi_clienti: 4 }],
    products: [{ id: 'pr1', nome: 'Percorso Alpha 3 mesi', durata_mesi: 3, prezzo_listino: 1500, attivo: true, piano_predefinito: null }],
    setter_daily_reports: [
      {
        id: 'rep1',
        setter_id: LORIS,
        data: '2026-09-26',
        dm_outbound: 10,
        dm_inbound: 2,
        conversazioni: 3,
        call_proposte: 1,
        discovery_prenotate: 1,
        discovery_svolte: 0,
        call_qualificate: 0,
        strategy_prenotate: 0,
        follow_up: 4,
        contenuto_pubblicato: false,
        note: null,
      },
    ],
    v_pm_progetti: [
      {
        id: PROGETTO,
        nome: 'Reel settembre',
        reparto_id: 'rep-video',
        client_id: null,
        stato: 'attivo',
        descrizione: null,
        data_inizio: null,
        data_fine: null,
        responsabile_id: null,
        task_totali: 3,
      },
    ],
    pm_membri: [
      { progetto_id: PROGETTO, profilo: { id: IO, nome: 'Dany Montagnolo' } },
      { progetto_id: PROGETTO, profilo: { id: LORENZO, nome: 'Lorenzo Closer' } },
    ],
    v_pm_tasklist: [{ id: LISTA, progetto_id: PROGETTO, nome: 'Montaggio', descrizione: null, data_inizio: null, data_fine: null, task_totali: 2 }],
    pm_tempo: [
      { id: 't-mio', profile_id: IO, progetto_id: PROGETTO, task_id: null, data: '2026-09-28', minuti: 90, nota: null, inizio: null, fine: null, progetto: { nome: 'Reel settembre' } },
      { id: 't-altro', profile_id: LORENZO, progetto_id: PROGETTO, task_id: null, data: '2026-09-28', minuti: 30, nota: null, inizio: null, fine: null, progetto: { nome: 'Reel settembre' } },
    ],
  }
}

function profiloDi(ruolo: AppRole): Profilo {
  return { id: IO, nome: 'Dany Montagnolo', ruolo, attivo: true, livello_pm: 'employee' } as Profilo
}

function strumenti(ruolo: AppRole = 'admin', livello: LivelloPm = 'admin', righe = mondo(), registro: string[] = [], rotte: string[] = []): ToolSet {
  return strumentiAlfire(supabaseFinto(righe, registro, rotte) as never, profiloDi(ruolo), livello)
}

async function esegui(s: ToolSet, nome: string, input: Record<string, unknown>) {
  const execute = s[nome]?.execute
  if (!execute) throw new Error(`${nome} non c’è`)
  return execute(input as never, { toolCallId: 'prova', messages: [] } as never)
}

async function anteprima(nome: string, input: Record<string, unknown>, ruolo: AppRole = 'admin', righe = mondo(), rotte: string[] = []) {
  return anteprimaScrittura(supabaseFinto(righe, [], rotte) as never, profiloDi(ruolo), ruolo === 'admin' ? 'admin' : 'employee', nome, input)
}

/** The actions the model is offered by a tool's schema. */
async function azioniDi(s: ToolSet, nome: string, campo = 'azione'): Promise<string[]> {
  const schema = (await asSchema(s[nome].inputSchema).jsonSchema) as { properties: Record<string, { enum?: string[] }> }
  return schema.properties[campo]?.enum ?? []
}

async function campiDi(s: ToolSet, nome: string): Promise<string[]> {
  const schema = (await asSchema(s[nome].inputSchema).jsonSchema) as { properties: Record<string, unknown> }
  return Object.keys(schema.properties)
}

const spazi = (t: string) => t.replace(/ /g, ' ')

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
describe('chi riceve quali strumenti (elenchi fissati)', () => {
  it('admin: 15 letture, le risposte a un tocco e 18 scritture', () => {
    expect(strumentiConsentiti('admin', 'admin')).toEqual([
      'guida',
      'proponi_risposte',
      'numeri_periodo',
      'cash_per_mese',
      'da_incassare',
      'cerca_clienti',
      'rate_cliente',
      'vendite_periodo',
      'metriche_setting',
      'provvigioni',
      'costi_periodo',
      'call_periodo',
      'progetti',
      'progetto_dettaglio',
      'miei_task',
      'mio_tempo',
      'cliente',
      'vendita',
      'registra_vendita',
      'rata',
      'costo',
      'pagamento_provvigione',
      'regola_provvigione',
      'obiettivi_mese',
      'prodotto',
      'fissa_call',
      'call',
      'lead',
      'aggiorna_report',
      'progetto',
      'lista',
      'task',
      'nota_progetto',
      'tempo',
    ])
  })

  it('setter: i suoi numeri, report, call, lead e i progetti', () => {
    expect(strumentiConsentiti('setter', 'employee')).toEqual([
      'guida',
      'proponi_risposte',
      'miei_numeri',
      'call_periodo',
      'progetti',
      'progetto_dettaglio',
      'miei_task',
      'mio_tempo',
      'fissa_call',
      'call',
      'lead',
      'aggiorna_report',
      'task',
      'nota_progetto',
      'tempo',
    ])
  })

  it('closer: le sue call, le sue vendite e i loro incassi, i progetti', () => {
    expect(strumentiConsentiti('closer', 'employee')).toEqual([
      'guida',
      'proponi_risposte',
      'call_periodo',
      'progetti',
      'progetto_dettaglio',
      'miei_task',
      'mio_tempo',
      'registra_vendita',
      'rata',
      'call',
      'lead',
      'task',
      'nota_progetto',
      'tempo',
    ])
  })

  it('coach: i progetti per livello, niente Economics', () => {
    const lavora = [
      'guida',
      'proponi_risposte',
      'progetti',
      'progetto_dettaglio',
      'miei_task',
      'mio_tempo',
      'task',
      'nota_progetto',
      'tempo',
    ]
    expect(strumentiConsentiti('coach', 'employee')).toEqual(lavora)
    expect(strumentiConsentiti('coach', 'manager')).toEqual([...lavora.slice(0, 6), 'progetto', 'lista', ...lavora.slice(6)])
  })
})

describe('azioni per ruolo: il modello vede solo quelle che la persona può fare', () => {
  it('rata: l’admin tutto il piano, il closer solo gli incassi delle sue vendite', async () => {
    expect(await azioniDi(strumenti(), 'rata')).toEqual([
      'incassa',
      'correggi_incasso',
      'annulla_incasso',
      'fallita',
      'modifica',
      'rimborso',
      'aggiungi',
      'elimina',
    ])
    const closer = strumenti('closer', 'employee')
    expect(await azioniDi(closer, 'rata')).toEqual(['incassa', 'correggi_incasso', 'annulla_incasso', 'fallita'])
    // scadenza, rimborso notes and the sale to add to are the admin's plan
    expect(await campiDi(closer, 'rata')).not.toContain('scadenza')
  })

  it('call: l’esito è di chi fa la call, eliminare dell’admin; il setter la sposta', async () => {
    expect(await azioniDi(strumenti(), 'call')).toEqual(['esito', 'modifica', 'elimina'])
    expect(await azioniDi(strumenti('closer', 'employee'), 'call')).toEqual(['esito', 'modifica'])
    expect(await azioniDi(strumenti('setter', 'employee'), 'call')).toEqual(['modifica'])
  })

  it('la call del setter non ha importi, link, performance né esito', async () => {
    const campi = await campiDi(strumenti('setter', 'employee'), 'call')
    for (const c of ['importo_proposto', 'link_registrazione', 'performance', 'prodotto_proposto', 'esito', 'tipo']) {
      expect(campi, c).not.toContain(c)
    }
    expect(campi).toContain('closer')
    // the closer keeps his calls: no one to reassign them to
    expect(await campiDi(strumenti('closer', 'employee'), 'call')).not.toContain('closer')
  })

  it('lead: il setter corregge i suoi, il closer ne sposta solo lo stato', async () => {
    expect(await azioniDi(strumenti(), 'lead')).toEqual(['stato', 'modifica', 'elimina'])
    expect(await azioniDi(strumenti('setter', 'employee'), 'lead')).toEqual(['stato', 'modifica'])
    const closer = strumenti('closer', 'employee')
    expect(await azioniDi(closer, 'lead')).toEqual(['stato'])
    expect(await campiDi(closer, 'lead')).toEqual(['azione', 'lead', 'stato'])
  })

  it('report: l’admin sceglie il setter ed elimina un giorno, il setter compila i suoi', async () => {
    expect(await azioniDi(strumenti(), 'aggiorna_report', 'modalita')).toEqual(['aggiungi', 'imposta', 'elimina'])
    expect(await campiDi(strumenti(), 'aggiorna_report')).toContain('setter')
    const setter = strumenti('setter', 'employee')
    expect(await azioniDi(setter, 'aggiorna_report', 'modalita')).toEqual(['aggiungi', 'imposta'])
    expect(await campiDi(setter, 'aggiorna_report')).not.toContain('setter')
  })

  it('progetto: il manager non elimina; il cliente lo collega solo l’admin dell’app', async () => {
    expect(await azioniDi(strumenti(), 'progetto')).toContain('elimina')
    const manager = strumenti('coach', 'manager')
    expect(await azioniDi(manager, 'progetto')).toEqual(['crea', 'modifica', 'aggiungi_membro', 'togli_membro'])
    expect(await campiDi(manager, 'progetto')).not.toContain('cliente')
    expect(await campiDi(strumenti(), 'progetto')).toContain('cliente')
  })

  it('tempo: sempre il proprio, per tutti i livelli', async () => {
    expect(await azioniDi(strumenti('coach', 'employee'), 'tempo')).toEqual(['avvia', 'ferma', 'registra', 'modifica', 'elimina'])
    expect(await campiDi(strumenti('coach', 'employee'), 'tempo')).not.toContain('persona')
  })
})

// ---------------------------------------------------------------------------
describe('nomi, non id: quando più righe vanno bene lo strumento chiede quale', () => {
  it('«Rossi» sono due clienti: nessuna scrittura, i candidati nell’errore', async () => {
    const esito = await esegui(strumenti(), 'cliente', { azione: 'modifica', cliente: 'Rossi', telefono: '+39 333 000 0000' })
    expect(a.aggiornaCliente).not.toHaveBeenCalled()
    expect(esito).toEqual({ errore: 'Più clienti possibili: Mario Rossi, Luca Rossi. Chiedi quale, con nome e cognome.' })
  })

  it('«la rata di Rossi» con due rate da incassare: chiede quale; «di marzo» la trova', async () => {
    const s = strumenti()
    const dubbio = (await esegui(s, 'rata', { azione: 'incassa', cliente: 'Mario Rossi' })) as { errore: string }
    expect(a.segnaIncassata).not.toHaveBeenCalled()
    expect(spazi(dubbio.errore)).toBe(
      'Più rate possibili di Mario Rossi: Rata 2 di 3 (scadenza 10/02/2026, 500,00 €, da incassare); ' +
        'Rata 3 di 3 (scadenza 10/03/2026, 500,00 €, da incassare). Chiedi quale, con il numero della rata o il mese.',
    )
    const esito = await esegui(s, 'rata', { azione: 'incassa', cliente: 'Mario Rossi', mese: '2026-03', metodo: 'bonifico' })
    expect(a.segnaIncassata).toHaveBeenCalledWith({ payment_id: RATA(3), incassato_il: undefined, importo: undefined, metodo: 'bonifico' })
    expect(esito).toMatchObject({ fatto: true, rata: 'rata 3 di 3' })
  })

  it('una rata già incassata non si incassa di nuovo: lo dice e mostra le rate', async () => {
    const esito = (await esegui(strumenti(), 'rata', { azione: 'incassa', cliente: 'Mario Rossi', numero: 1 })) as { errore: string }
    expect(a.segnaIncassata).not.toHaveBeenCalled()
    expect(esito.errore).toMatch(/^Nessuna rata adatta tra quelle indicate \(servono rate da incassare o fallita\): Rata 1 di 3 \(incassata il 10\/01\/2026/)
  })

  it('«il costo di Canva» è ricorrente: due mesi, chiede quale; col mese elimina quello giusto', async () => {
    const s = strumenti()
    const dubbio = (await esegui(s, 'costo', { azione: 'elimina', costo: 'Canva' })) as { errore: string }
    expect(a.eliminaCosto).not.toHaveBeenCalled()
    expect(dubbio.errore).toMatch(/^Più costi possibili: «Canva» del 12\/08\/2026 .*«Canva» del 12\/09\/2026/)
    await esegui(s, 'costo', { azione: 'elimina', costo: 'canva', mese: '2026-09' })
    expect(a.eliminaCosto).toHaveBeenCalledWith({ id: 'e2' })
  })

  it('«Luca» sono due lead; con l’handle è uno solo', async () => {
    const s = strumenti()
    const dubbio = (await esegui(s, 'lead', { azione: 'stato', lead: 'Luca', stato: 'perso' })) as { errore: string }
    expect(a.aggiornaStatoLead).not.toHaveBeenCalled()
    expect(dubbio.errore).toBe(
      'Più lead possibili: Luca Neri (@luca.neri), Call da fare; Luca Bianchi (@lucab), Follow-up. Chiedi quale (nome completo o @handle).',
    )
    await esegui(s, 'lead', { azione: 'stato', lead: '@Luca.Neri', stato: 'follow_up' })
    expect(a.aggiornaStatoLead).toHaveBeenCalledWith({ lead_id: LEAD_NERI, stato: 'follow_up' })
  })

  it('una persona che non c’è: nessun pagamento, l’elenco di chi c’è', async () => {
    const esito = await esegui(strumenti(), 'pagamento_provvigione', { azione: 'registra', persona: 'Marta', mese: '2026-09', importo: 100 })
    expect(a.registraPagamentoProvvigione).not.toHaveBeenCalled()
    expect(esito).toEqual({
      errore: 'Persona "Marta" non trovata o non univoca. Possibili: Dany Montagnolo, Lorenzo Closer, Loris Setter',
    })
  })
})

// ---------------------------------------------------------------------------
describe('ogni scrittura chiama l’azione del form con i dati giusti', () => {
  it('cliente: correggere fonde i campi, eliminare passa l’id', async () => {
    const s = strumenti()
    await esegui(s, 'cliente', { azione: 'modifica', cliente: 'Mario Rossi', telefono: '+39 333 000 0000', setter: 'Loris' })
    expect(a.aggiornaCliente).toHaveBeenCalledWith(
      expect.objectContaining({ id: MARIO, nome: 'Mario', telefono: '+39 333 000 0000', fonte: 'referral', setter_id: LORIS, closer_id: IO }),
    )
    await esegui(s, 'cliente', { azione: 'elimina', cliente: 'Mario Rossi' })
    expect(a.eliminaCliente).toHaveBeenCalledWith({ id: MARIO })
  })

  it('cliente: creare senza vendita, con setter e closer per nome', async () => {
    await esegui(strumenti(), 'cliente', { azione: 'crea', nome: 'Anna', cognome: 'Verdi', fonte: 'referral', setter: 'Loris', closer: 'io' })
    expect(a.creaCliente).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Anna', cognome: 'Verdi', fonte: 'referral', setter_id: LORIS, closer_id: IO, note: null }),
    )
  })

  it('vendita: correggere tiene tutto il resto; un prodotto fuori catalogo diventa personalizzato', async () => {
    await esegui(strumenti(), 'vendita', { azione: 'modifica', cliente: 'Mario Rossi', prodotto: 'Semestrale', valore: 1800 })
    expect(a.modificaVendita).toHaveBeenCalledWith({
      id: VENDITA,
      tipo: 'nuovo',
      product_id: 'personalizzato',
      prodotto_personalizzato: 'Semestrale',
      valore_contratto: 1800,
      data_vendita: '2026-01-10',
      data_inizio: '2026-01-10',
      data_fine: '2027-01-09',
      setter_id: null,
      closer_id: IO,
      note: null,
    })
  })

  it('vendita: interrompere il percorso usa la stessa azione della scheda cliente', async () => {
    await esegui(strumenti(), 'vendita', { azione: 'interrompi', cliente: 'Mario Rossi', ultimo_giorno: '2026-09-30' })
    expect(a.interrompiPercorso).toHaveBeenCalledWith({ sale_id: VENDITA, ultimo_giorno: '2026-09-30', togli_rate: false })
  })

  it('rata: aggiungere va sulla vendita del cliente; correggere un incasso tiene quel che non cambia', async () => {
    const s = strumenti()
    await esegui(s, 'rata', { azione: 'aggiungi', cliente: 'Mario Rossi', scadenza: '2026-12-10', importo: 300 })
    expect(a.aggiungiRata).toHaveBeenCalledWith({ sale_id: VENDITA, scadenza: '2026-12-10', importo: 300 })
    await esegui(s, 'rata', { azione: 'correggi_incasso', cliente: 'Mario Rossi', numero: 1, importo: 450 })
    expect(a.modificaIncasso).toHaveBeenCalledWith({ payment_id: RATA(1), incassato_il: '2026-01-10', importo: 450, metodo: 'bonifico' })
    await esegui(s, 'rata', { azione: 'rimborso', cliente: 'Mario Rossi', numero: 1, importo: 200 })
    expect(a.registraRimborso).toHaveBeenCalledWith({ payment_id: RATA(1), data: oggiRoma(), importo: 200, note: undefined })
  })

  it('costo: registra oggi di default, copia i ricorrenti nel mese indicato', async () => {
    const s = strumenti()
    await esegui(s, 'costo', { azione: 'registra', descrizione: 'Notion', importo: 10, categoria: 'software' })
    expect(a.aggiungiCosto).toHaveBeenCalledWith({ data: oggiRoma(), categoria: 'software', descrizione: 'Notion', importo: 10, ricorrente: false })
    await esegui(s, 'costo', { azione: 'copia_ricorrenti', mese: '2026-10' })
    expect(a.copiaRicorrenti).toHaveBeenCalledWith({ mese: '2026-10-01' })
  })

  it('provvigioni: pagamento del mese e regola nuova, chiusa, eliminata', async () => {
    const s = strumenti()
    await esegui(s, 'pagamento_provvigione', { azione: 'registra', persona: 'Loris', mese: '2026-09', importo: 120, metodo: 'bonifico' })
    expect(a.registraPagamentoProvvigione).toHaveBeenCalledWith({
      profile_id: LORIS,
      periodo: '2026-09-01',
      importo: 120,
      pagato_il: oggiRoma(),
      metodo: 'bonifico',
      note: undefined,
    })
    await esegui(s, 'pagamento_provvigione', { azione: 'elimina', persona: 'Loris', mese: '2026-09' })
    expect(a.eliminaPagamentoProvvigione).toHaveBeenCalledWith({ id: 'p1' })
    await esegui(s, 'regola_provvigione', { azione: 'nuova', persona: 'Loris', percentuale: 7, valida_dal: '2026-10-01' })
    expect(a.nuovaRegola).toHaveBeenCalledWith({ profile_id: LORIS, percentuale: 7, applica_a: ['nuovo'], valida_dal: '2026-10-01' })
    await esegui(s, 'regola_provvigione', { azione: 'chiudi', persona: 'Loris', valida_al: '2026-12-31' })
    expect(a.chiudiRegola).toHaveBeenCalledWith({ rule_id: 'r1', valida_al: '2026-12-31' })
    await esegui(s, 'regola_provvigione', { azione: 'modifica', persona: 'Loris', percentuale: 6 })
    expect(a.modificaRegola).toHaveBeenCalledWith({ id: 'r1', percentuale: 6, applica_a: ['nuovo'], valida_dal: '2026-01-01', valida_al: null })
  })

  it('obiettivi: un campo non detto resta com’è, null lo toglie', async () => {
    const s = strumenti()
    await esegui(s, 'obiettivi_mese', { mese: '2026-10', cash: 10000 })
    expect(a.salvaObiettivi).toHaveBeenLastCalledWith({ mese: '2026-10-01', cash: 10000, nuovi_clienti: 4 })
    await esegui(s, 'obiettivi_mese', { mese: '2026-10', cash: null, nuovi_clienti: null })
    expect(a.salvaObiettivi).toHaveBeenLastCalledWith({ mese: '2026-10-01', cash: null, nuovi_clienti: null })
  })

  it('prodotto: fuori vendita e modifica dal nome', async () => {
    const s = strumenti()
    await esegui(s, 'prodotto', { azione: 'fuori_vendita', prodotto: '3 mesi' })
    expect(a.cambiaAttivoProdotto).toHaveBeenCalledWith({ id: 'pr1', attivo: false })
    await esegui(s, 'prodotto', { azione: 'modifica', prodotto: 'Percorso Alpha 3 mesi', prezzo_listino: 1600 })
    expect(a.salvaProdotto).toHaveBeenCalledWith(expect.objectContaining({ id: 'pr1', prezzo_listino: 1600, durata_mesi: 3, attivo: true }))
  })

  it('call: l’esito chiusa restituisce il call_id per la vendita; follow-up vuole la qualifica', async () => {
    const s = strumenti('closer', 'employee')
    const chiusa = await esegui(s, 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'chiusa' })
    expect(a.registraEsito).toHaveBeenCalledWith({ call_id: CALL, esito: 'chiusa', qualificata: undefined, obiezione: undefined })
    expect(chiusa).toMatchObject({ fatto: true, call_id: CALL })
    vi.clearAllMocks()
    const senza = await esegui(s, 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'follow_up' })
    expect(a.registraEsito).not.toHaveBeenCalled()
    expect(senza).toEqual({ errore: 'Dimmi se il lead era qualificato.' })
  })

  it('call: i dettagli del closer si fondono con quelli salvati (importo proposto compreso)', async () => {
    await esegui(strumenti('closer', 'employee'), 'call', { azione: 'modifica', call_id: CALL, lead: 'Luca Neri', performance: 'buona' })
    expect(a.modificaCall).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: CALL,
        closer_id: IO,
        dettagli: { link_registrazione: null, performance: 'buona', prodotto_proposto_id: null, importo_proposto: 1500 },
      }),
    )
  })

  it('registra_vendita passa il call_id: setter e closer vengono dalla call', async () => {
    a.registraVendita.mockResolvedValueOnce({ ok: true, idVendita: VENDITA })
    await esegui(strumenti('closer', 'employee'), 'registra_vendita', {
      cliente: 'Luca Neri',
      tipo: 'nuovo',
      prodotto: 'Percorso Alpha 3 mesi',
      valore: 1500,
      data_vendita: '2026-09-28',
      data_inizio: '2026-10-01',
      call_id: CALL,
    })
    expect(a.registraVendita).toHaveBeenCalledWith(expect.objectContaining({ call_id: CALL, nome: 'Luca', cognome: 'Neri', product_id: 'pr1' }))
  })

  it('report dell’admin: un giorno nuovo si aggiunge, uno che c’è si corregge, e si elimina', async () => {
    const s = strumenti()
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-27', modalita: 'imposta', dm_outbound: 20 })
    expect(a.aggiungiReport).toHaveBeenCalledWith(expect.objectContaining({ setter_id: LORIS, data: '2026-09-27', dm_outbound: 20, follow_up: 0 }))
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'aggiungi', dm_outbound: 5 })
    expect(a.correggiReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'rep1', dm_outbound: 15, follow_up: 4 }))
    expect(a.correggiReport.mock.calls[0][0]).not.toHaveProperty('data')
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'elimina' })
    expect(a.eliminaReport).toHaveBeenCalledWith({ id: 'rep1' })
    expect(a.salvaReportGiornaliero).not.toHaveBeenCalled()
  })

  it('report del setter: il suo giorno, sommato a quello salvato, dalla stessa azione di «Oggi»', async () => {
    const righe = mondo()
    righe.setter_daily_reports = righe.setter_daily_reports.map((r) => ({ ...r, setter_id: IO }))
    await esegui(strumenti('setter', 'employee', righe), 'aggiorna_report', { data: '2026-09-26', modalita: 'aggiungi', dm_outbound: 5 })
    expect(a.salvaReportGiornaliero).toHaveBeenCalledWith(expect.objectContaining({ data: '2026-09-26', dm_outbound: 15, follow_up: 4 }))
    expect(a.aggiungiReport).not.toHaveBeenCalled()
    expect(a.correggiReport).not.toHaveBeenCalled()
  })

  it('task: correggere manda la riga intera, con le persone del progetto', async () => {
    const righe = mondo()
    righe.v_pm_task = [
      {
        id: 'k1',
        titolo: 'Copertina',
        progetto_id: PROGETTO,
        tasklist_id: LISTA,
        parent_id: null,
        descrizione: null,
        stato: 'da_fare',
        priorita: 'media',
        data_inizio: null,
        scadenza: null,
        stima_minuti: null,
        assegnatari: [IO],
        sotto_task_totali: 0,
      },
    ]
    await esegui(strumenti('coach', 'employee', righe), 'task', { azione: 'modifica', titolo: 'Copertina', scadenza: '2026-10-10', stima: '2 h', assegnatari: ['Lorenzo'] })
    expect(a.modificaTask).toHaveBeenCalledWith({
      id: 'k1',
      titolo: 'Copertina',
      descrizione: null,
      stato: 'da_fare',
      priorita: 'media',
      assegnatari: [LORENZO],
      data_inizio: null,
      scadenza: '2026-10-10',
      stima_minuti: 120,
      tasklist_id: LISTA,
      parent_id: null,
    })
  })

  it('progetto: creare con reparto, modello e membri per nome', async () => {
    const righe = mondo()
    righe.pm_reparti = [{ id: 'rep-video', nome: 'Contenuti e Video', attivo: true }]
    righe.pm_modelli = [{ id: 'mod-reel', nome: 'Reel mensile', attivo: true }]
    a.creaProgetto.mockResolvedValueOnce({ ok: true, id: PROGETTO })
    const esito = await esegui(strumenti('coach', 'manager', righe), 'progetto', {
      azione: 'crea',
      nome: 'Reel ottobre',
      reparto: 'contenuti',
      modello: 'Reel',
      persone: ['Lorenzo'],
    })
    expect(a.creaProgetto).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Reel ottobre', reparto_id: 'rep-video', modello_id: 'mod-reel', client_id: null, membri: [LORENZO] }),
    )
    expect(esito).toEqual({ fatto: true, link: `/progetti/${PROGETTO}` })
  })

  it('progetti: membro, lista, task nella lista, nota', async () => {
    const s = strumenti()
    await esegui(s, 'progetto', { azione: 'aggiungi_membro', progetto: 'Reel', persone: ['Loris'] })
    expect(a.aggiungiMembro).toHaveBeenCalledWith({ progetto_id: PROGETTO, profile_id: LORIS })
    await esegui(s, 'lista', { azione: 'modifica', progetto: 'Reel', lista: 'Montaggio', data_fine: '2026-10-15' })
    expect(a.salvaLista).toHaveBeenCalledWith(expect.objectContaining({ id: LISTA, progetto_id: PROGETTO, nome: 'Montaggio', data_fine: '2026-10-15' }))
    await esegui(s, 'task', { azione: 'aggiungi', titolo: 'Copertina', progetto: 'Reel settembre', lista: 'Montaggio', assegnatari: ['io', 'Lorenzo'] })
    expect(a.aggiungiTask).toHaveBeenCalledWith({
      progetto_id: PROGETTO,
      titolo: 'Copertina',
      tasklist_id: LISTA,
      parent_id: null,
      assegnatari: [IO, LORENZO],
    })
    await esegui(s, 'nota_progetto', { azione: 'aggiungi', progetto: 'Reel', testo: 'Call con il cliente spostata' })
    expect(a.aggiungiNota).toHaveBeenCalledWith({ progetto_id: PROGETTO, data: oggiRoma(), testo: 'Call con il cliente spostata' })
  })

  it('tempo: registra il proprio; per correggere cerca solo tra le proprie voci', async () => {
    const registro: string[] = []
    const s = strumenti('coach', 'employee', mondo(), registro)
    await esegui(s, 'tempo', { azione: 'registra', progetto: 'Reel', durata: '1h30', nota: 'Montaggio' })
    expect(a.registraTempo).toHaveBeenCalledWith({ progetto_id: PROGETTO, task_id: null, data: oggiRoma(), durata: '1h30', nota: 'Montaggio' })
    // two entries that day on the project, one is someone else's: mine only, no question
    await esegui(s, 'tempo', { azione: 'elimina', progetto: 'Reel', data: '2026-09-28' })
    expect(a.eliminaTempo).toHaveBeenCalledWith({ id: 't-mio' })
    expect(registro).toContain(`pm_tempo.profile_id=${IO}`)
  })

  it('mio_tempo legge solo il tempo di chi chatta', async () => {
    const registro: string[] = []
    const esito = (await esegui(strumenti('coach', 'manager', mondo(), registro), 'mio_tempo', {
      da: '2026-09-01',
      a: '2026-09-30',
    })) as { voci: unknown[] }
    expect(registro).toContain(`pm_tempo.profile_id=${IO}`)
    expect(esito.voci.map((v) => (v as { voce_id: string }).voce_id)).toEqual(['t-mio'])
  })
})

// ---------------------------------------------------------------------------
describe('la scheda prima del tocco: la riga vera, prima → dopo, cosa si porta dietro', () => {
  it('eliminare un cliente dice vendite, rate e incassato, dal SQL dell’app', async () => {
    a.anteprimaEliminazione.mockResolvedValueOnce({ ok: true, dati: { vendite: 2, rate: 8, incassato: '3.200,00 €' } })
    const p = await anteprima('cliente', { azione: 'elimina', cliente: 'mario rossi' })
    expect(a.anteprimaEliminazione).toHaveBeenCalledWith('cliente', MARIO)
    expect(p).toEqual({
      titolo: 'Elimino il cliente Mario Rossi',
      righe: ['Si eliminano anche 2 vendite e 8 rate, con 3.200,00 € già incassati.', 'I numeri dei mesi passati cambiano di conseguenza.'],
      sostituisceDettagli: true,
    })
  })

  it('correggere un cliente mostra prima → dopo, con i nomi delle persone', async () => {
    const p = await anteprima('cliente', { azione: 'modifica', cliente: 'Mario Rossi', telefono: '+39 333 000 0000', setter: 'Loris' })
    expect(p).toMatchObject({
      titolo: 'Correggo il cliente Mario Rossi',
      righe: [
        'Telefono: +39 111 111 1111 → +39 333 000 0000',
        'Setter: – → Loris Setter',
        // Mario has a sale: its setter (and the commissions) stay as they are
        'Le vendite già registrate tengono il loro setter: provvigioni invariate. Per cambiarlo: vendita modifica.',
      ],
    })
  })

  it('una rata: il nome vero della rata; eliminare quella incassata toglie il suo incasso dal cash', async () => {
    const incassa = await anteprima('rata', { azione: 'incassa', cliente: 'Mario Rossi', numero: 2, importo: 450 })
    expect(incassa).toMatchObject({ titolo: 'Segno incassata la rata 2 di 3 di Mario Rossi' })
    expect((incassa as { righe: string[] }).righe.map(spazi)).toEqual([
      'Prevista: 500,00 €, scadenza 10/02/2026',
      `Incasso: 450,00 € il ${oggiRoma().split('-').reverse().join('/')}`,
    ])
    const elimina = (await anteprima('rata', { azione: 'elimina', cliente: 'Mario Rossi', numero: 1 })) as { righe: string[] }
    expect(elimina.righe.map(spazi)).toContain('Il suo incasso (500,00 €) esce dal cash e dalle provvigioni del mese.')
  })

  it('l’ultima rata non si elimina: si elimina la vendita', async () => {
    const righe = mondo()
    righe.v_vendite = [{ sale_id: VENDITA, data_vendita: '2026-01-10', rate_totali: 1 }]
    righe.v_rate = [rata(1, 'prevista')]
    expect(await anteprima('rata', { azione: 'elimina', cliente: 'Mario Rossi' }, 'admin', righe)).toEqual({
      errore: 'È l’ultima rata: per togliere tutto elimina la vendita.',
    })
  })

  it('aggiungere una rata: quanto sommano oggi le rate, dal SQL, e che si rinumerano', async () => {
    const p = (await anteprima('rata', { azione: 'aggiungi', cliente: 'Mario Rossi', scadenza: '2026-12-10', importo: 300 })) as {
      titolo: string
      righe: string[]
    }
    expect(spazi(p.titolo)).toBe('Aggiungo una rata alla vendita di Mario Rossi del 10/01/2026 (Primo percorso, 1.500,00 €)')
    expect(p.righe.map(spazi)).toEqual([
      'Nuova rata: 300,00 € con scadenza 10/12/2026',
      'Oggi 3 rate sommano 1.500,00 € su un contratto di 1.500,00 €.',
      'Le rate si rinumerano in ordine di scadenza.',
    ])
  })

  it('interrompere un percorso: le frasi della scheda cliente, con i numeri del SQL', async () => {
    a.anteprimaInterruzione.mockResolvedValueOnce({
      ok: true,
      anteprima: { rate_tolte: 2, importo_tolto: 1000, valore_prima: 1500, valore_dopo: 500 },
    })
    const p = (await anteprima('vendita', { azione: 'interrompi', cliente: 'Mario Rossi', ultimo_giorno: '2026-09-30', togli_rate: true })) as {
      righe: string[]
    }
    expect(a.anteprimaInterruzione).toHaveBeenCalledWith({ sale_id: VENDITA, ultimo_giorno: '2026-09-30', togli_rate: true })
    expect(p.righe.map(spazi)).toEqual([
      'Fine del percorso: 09/01/2027 → 30/09/2026',
      'Tolgo 2 rate (1.000,00 €): il contratto passa da 1.500,00 € a 500,00 €.',
      'Gli incassi già fatti non cambiano.',
    ])
  })

  it('call, lead, regola: le stesse frasi dell’app', async () => {
    expect(await anteprima('call', { azione: 'elimina', call_id: CALL, lead: 'Luca' })).toMatchObject({
      titolo: 'Elimino la call con Luca Neri del 28/09/2026 alle 15:00',
      righe: [...CONSEGUENZE.call],
    })
    a.anteprimaEliminazione.mockResolvedValueOnce({ ok: true, dati: { call: 1, clienti_collegati: 0 } })
    expect(await anteprima('lead', { azione: 'elimina', lead: '@luca.neri' })).toMatchObject({
      titolo: 'Elimino il lead Luca Neri',
      righe: ['Si eliminano anche 1 call.'],
    })
    expect(await anteprima('lead', { azione: 'stato', lead: 'Luca Neri', stato: 'follow_up' })).toMatchObject({
      titolo: 'Sposto Luca Neri in «Follow-up»',
      righe: ['Ora: Call da fare'],
    })
    expect(await anteprima('regola_provvigione', { azione: 'elimina', persona: 'Loris' })).toMatchObject({
      titolo: 'Elimino la regola di Loris Setter: 5% su nuovo dal 01/01/2026',
      righe: [...CONSEGUENZE.regola],
    })
  })

  it('il report di un giorno che c’è già: lo corregge, campo per campo', async () => {
    const p = await anteprima('aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'aggiungi', dm_outbound: 5 })
    expect(p).toMatchObject({
      titolo: 'Correggo il report di Loris Setter del 26/09/2026',
      righe: ['C’è già: lo correggo.', 'DM outbound: 10 → 15'],
    })
  })

  it('un bersaglio ambiguo è un errore da girare al modello; uno strumento non del ruolo non si legge', async () => {
    expect(await anteprima('cliente', { azione: 'elimina', cliente: 'Rossi' })).toEqual({
      errore: 'Più clienti possibili: Mario Rossi, Luca Rossi. Chiedi quale, con nome e cognome.',
    })
    expect(await anteprima('cliente', { azione: 'elimina', cliente: 'Mario Rossi' }, 'setter')).toEqual({
      errore: 'Operazione non disponibile per il tuo ruolo.',
    })
    // the closer's instalment tool has no plan actions, whatever the chat sends
    expect(await anteprima('rata', { azione: 'elimina', cliente: 'Mario Rossi', numero: 1 }, 'closer')).toEqual({
      errore: 'Dati non validi per questa operazione.',
    })
  })
})

// ---------------------------------------------------------------------------
describe('la scheda dall’input: una frase per azione', () => {
  const casi: [Parameters<typeof riassuntoScrittura>[0], Record<string, unknown>, string, string[]?][] = [
    ['cliente', { azione: 'elimina', cliente: 'Mario Rossi' }, 'Elimino il cliente Mario Rossi'],
    ['vendita', { azione: 'interrompi', cliente: 'Mario Rossi', ultimo_giorno: '2026-09-30', togli_rate: true }, 'Interrompo il percorso di Mario Rossi', ['Ultimo giorno: 30/09/2026', 'Tolgo le rate non pagate dopo quel giorno']],
    ['vendita', { azione: 'elimina', cliente: 'Mario Rossi', data_vendita: '2026-01-10' }, 'Elimino la vendita di Mario Rossi del 10/01/2026'],
    ['rata', { azione: 'incassa', cliente: 'Mario Rossi', numero: 2 }, 'Segno incassata una rata di Mario Rossi', ['Rata 2', 'Importo previsto dalla rata', 'Incassata oggi']],
    ['rata', { azione: 'aggiungi', cliente: 'Mario Rossi', scadenza: '2026-12-10', importo: 300 }, 'Aggiungo una rata di 300,00 € alla vendita di Mario Rossi', ['Scadenza 10/12/2026', 'Le rate si rinumerano in ordine di scadenza']],
    ['rata', { azione: 'rimborso', cliente: 'Mario Rossi', numero: 1, importo: 200 }, 'Registro un rimborso a Mario Rossi', ['Rata 1', 'Importo 200,00 €', 'Rimborsato oggi', 'La provvigione torna indietro nel mese del rimborso']],
    ['rata', { azione: 'fallita', cliente: 'Mario Rossi', mese: '2026-03' }, 'Segno come fallita una rata di Mario Rossi', ['Scadenza a marzo 2026']],
    ['costo', { azione: 'copia_ricorrenti', mese: '2026-10' }, 'Copio i costi ricorrenti in ottobre 2026', ['Dal mese prima; salto quelli che ci sono già']],
    ['costo', { azione: 'modifica', costo: 'Canva', importo: 14.99 }, 'Correggo il costo «Canva»', ['Importo: 14,99 €']],
    ['pagamento_provvigione', { azione: 'registra', persona: 'Loris', mese: '2026-09', importo: 150 }, 'Registro il pagamento di 150,00 € a Loris per settembre 2026', ['Pagato oggi']],
    ['regola_provvigione', { azione: 'nuova', persona: 'Loris', percentuale: 5, valida_dal: '2026-10-01' }, 'Nuova regola per Loris: 5% su nuovo', ['Dal 01/10/2026']],
    ['regola_provvigione', { azione: 'chiudi', persona: 'Loris', valida_al: '2026-12-31' }, 'Chiudo la regola di Loris al 31/12/2026', ['Le provvigioni fino a quel giorno restano']],
    ['obiettivi_mese', { mese: '2026-10', cash: 10000, nuovi_clienti: 5 }, 'Obiettivi di ottobre 2026', ['Cash: 10.000,00 €', 'Nuovi clienti: 5']],
    ['obiettivi_mese', { mese: '2026-10', cash: null, nuovi_clienti: null }, 'Tolgo gli obiettivi di ottobre 2026', []],
    ['prodotto', { azione: 'fuori_vendita', prodotto: 'Annuale' }, 'Metto fuori vendita «Annuale»'],
    ['call', { azione: 'esito', lead: 'Luca Neri', esito: 'chiusa' }, 'Registro l’esito della call con Luca Neri: Chiusa', ['Poi registriamo la vendita']],
    ['call', { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: false, obiezione: 'Prezzo' }, 'Registro l’esito della call con Luca Neri: Persa', ['Qualificata: no', 'Obiezione: Prezzo']],
    ['lead', { azione: 'stato', lead: 'Luca Neri', stato: 'call_fissata' }, 'Sposto Luca Neri in «Call da fare»'],
    ['aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'elimina' }, 'Elimino il report di Loris di 26/09/2026', []],
    ['progetto', { azione: 'togli_membro', progetto: 'Reel', persone: ['Sara Editor'] }, 'Tolgo Sara Editor dal progetto «Reel»'],
    ['lista', { azione: 'crea', progetto: 'Reel', nome: 'Pubblicazione', data_fine: '2026-10-31' }, 'Creo la lista «Pubblicazione» in «Reel»', ['Fine: 31/10/2026']],
    ['task', { azione: 'elimina', titolo: 'Copertina', progetto: 'Reel' }, 'Elimino il task «Copertina»', ['Progetto: Reel']],
    ['nota_progetto', { azione: 'aggiungi', progetto: 'Reel', testo: 'Consegna spostata' }, 'Aggiungo una nota a «Reel»', ['Giorno: oggi', '«Consegna spostata»']],
    ['tempo', { azione: 'registra', progetto: 'Reel', durata: '1h30', task: 'Copertina' }, 'Registro 1h30 su «Reel»', ['Giorno: oggi', 'Task: Copertina']],
    ['tempo', { azione: 'ferma' }, 'Fermo il timer', []],
  ]

  it.each(casi)('%s %o', (nome, input, titolo, dettagli) => {
    const r = riassuntoScrittura(nome, input)
    expect(spazi(r.titolo)).toBe(titolo)
    if (dettagli) expect(r.dettagli.map(spazi)).toEqual(dettagli)
  })

  it('il bottone di chi toglie o chiude dice cosa fa', () => {
    expect(azioneDistruttiva('cliente', { azione: 'elimina' })).toBe('Elimina')
    expect(azioneDistruttiva('aggiorna_report', { modalita: 'elimina' })).toBe('Elimina')
    expect(azioneDistruttiva('vendita', { azione: 'interrompi' })).toBe('Interrompi')
    expect(azioneDistruttiva('progetto', { azione: 'togli_membro' })).toBe('Togli')
    expect(azioneDistruttiva('rata', { azione: 'incassa' })).toBeNull()
  })
})

describe('le conseguenze fisse sono le parole dell’app', () => {
  const file: Record<keyof typeof CONSEGUENZE, string> = {
    call: 'app/(app)/calls/modifica-call.tsx',
    prodotto: 'app/(app)/settings/products/prodotto-form.tsx',
    regola: 'app/(app)/settings/commissions/regole-client.tsx',
    report: 'app/(app)/setting/modifica-report.tsx',
    membro: 'components/pm/membri/membri-client.tsx',
    progetto: 'components/pm/progetto/modifica-progetto.tsx',
    interruzione: 'app/(app)/clients/[id]/interrompi-percorso.tsx',
  }

  it.each(Object.entries(file))('%s', (chiave, percorso) => {
    const sorgente = readFileSync(percorso, 'utf8').replace(/\s+/g, ' ')
    for (const frase of CONSEGUENZE[chiave as keyof typeof CONSEGUENZE]) expect(sorgente).toContain(frase)
  })
})

// ---------------------------------------------------------------------------
describe('la scheda dice esattamente cosa si scrive, e un dubbio si chiede prima del tocco', () => {
  const P_LORIS = 'aa000000-0000-4000-8000-000000000001'
  const P_ALTRO = 'aa000000-0000-4000-8000-000000000002'

  it('un’eliminazione il cui conteggio fallisce resta incompleta: il bottone rosso aspetta', async () => {
    a.anteprimaEliminazione.mockResolvedValueOnce({ ok: false, errore: 'Anteprima non disponibile. Riprova.' })
    expect(await anteprima('cliente', { azione: 'elimina', cliente: 'Mario Rossi' })).toEqual({
      titolo: 'Elimino il cliente Mario Rossi',
      righe: ['Non riesco a contare cosa si porta dietro: annulla e riprova tra poco.'],
      sostituisceDettagli: true,
      incompleta: true,
    })
    a.anteprimaEliminazione.mockResolvedValueOnce({ ok: false, errore: 'Anteprima non disponibile. Riprova.' })
    expect(await anteprima('lead', { azione: 'elimina', lead: '@luca.neri' })).toMatchObject({ incompleta: true })
  })

  it('una lettura fallita non è «nessun risultato»: niente cliente nuovo doppio, niente scrittura', async () => {
    const esito = await esegui(strumenti('admin', 'admin', mondo(), [], ['clients']), 'registra_vendita', {
      cliente: 'Mario Rossi',
      tipo: 'nuovo',
      prodotto: 'Percorso Alpha 3 mesi',
      valore: 1500,
      data_vendita: '2026-09-28',
      data_inizio: '2026-10-01',
    })
    expect(a.registraVendita).not.toHaveBeenCalled()
    expect(esito).toEqual({ errore: 'Non riesco a leggere i dati in questo momento: riprova tra poco.' })
  })

  it('un pagamento per id è sempre della persona detta, e la scheda dice il suo mese vero', async () => {
    const righe = mondo()
    righe.commission_payouts = [
      { id: P_LORIS, profile_id: LORIS, periodo: '2026-08-01', importo: 150, pagato_il: '2026-08-20', metodo: 'bonifico', note: null },
      { id: P_ALTRO, profile_id: LORENZO, periodo: '2026-09-01', importo: 90, pagato_il: '2026-09-20', metodo: 'bonifico', note: null },
    ]
    // the id of somebody else's payout: not found, nothing deleted
    const altro = await esegui(strumenti('admin', 'admin', righe), 'pagamento_provvigione', {
      azione: 'elimina',
      persona: 'Loris',
      mese: '2026-09',
      id: P_ALTRO,
    })
    expect(a.eliminaPagamentoProvvigione).not.toHaveBeenCalled()
    expect(altro).toEqual({ errore: 'Pagamento non trovato tra quelli di questa persona.' })
    // his own payout by id, with the wrong month in the chat: the card says August
    const p = await anteprima('pagamento_provvigione', { azione: 'elimina', persona: 'Loris', mese: '2026-09', id: P_LORIS }, 'admin', righe)
    expect(p).toMatchObject({ titolo: 'Elimino il pagamento a Loris Setter per agosto 2026' })
  })

  it('registra_vendita del closer: setter e closer vengono dalla call, e la scheda li nomina', async () => {
    const closer = strumenti('closer', 'employee')
    const campi = await campiDi(closer, 'registra_vendita')
    for (const c of ['setter', 'closer', 'fonte']) expect(campi, c).not.toContain(c)
    const righe = mondo()
    righe.calls = righe.calls.map((c) => ({ ...c, esito: 'chiusa', lead: { nome: 'Luca Neri', stato: 'cliente', fonte: 'dm_inbound' } }))
    const p = (await anteprima(
      'registra_vendita',
      { cliente: 'Luca Neri', tipo: 'nuovo', prodotto: 'Percorso Alpha 3 mesi', valore: 1500, data_vendita: '2026-09-28', data_inizio: '2026-10-01', call_id: CALL },
      'closer',
      righe,
    )) as { righe: string[] }
    expect(p.righe).toContain('Cliente nuovo: lo creo con questa vendita')
    expect(p.righe).toContain('Setter: Loris Setter (dalla call)')
    expect(p.righe).toContain('Closer: Dany Montagnolo')
    expect(p.righe).toContain('Fonte: DM inbound')
  })

  it('registra_vendita dell’admin: un setter che non c’è ferma la scheda e non scrive niente', async () => {
    const input = { cliente: 'Paolo Neri', tipo: 'nuovo', prodotto: 'Percorso Alpha 3 mesi', valore: 900, data_vendita: '2026-09-28', data_inizio: '2026-10-01', setter: 'Marta' }
    expect(await anteprima('registra_vendita', input)).toMatchObject({ errore: expect.stringMatching(/^Persona "Marta" non trovata/) })
    expect(await esegui(strumenti(), 'registra_vendita', input)).toMatchObject({ errore: expect.stringMatching(/^Persona "Marta"/) })
    expect(a.registraVendita).not.toHaveBeenCalled()
  })

  it('registra_vendita a un cliente che c’è: contatti e fonte non si scrivono, e la scheda lo dice', async () => {
    const p = (await anteprima('registra_vendita', {
      cliente: 'Mario Rossi',
      tipo: 'rinnovo',
      prodotto: 'Percorso Alpha 3 mesi',
      valore: 1500,
      data_vendita: '2026-09-28',
      data_inizio: '2026-10-01',
      fonte: 'ads',
      telefono: '+39 999',
    })) as { righe: string[] }
    expect(p.righe).toContain('Cliente già in anagrafica: Mario Rossi')
    expect(p.righe).toContain('Setter: nessuno')
    expect(p.righe).not.toContain('Fonte: Ads')
    expect(p.righe).toContain('Contatti e fonte restano quelli in anagrafica di Mario Rossi: si cambiano con cliente modifica.')
  })

  it('un prodotto che vale per più voci del catalogo si chiede; «2 mesi» non è «12 mesi»', async () => {
    const righe = mondo()
    righe.products = [
      ...righe.products,
      { id: 'pr6', nome: 'Percorso Alpha 6 mesi', durata_mesi: 6, prezzo_listino: 2500, attivo: true, piano_predefinito: null },
      { id: 'pr12', nome: 'Percorso Alpha 12 mesi', durata_mesi: 12, prezzo_listino: 4500, attivo: true, piano_predefinito: null },
    ]
    const s = strumenti('admin', 'admin', righe)
    const dubbio = await esegui(s, 'vendita', { azione: 'modifica', cliente: 'Mario Rossi', prodotto: 'Percorso Alpha' })
    expect(a.modificaVendita).not.toHaveBeenCalled()
    expect(dubbio).toMatchObject({ errore: expect.stringMatching(/^Più prodotti possibili: Percorso Alpha 3 mesi, Percorso Alpha 6 mesi, Percorso Alpha 12 mesi/) })
    await esegui(s, 'vendita', { azione: 'modifica', cliente: 'Mario Rossi', prodotto: '2 mesi' })
    expect(a.modificaVendita).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'personalizzato', prodotto_personalizzato: '2 mesi' }))
    await esegui(s, 'vendita', { azione: 'modifica', cliente: 'Mario Rossi', prodotto: '12 mesi' })
    expect(a.modificaVendita).toHaveBeenLastCalledWith(expect.objectContaining({ product_id: 'pr12', prodotto_personalizzato: null }))
  })

  it('«sposta la call» non passa dall’esito: data e ora con l’esito si rifiutano', async () => {
    const input = { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata', data: '2026-09-30', ora: '18:00' }
    expect(await anteprima('call', input, 'closer')).toEqual({
      errore: 'L’esito non cambia data e ora: per spostare la call usa azione modifica con data e ora.',
    })
    await esegui(strumenti('closer', 'employee'), 'call', input)
    expect(a.registraEsito).not.toHaveBeenCalled()
    const descrizione = strumenti('closer', 'employee').call.description ?? ''
    expect(descrizione).toContain('per spostarla usa modifica')
    expect(descrizione).toContain('lead stato')
  })

  it('creare senza i dati obbligatori: la scheda si rifiuta prima del tocco', async () => {
    expect(await anteprima('cliente', { azione: 'crea', cognome: 'Verdi' })).toEqual({ errore: 'Scrivi il nome del cliente.' })
    expect(await anteprima('costo', { azione: 'registra', descrizione: 'Notion' })).toEqual({
      errore: 'Per registrare un costo servono categoria, descrizione e importo.',
    })
    expect(await anteprima('prodotto', { azione: 'crea', nome: 'Annuale' })).toEqual({
      errore: 'Per creare un prodotto servono nome, durata in mesi e prezzo di listino.',
    })
    expect(await anteprima('lista', { azione: 'crea', progetto: 'Reel' })).toEqual({ errore: 'Dimmi il nome della lista.' })
  })

  it('ogni campo che si scrive è sulla scheda, i testi lunghi per intero', async () => {
    const lunga = `Rimborso concordato al telefono. ${'Dettagli del caso. '.repeat(10)}Fine.`
    const rimborso = (await anteprima('rata', { azione: 'rimborso', cliente: 'Mario Rossi', numero: 1, note: lunga })) as { righe: string[] }
    expect(rimborso.righe).toContain(`Note: ${lunga}`)

    const righe = mondo()
    righe.pm_tasklist = []
    const task = (await anteprima(
      'task',
      { azione: 'aggiungi', titolo: 'Copertina', progetto: 'Reel settembre', stato: 'in_corso', stima: '2 h', data_inizio: '2026-10-01', descrizione: lunga },
      'admin',
      righe,
    )) as { righe: string[] }
    expect(task.righe).toEqual(expect.arrayContaining(['Stato: In corso', 'Stima: 2 h', 'Inizio 01/10/2026', `Descrizione: ${lunga}`]))

    const cliente = (await anteprima('cliente', { azione: 'modifica', cliente: 'Luca Rossi', note: lunga })) as { righe: string[] }
    expect(cliente.righe).toEqual([`Note: – → ${lunga}`])

    expect(riassuntoScrittura('prodotto', { azione: 'crea', nome: 'Annuale', durata_mesi: 12, prezzo_listino: 3000, piano_predefinito: [{ mese: 0, importo: 1500 }, { mese: 6, importo: 1500 }] }).dettagli.map(spazi)).toContain(
      'Piano abituale: 1.500,00 € al mese 0 · 1.500,00 € al mese 6',
    )
    expect(riassuntoScrittura('cliente', { azione: 'crea', nome: 'Anna', aggiungi_nota: 'Viene da un referral di Mario' }).dettagli).toContain(
      'Note: Viene da un referral di Mario',
    )
  })

  it('aggiungere un task non lo rinomina: nuovo_titolo vale solo per modifica', async () => {
    const righe = mondo()
    righe.v_pm_task = []
    a.aggiungiTask.mockImplementationOnce(async (input) => {
      const v = input as Riga
      righe.v_pm_task.push({ id: 'k9', titolo: v.titolo, progetto_id: PROGETTO, tasklist_id: null, parent_id: null, descrizione: null, stato: 'da_fare', priorita: 'media', data_inizio: null, scadenza: null, stima_minuti: null, assegnatari: [], sotto_task_totali: 0, created_by: IO })
      return { ok: true }
    })
    await esegui(strumenti('admin', 'admin', righe), 'task', { azione: 'aggiungi', titolo: 'Copertina', progetto: 'Reel settembre', nuovo_titolo: 'Altro', scadenza: '2026-10-10' })
    expect(a.modificaTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'k9', titolo: 'Copertina', scadenza: '2026-10-10' }))
  })

  it('task con lo stesso titolo in più progetti: dentro il progetto detto si trova, altrimenti si chiede con il progetto', async () => {
    const ALTRO_PROGETTO = 'b0000000-0000-4000-8000-000000000002'
    const righe = mondo()
    righe.v_pm_progetti = [...righe.v_pm_progetti, { ...righe.v_pm_progetti[0], id: ALTRO_PROGETTO, nome: 'Percorso Tiziano Mele' }]
    const riga = (id: string, progetto: string, scadenza: string | null) => ({
      id,
      titolo: 'Call di onboarding',
      progetto_id: progetto,
      tasklist_id: null,
      parent_id: null,
      descrizione: null,
      stato: 'da_fare',
      priorita: 'media',
      data_inizio: null,
      scadenza,
      stima_minuti: null,
      assegnatari: [IO],
      sotto_task_totali: 0,
    })
    righe.v_pm_task = [riga('k1', PROGETTO, '2026-10-03'), riga('k2', ALTRO_PROGETTO, null)]
    righe.pm_tasklist = []
    const s = strumenti('admin', 'admin', righe)

    await esegui(s, 'task', { azione: 'aggiungi', titolo: 'Preparare il questionario', progetto: 'Reel settembre', sotto_task_di: 'Call di onboarding' })
    expect(a.aggiungiTask).toHaveBeenCalledWith(expect.objectContaining({ progetto_id: PROGETTO, parent_id: 'k1' }))

    const dubbio = (await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding' })) as { errore: string }
    expect(a.completaTask).not.toHaveBeenCalled()
    expect(dubbio.errore).toBe(
      'Più task possibili: «Call di onboarding» in Reel settembre, scadenza 03/10/2026; «Call di onboarding» in Percorso Tiziano Mele. ' +
        'Chiedi quale (il progetto, o passa il task_id da progetto_dettaglio o miei_task).',
    )
    await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding', progetto: 'Tiziano' })
    expect(a.completaTask).toHaveBeenLastCalledWith({ id: 'k2', completato: true })
    await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding', task_id: 'k1' })
    expect(a.completaTask).toHaveBeenLastCalledWith({ id: 'k1', completato: true })
  })
})
