import { readFileSync } from 'node:fs'

import { asSchema, type ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSEGUENZE } from '@/lib/alfire/conseguenze'
import { strumentiConsentiti } from '@/lib/alfire/permessi'
import { azioneDistruttiva, riassuntoScrittura } from '@/lib/alfire/riassunto'
import { anteprimaScrittura, strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { SPOSTA, quandoBreve, quandoBreveDa } from '@/lib/call/spostamento'
import { aggiungiGiorni, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { SPOSTA_SOLO_AVANTI } from '@/lib/validation/call'

// Every write goes through the server action of the app's own form: stand-ins
// here record what Alfire would write, without Next or a database.
const a = vi.hoisted(() => {
  const ok = () => vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(async () => ({ ok: true }))
  return {
    modificaCall: ok(),
    registraEsito: ok(),
    spostaCall: ok(),
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
vi.mock('@/app/(app)/calls/actions', () => ({
  modificaCall: a.modificaCall,
  registraEsito: a.registraEsito,
  eliminaCall: a.eliminaCall,
  spostaCall: a.spostaCall,
}))
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
  return {
    from: query,
    rpc: (nome: string, args: Record<string, unknown> = {}) => {
      rpcChiamate.push({ nome, args })
      return query(nome)
    },
  }
}

/** Every RPC the tools called, with its arguments (reset before each test). */
const rpcChiamate: { nome: string; args: Record<string, unknown> }[] = []

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
        note: 'Chiamarlo dopo le 18',
        note_closer: 'Da richiamare',
        obiezione_principale: 'Ci deve pensare',
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
        lead_in_target: null,
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Non ho tempo per una call',
        domande_contenuti: null,
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

beforeEach(() => {
  vi.clearAllMocks()
  rpcChiamate.length = 0
})

// ---------------------------------------------------------------------------
describe('chi riceve quali strumenti (elenchi fissati)', () => {
  it('admin: 17 letture, le risposte a un tocco e 18 scritture', () => {
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
      'commenti_marketing',
      'provvigioni',
      'costi_periodo',
      'call_periodo',
      'progetti',
      'progetto_dettaglio',
      'miei_task',
      'mio_tempo',
      'tempo_team',
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

  it('il tempo del team lo legge solo l’admin dell’app, non chi gestisce i progetti', () => {
    expect(strumentiConsentiti('admin', 'admin')).toContain('tempo_team')
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      for (const livello of ['employee', 'manager', 'admin'] as const) {
        expect(strumentiConsentiti(ruolo, livello), `${ruolo}/${livello}`).not.toContain('tempo_team')
        expect(Object.keys(strumenti(ruolo, livello)), `${ruolo}/${livello}`).not.toContain('tempo_team')
      }
    }
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

  it('call: l’esito è di chi fa la call, eliminare dell’admin; spostarla di tutti e tre', async () => {
    expect(await azioniDi(strumenti(), 'call')).toEqual(['esito', 'sposta', 'modifica', 'elimina'])
    expect(await azioniDi(strumenti('closer', 'employee'), 'call')).toEqual(['esito', 'sposta', 'modifica'])
    expect(await azioniDi(strumenti('setter', 'employee'), 'call')).toEqual(['sposta', 'modifica'])
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

  it('due note (Dany, 30/09/2026): il setter scrive le sue, il closer le sue, l’admin tutte e due', async () => {
    const setter = await campiDi(strumenti('setter', 'employee'), 'call')
    expect(setter).toContain('note')
    for (const c of ['note_closer', 'motivo', 'qualificata', 'esito']) expect(setter, c).not.toContain(c)
    const closer = await campiDi(strumenti('closer', 'employee'), 'call')
    expect(closer).toContain('note_closer')
    expect(closer).not.toContain('note')
    const admin = await campiDi(strumenti(), 'call')
    expect(admin).toEqual(expect.arrayContaining(['note', 'note_closer']))
  })

  it('il setter sposta la call e scrive le sue note, senza dettagli né note del closer', async () => {
    // a call still to be held: the setter corrects its date and time too
    const daFare = mondo()
    daFare.calls = [{ ...daFare.calls[0], stato: 'programmata', esito: null, qualificata: null, obiezione_principale: null }]
    await esegui(strumenti('setter', 'employee', daFare), 'call', {
      azione: 'modifica',
      lead: 'Luca Neri',
      data: '2026-10-02',
      ora: '18:30',
      note: 'Preferisce la sera',
      // not in his schema: dropped before anything is written
      note_closer: 'Scritto dal setter',
    })
    expect(a.modificaCall).toHaveBeenCalledWith(
      expect.objectContaining({ call_id: CALL, data: '2026-10-02', ora: '18:30', note: 'Preferisce la sera', dettagli: null }),
    )
  })

  it('sulla call con un esito il setter scrive le sue note, ma data e ora restano (Dany, 02/10/2026)', async () => {
    // a held call: nobody moves it, and the setter reads who corrects the outcome
    expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', data: '2026-10-05', ora: '18:30' }, 'setter')).toEqual({
      errore: SPOSTA.setterSvolta,
    })
    await esegui(strumenti('setter', 'employee'), 'call', { azione: 'modifica', lead: 'Luca Neri', ora: '18:30' })
    expect(a.modificaCall).not.toHaveBeenCalled()
    await esegui(strumenti('setter', 'employee'), 'call', { azione: 'modifica', lead: 'Luca Neri', note: 'Preferisce la sera' })
    expect(a.modificaCall).toHaveBeenCalledWith(expect.objectContaining({ call_id: CALL, ora: '15:00', note: 'Preferisce la sera' }))
  })

  it('il closer scrive le sue note con i dettagli e lascia quelle del setter come sono', async () => {
    await esegui(strumenti('closer', 'employee'), 'call', {
      azione: 'modifica',
      lead: 'Luca Neri',
      note_closer: 'Vuole la versione da 3 mesi',
      // not in his schema
      note: 'Riscritto dal closer',
    })
    expect(a.modificaCall).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: CALL,
        note: 'Chiamarlo dopo le 18',
        dettagli: expect.objectContaining({ note_closer: 'Vuole la versione da 3 mesi', importo_proposto: 1500 }),
      }),
    )
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

  it('report: le quattro risposte sulla giornata, per il setter e per l’admin, coi livelli del form', async () => {
    for (const s of [strumenti(), strumenti('setter', 'employee')]) {
      expect(await campiDi(s, 'aggiorna_report')).toEqual(
        expect.arrayContaining(['lead_in_target', 'qualita_conversazioni', 'cosa_frenava', 'domande_contenuti', 'note']),
      )
      expect(await azioniDi(s, 'aggiorna_report', 'lead_in_target')).toEqual(['quasi_tutti', 'circa_meta', 'pochi'])
      expect(await azioniDi(s, 'aggiorna_report', 'qualita_conversazioni')).toEqual(['buone', 'medie', 'scarse'])
    }
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
    expect(a.registraEsito).toHaveBeenCalledWith({ call_id: CALL, esito: 'chiusa' })
    expect(chiusa).toMatchObject({ fatto: true, call_id: CALL })
    vi.clearAllMocks()
    const senza = await esegui(s, 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'follow_up' })
    expect(a.registraEsito).not.toHaveBeenCalled()
    expect(senza).toEqual({ errore: 'Dimmi se il lead era qualificato.' })
  })

  it('call: follow-up e persa vogliono il motivo di non chiusura, con lo schema del foglio', async () => {
    for (const [ruolo, livello] of [
      ['closer', 'employee'],
      ['admin', 'admin'],
    ] as const) {
      const s = strumenti(ruolo, livello)
      expect(await campiDi(s, 'call')).toContain('motivo')
      for (const motivo of [undefined, '', '   ']) {
        const senza = await esegui(s, 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: false, motivo })
        expect(senza).toMatchObject({ errore: expect.stringContaining('Scrivi il motivo di non chiusura') })
        // the card stops before the tap: the model asks why it did not close
        expect(await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: false, motivo }, ruolo)).toMatchObject({
          errore: expect.stringContaining('chiedi perché non ha chiuso'),
        })
      }
      expect(a.registraEsito).not.toHaveBeenCalled()
    }
    await esegui(strumenti('closer', 'employee'), 'call', {
      azione: 'esito',
      lead: 'Luca Neri',
      esito: 'persa',
      qualificata: false,
      motivo: 'Fuori budget',
      note_closer: 'Riprovare a gennaio',
    })
    expect(a.registraEsito).toHaveBeenCalledWith({
      call_id: CALL,
      esito: 'persa',
      qualificata: false,
      motivo: 'Fuori budget',
      note_closer: 'Riprovare a gennaio',
    })
    // the setter never records an outcome, so he has no reason field either
    expect(await campiDi(strumenti('setter', 'employee'), 'call')).not.toContain('motivo')
  })

  it('call: i dettagli del closer si fondono con quelli salvati (importo proposto compreso)', async () => {
    await esegui(strumenti('closer', 'employee'), 'call', { azione: 'modifica', call_id: CALL, lead: 'Luca Neri', performance: 'buona' })
    expect(a.modificaCall).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: CALL,
        closer_id: IO,
        dettagli: {
          link_registrazione: null,
          performance: 'buona',
          prodotto_proposto_id: null,
          importo_proposto: 1500,
          // the closer's notes go back as they are
          note_closer: 'Da richiamare',
        },
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

  it('report: le risposte sulla giornata passano con i numeri; aggiungi accoda il testo, imposta lo sostituisce', async () => {
    const s = strumenti()
    await esegui(s, 'aggiorna_report', {
      setter: 'Loris',
      data: '2026-09-26',
      modalita: 'aggiungi',
      lead_in_target: 'pochi',
      cosa_frenava: 'Sono solo curioso',
    })
    // a scale not said keeps the saved one; the text goes under the saved one
    expect(a.correggiReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'rep1',
        dm_outbound: 10,
        lead_in_target: 'pochi',
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Non ho tempo per una call\nSono solo curioso',
        domande_contenuti: null,
      }),
    )
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'imposta', cosa_frenava: 'Ci devo pensare' })
    expect(a.correggiReport).toHaveBeenLastCalledWith(expect.objectContaining({ cosa_frenava: 'Ci devo pensare' }))
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'imposta', cosa_frenava: '' })
    expect(a.correggiReport).toHaveBeenLastCalledWith(expect.objectContaining({ cosa_frenava: null }))
    // "Altre note" is the report's note, with the same rules
    await esegui(s, 'aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'imposta', note: 'Giornata corta' })
    expect(a.correggiReport).toHaveBeenLastCalledWith(expect.objectContaining({ note: 'Giornata corta' }))
    // a new day for someone: the answers go with the numbers
    await esegui(s, 'aggiorna_report', {
      setter: 'Loris',
      data: '2026-09-27',
      modalita: 'imposta',
      conversazioni: 6,
      qualita_conversazioni: 'buone',
      domande_contenuti: 'Serve la palestra?',
    })
    expect(a.aggiungiReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setter_id: LORIS,
        conversazioni: 6,
        lead_in_target: null,
        qualita_conversazioni: 'buone',
        domande_contenuti: 'Serve la palestra?',
      }),
    )
  })

  it('report del setter: le sue risposte dalla stessa azione di «Oggi»', async () => {
    const righe = mondo()
    righe.setter_daily_reports = righe.setter_daily_reports.map((r) => ({ ...r, setter_id: IO }))
    await esegui(strumenti('setter', 'employee', righe), 'aggiorna_report', {
      data: '2026-09-26',
      modalita: 'imposta',
      lead_in_target: 'quasi_tutti',
      qualita_conversazioni: 'buone',
    })
    expect(a.salvaReportGiornaliero).toHaveBeenCalledWith(
      expect.objectContaining({ data: '2026-09-26', dm_outbound: 10, lead_in_target: 'quasi_tutti', qualita_conversazioni: 'buone', cosa_frenava: 'Non ho tempo per una call' }),
    )
  })

  it('commenti_marketing: il setting con le parole del form e i motivi di non chiusura del closer, un setter per nome', async () => {
    const righe = mondo()
    righe.commenti_setter_periodo = [
      { tipo: 'scala', scala: 'lead_in_target', livello: 'quasi_tutti', giorni: 2, su_giorni: 3, quota: 0.6667 },
      { tipo: 'scala', scala: 'lead_in_target', livello: 'circa_meta', giorni: 1, su_giorni: 3, quota: 0.3333 },
      { tipo: 'scala', scala: 'lead_in_target', livello: 'pochi', giorni: 0, su_giorni: 3, quota: 0 },
      { tipo: 'scala', scala: 'qualita_conversazioni', livello: 'buone', giorni: 1, su_giorni: 1, quota: 1 },
      { tipo: 'scala', scala: 'qualita_conversazioni', livello: 'medie', giorni: 0, su_giorni: 1, quota: 0 },
      { tipo: 'scala', scala: 'qualita_conversazioni', livello: 'scarse', giorni: 0, su_giorni: 1, quota: 0 },
      {
        tipo: 'giorno',
        data: '2026-09-26',
        setter: 'Loris Setter',
        lead_in_target: 'circa_meta',
        qualita_conversazioni: null,
        cosa_frenava: 'Sono solo curiosi',
        domande_contenuti: null,
        note: 'Giornata corta',
      },
    ]
    righe.motivi_non_chiusura_periodo = [
      { call_id: CALL, data: '2026-09-28', lead: 'Luca Neri', closer: 'Dany Montagnolo', esito: 'persa', qualificata: true, motivo: 'Fuori budget', note_closer: 'Riprovare a gennaio' },
      { call_id: 'ca000000-0000-4000-8000-000000000002', data: '2026-09-27', lead: 'Marco Bianchi', closer: 'Dany Montagnolo', esito: 'follow_up', qualificata: true, motivo: null, note_closer: 'Solo una nota' },
    ]
    const esito = (await esegui(strumenti('admin', 'admin', righe), 'commenti_marketing', { da: '2026-09-01', a: '2026-09-30', setter: 'Loris' })) as Record<string, unknown>
    expect(esito).toMatchObject({
      periodo: { da: '2026-09-01', a: '2026-09-30' },
      setter: 'Loris Setter',
      dal_setting: {
        scale: {
          'Lead in target': {
            giorni_con_risposta: 3,
            livelli: [
              { livello: 'Quasi tutti', giorni: 2, quota: 0.6667 },
              { livello: 'Circa metà', giorni: 1, quota: 0.3333 },
              { livello: 'Pochi', giorni: 0, quota: 0 },
            ],
          },
        },
        giorni_con_testo: [
          {
            data: '2026-09-26',
            setter: 'Loris Setter',
            'Lead in target': 'Circa metà',
            'Cosa frenava i lead': 'Sono solo curiosi',
            'Altre note': 'Giornata corta',
          },
        ],
      },
      dalle_call: [
        {
          data: '2026-09-28',
          lead: 'Luca Neri',
          closer: 'Dany Montagnolo',
          esito: 'Persa',
          'Motivo di non chiusura': 'Fuori budget',
          'Note aggiuntive': 'Riprovare a gennaio',
        },
        { lead: 'Marco Bianchi', esito: 'Follow-up', 'Note aggiuntive': 'Solo una nota' },
      ],
    })
    // only what was answered and written: an unanswered scale or reason is not there (section 17)
    const [giorno] = (esito.dal_setting as { giorni_con_testo: Record<string, unknown>[] }).giorni_con_testo
    expect(giorno).not.toHaveProperty('Qualità delle conversazioni')
    expect(giorno).not.toHaveProperty('Domande e contenuti')
    expect((esito.dalle_call as Record<string, unknown>[])[1]).not.toHaveProperty('Motivo di non chiusura')
    expect(JSON.stringify(esito)).not.toMatch(/non indicato|non scritto|null/)
    // a setter that is not there: the list of who is, no read
    expect(await esegui(strumenti('admin', 'admin', righe), 'commenti_marketing', { setter: 'Mario' })).toMatchObject({
      errore: expect.stringContaining('Loris Setter'),
    })
  })

  it('commenti_marketing: una lettura che fallisce non vale «nessun commento»', async () => {
    for (const rotta of ['commenti_setter_periodo', 'motivi_non_chiusura_periodo']) {
      const s = strumenti('admin', 'admin', mondo(), [], [rotta])
      expect(await esegui(s, 'commenti_marketing', {})).toEqual({ errore: 'Commenti per il marketing non disponibili.' })
    }
  })

  it('i commenti per il marketing li legge solo l’admin', () => {
    expect(strumentiConsentiti('admin', 'admin')).toContain('commenti_marketing')
    for (const [ruolo, livello] of [
      ['setter', 'employee'],
      ['closer', 'employee'],
      ['coach', 'employee'],
      ['coach', 'admin'],
      ['editor', 'manager'],
    ] as const) {
      expect(strumentiConsentiti(ruolo, livello), `${ruolo}/${livello}`).not.toContain('commenti_marketing')
    }
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
    expect(a.registraTempo).toHaveBeenCalledWith({
      progetto_id: PROGETTO,
      task_id: null,
      data: oggiRoma(),
      durata: '1h30',
      dalle: null,
      alle: null,
      nota: 'Montaggio',
    })
    // two entries that day on the project, one is someone else's: mine only, no question
    await esegui(s, 'tempo', { azione: 'elimina', progetto: 'Reel', data: '2026-09-28' })
    expect(a.eliminaTempo).toHaveBeenCalledWith({ id: 't-mio' })
    expect(registro).toContain(`pm_tempo.profile_id=${IO}`)
  })

  it('tempo: la fascia facoltativa passa dalla stessa azione del modulo, e si toglie', async () => {
    const s = strumenti('coach', 'employee')
    await esegui(s, 'tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '9:00', alle: '10:30' })
    expect(a.registraTempo).toHaveBeenLastCalledWith(
      expect.objectContaining({ progetto_id: PROGETTO, data: '2026-09-28', dalle: '9:00', alle: '10:30' }),
    )

    // a range on an entry typed as minutes; then only a new start (the end stays)
    const conFascia = mondo()
    conFascia.pm_tempo[0] = {
      ...conFascia.pm_tempo[0],
      inizio: '2026-09-28T07:00:00.000Z',
      fine: '2026-09-28T08:30:00.000Z',
    }
    const s2 = strumenti('coach', 'employee', conFascia)
    await esegui(s2, 'tempo', { azione: 'modifica', voce_id: 't-mio', dalle: '08:30' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't-mio', dalle: '08:30', alle: '10:30' }))
    // "nessuna" takes it away, the minutes stay
    await esegui(s2, 'tempo', { azione: 'modifica', voce_id: 't-mio', dalle: 'nessuna' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't-mio', dalle: null, alle: null, durata: 90 }))
    // a new duration without a range cannot keep the old range
    await esegui(s2, 'tempo', { azione: 'modifica', voce_id: 't-mio', durata: '2h' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ dalle: null, alle: null, durata: '2h' }))
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
describe('i dati di chi chatta dicono di chi sono', () => {
  // Dany's chat of 30/09/2026: asked about Loris's time, Alfire read Dany's own
  // (mio_tempo) and answered "Loris ha registrato 2 ore"
  const DI_DANY = {
    persona: 'Dany Montagnolo',
    di_chi: 'Questi sono i dati di Dany Montagnolo, cioè di chi sta chattando: mai di un’altra persona.',
  }

  it('mio_tempo, miei_task e miei_numeri: il nome di chi chatta per primo, e la frase che lo dice', async () => {
    const righe = mondo()
    righe.v_pm_task = [{ id: 'k1', titolo: 'Montaggio reel', stato: 'da_fare', scadenza: null, in_ritardo: false, priorita: null, progetto_id: PROGETTO, assegnatari: [IO] }]
    righe.miei_numeri_periodo = [{ dm_totali: 40 }]

    const tempo = (await esegui(strumenti('admin', 'admin', righe), 'mio_tempo', { da: '2026-09-01', a: '2026-09-30' })) as Record<string, unknown>
    const task = (await esegui(strumenti('coach', 'employee', righe), 'miei_task', {})) as Record<string, unknown>
    const numeri = (await esegui(strumenti('setter', 'employee', righe), 'miei_numeri', { da: '2026-09-01', a: '2026-09-30' })) as Record<string, unknown>

    for (const [nome, esito] of [
      ['mio_tempo', tempo],
      ['miei_task', task],
      ['miei_numeri', numeri],
    ] as const) {
      expect(esito, nome).toMatchObject(DI_DANY)
      // first in the result: the model reads whose data before the data
      expect(Object.keys(esito).slice(0, 2), nome).toEqual(['persona', 'di_chi'])
    }
    expect(tempo).toMatchObject({ voci: [{ voce_id: 't-mio', minuti: 90 }] })
    expect(task).toMatchObject({ task: [{ id: 'k1' }] })
    expect(numeri).toMatchObject({ numeri: { dm_totali: 40 } })
  })

  it('le loro descrizioni dicono che sono solo di chi chatta; all’admin mio_tempo indica tempo_team', () => {
    const admin = strumenti('admin', 'admin')
    const setter = strumenti('setter', 'employee')
    for (const [s, nome] of [
      [admin, 'mio_tempo'],
      [admin, 'miei_task'],
      [setter, 'miei_numeri'],
      [setter, 'miei_task'],
      [setter, 'mio_tempo'],
    ] as const) {
      expect(s[nome].description, nome).toContain('Solo di chi chatta: mai per un’altra persona.')
    }
    expect(admin.mio_tempo.description).toContain('Per il tempo degli altri: tempo_team.')
    // a tool the setter does not have is never named to him
    expect(setter.mio_tempo.description).not.toContain('tempo_team')
  })

  it('mio_tempo: totale e progetti da SQL, mai il timer acceso tra le voci, e dice quando l’elenco non le ha tutte', async () => {
    const righe = mondo()
    righe.pm_tempo = [
      ...Array.from({ length: 45 }, (_, i) => ({
        id: `t${i}`,
        profile_id: IO,
        progetto_id: PROGETTO,
        task_id: null,
        data: '2026-09-15',
        minuti: 60,
        nota: null,
        inizio: null,
        fine: null,
        progetto: { nome: 'Reel settembre' },
      })),
    ]
    // a month of 45 entries: the list keeps 40, the totals count all of them
    righe.pm_riepilogo_tempo = [
      { livello: 'progetto', data: null, progetto_id: PROGETTO, progetto: 'Reel settembre', minuti: 2700, voci: 45 },
      { livello: 'totale', data: null, progetto_id: null, progetto: null, minuti: 2700, voci: 45 },
    ]
    const registro: string[] = []
    const esito = (await esegui(strumenti('coach', 'employee', righe, registro), 'mio_tempo', { da: '2026-09-01', a: '2026-09-30' })) as {
      voci: unknown[]
    }
    expect(rpcChiamate).toContainEqual({ nome: 'pm_riepilogo_tempo', args: { p_da: '2026-09-01', p_a: '2026-09-30' } })
    expect(esito).toMatchObject({
      totale: { minuti: 2700, durata: '45 h', voci: 45 },
      per_progetto: [{ progetto: 'Reel settembre', minuti: 2700, durata: '45 h', voci: 45 }],
      nota: 'Qui le 40 voci più recenti su 45: il totale le conta tutte; l’elenco intero in [Il mio tempo](/tempo).',
    })
    expect(esito.voci).toHaveLength(40)

    // a running timer is timer_acceso, never an entry that takes a place in the list
    righe.pm_tempo = [
      { id: 't-acceso', profile_id: IO, progetto_id: PROGETTO, task_id: null, data: '2026-09-30', minuti: null, nota: null, inizio: '2026-09-30T08:00:00Z', fine: null, progetto: { nome: 'Reel settembre' } },
      ...righe.pm_tempo.slice(0, 2),
    ]
    righe.pm_riepilogo_tempo = [{ livello: 'totale', data: null, progetto_id: null, progetto: null, minuti: 120, voci: 2 }]
    const conTimer = (await esegui(strumenti('coach', 'employee', righe), 'mio_tempo', { da: '2026-09-01', a: '2026-09-30' })) as Record<string, unknown>
    expect(conTimer).toMatchObject({ totale: { minuti: 120, durata: '2 h', voci: 2 }, timer_acceso: { progetto: 'Reel settembre', dalle: '10:00' } })
    expect((conTimer.voci as { voce_id: string }[]).map((v) => v.voce_id)).toEqual(['t0', 't1'])
    expect(conTimer).not.toHaveProperty('nota')
  })

  it('mio_tempo: un totale che non si legge non diventa mai «nessun tempo»', async () => {
    const s = strumentiAlfire(supabaseFinto(mondo(), [], ['pm_riepilogo_tempo']) as never, profiloDi('coach'), 'employee')
    expect(await esegui(s, 'mio_tempo', {})).toEqual({ errore: 'Tempo non disponibile.' })
  })

  it('miei_task dice il progetto per nome, mai solo il suo id', async () => {
    const righe = mondo()
    righe.v_pm_task = [{ id: 'k1', titolo: 'Montaggio reel', stato: 'da_fare', scadenza: null, in_ritardo: false, priorita: null, progetto_id: PROGETTO, assegnatari: [IO] }]
    const esito = (await esegui(strumenti('coach', 'employee', righe), 'miei_task', {})) as { task: Record<string, unknown>[] }
    expect(esito.task).toEqual([expect.objectContaining({ id: 'k1', titolo: 'Montaggio reel', progetto: 'Reel settembre' })])
    expect(esito.task[0]).not.toHaveProperty('progetto_id')
  })

  it('progetti: sotto l’admin dei progetti dice che sono solo quelli di chi chatta', async () => {
    const employee = (await esegui(strumenti('coach', 'employee'), 'progetti', {})) as Record<string, unknown>
    expect(Object.keys(employee).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(employee.di_chi).toBe(
      'Solo i progetti di cui Dany Montagnolo, cioè chi sta chattando, è membro: non tutti quelli del team, né quelli di un’altra persona.',
    )
    expect(await esegui(strumenti('coach', 'manager'), 'progetti', {})).toHaveProperty('di_chi')
    // the projects' admin reads them all
    expect(await esegui(strumenti('admin', 'admin'), 'progetti', {})).not.toHaveProperty('di_chi')
  })

  it('mio_tempo: «ultimi 7 giorni» sono oggi e i 6 giorni prima', async () => {
    const oggi = oggiRoma()
    const esito = (await esegui(strumenti('coach', 'employee'), 'mio_tempo', { ultimi_giorni: 7 })) as { periodo: unknown }
    expect(esito.periodo).toEqual({ da: aggiungiGiorni(oggi, -6), a: oggi })
  })
})

// ---------------------------------------------------------------------------
describe('tempo_team: il tempo dichiarato dal team, come Tempo › Team', () => {
  const DM_SETTER = 'b0000000-0000-4000-8000-000000000002'
  const TASK_DM = 'k0000000-0000-4000-8000-000000000001'
  const TASK_CALL = 'k0000000-0000-4000-8000-000000000002'
  const vuota = { profile_id: null, persona: null, progetto_id: null, progetto: null, task_id: null, task: null, voci: null, id: null, data: null, inizio: null, fine: null, nota: null }
  const diLoris = { profile_id: LORIS, persona: 'Loris Setter' }
  const suDm = { ...diLoris, progetto_id: DM_SETTER, progetto: 'DM Setter' }

  /** The rows of pm_tempo_per_persona for Loris (the numbers of 30/09/2026: 566 minutes, 12 entries). */
  function tempoDiLoris(): Riga[] {
    return [
      { ...vuota, livello: 'totale', minuti: 566, voci: 12 },
      { ...vuota, ...diLoris, livello: 'persona', minuti: 566, voci: 12 },
      { ...vuota, ...suDm, livello: 'progetto', minuti: 566, voci: 12 },
      { ...vuota, ...suDm, livello: 'task', task_id: TASK_DM, task: 'DM Setting', minuti: 400, voci: 8 },
      { ...vuota, ...suDm, livello: 'task', task_id: TASK_CALL, task: 'Call di allineamento', minuti: 120, voci: 2 },
      { ...vuota, ...suDm, livello: 'task', minuti: 46, voci: 2 },
      {
        ...vuota,
        ...suDm,
        livello: 'voce',
        task_id: TASK_DM,
        task: 'DM Setting',
        minuti: 60,
        id: 'v1',
        data: '2026-09-29',
        inizio: '2026-09-29T07:00:00Z',
        fine: '2026-09-29T08:00:00Z',
        nota: 'Risposte ai DM',
      },
      { ...vuota, ...suDm, livello: 'voce', minuti: 23, id: 'v2', data: '2026-09-28' },
    ]
  }

  function conTempo(extra: Partial<Record<string, Riga[]>> = {}): Record<string, Riga[]> {
    const righe = mondo()
    righe.pm_tempo_per_persona = tempoDiLoris()
    righe.v_pm_progetti = [...righe.v_pm_progetti, { id: DM_SETTER, nome: 'DM Setter', reparto_id: 'rep-vendite', client_id: null, stato: 'attivo' }]
    return { ...righe, ...extra } as Record<string, Riga[]>
  }

  it('«quanto ha tracciato Loris negli ultimi 7 giorni?»: la RPC con Loris e il periodo giusto, i totali di SQL con le parole', async () => {
    const oggi = oggiRoma()
    const esito = (await esegui(strumenti('admin', 'admin', conTempo()), 'tempo_team', { persona: 'Loris', ultimi_giorni: 7 })) as Record<string, unknown>

    expect(rpcChiamate).toEqual([
      { nome: 'pm_tempo_per_persona', args: { p_da: aggiungiGiorni(oggi, -6), p_a: oggi, p_profilo: LORIS, p_limite: 20 } },
    ])
    expect(esito).toMatchObject({
      periodo: { da: aggiungiGiorni(oggi, -6), a: oggi },
      persona: 'Loris Setter',
      totale: { minuti: 566, durata: '9 h 26 min', voci: 12 },
      persone: [
        {
          persona: 'Loris Setter',
          minuti: 566,
          durata: '9 h 26 min',
          voci: 12,
          progetti: [
            {
              progetto: 'DM Setter',
              minuti: 566,
              task: [
                { task: 'DM Setting', minuti: 400, durata: '6 h 40 min' },
                { task: 'Call di allineamento', minuti: 120, durata: '2 h' },
                { task: 'senza task', minuti: 46, durata: '46 min' },
              ],
            },
          ],
          ultime_voci: [
            { data: '2026-09-29', progetto: 'DM Setter', task: 'DM Setting', minuti: 60, fascia: '09:00–10:00', nota: 'Risposte ai DM' },
            { data: '2026-09-28', progetto: 'DM Setter', task: 'senza task', minuti: 23 },
          ],
          // 2 entries of 12 here: the rest is on the page
          nota: 'Qui le 2 voci più recenti su 12: tutte in Tempo › Team.',
        },
      ],
      link: `/tempo/team?persona=${LORIS}&da=${aggiungiGiorni(oggi, -6)}&a=${oggi}`,
    })
    // never Dany's own time, never an id the model could repeat
    expect(JSON.stringify(esito)).not.toContain('Dany')
    expect(JSON.stringify((esito as { persone: unknown }).persone)).not.toMatch(/v1|v2|profile_id/)
  })

  it('senza persona: tutto il team del mese in corso, poche voci per persona; un progetto per nome', async () => {
    const oggi = oggiRoma()
    await esegui(strumenti('admin', 'admin', conTempo()), 'tempo_team', {})
    expect(rpcChiamate.at(-1)).toEqual({ nome: 'pm_tempo_per_persona', args: { p_da: primoDelMeseISO(oggi), p_a: oggi, p_limite: 5 } })

    await esegui(strumenti('admin', 'admin', conTempo()), 'tempo_team', { progetto: 'DM', da: '2026-09-01', a: '2026-09-30' })
    expect(rpcChiamate.at(-1)).toEqual({
      nome: 'pm_tempo_per_persona',
      args: { p_da: '2026-09-01', p_a: '2026-09-30', p_progetto: DM_SETTER, p_limite: 5 },
    })
  })

  it('un nome che vale per due persone: le candidate, nessuna lettura e nessuna scelta a caso', async () => {
    const righe = conTempo()
    righe.profiles = [...righe.profiles, { id: 'ex-loris', nome: 'Loris Rossi', ruolo: 'coach', attivo: false }]
    const esito = await esegui(strumenti('admin', 'admin', righe), 'tempo_team', { persona: 'Loris', ultimi_giorni: 7 })
    expect(esito).toEqual({
      errore: 'Più persone possibili per "Loris": Loris Rossi (Coach, non più attivo); Loris Setter (Setter). Chiedi quale, e cercala scritta come qui.',
    })
    expect(rpcChiamate).toEqual([])

    // who no longer works here keeps the time declared: found by name
    await esegui(strumenti('admin', 'admin', righe), 'tempo_team', { persona: 'Loris Rossi' })
    expect(rpcChiamate.at(-1)?.args).toMatchObject({ p_profilo: 'ex-loris' })
  })

  it('due persone con lo stesso nome: ruolo, stato e, se non basta, l’email le distinguono; scritta così, la risposta trova quella', async () => {
    const righe = conTempo()
    righe.profiles = [
      { id: IO, nome: 'Dany Montagnolo', ruolo: 'admin', attivo: true, email: 'dany@esempio.it' },
      { id: LORIS, nome: 'Loris Setter', ruolo: 'setter', attivo: true, email: 'loris@esempio.it' },
      // the Excel import's placeholder, not merged yet, and an old account
      { id: 'segnaposto', nome: 'Loris Setter', ruolo: 'setter', attivo: true, email: 'import@esempio.it' },
      { id: 'vecchio', nome: 'Loris Setter', ruolo: 'setter', attivo: false, email: 'vecchio@esempio.it' },
    ]
    const s = strumenti('admin', 'admin', righe)
    expect(await esegui(s, 'tempo_team', { persona: 'Loris Setter' })).toEqual({
      errore:
        'Più persone possibili per "Loris Setter": Loris Setter (Setter, import@esempio.it); Loris Setter (Setter, loris@esempio.it); ' +
        'Loris Setter (Setter, non più attivo). Chiedi quale, e cercala scritta come qui.',
    })
    expect(rpcChiamate).toEqual([])

    // the user's answer, as the question wrote it (a tap on its button sends exactly that)
    await esegui(s, 'tempo_team', { persona: 'Loris Setter (Setter, non più attivo)' })
    expect(rpcChiamate.at(-1)?.args).toMatchObject({ p_profilo: 'vecchio' })
    await esegui(s, 'tempo_team', { persona: 'loris setter (setter, loris@esempio.it)' })
    expect(rpcChiamate.at(-1)?.args).toMatchObject({ p_profilo: LORIS })
  })

  it('tutto il team per un mese: i progetti e i task con più tempo, quanti altri, e un risultato che resta piccolo', async () => {
    // six people, a coach-like month: 26 client projects with 6 tasks each
    const persone = Array.from({ length: 6 }, (_, i) => ({ profile_id: `p${i}`, persona: `Persona ${i}` }))
    const righe: Riga[] = [{ ...vuota, livello: 'totale', minuti: 6 * 26 * 6 * 30, voci: 6 * 26 * 6 }]
    for (const chi of persone) {
      righe.push({ ...vuota, ...chi, livello: 'persona', minuti: 26 * 6 * 30, voci: 26 * 6 })
      for (let g = 0; g < 26; g++) {
        const progetto = { ...chi, progetto_id: `${chi.profile_id}-g${g}`, progetto: `Percorso cliente ${g}` }
        righe.push({ ...vuota, ...progetto, livello: 'progetto', minuti: 6 * 30, voci: 6 })
        for (let t = 0; t < 6; t++) {
          righe.push({ ...vuota, ...progetto, livello: 'task', task_id: `t${t}`, task: `Call di check ${t}`, minuti: 30, voci: 1 })
        }
      }
      for (let v = 0; v < 5; v++) {
        righe.push({ ...vuota, ...chi, progetto_id: `${chi.profile_id}-g0`, progetto: 'Percorso cliente 0', livello: 'voce', minuti: 30, id: `${chi.profile_id}-v${v}`, data: '2026-09-29', nota: 'Call di check con il cliente, tutto regolare' })
      }
    }
    const esito = (await esegui(strumenti('admin', 'admin', conTempo({ pm_tempo_per_persona: righe })), 'tempo_team', {})) as {
      persone: { progetti: { task: unknown[]; altri_task?: number }[]; altri_progetti?: number }[]
    }
    expect(esito.persone).toHaveLength(6)
    for (const p of esito.persone) {
      expect(p.progetti).toHaveLength(5)
      expect(p.altri_progetti).toBe(21)
      expect(p.progetti[0].task).toHaveLength(3)
      expect(p.progetti[0].altri_task).toBe(3)
    }
    // a free-plan answer: about 4.000 tokens for six busy people (without the caps, about six times as much)
    expect(JSON.stringify(esito).length).toBeLessThan(14_000)
  })

  it('una persona che non c’è, o senza tempo nel periodo: lo dice, senza elenchi di chi non ha registrato', async () => {
    const nessuno = await esegui(strumenti('admin', 'admin', conTempo()), 'tempo_team', { persona: 'Marta' })
    expect(nessuno).toEqual({ errore: 'Nessuna persona "Marta" nel team. Persone: Dany Montagnolo, Lorenzo Closer, Loris Setter' })
    expect(rpcChiamate).toEqual([])

    const vuoto = (await esegui(strumenti('admin', 'admin', conTempo({ pm_tempo_per_persona: [] })), 'tempo_team', {
      persona: 'Lorenzo',
    })) as Record<string, unknown>
    expect(vuoto).toMatchObject({ persona: 'Lorenzo Closer', persone: [], nota: 'Lorenzo Closer non ha tempo registrato nel periodo.' })
    const team = (await esegui(strumenti('admin', 'admin', conTempo({ pm_tempo_per_persona: [] })), 'tempo_team', {})) as Record<string, unknown>
    expect(team).toMatchObject({ persone: [], nota: 'Nessun tempo registrato nel periodo.' })
  })

  it('una lettura che non riesce non vale mai «nessuno ha registrato»', async () => {
    const s = strumentiAlfire(supabaseFinto(conTempo(), [], ['pm_tempo_per_persona']) as never, profiloDi('admin'), 'admin')
    expect(await esegui(s, 'tempo_team', { persona: 'Loris' })).toEqual({ errore: 'Tempo del team non disponibile.' })
  })

  it('la descrizione: l’unico strumento per il tempo di un altro, con i limiti della pagina', () => {
    const d = strumenti('admin', 'admin').tempo_team.description ?? ''
    expect(d).toContain('mio_tempo è solo di chi chatta')
    expect(d).toContain('Mai i timer accesi')
    expect(d).toContain('niente classifiche né confronti tra persone')
    expect(d).toContain('non dire chi manca')
  })
})

// ---------------------------------------------------------------------------
describe('la scheda prima del tocco: la riga vera, prima → dopo, cosa si porta dietro', () => {
  it('tempo: la fascia si vede sulla scheda e segue le regole del modulo', async () => {
    const p = await anteprima('tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '9:00', alle: '10:30' }, 'coach')
    expect(p).toMatchObject({ titolo: 'Registro 1 h 30 min su «Reel settembre» il 28/09/2026' })
    expect((p as { righe: string[] }).righe).toContain('Fascia: 09:00–10:30')

    expect(await anteprima('tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '9:00' }, 'coach')).toEqual({
      errore: 'Indica sia l’inizio sia la fine, o nessuno dei due',
    })
    expect(
      await anteprima('tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '10:30', alle: '09:00' }, 'coach'),
    ).toEqual({ errore: 'L’ora di fine deve essere dopo quella di inizio' })

    // the entry typed as 1 h 30 min gets a range: before → after, and the minutes it gives
    const righe = mondo()
    righe.pm_tempo[0] = { ...righe.pm_tempo[0], id: '6a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d' }
    const m = await anteprima('tempo', { azione: 'modifica', progetto: 'Reel', data: '2026-09-28', dalle: '14:00', alle: '16:00' }, 'coach', righe)
    expect(m).toMatchObject({ righe: ['Fascia: – → 14:00–16:00', 'Durata: 1 h 30 min → 2 h'] })
  })

  it('tempo: il timer senza fascia di un giorno la perde sulla scheda solo se cambiano giorno o durata', async () => {
    const VOCE = '6a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
    // 23:30–00:30 across midnight, 60 minutes
    const notte = mondo()
    notte.pm_tempo[0] = { ...notte.pm_tempo[0], id: VOCE, minuti: 60, inizio: '2026-09-28T21:30:00.000Z', fine: '2026-09-28T22:30:00.000Z' }
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, durata: '2h' }, 'coach', notte)).toMatchObject({
      righe: ['Fascia: 23:30–00:30, a cavallo della mezzanotte → tolta', 'Durata: 1 h → 2 h'],
    })
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, nota: 'Consegna' }, 'coach', notte)).toMatchObject({
      righe: ['Nota: – → Consegna'],
    })

    // started and stopped within 09:00: the note changes, nothing blocks the card
    const breve = mondo()
    breve.pm_tempo[0] = { ...breve.pm_tempo[0], id: VOCE, minuti: 1, inizio: '2026-09-28T07:00:05.000Z', fine: '2026-09-28T07:00:50.000Z' }
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, nota: 'Cambio di task' }, 'coach', breve)).toMatchObject({
      righe: ['Nota: – → Cambio di task'],
    })

    // a range the forms show, taken away
    const conFascia = mondo()
    conFascia.pm_tempo[0] = { ...conFascia.pm_tempo[0], id: VOCE, inizio: '2026-09-28T07:00:00.000Z', fine: '2026-09-28T08:30:00.000Z' }
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, dalle: 'nessuna' }, 'coach', conFascia)).toMatchObject({
      righe: ['Fascia: 09:00–10:30 → tolta'],
    })
  })

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

  it('il report: le risposte sulla giornata con le parole del form, prima → dopo, i testi per intero', async () => {
    const p = await anteprima('aggiorna_report', {
      setter: 'Loris',
      data: '2026-09-26',
      modalita: 'imposta',
      lead_in_target: 'pochi',
      qualita_conversazioni: 'scarse',
      domande_contenuti: 'Chiedono se serve la palestra',
    })
    expect(p).toMatchObject({
      righe: [
        'C’è già: lo correggo.',
        'Lead in target: – → Pochi',
        'Qualità delle conversazioni: Medie → Scarse',
        'Domande e contenuti: – → Chiedono se serve la palestra',
      ],
    })
    const nuovo = await anteprima('aggiorna_report', {
      setter: 'Loris',
      data: '2026-09-27',
      modalita: 'imposta',
      conversazioni: 3,
      lead_in_target: 'quasi_tutti',
      cosa_frenava: 'Non hanno tempo per una call',
      note: 'Giornata corta',
    })
    expect(nuovo).toMatchObject({
      titolo: 'Compilo il report di Loris Setter del 27/09/2026',
      righe: [
        'Giornata nuova.',
        'Conversazioni: 3',
        'Lead in target: Quasi tutti',
        'Cosa frenava i lead: Non hanno tempo per una call',
        'Altre note: Giornata corta',
      ],
    })
  })

  it('l’esito di una call non chiusa: motivo di non chiusura prima → dopo, per intero, e note prima → dopo', async () => {
    expect(
      await anteprima(
        'call',
        { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: true, motivo: 'Deve parlarne con la compagna', note_closer: 'Richiamare lunedì' },
        'closer',
      ),
    ).toMatchObject({
      titolo: 'Registro l’esito della call con Luca Neri del 28/09/2026 alle 15:00: Persa',
      righe: [
        'Ora: Follow-up',
        'Qualificata: sì',
        'Motivo di non chiusura: Ci deve pensare → Deve parlarne con la compagna',
        'Note aggiuntive: Da richiamare → Richiamare lunedì',
      ],
    })
    // the same reason: still on the card, as it will stay
    expect(
      await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: true, motivo: ' Ci deve pensare ' }, 'closer'),
    ).toMatchObject({ righe: ['Ora: Follow-up', 'Qualificata: sì', 'Motivo di non chiusura: Ci deve pensare'] })
  })

  it('correggere una call: le due note col loro nome, prima → dopo', async () => {
    expect(
      await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', note: 'Solo dopo le 19', note_closer: 'Vuole la versione da 3 mesi' }),
    ).toMatchObject({
      righe: ['Note del setter: Chiamarlo dopo le 18 → Solo dopo le 19', 'Note aggiuntive: Da richiamare → Vuole la versione da 3 mesi'],
    })
    // the closer changes his own notes; the setter's stay as they are
    expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', note_closer: 'Nuove' }, 'closer')).toMatchObject({
      righe: ['Note aggiuntive: Da richiamare → Nuove'],
    })
    // the setter moves his call: nothing of the closer's on the card
    expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', note: 'Solo dopo le 19' }, 'setter')).toMatchObject({
      righe: ['Note del setter: Chiamarlo dopo le 18 → Solo dopo le 19'],
    })
  })

  it('call_periodo: il motivo e le due note, ognuna col suo autore', async () => {
    for (const ruolo of ['setter', 'closer', 'admin'] as const) {
      const letto = (await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'call_periodo', {
        da: '2026-09-28',
        a: '2026-09-28',
      })) as { call: Record<string, unknown>[] }
      expect(letto.call, ruolo).toEqual([
        expect.objectContaining({
          call_id: CALL,
          lead: 'Luca Neri',
          'Motivo di non chiusura': 'Ci deve pensare',
          'Note del setter': 'Chiamarlo dopo le 18',
          'Note aggiuntive del closer': 'Da richiamare',
        }),
      ])
    }
  })

  it('call_periodo: chi ha fissato ogni call, e per setter e closer che sono solo le loro', async () => {
    const leggi = async (ruolo: 'setter' | 'closer' | 'admin') =>
      (await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as Record<string, unknown>
    const righe = mondo()
    righe.calls[0] = { ...righe.calls[0], setter: { nome: 'Loris Setter' }, closer: { nome: 'Dany Montagnolo' } }
    const admin = (await esegui(strumenti('admin', 'admin', righe), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as {
      call: Record<string, unknown>[]
    }
    // the admin reads every call: each one says who set it and who closes it ("Loris's calls" are only those with his name)
    expect(admin.call[0]).toMatchObject({ setter: 'Loris Setter', closer: 'Dany Montagnolo' })
    expect(admin).not.toHaveProperty('di_chi')

    const setter = await leggi('setter')
    expect(Object.keys(setter).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(setter).toMatchObject({
      persona: 'Dany Montagnolo',
      di_chi:
        'Solo le call fissate da Dany Montagnolo, cioè da chi sta chattando: non tutte le call del team. ' +
        'Di un’altra persona qui ci sono solo le call fissate da Dany Montagnolo, mai tutte le sue.',
    })
    expect(await leggi('closer')).toMatchObject({
      di_chi:
        'Solo le call assegnate a Dany Montagnolo, cioè a chi sta chattando: non tutte le call del team. ' +
        'Di un’altra persona qui ci sono solo le call assegnate a Dany Montagnolo, mai tutte le sue.',
    })

    expect(strumenti('setter', 'employee').call_periodo.description).toContain('Solo le call fissate da chi chatta')
    expect(strumenti('closer', 'employee').call_periodo.description).toContain('Solo le call assegnate a chi chatta')
    expect(strumenti('admin', 'admin').call_periodo.description).toContain('Tutte le call del team.')
  })

  it('call_periodo: oltre 60 call l’elenco dice che è parziale', async () => {
    const righe = mondo()
    righe.calls = Array.from({ length: 61 }, (_, i) => ({ ...righe.calls[0], id: `c${i}` }))
    const esito = (await esegui(strumenti('admin', 'admin', righe), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as Record<string, unknown>
    expect(esito.call).toHaveLength(60)
    expect(esito.nota).toBe('Elenco parziale: più di 60 call, qui le prime per data. Per contarle tutte, un periodo più corto.')
    expect(await esegui(strumenti('admin', 'admin'), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })).not.toHaveProperty('nota')
  })

  it('un altro esito toglie il motivo di non chiusura salvato, e la scheda lo dice', async () => {
    for (const esito of ['chiusa', 'no_show', 'programmata'] as const) {
      const p = await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito }, 'closer')
      expect(p, esito).toMatchObject({ righe: expect.arrayContaining(['Motivo di non chiusura: Ci deve pensare → tolto']) })
    }
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
    [
      'call',
      { azione: 'sposta', lead: 'Andrea Varriale', data: '2026-10-03', ora: '18:00' },
      `Sposto la call di Andrea Varriale al ${quandoBreveDa('2026-10-03', '18:00')}`,
      [],
    ],
    [
      'call',
      { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: false, motivo: 'Fuori budget', note_closer: 'Riprovare a gennaio' },
      'Registro l’esito della call con Luca Neri: Persa',
      ['Qualificata: no', 'Motivo di non chiusura: Fuori budget', 'Note aggiuntive: Riprovare a gennaio'],
    ],
    ['lead', { azione: 'stato', lead: 'Luca Neri', stato: 'call_fissata' }, 'Sposto Luca Neri in «Call da fare»'],
    ['aggiorna_report', { setter: 'Loris', data: '2026-09-26', modalita: 'elimina' }, 'Elimino il report di Loris di 26/09/2026', []],
    [
      'aggiorna_report',
      { modalita: 'aggiungi', conversazioni: 4, lead_in_target: 'circa_meta', qualita_conversazioni: 'buone', cosa_frenava: 'Ci devo pensare' },
      'Aggiungo al report di oggi',
      ['+4 conversazioni', 'Lead in target: Circa metà', 'Qualità delle conversazioni: Buone', 'Cosa frenava i lead (in aggiunta): Ci devo pensare'],
    ],
    ['aggiorna_report', { modalita: 'imposta', domande_contenuti: '' }, 'Imposto il report di oggi', ['Domande e contenuti: da togliere']],
    ['progetto', { azione: 'togli_membro', progetto: 'Reel', persone: ['Sara Editor'] }, 'Tolgo Sara Editor dal progetto «Reel»'],
    ['lista', { azione: 'crea', progetto: 'Reel', nome: 'Pubblicazione', data_fine: '2026-10-31' }, 'Creo la lista «Pubblicazione» in «Reel»', ['Fine: 31/10/2026']],
    ['task', { azione: 'elimina', titolo: 'Copertina', progetto: 'Reel' }, 'Elimino il task «Copertina»', ['Progetto: Reel']],
    ['nota_progetto', { azione: 'aggiungi', progetto: 'Reel', testo: 'Consegna spostata' }, 'Aggiungo una nota a «Reel»', ['Giorno: oggi', '«Consegna spostata»']],
    ['tempo', { azione: 'registra', progetto: 'Reel', durata: '1h30', task: 'Copertina' }, 'Registro 1h30 su «Reel»', ['Giorno: oggi', 'Task: Copertina']],
    ['tempo', { azione: 'registra', progetto: 'Reel', dalle: '09:00', alle: '10:30' }, 'Registro 09:00–10:30 su «Reel»', ['Giorno: oggi']],
    ['tempo', { azione: 'modifica', voce_id: 'x', dalle: 'nessuna' }, 'Correggo una tua voce di tempo', ['Tolgo la fascia oraria']],
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
    const input = { azione: 'esito', lead: 'Luca Neri', esito: 'no_show', data: '2026-09-30', ora: '18:00' }
    expect(await anteprima('call', input, 'closer')).toEqual({
      errore: 'L’esito non cambia data e ora: per spostare la call usa azione sposta con data e ora.',
    })
    await esegui(strumenti('closer', 'employee'), 'call', input)
    expect(a.registraEsito).not.toHaveBeenCalled()
    // riprogrammata is a move (Dany, 02/10/2026): never an outcome without the new day
    expect(await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata' }, 'closer')).toEqual({
      errore: 'Dati non validi per questa operazione.',
    })
    const descrizione = strumenti('closer', 'employee').call.description ?? ''
    expect(descrizione).toContain('riprogrammata non è un esito: usa sposta')
    expect(descrizione).toContain('lead stato')
  })

  describe('sposta: la stessa call passa al nuovo giorno (Dany, 02/10/2026)', () => {
    const domani = aggiungiGiorni(oggiRoma(), 1)
    const daFare = () => {
      const righe = mondo()
      righe.calls = [{ ...righe.calls[0], stato: 'programmata', esito: null, qualificata: null, obiezione_principale: null }]
      return righe
    }

    const conStato = (stato: 'no_show' | 'cancellata') => () => {
      const righe = mondo()
      righe.calls = [{ ...righe.calls[0], stato, esito: null, qualificata: null, obiezione_principale: null }]
      return righe
    }
    const noShow = conStato('no_show')
    const cancellata = conStato('cancellata')

    it('la scheda dice da quando a quando, e che l’esito si toglie', async () => {
      const p = await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, 'closer', cancellata())
      expect(p).toMatchObject({
        titolo: `Sposto la call di Luca Neri dal ${quandoBreve('2026-09-28T13:00:00Z')} al ${quandoBreveDa(domani, '18:00')}`,
        righe: ['Esito: Cancellata → da fare', `Sulla scheda: «Spostata dal ${quandoBreve('2026-09-28T13:00:00Z')}»`],
      })
      await esegui(strumenti('closer', 'employee', cancellata()), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      expect(a.spostaCall).toHaveBeenCalledWith({ call_id: CALL, data: domani, ora: '18:00' })
      expect(a.modificaCall).not.toHaveBeenCalled()
      expect(a.registraEsito).not.toHaveBeenCalled()
    })

    it('una call svolta non si sposta, per nessuno', async () => {
      for (const ruolo of ['closer', 'admin'] as const) {
        // sposta_call's words, and where a wrong day goes: modifica (Dany, 03/10/2026)
        expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, ruolo)).toEqual({
          errore: `${SPOSTA.svolta}. ${SPOSTA.soloLaData}`,
        })
      }
      // the setter reads who corrects the outcome, never «la sposta lui»
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, 'setter')).toEqual({
        errore: SPOSTA.setterSvolta,
      })
      await esegui(strumenti('closer', 'employee'), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      await esegui(strumenti(), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      await esegui(strumenti('setter', 'employee'), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      expect(a.spostaCall).not.toHaveBeenCalled()
    })

    it('un no show non si sposta, per nessuno: resta nello show rate (Dany, 02/10/2026)', async () => {
      const ieri = aggiungiGiorni(oggiRoma(), -1)
      for (const [ruolo, frase] of [
        // closer and admin also read that a wrong day is modifica's (Dany, 03/10/2026)
        ['closer', `${SPOSTA.noShow}. ${SPOSTA.soloLaData}`],
        ['admin', `${SPOSTA.noShow}. ${SPOSTA.soloLaData}`],
        ['setter', SPOSTA.setterNoShow],
      ] as const) {
        // the card stops before the tap, whatever the day (the admin also moves to the past)
        for (const giorno of [domani, ieri]) {
          expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: giorno, ora: '18:00' }, ruolo, noShow()), ruolo).toEqual({
            errore: frase,
          })
        }
        await esegui(strumenti(ruolo, 'employee', noShow()), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      }
      expect(a.spostaCall).not.toHaveBeenCalled()
      // «è stata riprogrammata» is a move too: the outcome never carries a new day
      expect(
        await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'programmata', data: domani, ora: '18:00' }, 'closer', noShow()),
      ).toEqual({ errore: 'L’esito non cambia data e ora: per spostare la call usa azione sposta con data e ora.' })
      // the description says it to the model, for every role
      for (const ruolo of ['closer', 'admin'] as const) {
        expect(strumenti(ruolo, 'employee').call.description, ruolo).toContain('una call svolta o un no show non si spostano')
      }
      expect(strumenti('setter', 'employee').call.description).toContain('una svolta o un no show non si spostano')
    })

    it('«modifica» corregge data e ora di un no show per closer e admin, come di una svolta; il setter no (Dany, 03/10/2026)', async () => {
      for (const ruolo of ['closer', 'admin'] as const) {
        // another day, or another time of the same day: the card says before → after, and that the call stays a no-show
        expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', data: '2026-09-29' }, ruolo, noShow()), ruolo).toMatchObject({
          titolo: expect.stringMatching(/^Correggo la call con Luca Neri del /),
          righe: ['Data: 28/09/2026 → 29/09/2026', 'Resta un no show: è una correzione, senza «Spostata dal…»'],
        })
        expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', ora: '18:30' }, ruolo, noShow()), ruolo).toMatchObject({
          righe: ['Ora: 15:00 → 18:30', SPOSTA.correzione.noShow],
        })
        // the same day and time: nothing to say about a move
        expect(
          await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', link_registrazione: 'https://esempio.it/rec' }, ruolo, noShow()),
          ruolo,
        ).toMatchObject({ righe: ['Registrazione: – → https://esempio.it/rec'] })
        await esegui(strumenti(ruolo, 'employee', noShow()), 'call', { azione: 'modifica', lead: 'Luca Neri', data: '2026-09-29', ora: '18:30' })
        expect(a.modificaCall, ruolo).toHaveBeenLastCalledWith(expect.objectContaining({ call_id: CALL, data: '2026-09-29', ora: '18:30' }))
      }
      // the pencil is never a move: no sposta_call, no outcome written
      expect(a.spostaCall).not.toHaveBeenCalled()
      expect(a.registraEsito).not.toHaveBeenCalled()
      // the setter: refused before the card, in his words, another day or another time
      a.modificaCall.mockClear()
      for (const cambio of [{ data: domani }, { ora: '18:30' }]) {
        expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', ...cambio }, 'setter', noShow())).toEqual({
          errore: SPOSTA.setterNoShow,
        })
        await esegui(strumenti('setter', 'employee', noShow()), 'call', { azione: 'modifica', lead: 'Luca Neri', ...cambio })
      }
      expect(a.modificaCall).not.toHaveBeenCalled()
      // his notes still save, with day and time as they are
      await esegui(strumenti('setter', 'employee', noShow()), 'call', { azione: 'modifica', lead: 'Luca Neri', note: 'Richiamarlo' })
      expect(a.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ call_id: CALL, data: '2026-09-28', ora: '15:00', note: 'Richiamarlo' }))
      // a held call: closer and admin still correct a wrong date (a typo is not a move)
      expect(await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', data: '2026-09-29' }, 'closer')).toMatchObject({
        righe: ['Data: 28/09/2026 → 29/09/2026', SPOSTA.correzione.svolta],
      })
      await esegui(strumenti('closer', 'employee'), 'call', { azione: 'modifica', lead: 'Luca Neri', data: '2026-09-29' })
      expect(a.modificaCall).toHaveBeenLastCalledWith(expect.objectContaining({ call_id: CALL, data: '2026-09-29', ora: '15:00' }))
      // the description says it: a correction, never a move; a real no-show is never undone to move it
      for (const ruolo of ['closer', 'admin'] as const) {
        const descrizione = strumenti(ruolo, 'employee').call.description ?? ''
        expect(descrizione, ruolo).not.toContain('mai data e ora di un no show')
        expect(descrizione, ruolo).not.toContain('modifica non cambia data e ora di un no show')
        expect(descrizione, ruolo).toContain('anche di una call svolta o di un no show, che restano tali: è una correzione, mai per spostarla')
        expect(descrizione, ruolo).toContain('mai per spostare un no show vero o una call svolta')
      }
      expect(strumenti('closer', 'employee').call.description).toContain('che fissa il setter (o l’admin)')
      expect(strumenti().call.description).toContain('con fissa_call')
    })

    it('senza giorno e ora non si sposta; nel passato solo l’admin', async () => {
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani }, 'closer')).toEqual({
        errore: 'Dimmi il nuovo giorno e l’ora della call.',
      })
      const ieri = aggiungiGiorni(oggiRoma(), -1)
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: ieri, ora: '18:00' }, 'closer', daFare())).toEqual({
        errore: SPOSTA_SOLO_AVANTI,
      })
      await esegui(strumenti('closer', 'employee', daFare()), 'call', { azione: 'sposta', lead: 'Luca Neri', data: ieri, ora: '18:00' })
      expect(a.spostaCall).not.toHaveBeenCalled()
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: ieri, ora: '18:00' }, 'admin', daFare())).toMatchObject({
        titolo: expect.stringMatching(/^Sposto la call di Luca Neri dal /),
      })
      // the same moment is not a move
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: '2026-09-28', ora: '15:00' }, 'admin', daFare())).toEqual({
        errore: SPOSTA.stessoMomento,
      })
    })

    it('il setter sposta una sua call da fare; con un esito la sposta il closer', async () => {
      expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, 'setter', cancellata())).toEqual({
        errore: SPOSTA.setterConEsito,
      })
      const riprogrammata = mondo()
      riprogrammata.calls = [{ ...riprogrammata.calls[0], stato: 'riprogrammata', esito: null, qualificata: null }]
      expect(
        await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, 'setter', riprogrammata),
      ).toEqual({ errore: SPOSTA.setterRiprogrammata })

      const p = await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' }, 'setter', daFare())
      // a call still to be held: nothing of the closer's to clear
      expect(p).toMatchObject({ righe: [`Sulla scheda: «Spostata dal ${quandoBreve('2026-09-28T13:00:00Z')}»`] })
      await esegui(strumenti('setter', 'employee', daFare()), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      expect(a.spostaCall).toHaveBeenCalledWith({ call_id: CALL, data: domani, ora: '18:00' })
    })
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
