import { readFileSync } from 'node:fs'

import { asSchema, type ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSEGUENZE } from '@/lib/alfire/conseguenze'
import { strumentiConsentiti } from '@/lib/alfire/permessi'
import { azioneDistruttiva, riassuntoScrittura } from '@/lib/alfire/riassunto'
import { nomiDistinti, type Errore } from '@/lib/alfire/risolvi'
import { CARTELLA_NON_LETTA } from '@/lib/alfire/scritture/progetti'
import { FISSATA_DA_FOLLOW_UP, anteprimaScrittura, strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { FOLLOW_UP, quandoFollowUp } from '@/lib/call/follow-up'
import { SPOSTA, quandoBreve, quandoBreveDa } from '@/lib/call/spostamento'
import { aggiungiGiorni, giornoEsteso, istanteRoma, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData } from '@/lib/format'
import { SPOSTA_SOLO_AVANTI } from '@/lib/validation/call'

// Every write goes through the server action of the app's own form: stand-ins
// here record what Alfire would write, without Next or a database.
const a = vi.hoisted(() => {
  const ok = () => vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(async () => ({ ok: true }))
  return {
    modificaCall: ok(),
    registraEsito: ok(),
    spostaCall: ok(),
    fissaFollowUp: ok(),
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
    chiudiCliente: ok(),
    archiviaCliente: ok(),
    togliDallArchivio: ok(),
    riapriCliente: ok(),
    sospendiCliente: ok(),
    riattivaCliente: ok(),
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
    scegliCoach: ok(),
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
  fissaFollowUp: a.fissaFollowUp,
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
  chiudiCliente: a.chiudiCliente,
  archiviaCliente: a.archiviaCliente,
  togliDallArchivio: a.togliDallArchivio,
  riapriCliente: a.riapriCliente,
  sospendiCliente: a.sospendiCliente,
  riattivaCliente: a.riattivaCliente,
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
  scegliCoach: a.scegliCoach,
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
  // like LIKE: % any run, _ any one character
  const regex = schema
    .split('%')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'))
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
    // order like Postgres (nulls last ascending, first descending), every key so far: the latest call is the minor one
    const chiavi: { c: string; su: boolean; nulliPrima: boolean }[] = []
    Object.assign(q, {
      select: () => q,
      order: (c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
        const su = o.ascending !== false
        chiavi.push({ c, su, nulliPrima: o.nullsFirst ?? !su })
        righe = [...righe].sort((x, y) => {
          for (const k of chiavi) {
            const a = x[k.c] ?? null
            const b = y[k.c] ?? null
            if (a === b) continue
            if (a === null) return k.nulliPrima ? -1 : 1
            if (b === null) return k.nulliPrima ? 1 : -1
            const d = String(a) < String(b) ? -1 : 1
            return k.su ? d : -d
          }
          return 0
        })
        return q
      },
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

/** A date in another format: the person reads that Alfire rewrites it, the model the format (03/10/2026). */
const DATA_SBAGLIATA = {
  errore: 'La data non è scritta nel formato che serve: la riscrivo e riprovo.',
  per_alfire: 'Date in formato AAAA-MM-GG (es. 2026-09-28): riprova così.',
}

/** An outcome said with a new day: the person reads that the call moves, the model with which action. */
const ESITO_SENZA_DATA = {
  errore: 'L’esito non cambia il giorno né l’ora della call: per quello la call si sposta.',
  per_alfire: 'Per spostarla: call, azione sposta con data e ora.',
}

beforeEach(() => {
  vi.clearAllMocks()
  rpcChiamate.length = 0
})

// ---------------------------------------------------------------------------
describe('chi riceve quali strumenti (elenchi fissati)', () => {
  it('admin: 18 letture (la sua giornata da closer compresa), le risposte a un tocco e 18 scritture', () => {
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
      'mie_giornate',
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

  it('setter: i suoi numeri, i suoi clienti, la sua giornata, i numeri del closer, report, call, lead e i progetti', () => {
    expect(strumentiConsentiti('setter', 'employee')).toEqual([
      'guida',
      'proponi_risposte',
      'miei_numeri',
      'miei_clienti',
      'mie_giornate',
      // the Closer page he reads since 07/10/2026: the closer's numbers of every setter
      'giornate_closer',
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

  it('closer: le sue call, le sue vendite e i loro incassi, la sua giornata, i progetti', () => {
    expect(strumentiConsentiti('closer', 'employee')).toEqual([
      'guida',
      'proponi_risposte',
      'mie_vendite',
      'mie_giornate',
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
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
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

  it('call: l’esito e la call di follow-up sono di chi fa la call, eliminare dell’admin; spostarla di tutti e tre', async () => {
    expect(await azioniDi(strumenti(), 'call')).toEqual(['esito', 'follow_up', 'sposta', 'modifica', 'elimina'])
    expect(await azioniDi(strumenti('closer', 'employee'), 'call')).toEqual(['esito', 'follow_up', 'sposta', 'modifica'])
    expect(await azioniDi(strumenti('setter', 'employee'), 'call')).toEqual(['sposta', 'modifica'])
  })

  it('la call del setter non ha importi, link, performance né esito', async () => {
    const campi = await campiDi(strumenti('setter', 'employee'), 'call')
    for (const c of ['importo_proposto', 'link_registrazione', 'performance', 'prodotto_proposto', 'esito', 'tipo', 'follow_up_data', 'follow_up_ora']) {
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
    expect(await azioniDi(manager, 'progetto')).toEqual(['crea', 'modifica', 'aggiungi_membro', 'togli_membro', 'scegli_coach'])
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
    // the person reads the candidates; how to tell them apart is the model's
    expect(esito).toEqual({ errore: 'Più clienti possibili: Mario Rossi, Luca Rossi.', per_alfire: 'Chiedi quale, con nome e cognome.' })
  })

  it('«la rata di Rossi» con due rate da incassare: chiede quale; «di marzo» la trova', async () => {
    const s = strumenti()
    const dubbio = (await esegui(s, 'rata', { azione: 'incassa', cliente: 'Mario Rossi' })) as { errore: string; per_alfire: string }
    expect(a.segnaIncassata).not.toHaveBeenCalled()
    expect(spazi(dubbio.errore)).toBe(
      'Più rate possibili di Mario Rossi: Rata 2 di 3 (scadenza 10/02/2026, 500,00 €, da incassare); ' +
        'Rata 3 di 3 (scadenza 10/03/2026, 500,00 €, da incassare).',
    )
    expect(dubbio.per_alfire).toBe('Chiedi quale, con il numero della rata o il mese.')
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
    // newest first, as the database orders them
    expect(dubbio.errore).toMatch(/^Più costi possibili: «Canva» del 12\/09\/2026 .*«Canva» del 12\/08\/2026/)
    await esegui(s, 'costo', { azione: 'elimina', costo: 'canva', mese: '2026-09' })
    expect(a.eliminaCosto).toHaveBeenCalledWith({ id: 'e2' })
  })

  it('«Luca» sono due lead; con l’handle è uno solo', async () => {
    const s = strumenti()
    const dubbio = await esegui(s, 'lead', { azione: 'stato', lead: 'Luca', stato: 'perso' })
    expect(a.aggiornaStatoLead).not.toHaveBeenCalled()
    expect(dubbio).toEqual({
      errore: 'Più lead possibili: Luca Neri (@luca.neri), Call da fare; Luca Bianchi (@lucab), Follow-up.',
      per_alfire: 'Chiedi quale (nome completo o @handle).',
    })
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

  it('cliente: «non rinnova» chiude da oggi con il motivo; riapre solo un cliente chiuso', async () => {
    const s = strumenti()
    expect(await azioniDi(s, 'cliente')).toEqual([
      'crea',
      'modifica',
      'chiudi',
      'archivia',
      'togli_archivio',
      'riapri',
      'sospendi',
      'riattiva',
      'elimina',
    ])
    expect(await anteprima('cliente', { azione: 'chiudi', cliente: 'Mario Rossi', motivo: 'Si allena da solo' })).toEqual({
      titolo: 'Mario Rossi non rinnova: lo chiudo',
      righe: [
        `Chiuso dal ${formatData(oggiRoma())}`,
        'Motivo: Si allena da solo',
        'Va tra i clienti chiusi: esce da In scadenza e Da recuperare, niente più promemoria del percorso. Vendite e incassi restano; se compra di nuovo torna da solo.',
      ],
      sostituisceDettagli: true,
    })
    await esegui(s, 'cliente', { azione: 'chiudi', cliente: 'Mario Rossi', motivo: ' Si allena da solo ' })
    expect(a.chiudiCliente).toHaveBeenCalledWith({ client_id: MARIO, chiuso_il: oggiRoma(), motivo: 'Si allena da solo' })

    // not closed: nothing to reopen, before the tap and at the tap
    expect(await anteprima('cliente', { azione: 'riapri', cliente: 'Mario Rossi' })).toEqual({
      errore: 'Mario Rossi non è chiuso: non c’è niente da riaprire.',
    })
    await esegui(s, 'cliente', { azione: 'riapri', cliente: 'Mario Rossi' })
    expect(a.riapriCliente).not.toHaveBeenCalled()
  })

  it('cliente: mai chiuso nel futuro né prima della firma del suo ultimo percorso', async () => {
    const futuro = await esegui(strumenti(), 'cliente', { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: aggiungiGiorni(oggiRoma(), 1) })
    expect(futuro).toEqual({ errore: 'Il giorno della chiusura non può essere nel futuro.' })
    const prima = await anteprima('cliente', { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: '2026-01-09' })
    expect(prima).toEqual({ errore: 'Il 10/01/2026 Mario Rossi ha firmato il suo ultimo percorso: la chiusura va da quel giorno in poi.' })
    expect(a.chiudiCliente).not.toHaveBeenCalled()
  })

  it('cliente: su un cliente chiuso, chiudi corregge giorno o motivo e riapri toglie la chiusura', async () => {
    const righe = { ...mondo(), v_clienti_chiusi: [{ client_id: MARIO, chiuso_il: '2026-09-30', motivo: 'Trasloco' }] }
    expect(await anteprima('cliente', { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: '2026-10-01' }, 'admin', righe)).toEqual({
      titolo: 'Correggo la chiusura di Mario Rossi',
      righe: ['Chiuso dal: 30/09/2026 → 01/10/2026'],
      sostituisceDettagli: true,
    })
    const s = strumenti('admin', 'admin', righe)
    // the reason already saved stays when only the day changes
    await esegui(s, 'cliente', { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: '2026-10-01' })
    expect(a.chiudiCliente).toHaveBeenCalledWith({ client_id: MARIO, chiuso_il: '2026-10-01', motivo: 'Trasloco' })
    expect(await anteprima('cliente', { azione: 'riapri', cliente: 'Mario Rossi' }, 'admin', righe)).toEqual({
      titolo: 'Riapro il cliente Mario Rossi',
      righe: [
        'Era chiuso dal 30/09/2026: Trasloco',
        'Torna con lo stato che dicono le date del percorso, con i promemoria ancora dovuti; giorno e motivo della chiusura si tolgono.',
      ],
      sostituisceDettagli: true,
    })
    await esegui(s, 'cliente', { azione: 'riapri', cliente: 'Mario Rossi' })
    expect(a.riapriCliente).toHaveBeenCalledWith({ client_id: MARIO })
  })

  it('cliente: archivia come ex cliente un chiuso, lo toglie dall’archivio; mai chi non è chiuso', async () => {
    // not closed: nothing to archive, before the tap and at the tap
    expect(await anteprima('cliente', { azione: 'archivia', cliente: 'Mario Rossi' })).toEqual({
      errore: 'Mario Rossi non è chiuso: prima va chiuso (non rinnova), poi si archivia.',
    })
    await esegui(strumenti(), 'cliente', { azione: 'archivia', cliente: 'Mario Rossi' })
    expect(a.archiviaCliente).not.toHaveBeenCalled()

    const chiuso = { ...mondo(), v_clienti_chiusi: [{ client_id: MARIO, chiuso_il: '2026-09-30', motivo: 'Trasloco', archiviato_il: null }] }
    expect(await anteprima('cliente', { azione: 'archivia', cliente: 'Mario Rossi' }, 'admin', chiuso)).toEqual({
      titolo: 'Archivio Mario Rossi come ex cliente',
      righe: [
        `Archiviato dal ${formatData(oggiRoma())}`,
        'Chiuso dal 30/09/2026: Trasloco',
        'Esce da Non rinnovano e va sotto Ex cliente in Clienti; niente promemoria del percorso. Vendite e incassi restano; se compra di nuovo torna da solo.',
      ],
      sostituisceDettagli: true,
    })
    // closed, not archived: nothing to take out of the archive
    expect(await anteprima('cliente', { azione: 'togli_archivio', cliente: 'Mario Rossi' }, 'admin', chiuso)).toEqual({
      errore: 'Mario Rossi non è archiviato: non c’è niente da togliere dall’archivio.',
    })
    expect(await esegui(strumenti('admin', 'admin', chiuso), 'cliente', { azione: 'archivia', cliente: 'Mario Rossi' })).toEqual({
      fatto: true,
      cliente: 'Mario Rossi',
      link: `/clients/${MARIO}`,
    })
    expect(a.archiviaCliente).toHaveBeenCalledWith({ client_id: MARIO })
    // archived elsewhere between the card and the tap: his day stays, and Alfire says so
    a.archiviaCliente.mockResolvedValueOnce({ ok: true, archiviato_il: '2026-10-01', gia: true })
    expect(await esegui(strumenti('admin', 'admin', chiuso), 'cliente', { azione: 'archivia', cliente: 'Mario Rossi' })).toEqual({
      errore: 'Mario Rossi era già archiviato come ex cliente dal 01/10/2026.',
    })

    const archiviato = {
      ...mondo(),
      v_clienti_chiusi: [{ client_id: MARIO, chiuso_il: '2026-09-30', motivo: null, archiviato_il: '2026-10-02' }],
    }
    expect(await anteprima('cliente', { azione: 'archivia', cliente: 'Mario Rossi' }, 'admin', archiviato)).toEqual({
      errore: 'Mario Rossi è già archiviato come ex cliente dal 02/10/2026.',
    })
    expect(await anteprima('cliente', { azione: 'togli_archivio', cliente: 'Mario Rossi' }, 'admin', archiviato)).toEqual({
      titolo: 'Tolgo Mario Rossi dall’archivio',
      righe: ['Era archiviato dal 02/10/2026', 'Torna chiuso (dal 30/09/2026), in Rinnovi sotto Non rinnovano.'],
      sostituisceDettagli: true,
    })
    const s = strumenti('admin', 'admin', archiviato)
    await esegui(s, 'cliente', { azione: 'togli_archivio', cliente: 'Mario Rossi' })
    expect(a.togliDallArchivio).toHaveBeenCalledWith({ client_id: MARIO })
    // "Riapri" says the archive goes too
    expect(await anteprima('cliente', { azione: 'riapri', cliente: 'Mario Rossi' }, 'admin', archiviato)).toEqual({
      titolo: 'Riapro il cliente Mario Rossi',
      righe: [
        'Era chiuso dal 30/09/2026',
        'Archiviato come ex cliente dal 02/10/2026',
        'Torna con lo stato che dicono le date del percorso, con i promemoria ancora dovuti; giorno e motivo della chiusura e l’archivio si tolgono.',
      ],
      sostituisceDettagli: true,
    })
    // the closure never moves after the archiving day
    expect(await anteprima('cliente', { azione: 'chiudi', cliente: 'Mario Rossi', chiuso_il: '2026-10-03' }, 'admin', archiviato)).toEqual({
      errore: 'Mario Rossi è archiviato dal 02/10/2026: la chiusura non può venire dopo quel giorno.',
    })
  })

  it('cliente: sospende da oggi con il motivo; riattiva solo un sospeso; mai un chiuso né chi non ha un percorso', async () => {
    const s = strumenti()
    expect(await anteprima('cliente', { azione: 'sospendi', cliente: 'Mario Rossi', motivo: 'Viaggio di lavoro' })).toEqual({
      titolo: 'Sospendo Mario Rossi',
      righe: [
        `Sospeso dal ${formatData(oggiRoma())}`,
        'Motivo: Viaggio di lavoro',
        'Va tra i clienti sospesi: esce da In scadenza e dai rinnovi da chiamare, niente più promemoria del percorso. Percorso, rate e incassi restano; se compra di nuovo o non rinnova la sospensione finisce da sola.',
      ],
      sostituisceDettagli: true,
    })
    await esegui(s, 'cliente', { azione: 'sospendi', cliente: 'Mario Rossi', motivo: ' Viaggio di lavoro ' })
    expect(a.sospendiCliente).toHaveBeenCalledWith({ client_id: MARIO, sospeso_il: oggiRoma(), motivo: 'Viaggio di lavoro' })

    // not on hold: nothing to reactivate, before the tap and at the tap
    expect(await anteprima('cliente', { azione: 'riattiva', cliente: 'Mario Rossi' })).toEqual({
      errore: 'Mario Rossi non è sospeso: non c’è niente da riattivare.',
    })
    await esegui(s, 'cliente', { azione: 'riattiva', cliente: 'Mario Rossi' })
    expect(a.riattivaCliente).not.toHaveBeenCalled()

    // never in the future
    expect(await esegui(s, 'cliente', { azione: 'sospendi', cliente: 'Mario Rossi', sospeso_il: aggiungiGiorni(oggiRoma(), 1) })).toEqual({
      errore: 'Il giorno della sospensione non può essere nel futuro.',
    })

    // closed: the closure wins, nothing to suspend
    const chiuso = { ...mondo(), v_clienti_chiusi: [{ client_id: MARIO, chiuso_il: '2026-09-30', motivo: null, archiviato_il: null }] }
    expect(await anteprima('cliente', { azione: 'sospendi', cliente: 'Mario Rossi' }, 'admin', chiuso)).toEqual({
      errore: 'Mario Rossi è chiuso: prima va riaperto (riapri), poi si può sospendere.',
    })
    // no path yet: nothing to suspend
    expect(await anteprima('cliente', { azione: 'sospendi', cliente: 'Luca Rossi' })).toEqual({
      errore: 'Luca Rossi non ha ancora un percorso: non c’è niente da sospendere.',
    })
    expect(a.sospendiCliente).toHaveBeenCalledTimes(1)
  })

  it('cliente: su un sospeso, sospendi corregge giorno o motivo e riattiva toglie la sospensione', async () => {
    const righe = { ...mondo(), clienti_sospensioni: [{ client_id: MARIO, sospeso_il: '2026-10-10', motivo: 'Viaggio' }] }
    expect(await anteprima('cliente', { azione: 'sospendi', cliente: 'Mario Rossi', sospeso_il: '2026-10-12' }, 'admin', righe)).toEqual({
      titolo: 'Correggo la sospensione di Mario Rossi',
      righe: ['Sospeso dal: 10/10/2026 → 12/10/2026'],
      sostituisceDettagli: true,
    })
    const s = strumenti('admin', 'admin', righe)
    // the reason already saved stays when only the day changes
    await esegui(s, 'cliente', { azione: 'sospendi', cliente: 'Mario Rossi', sospeso_il: '2026-10-12' })
    expect(a.sospendiCliente).toHaveBeenCalledWith({ client_id: MARIO, sospeso_il: '2026-10-12', motivo: 'Viaggio' })
    expect(await anteprima('cliente', { azione: 'riattiva', cliente: 'Mario Rossi' }, 'admin', righe)).toEqual({
      titolo: 'Riattivo il cliente Mario Rossi',
      righe: [
        'Era sospeso dal 10/10/2026: Viaggio',
        'Torna con lo stato che dicono le date del percorso, con i promemoria ancora dovuti; giorno e motivo della sospensione si tolgono.',
      ],
      sostituisceDettagli: true,
    })
    await esegui(s, 'cliente', { azione: 'riattiva', cliente: 'Mario Rossi' })
    expect(a.riattivaCliente).toHaveBeenCalledWith({ client_id: MARIO })
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
        // the card stops before the tap with the form's words; the model reads that it asks why it did not close
        expect(await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: false, motivo }, ruolo)).toEqual({
          errore: 'Scrivi il motivo di non chiusura.',
          per_alfire: expect.stringMatching(/^Chiedi perché non ha chiuso \(es\. /),
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
    righe.pm_modelli = [{ id: 'mod-reel', nome: 'Reel mensile', attivo: true, per_onboarding: false }]
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
// The team tracking its time through Alfire (Dany, 03/10/2026): a coach on the
// projects of his clients, where the same 8 tasks repeat in every project.
// ---------------------------------------------------------------------------
const SERGIO = 'b0000000-0000-4000-8000-0000000000a1'
const STEFANO = 'b0000000-0000-4000-8000-0000000000a2'
const MARCO = '00000000-0000-4000-8000-000000000005'
const NINA = '00000000-0000-4000-8000-000000000006'
const PERCORSO = [
  'Call di onboarding',
  'Analisi e strategia iniziale',
  'Programmazione allenamento (creazione e aggiornamenti)',
  'Programmazione alimentare (creazione e aggiornamenti)',
  'Revisione video',
  'Call di check',
  'Assistenza chat',
  'Altre attività',
]
/** The id of the n-th task of the path in a client's project (1: Sergio, 2: Stefano). */
const TASK = (cliente: 1 | 2, n: number) => `7a000000-0000-4000-8000-00000000${cliente}0${String(n).padStart(2, '0')}`
const VOCE_CALL = '7e000000-0000-4000-8000-000000000001'
const VOCE_VIDEO = '7e000000-0000-4000-8000-000000000002'
const TIMER = '7e000000-0000-4000-8000-000000000003'

function taskDelPercorso(cliente: 1 | 2, progetto: string): Riga[] {
  return PERCORSO.map((titolo, n) => ({
    id: TASK(cliente, n),
    titolo,
    progetto_id: progetto,
    tasklist_id: null,
    parent_id: null,
    descrizione: null,
    stato: 'da_fare',
    priorita: 'media',
    data_inizio: null,
    scadenza: null,
    stima_minuti: null,
    // the coach works them; the template made them (not him)
    assegnatari: [IO],
    sotto_task_totali: 0,
    created_by: LORENZO,
  }))
}

/** Two clients' projects, each with the 8 tasks of the path; the coach chatting is IO. */
function mondoCoach(): Record<string, Riga[]> {
  const m = mondo()
  const progetto = (id: string, nome: string, coach: string | null) => ({
    id,
    nome,
    reparto_id: 'rep-fitness',
    client_id: `cl-${id.slice(-2)}`,
    coach_id: coach,
    stato: 'attivo',
    descrizione: null,
    data_inizio: '2026-09-01',
    data_fine: '2026-12-01',
    responsabile_id: null,
    task_totali: 8,
  })
  m.v_pm_progetti = [...m.v_pm_progetti, progetto(SERGIO, 'Sergio Bellini', IO), progetto(STEFANO, 'Stefano Moretti', null)]
  m.v_pm_task = [...taskDelPercorso(1, SERGIO), ...taskDelPercorso(2, STEFANO)]
  m.profiles = [
    ...m.profiles,
    { id: MARCO, nome: 'Marco Coach', ruolo: 'coach', attivo: true },
    { id: NINA, nome: 'Nina Nutri', ruolo: 'nutrizione', attivo: true },
  ]
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  m.pm_tempo = [
    // yesterday on Sergio: 45 minutes typed in the morning, then a range in the afternoon
    {
      id: VOCE_CALL,
      profile_id: IO,
      progetto_id: SERGIO,
      task_id: TASK(1, 5),
      data: ieri,
      minuti: 45,
      nota: null,
      inizio: null,
      fine: null,
      created_at: istanteRoma(ieri, '09:00'),
      progetto: { nome: 'Sergio Bellini' },
      task: { titolo: 'Call di check' },
    },
    {
      id: VOCE_VIDEO,
      profile_id: IO,
      progetto_id: SERGIO,
      task_id: TASK(1, 4),
      data: ieri,
      minuti: 90,
      nota: 'Tre video',
      // built in Europe/Rome, as the code formats them: 15:00–16:30 on any date, summer or winter
      inizio: istanteRoma(ieri, '15:00'),
      fine: istanteRoma(ieri, '16:30'),
      created_at: istanteRoma(ieri, '17:00'),
      progetto: { nome: 'Sergio Bellini' },
      task: { titolo: 'Revisione video' },
    },
    // someone else's entry on the same project and day: never one of mine
    { ...m.pm_tempo[1], progetto_id: SERGIO, data: ieri, progetto: { nome: 'Sergio Bellini' }, task: null },
  ]
  return m
}

/** The coach's timer, running for half an hour on Stefano's analysis. */
function conTimer(m: Record<string, Riga[]>): Record<string, Riga[]> {
  m.pm_tempo.push({
    id: TIMER,
    profile_id: IO,
    progetto_id: STEFANO,
    task_id: TASK(2, 1),
    data: oggiRoma(),
    minuti: null,
    nota: 'Analisi',
    inizio: new Date(Date.now() - 30 * 60_000 - 5_000).toISOString(),
    fine: null,
    created_at: new Date().toISOString(),
    progetto: { nome: 'Stefano Moretti' },
    task: { titolo: 'Analisi e strategia iniziale' },
  })
  return m
}

async function anteprimaCoach(nome: string, input: Record<string, unknown>, righe = mondoCoach()) {
  return anteprimaScrittura(supabaseFinto(righe) as never, profiloDi('coach'), 'employee', nome, input)
}

describe('il tempo dei collaboratori con Alfire (03/10/2026)', () => {
  const IERI = aggiungiGiorni(oggiRoma(), -1)

  it('chi riceve cosa (elenchi fissati): ogni ruolo dei progetti ha il tempo, nessuno strumento sui soldi', () => {
    const lavora = ['guida', 'proponi_risposte', 'progetti', 'progetto_dettaglio', 'miei_task', 'mio_tempo', 'task', 'nota_progetto', 'tempo']
    // marketing gets the video editor's tools: nothing on the calendar yet (1.32.0)
    for (const ruolo of ['coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      expect(strumentiConsentiti(ruolo, 'employee'), ruolo).toEqual(lavora)
      expect(strumentiConsentiti(ruolo, 'manager'), ruolo).toEqual([...lavora.slice(0, 6), 'progetto', 'lista', ...lavora.slice(6)])
    }
  })

  it('lo schema del tempo: task_id per i titoli ripetuti, nuovo_task per spostare una voce, mai una persona', async () => {
    const campi = await campiDi(strumenti('coach', 'employee'), 'tempo')
    expect(campi).toEqual(expect.arrayContaining(['progetto', 'task', 'task_id', 'nuovo_task', 'data', 'durata', 'dalle', 'alle', 'nota', 'voce_id']))
    for (const c of ['persona', 'profile_id', 'chi']) expect(campi).not.toContain(c)
    const d = strumenti('coach', 'employee').tempo.description ?? ''
    expect(d).toContain('per un’altra persona non si registra, dillo')
    expect(d).toContain('Ogni cliente ha un progetto col suo nome')
    expect(d).toContain('Revisione video')
  })

  it('ogni data che il modello scrive porta il formato AAAA-MM-GG nella sua descrizione', async () => {
    const DATE = /^(data|da|a|data_inizio|data_fine|scadenza|data_vendita|nuova_data_vendita|ultimo_giorno|pagato_il|valida_dal|valida_al|alla_data|incassata_il)$/
    type Schema = { properties?: Record<string, Schema>; items?: Schema; description?: string; type?: string | string[] }
    const senzaFormato: string[] = []
    const visita = (nome: string, schema: Schema, percorso: string) => {
      for (const [campo, figlio] of Object.entries(schema.properties ?? {})) {
        if (DATE.test(campo) && (figlio.type === 'string' || figlio.type === undefined) && !figlio.description?.startsWith('AAAA-MM-GG')) {
          senzaFormato.push(`${nome}.${percorso}${campo}: ${figlio.description}`)
        }
        visita(nome, figlio, `${percorso}${campo}.`)
        if (figlio.items) visita(nome, figlio.items, `${percorso}${campo}[].`)
      }
    }
    for (const [ruolo, livello] of [['admin', 'admin'], ['setter', 'employee'], ['closer', 'employee'], ['coach', 'employee']] as const) {
      const s = strumenti(ruolo, livello)
      for (const nome of Object.keys(s)) visita(nome, (await asSchema(s[nome].inputSchema).jsonSchema) as Schema, '')
    }
    expect(senzaFormato).toEqual([])
  })

  it('una data scritta in un altro formato non diventa mai il mese in corso: lo strumento lo dice', async () => {
    const atteso = DATA_SBAGLIATA
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'mio_tempo', { da: '28/09/2026' })).toEqual(atteso)
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'mio_tempo', { da: 'lunedì', a: oggiRoma() })).toEqual(atteso)
    expect(await esegui(strumenti(), 'tempo_team', { da: '2026-09-28', a: '03/10/2026' })).toEqual(atteso)
    expect(await esegui(strumenti(), 'numeri_periodo', { da: '01/09/2026' })).toEqual(atteso)
    expect(rpcChiamate).toEqual([])
  })

  it('mio_tempo: le voci dalla più recente, come Il mio tempo, e i totali per giorno dal SQL', async () => {
    const righe = mondoCoach()
    righe.pm_riepilogo_tempo = [
      { livello: 'giorno', data: IERI, progetto_id: null, progetto: null, minuti: 135, voci: 2 },
      { livello: 'progetto', data: null, progetto_id: SERGIO, progetto: 'Sergio Bellini', minuti: 135, voci: 2 },
      { livello: 'totale', data: null, progetto_id: null, progetto: null, minuti: 135, voci: 2 },
    ]
    const esito = (await esegui(strumenti('coach', 'employee', righe), 'mio_tempo', { ultimi_giorni: 7 })) as {
      voci: { voce_id: string; task: string; fascia: string | null }[]
      per_giorno: unknown
    }
    expect(esito.voci.map((v) => v.voce_id)).toEqual([VOCE_VIDEO, VOCE_CALL])
    expect(esito.voci[0]).toMatchObject({ task: 'Revisione video', fascia: '15:00–16:30' })
    expect(esito.per_giorno).toEqual([{ data: IERI, minuti: 135, durata: '2 h 15 min' }])
  })

  it('«correggi la voce di ieri»: due voci, la domanda le dice dalla più recente, con task e fascia', async () => {
    const dubbio = (await anteprimaCoach('tempo', { azione: 'modifica', progetto: 'Sergio Bellini', data: IERI, durata: '1h' })) as {
      errore: string
      per_alfire: string
    }
    expect(spazi(dubbio.errore)).toBe(
      `Più voci possibili, dalla più recente: ${giornoEsteso(IERI)}, 1 h 30 min su «Sergio Bellini» · Revisione video, 15:00–16:30; ` +
        `${giornoEsteso(IERI)}, 45 min su «Sergio Bellini» · Call di check.`,
    )
    expect(dubbio.per_alfire).toBe('Chiedi quale (o passa il voce_id da mio_tempo).')
    expect(a.modificaTempo).not.toHaveBeenCalled()
  })

  it('il task detto trova la voce, senza spostarla: la scheda dice quale voce e cosa cambia', async () => {
    const p = await anteprimaCoach('tempo', { azione: 'modifica', progetto: 'Sergio Bellini', task: 'revisione video', data: IERI, durata: '1h' })
    expect(p).toMatchObject({
      titolo: 'Correggo 1 h 30 min del tuo tempo su «Sergio Bellini» · Revisione video',
      righe: [`Voce: ${giornoEsteso(IERI)}, 15:00–16:30`, 'Fascia: 15:00–16:30 → tolta', 'Durata: 1 h 30 min → 1 h'],
    })
    // a title every client has, said without the project: the entries say whose it is
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'modifica', task: 'Call di check', data: IERI, durata: '30 min' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ id: VOCE_CALL, task_id: TASK(1, 5), durata: '30 min' }))
  })

  it('nuovo_task sposta la voce, e la scheda lo dice prima → dopo', async () => {
    const p = await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_task: 'assistenza in chat' })
    expect(p).toMatchObject({ righe: [`Voce: ${giornoEsteso(IERI)}`, 'Task: Call di check → Assistenza chat'] })
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_task: 'assistenza in chat' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ id: VOCE_CALL, task_id: TASK(1, 6), durata: 45 }))
  })

  it('il timer acceso non è una voce: niente «Elimino 0 min», la scheda dice di fermarlo', async () => {
    const m = conTimer(mondoCoach())
    const atteso = {
      errore: 'Non c’è una voce chiusa: il tempo che corre è il timer acceso su «Stefano Moretti». Fermalo, poi correggi la voce.',
      per_alfire: 'Per fermarlo: tempo, azione ferma.',
    }
    expect(await anteprimaCoach('tempo', { azione: 'elimina', progetto: 'Stefano Moretti', data: oggiRoma() }, m)).toEqual(atteso)
    expect(await esegui(strumenti('coach', 'employee', conTimer(mondoCoach())), 'tempo', { azione: 'elimina', data: oggiRoma() })).toEqual(atteso)
    expect(a.eliminaTempo).not.toHaveBeenCalled()
  })

  it('fermare il timer: da quanto va e quale nota resta', async () => {
    const p = (await anteprimaCoach('tempo', { azione: 'ferma', nota: 'Fatta la call' }, conTimer(mondoCoach()))) as { titolo: string; righe: string[] }
    expect(p.titolo).toBe('Fermo il timer su «Stefano Moretti» · Analisi e strategia iniziale')
    expect(p.righe).toEqual([expect.stringMatching(/^Acceso dalle \d{2}:\d{2}, finora circa 30 min$/), 'Nota: Fatta la call (al posto di «Analisi»)'])
    const senzaNota = (await anteprimaCoach('tempo', { azione: 'ferma' }, conTimer(mondoCoach()))) as { righe: string[] }
    expect(senzaNota.righe[1]).toBe('Nota: Analisi')
  })

  it.each([
    ['altre attivita', 'Altre attività'],
    ['call check', 'Call di check'],
    ['le call di check', 'Call di check'],
    ['programmazione dell’allenamento', 'Programmazione allenamento (creazione e aggiornamenti)'],
    ['analisi iniziale', 'Analisi e strategia iniziale'],
    ['revisione dei video', 'Revisione video'],
    ['assistenza in chat', 'Assistenza chat'],
  ])('il task detto a voce «%s» è «%s»', async (detto, titolo) => {
    const p = (await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Sergio', task: detto, durata: '30 min' })) as { righe: string[] }
    expect(p.righe).toContain(`Task: ${titolo}`)
  })

  it('un task che non c’è: l’errore elenca i task del progetto', async () => {
    expect(await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Sergio Bellini', task: 'dieta', durata: '30 min' })).toEqual({
      errore: `Task "dieta" non trovato nel progetto. Task del progetto: ${PERCORSO.join(', ')}.`,
    })
  })

  it('il task da solo basta quando è uno; un titolo di tutti i clienti fa chiedere quale progetto', async () => {
    const m = mondoCoach()
    m.v_pm_task.push({ ...taskDelPercorso(1, PROGETTO)[0], id: TASK(1, 20), titolo: 'Copertina reel' })
    await esegui(strumenti('coach', 'employee', m), 'tempo', { azione: 'registra', task: 'copertina', durata: '20 min' })
    expect(a.registraTempo).toHaveBeenLastCalledWith(expect.objectContaining({ progetto_id: PROGETTO, task_id: TASK(1, 20), durata: '20 min' }))

    expect(await anteprimaCoach('tempo', { azione: 'avvia', task: 'Revisione video' })).toEqual({
      errore: 'Più task possibili: «Revisione video» in Sergio Bellini; «Revisione video» in Stefano Moretti.',
      per_alfire: 'Chiedi quale (il progetto, o passa il task_id da progetto_dettaglio o miei_task).',
    })
    // the task_id the question points to: that task, in its project
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'avvia', task_id: TASK(2, 4) })
    expect(a.avviaTimer).toHaveBeenLastCalledWith({ progetto_id: STEFANO, task_id: TASK(2, 4), nota: undefined })
    // never a task of another project than the one said
    expect(await anteprimaCoach('tempo', { azione: 'avvia', progetto: 'Sergio Bellini', task_id: TASK(2, 4) })).toEqual({
      errore: 'Task non trovato tra quelli che vedi.',
    })
    expect(await anteprimaCoach('tempo', { azione: 'registra', durata: '30 min' })).toEqual({
      errore: 'Dimmi il progetto (quello di un cliente porta il suo nome) e, se vuoi, il task.',
    })
  })

  it('tra due task con lo stesso titolo vince quello aperto; uno completato la scheda lo dice', async () => {
    const m = mondoCoach()
    m.v_pm_task.push({ ...m.v_pm_task[5], id: TASK(1, 21), stato: 'completato' })
    m.v_pm_task[0] = { ...m.v_pm_task[0], stato: 'completato' }
    await esegui(strumenti('coach', 'employee', m), 'tempo', { azione: 'registra', progetto: 'Sergio Bellini', task: 'Call di check', durata: '15 min' })
    expect(a.registraTempo).toHaveBeenLastCalledWith(expect.objectContaining({ task_id: TASK(1, 5) }))
    expect(await anteprimaCoach('tempo', { azione: 'avvia', progetto: 'Sergio Bellini', task: 'call di onboarding' }, m)).toMatchObject({
      titolo: 'Avvio il timer su «Sergio Bellini» · Call di onboarding (task completato)',
    })
  })

  it('la scheda di registra: del tuo tempo, il giorno col suo nome', async () => {
    expect(
      await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Sergio Bellini', task: 'Call di check', data: '2026-09-28', durata: '45 min' }),
    ).toMatchObject({
      titolo: `Registro 45 min del tuo tempo su «Sergio Bellini», ${giornoEsteso('2026-09-28')}`,
      righe: ['Task: Call di check'],
    })
  })
})

describe('task e note: la scheda si ferma prima del tocco quando l’app non lo permette (03/10/2026)', () => {
  function conAltri(): Record<string, Riga[]> {
    const m = mondoCoach()
    m.v_pm_task.push({ ...taskDelPercorso(1, SERGIO)[0], id: TASK(1, 22), titolo: 'Brief del cliente', assegnatari: [LORENZO] })
    m.pm_note = [{ id: '7c000000-0000-4000-8000-000000000001', progetto_id: SERGIO, data: '2026-10-01', testo: 'Nota di Lorenzo', autore_id: LORENZO }]
    return m
  }

  it('completare un task: la scheda dice di quale progetto', async () => {
    expect(await anteprimaCoach('task', { azione: 'completa', titolo: 'Revisione video', progetto: 'Sergio Bellini' })).toMatchObject({
      titolo: 'Segno come fatto il task «Revisione video»',
      righe: ['Progetto: Sergio Bellini'],
    })
  })

  it('un task né suo né assegnato a lui, o da eliminare senza averlo creato: lo dice prima del tocco', async () => {
    expect(await anteprimaCoach('task', { azione: 'completa', titolo: 'Brief del cliente', progetto: 'Sergio' }, conAltri())).toEqual({
      errore: 'Puoi lavorare solo i task assegnati a te o creati da te: chiedi a chi gestisce il progetto.',
    })
    expect(await anteprimaCoach('task', { azione: 'elimina', titolo: 'Revisione video', progetto: 'Sergio' }, conAltri())).toEqual({
      errore: 'Puoi eliminare solo i task creati da te: chiedi a chi gestisce il progetto.',
    })
    await esegui(strumenti('coach', 'employee', conAltri()), 'task', { azione: 'elimina', titolo: 'Revisione video', progetto: 'Sergio' })
    expect(a.eliminaTask).not.toHaveBeenCalled()
    // the projects' admin manages them all
    expect(await anteprima('task', { azione: 'elimina', titolo: 'Revisione video', progetto: 'Sergio' }, 'admin', conAltri())).toMatchObject({
      titolo: 'Elimino il task «Revisione video»',
    })
  })

  it('la nota di un altro non si corregge né si elimina', async () => {
    expect(await anteprimaCoach('nota_progetto', { azione: 'elimina', progetto: 'Sergio Bellini', data: '2026-10-01' }, conAltri())).toEqual({
      errore: 'Puoi correggere o eliminare solo le tue note: questa l’ha scritta un’altra persona.',
    })
    expect(await anteprima('nota_progetto', { azione: 'elimina', progetto: 'Sergio Bellini', data: '2026-10-01' }, 'admin', conAltri())).toMatchObject({
      titolo: 'Elimino la nota del 01/10/2026 di «Sergio Bellini»',
    })
  })
})

describe('«Scegli il coach» da Alfire, come nella pagina del progetto (03/10/2026)', () => {
  function conRuolo(): Record<string, Riga[]> {
    const m = mondoCoach()
    m.pm_task = [
      { progetto_id: STEFANO, titolo: PERCORSO[3], per_ruolo: 'nutrizione', parent_id: null, ordine: 4, assegnatari: [] },
    ]
    return m
  }

  it('solo chi gestisce i progetti lo riceve', async () => {
    expect(await azioniDi(strumenti(), 'progetto')).toContain('scegli_coach')
    expect(await campiDi(strumenti('coach', 'manager'), 'progetto')).toContain('coach')
    expect(Object.keys(strumenti('coach', 'employee'))).not.toContain('progetto')
  })

  it('la scheda dice cosa succede, come il foglio della pagina; poi la stessa azione', async () => {
    expect(await anteprima('progetto', { azione: 'scegli_coach', progetto: 'Stefano Moretti', coach: 'Marco' }, 'admin', conRuolo())).toEqual({
      titolo: 'Marco Coach diventa il coach di «Stefano Moretti»',
      righe: [
        'Entra nel progetto e prende i task del cliente ancora senza nessuno: ci registra il tempo.',
        `«${PERCORSO[3]}» va a Nina Nutri (Nutrizione).`,
        'I task a cui lavorano già altre persone restano a loro.',
      ],
      sostituisceDettagli: true,
    })
    const esito = await esegui(strumenti('admin', 'admin', conRuolo()), 'progetto', { azione: 'scegli_coach', progetto: 'Stefano Moretti', coach: 'Marco' })
    expect(a.scegliCoach).toHaveBeenCalledWith({ progetto_id: STEFANO, profile_id: MARCO })
    expect(esito).toMatchObject({ fatto: true, coach: 'Marco Coach' })
  })

  it('un progetto senza cliente, o lo stesso coach: niente da confermare', async () => {
    expect(await anteprima('progetto', { azione: 'scegli_coach', progetto: 'Reel', coach: 'Marco' }, 'admin', conRuolo())).toEqual({
      errore: 'Il coach si sceglie solo nei progetti dei clienti: «Reel settembre» non ne ha uno.',
    })
    expect(await anteprima('progetto', { azione: 'scegli_coach', progetto: 'Sergio Bellini', coach: 'io' }, 'admin', conRuolo())).toEqual({
      errore: 'Dany Montagnolo è già il coach di «Sergio Bellini».',
    })
  })
})

describe('la cartella Drive del cliente in progetto_dettaglio (05/10/2026)', () => {
  // Sergio's coach is whoever chats (IO), Stefano's project has no coach; both clients have a folder
  function conCartelle(): Record<string, Riga[]> {
    const m = mondoCoach()
    m.clienti_cartelle = [
      { client_id: 'cl-a1', url: 'https://drive.google.com/drive/folders/sergio' },
      { client_id: 'cl-a2', url: 'https://drive.google.com/drive/folders/stefano' },
    ]
    return m
  }

  it('il coach del cliente legge il link nel suo progetto, mai in quello di un cliente di cui non è il coach', async () => {
    const s = strumenti('coach', 'employee', conCartelle())
    expect(await esegui(s, 'progetto_dettaglio', { progetto: 'Sergio Bellini' })).toMatchObject({
      cartella_drive: { link: 'https://drive.google.com/drive/folders/sergio' },
    })
    expect(await esegui(s, 'progetto_dettaglio', { progetto: 'Stefano Moretti' })).not.toHaveProperty('cartella_drive')
  })

  it('l’admin lo legge in ogni progetto di un cliente; senza link lo dice, senza cliente niente', async () => {
    const m = conCartelle()
    m.clienti_cartelle = m.clienti_cartelle.slice(0, 1)
    const s = strumenti('admin', 'admin', m)
    expect(await esegui(s, 'progetto_dettaglio', { progetto: 'Sergio Bellini' })).toMatchObject({
      cartella_drive: { link: 'https://drive.google.com/drive/folders/sergio' },
    })
    expect(await esegui(s, 'progetto_dettaglio', { progetto: 'Stefano Moretti' })).toMatchObject({
      cartella_drive: 'Nessuna cartella collegata: si collega dalla pagina del progetto, «Cartella Drive».',
    })
    expect(await esegui(s, 'progetto_dettaglio', { progetto: 'Reel settembre' })).not.toHaveProperty('cartella_drive')
  })

  it('chi non è il coach, anche nel team del progetto, non la chiede nemmeno al database', async () => {
    for (const [ruolo, livello] of [
      ['editor', 'employee'],
      ['coach', 'manager'],
      ['closer', 'employee'],
      ['setter', 'employee'],
    ] as const) {
      const registro: string[] = []
      const m = conCartelle()
      // Sergio's coach is someone else: whoever chats is only a member
      m.v_pm_progetti = m.v_pm_progetti.map((p) => (p.id === SERGIO ? { ...p, coach_id: MARCO } : p))
      const esito = await esegui(strumenti(ruolo, livello, m, registro), 'progetto_dettaglio', { progetto: 'Sergio Bellini' })
      expect(esito, ruolo).not.toHaveProperty('cartella_drive')
      expect(registro.some((r) => r.startsWith('clienti_cartelle.')), ruolo).toBe(false)
    }
  })

  it('una lettura del link che fallisce non vale «nessuna cartella», e il resto del progetto resta', async () => {
    const s = strumenti('coach', 'employee', conCartelle(), [], ['clienti_cartelle'])
    const esito = await esegui(s, 'progetto_dettaglio', { progetto: 'Sergio Bellini' })
    expect(esito).toMatchObject({ progetto: { nome: 'Sergio Bellini' }, cartella_drive: CARTELLA_NON_LETTA })
    expect(esito).not.toHaveProperty('errore')
    expect(CARTELLA_NON_LETTA).not.toMatch(/nessuna/i)
  })

  it('nessuno scrive la cartella da Alfire', () => {
    for (const [ruolo, livello] of [
      ['admin', 'admin'],
      ['coach', 'manager'],
      ['coach', 'employee'],
    ] as const) {
      expect(Object.keys(strumenti(ruolo, livello)).filter((n) => /cartell|drive/i.test(n)), ruolo).toEqual([])
    }
  })
})

describe('elenchi lunghi: lo dicono (03/10/2026)', () => {
  it('miei_task e progetti oltre il limite: un elenco parziale lo dice', async () => {
    const m = mondoCoach()
    m.v_pm_task = Array.from({ length: 45 }, (_, i) => ({ ...taskDelPercorso(1, SERGIO)[0], id: `t-${i}`, titolo: `Task ${i}` }))
    const task = (await esegui(strumenti('coach', 'employee', m), 'miei_task', {})) as { task: unknown[]; nota: string }
    expect(task.task).toHaveLength(40)
    expect(task.nota).toMatch(/^Elenco parziale: qui i primi 40/)
    m.v_pm_progetti = Array.from({ length: 41 }, (_, i) => ({ ...m.v_pm_progetti[0], id: `p-${i}`, nome: `Cliente ${String(i).padStart(2, '0')}` }))
    const progetti = (await esegui(strumenti('coach', 'employee', m), 'progetti', {})) as { progetti: unknown[]; nota: string }
    expect(progetti.progetti).toHaveLength(40)
    expect(progetti.nota).toMatch(/^Elenco parziale/)
    // within the limit, no note
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'miei_task', {})).not.toHaveProperty('nota')
  })
})

describe('la guida: ogni ruolo legge la sua parte (03/10/2026)', () => {
  it('gli argomenti per ruolo, fissati', async () => {
    expect(await azioniDi(strumenti('coach', 'employee'), 'guida', 'argomento')).toEqual(['progetti', 'alfire', 'permessi'])
    expect(await azioniDi(strumenti('setter', 'employee'), 'guida', 'argomento')).toEqual(['setting', 'call', 'provvigioni', 'progetti', 'alfire', 'permessi'])
    expect(await azioniDi(strumenti('closer', 'employee'), 'guida', 'argomento')).toEqual(['call', 'vendite', 'incassi', 'progetti', 'alfire', 'permessi'])
    expect(await azioniDi(strumenti(), 'guida', 'argomento')).toContain('panoramica')
    // the Marketing area (1.32.0): the video editor and marketing, and the admin with every topic
    for (const ruolo of ['editor', 'marketing'] as const) {
      expect(await azioniDi(strumenti(ruolo, 'employee'), 'guida', 'argomento'), ruolo).toEqual(['marketing', 'progetti', 'alfire', 'permessi'])
    }
    expect(await azioniDi(strumenti(), 'guida', 'argomento')).toContain('marketing')
    for (const ruolo of ['setter', 'closer', 'coach', 'nutrizione', 'dev'] as const) {
      expect(await azioniDi(strumenti(ruolo, 'employee'), 'guida', 'argomento'), ruolo).not.toContain('marketing')
    }
  })

  it('cosa fa Alfire, per chi chiede: al coach mai la lista dei soldi dell’admin', async () => {
    const coach = (await esegui(strumenti('coach', 'employee'), 'guida', { argomento: 'alfire' })) as { testo: string }
    expect(coach.testo).toContain('avvia e ferma il timer')
    for (const parola of ['rate', 'costi', 'provvigioni', 'vendite', 'obiettivi', 'ricevuta']) expect(coach.testo, parola).not.toContain(parola)
    const admin = (await esegui(strumenti(), 'guida', { argomento: 'alfire' })) as { testo: string }
    expect(admin.testo).toContain('pagamenti e regole delle provvigioni')
    expect(admin.testo).toContain('il tempo del team')
    expect(admin.testo).toContain('(una ricevuta come costo, un piano di rate)')
    // what a file can become, for who asks: the setter writes no costs or instalments, the closer no costs
    const setter = (await esegui(strumenti('setter', 'employee'), 'guida', { argomento: 'alfire' })) as { testo: string }
    expect(setter.testo).toContain('(i numeri del tuo report da uno screenshot)')
    for (const parola of ['costo', 'costi', 'rate', 'ricevuta']) expect(setter.testo, parola).not.toContain(parola)
    const closer = (await esegui(strumenti('closer', 'employee'), 'guida', { argomento: 'alfire' })) as { testo: string }
    expect(closer.testo).toContain('(il piano di rate di una vendita che registri)')
    for (const parola of ['costo', 'costi', 'ricevuta']) expect(closer.testo, parola).not.toContain(parola)
    expect(coach.testo).toContain('(task e note di un progetto)')
  })

  it('ogni ruolo legge i testi che lo riguardano, dal suo lato: mai i soldi a chi lavora solo nei progetti', async () => {
    const testo = async (ruolo: AppRole, argomento: string) =>
      ((await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'guida', { argomento })) as { testo: string }).testo
    for (const ruolo of ['coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      const permessi = await testo(ruolo, 'permessi')
      expect(permessi, ruolo).toContain('Il tempo è il tuo')
      // who manages a project sees the others' time there (section 18): never "nobody sees it"
      expect(permessi, ruolo).toContain('Quello degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto; Alfire non lo legge.')
      // the coach of a client's project sees and links its Drive folder (05/10/2026)
      expect(permessi, ruolo).toContain('Nei progetti di cui sei il coach vedi anche la cartella Drive')
      for (const parola of ['provvigion', 'incass', 'vendit', 'cliente', 'setter', 'closer', 'margine', 'costi', 'soldi']) {
        expect(permessi, `${ruolo}: ${parola}`).not.toContain(parola)
      }
    }
    // the setter: his own commission, never the rules or another person's
    const provvigioni = await testo('setter', 'provvigioni')
    expect(provvigioni).toContain('Le tue provvigioni')
    expect(provvigioni).toContain('dei clienti nuovi che hai portato tu')
    for (const parola of ['Regole provvigioni', 'Impostazioni', 'percentuale', 'Si registra il pagamento al setter']) {
      expect(provvigioni, parola).not.toContain(parola)
    }
    expect(await testo('setter', 'permessi')).toContain('la sua provvigione su ogni incasso')
    expect(await testo('setter', 'permessi')).not.toContain('Il closer vede')
    for (const ruolo of ['setter', 'closer'] as const) {
      expect(await testo(ruolo, 'permessi'), ruolo).toContain('il tempo degli altri solo nei progetti che gestisce, nella scheda Tempo del progetto')
    }
    // the closer: his own sales and cash-ins, never the admin's pages
    const vendite = await testo('closer', 'vendite')
    expect(vendite).toContain('Le tue vendite (Le mie vendite, /my-sales)')
    expect(vendite).not.toContain('Vendite (/sales)')
    const incassi = await testo('closer', 'incassi')
    expect(incassi).toContain('Gli incassi delle tue vendite')
    expect(incassi).not.toContain('/payments')
    expect(await testo('closer', 'permessi')).not.toContain('Il setter vede')
    // the admin reads the whole guide, as it is
    expect(await testo('admin', 'provvigioni')).toContain('Regole provvigioni')
    expect(await testo('admin', 'incassi')).toContain('Incassi (/payments)')
  })

  it('l’area Marketing (1.32.0): video editor e marketing leggono il calendario e i loro permessi, gli altri no', async () => {
    const testo = async (ruolo: AppRole, argomento: string) =>
      ((await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'guida', { argomento })) as { testo: string }).testo
    for (const ruolo of ['editor', 'marketing'] as const) {
      const permessi = await testo(ruolo, 'permessi')
      expect(permessi, ruolo).toContain('nell’area Marketing vedi, crei e modifichi il calendario dei contenuti di Instagram')
      expect(permessi, ruolo).toContain('lo eliminano l’admin e il marketing')
      expect(permessi, ruolo).toContain('I messaggi diretti e i nomi di chi scrive all’account non li vedi.')
      expect(permessi, ruolo).toContain('L’area Economics non è del tuo ruolo.')
      const contenuti = await testo(ruolo, 'marketing')
      expect(contenuti, ruolo).toContain('Piano editoriale (area Marketing, /marketing/contenuti')
      for (const parola of ['Name, Reel Type, Format, Inspiration, Status, Post Date, Audio, URL, View Count', 'Reel Topic', 'Carousel Topic']) {
        expect(contenuti, `${ruolo}: ${parola}`).toContain(parola)
      }
      expect(contenuti, ruolo).toContain('Alfire per ora non legge e non scrive i contenuti né i post di Instagram.')
      // the panel, the cells and the posts of Instagram (1.33.0)
      for (const parola of ['apre il contenuto in un pannello a lato', 'dalla sua cella', 'Pubblicati (/marketing/pubblicati', '«Collega»', '«Scollega»', 'si compila e si aggiorna da solo dalle views di Instagram', '«Aggiorna da Instagram» rilegge subito i post (admin e marketing)']) {
        expect(contenuti, `${ruolo}: ${parola}`).toContain(parola)
      }
      for (const parola of ['provvigion', 'incass', 'vendit', 'cliente', 'margine', 'costi', 'soldi', 'prezz']) {
        expect(contenuti, `${ruolo}: ${parola}`).not.toContain(parola)
      }
      expect(await testo(ruolo, 'alfire'), ruolo).toContain('Il calendario dei contenuti e i post di Instagram (area Marketing) per ora no')
    }
    for (const ruolo of ['coach', 'nutrizione', 'dev'] as const) {
      const permessi = await testo(ruolo, 'permessi')
      expect(permessi, ruolo).toContain('Le altre aree del gestionale non sono del tuo ruolo.')
      expect(permessi, ruolo).not.toContain('Marketing')
      expect(await testo(ruolo, 'alfire'), ruolo).not.toContain('calendario dei contenuti')
    }
    // the admin reads the topic as it is, and who sees the area in his permissions
    expect(await testo('admin', 'marketing')).toContain('Eliminano un contenuto l’admin e il marketing; il video editor lo segna Canceled.')
    expect(await testo('admin', 'permessi')).toContain('Il ruolo Marketing (e il video editor) vede l’area Marketing, il calendario dei contenuti')
    expect(await testo('admin', 'permessi')).toContain('Permessi: l’admin vede tutto.')
    expect(await testo('admin', 'alfire')).toContain('Il calendario dei contenuti e i post di Instagram (area Marketing) per ora no')
    expect(await testo('marketing', 'alfire')).toContain('(task e note di un progetto)')
  })

  it('i progetti dal lato di chi legge: Tempo › Team e Impostazioni solo all’admin', async () => {
    const testo = async (ruolo: AppRole) =>
      ((await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'guida', { argomento: 'progetti' })) as { testo: string }).testo
    for (const ruolo of ['coach', 'editor', 'marketing', 'nutrizione', 'dev', 'setter', 'closer'] as const) {
      const progetti = await testo(ruolo)
      expect(progetti, ruolo).toContain('Il tuo tempo lo dichiari tu')
      expect(progetti, ruolo).toContain('Il tempo degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto')
      expect(progetti, ruolo).toContain('«Scegli il coach»')
      for (const parola of ['/tempo/team', 'Impostazioni', 'L’admin', 'per l’admin']) expect(progetti, `${ruolo}: ${parola}`).not.toContain(parola)
    }
    const admin = await testo('admin')
    expect(admin).toContain('L’admin ha anche la scheda Team (/tempo/team)')
    expect(admin).toContain('Reparti e modelli in Impostazioni › Progetti.')
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
    righe.miei_numeri_periodo = [{ dm_totali: 40, call_fissate: 8, call_prenotate: 5 }]

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
    expect(numeri).toMatchObject({ numeri: { dm_totali: 40, call_prenotate: 5, in_agenda_nel_periodo: 8 } })
    // never «call_fissate»: it reads as his bookings, and the follow-up calls the closer booked are in it
    expect(numeri.numeri).not.toHaveProperty('call_fissate')
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
    // same day, same created_at: the id decides, as for the candidates of a correction (trovaVoce)
    expect((conTimer.voci as { voce_id: string }[]).map((v) => v.voce_id)).toEqual(['t1', 't0'])
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
      errore: 'Più persone possibili per "Loris": Loris Rossi (Coach, non più attivo); Loris Setter (Setter).',
      per_alfire: 'Chiedi quale, e cercala scritta come qui.',
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
        'Loris Setter (Setter, non più attivo).',
      per_alfire: 'Chiedi quale, e cercala scritta come qui.',
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
    // "del tuo tempo", and the weekday: a day the model worked out wrong shows (03/10/2026)
    expect(p).toMatchObject({ titolo: `Registro 1 h 30 min del tuo tempo su «Reel settembre», ${giornoEsteso('2026-09-28')}` })
    expect(giornoEsteso('2026-09-28', '2026-10-03')).toBe('lunedì 28/09/2026')
    expect((p as { righe: string[] }).righe).toContain('Fascia: 09:00–10:30')

    expect(await anteprima('tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '9:00' }, 'coach')).toEqual({
      errore: 'Indica sia l’inizio sia la fine, o nessuno dei due',
    })
    expect(
      await anteprima('tempo', { azione: 'registra', progetto: 'Reel', data: '2026-09-28', dalle: '10:30', alle: '09:00' }, 'coach'),
    ).toEqual({
      errore:
        'L’ora di fine deve essere dopo quella di inizio. Se passa la mezzanotte sono due voci: nel giorno dell’inizio 13 h 30 min come durata, senza fascia (dalle 10:30 a mezzanotte), e nel giorno dopo la fascia 00:00–09:00',
    })

    // the entry typed as 1 h 30 min gets a range: before → after, and the minutes it gives
    const righe = mondo()
    righe.pm_tempo[0] = { ...righe.pm_tempo[0], id: '6a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d' }
    const m = await anteprima('tempo', { azione: 'modifica', progetto: 'Reel', data: '2026-09-28', dalle: '14:00', alle: '16:00' }, 'coach', righe)
    expect(m).toMatchObject({ righe: [`Voce: ${giornoEsteso('2026-09-28')}`, 'Fascia: – → 14:00–16:00', 'Durata: 1 h 30 min → 2 h'] })
  })

  it('tempo: il timer senza fascia di un giorno la perde sulla scheda solo se cambiano giorno o durata', async () => {
    const VOCE = '6a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
    // 23:30–00:30 across midnight, 60 minutes
    const notte = mondo()
    notte.pm_tempo[0] = { ...notte.pm_tempo[0], id: VOCE, minuti: 60, inizio: '2026-09-28T21:30:00.000Z', fine: '2026-09-28T22:30:00.000Z' }
    const voce = `Voce: ${giornoEsteso('2026-09-28')}`
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, durata: '2h' }, 'coach', notte)).toMatchObject({
      righe: [`${voce}, 23:30–00:30, a cavallo della mezzanotte`, 'Fascia: 23:30–00:30, a cavallo della mezzanotte → tolta', 'Durata: 1 h → 2 h'],
    })
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, nota: 'Consegna' }, 'coach', notte)).toMatchObject({
      righe: [`${voce}, 23:30–00:30, a cavallo della mezzanotte`, 'Nota: – → Consegna'],
    })

    // started and stopped within 09:00: the note changes, nothing blocks the card
    const breve = mondo()
    breve.pm_tempo[0] = { ...breve.pm_tempo[0], id: VOCE, minuti: 1, inizio: '2026-09-28T07:00:05.000Z', fine: '2026-09-28T07:00:50.000Z' }
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, nota: 'Cambio di task' }, 'coach', breve)).toMatchObject({
      righe: [`${voce}, 09:00–09:00, meno di un minuto`, 'Nota: – → Cambio di task'],
    })

    // a range the forms show, taken away
    const conFascia = mondo()
    conFascia.pm_tempo[0] = { ...conFascia.pm_tempo[0], id: VOCE, inizio: '2026-09-28T07:00:00.000Z', fine: '2026-09-28T08:30:00.000Z' }
    expect(await anteprima('tempo', { azione: 'modifica', voce_id: VOCE, dalle: 'nessuna' }, 'coach', conFascia)).toMatchObject({
      righe: [`${voce}, 09:00–10:30`, 'Fascia: 09:00–10:30 → tolta'],
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

  it('il report del setter dall’08/10/2026: la scheda ricorda il commento obbligatorio che manca, mai all’admin', async () => {
    const MANCA = 'Manca il commento della giornata'
    const righe = mondo()
    // his day of 08/10/2026: quality and what held them back are there, lead in target is not
    righe.setter_daily_reports = righe.setter_daily_reports.map((r) => ({ ...r, setter_id: IO, data: '2026-10-08' }))
    const p = await anteprima('aggiorna_report', { data: '2026-10-08', modalita: 'aggiungi', dm_outbound: 5 }, 'setter', righe)
    expect(p).toMatchObject({
      righe: [
        'C’è già: lo correggo.',
        'DM outbound: 10 → 15',
        `${MANCA}: lead in target. Il report si salva lo stesso, ma la giornata resta da completare.`,
      ],
    })
    // the three answers there: nothing to remind
    const completo = await anteprima(
      'aggiorna_report',
      { data: '2026-10-08', modalita: 'aggiungi', dm_outbound: 5, lead_in_target: 'pochi' },
      'setter',
      righe,
    )
    expect(JSON.stringify(completo)).not.toContain(MANCA)
    // a new day of his, numbers only: every answer missing, said in the form's words
    const nuovo = await anteprima('aggiorna_report', { data: '2026-10-09', modalita: 'imposta', conversazioni: 3 }, 'setter', righe)
    expect(JSON.stringify(nuovo)).toContain(
      `${MANCA}: lead in target, qualità delle conversazioni, cosa frenava i lead.`,
    )
    // a day without DM or conversations: nothing is required
    const senza = await anteprima('aggiorna_report', { data: '2026-10-09', modalita: 'imposta', call_proposte: 2 }, 'setter', righe)
    expect(JSON.stringify(senza)).not.toContain(MANCA)
    // a day before 08/10/2026 keeps the rule it had: never required
    const prima = mondo()
    prima.setter_daily_reports = prima.setter_daily_reports.map((r) => ({ ...r, setter_id: IO }))
    const vecchio = await anteprima('aggiorna_report', { data: '2026-09-26', modalita: 'aggiungi', dm_outbound: 5 }, 'setter', prima)
    expect(JSON.stringify(vecchio)).not.toContain(MANCA)
    // the admin on Loris's day: never a reminder of a person's days for him
    const diLoris = mondo()
    diLoris.setter_daily_reports = diLoris.setter_daily_reports.map((r) => ({ ...r, data: '2026-10-08' }))
    const admin = await anteprima('aggiorna_report', { setter: 'Loris', data: '2026-10-08', modalita: 'aggiungi', dm_outbound: 5 }, 'admin', diLoris)
    expect(admin).toMatchObject({ righe: ['C’è già: lo correggo.', 'DM outbound: 10 → 15'] })
  })

  it('aggiorna_report del setter: la descrizione dice le tre risposte obbligatorie dall’08/10/2026, quella dell’admin no', async () => {
    const descrizione = (s: ToolSet) => String(s.aggiorna_report?.description ?? '')
    expect(descrizione(strumenti('setter', 'employee'))).toMatch(
      /Dal 08\/10\/2026.*lead in target, qualità delle conversazioni e cosa frenava i lead sono obbligatori/,
    )
    expect(descrizione(strumenti('setter', 'employee'))).toContain('Domande e contenuti e altre note restano facoltative')
    // the model cannot see the saved answers before the write: it asks only what the result says is missing
    expect(descrizione(strumenti('setter', 'employee'))).toMatch(/commento_mancante.*modalita imposta.*mai con aggiungi/)
    expect(descrizione(strumenti())).not.toContain('obbligatori')
  })

  it('aggiorna_report del setter: il risultato dice al modello le risposte obbligatorie che mancano ancora, mai all’admin', async () => {
    const righe = mondo()
    // his day of 08/10/2026: quality and what held them back are there, lead in target is not
    righe.setter_daily_reports = righe.setter_daily_reports.map((r) => ({ ...r, setter_id: IO, data: '2026-10-08' }))
    const setter = strumenti('setter', 'employee', righe)
    expect(await esegui(setter, 'aggiorna_report', { data: '2026-10-08', modalita: 'aggiungi', dm_outbound: 10 })).toMatchObject({
      fatto: true,
      commento_mancante: ['lead in target'],
    })
    // the answer given: nothing missing, and what held them back is not repeated under the saved one
    expect(
      await esegui(setter, 'aggiorna_report', { data: '2026-10-08', modalita: 'imposta', lead_in_target: 'pochi' }),
    ).toMatchObject({ fatto: true, commento_mancante: [] })
    expect(a.salvaReportGiornaliero).toHaveBeenLastCalledWith(
      expect.objectContaining({ lead_in_target: 'pochi', cosa_frenava: 'Non ho tempo per una call', dm_outbound: 10 }),
    )
    // a new day, numbers only: all three, in the form's words
    expect(await esegui(setter, 'aggiorna_report', { data: '2026-10-09', modalita: 'imposta', conversazioni: 3 })).toMatchObject({
      commento_mancante: ['lead in target', 'qualità delle conversazioni', 'cosa frenava i lead'],
    })
    // a day before 08/10/2026: never required
    expect(await esegui(setter, 'aggiorna_report', { data: '2026-10-07', modalita: 'imposta', conversazioni: 3 })).toMatchObject({
      commento_mancante: [],
    })
    // the admin on Loris's day: no reminder of a person's days for him
    const diLoris = mondo()
    diLoris.setter_daily_reports = diLoris.setter_daily_reports.map((r) => ({ ...r, data: '2026-10-08', lead_in_target: null }))
    const admin = await esegui(strumenti('admin', 'admin', diLoris), 'aggiorna_report', {
      setter: 'Loris',
      data: '2026-10-08',
      modalita: 'aggiungi',
      dm_outbound: 5,
    })
    expect(admin).toMatchObject({ fatto: true })
    expect(admin).not.toHaveProperty('commento_mancante')
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
        'Solo le call col nome di Dany Montagnolo, cioè di chi sta chattando: quelle che ha fissato e le loro call di follow-up, ' +
        'che fissa il closer (o l’admin) e non sono sue prenotate (hanno «fissata_da»). Non tutte le call del team. ' +
        'Di un’altra persona qui ci sono solo le call col nome di Dany Montagnolo, mai tutte le sue.',
    })
    expect(await leggi('closer')).toMatchObject({
      di_chi:
        'Solo le call assegnate a Dany Montagnolo, cioè a chi sta chattando: non tutte le call del team. ' +
        'Di un’altra persona qui ci sono solo le call assegnate a Dany Montagnolo, mai tutte le sue.',
    })

    expect(strumenti('setter', 'employee').call_periodo.description).toContain(
      'Solo le call col nome di chi chatta: quelle che ha fissato e le loro call di follow-up (fissate dal closer o dall’admin, non sono sue prenotate).',
    )
    // setter = who booked it, except a follow-up call: its setter is the first call's, the closer booked it
    expect(strumenti('admin', 'admin').call_periodo.description).toContain(
      'setter (chi l’ha fissata; per una call di follow-up il setter della prima call, ma la fissa il closer o l’admin: «fissata_da» lo dice)',
    )
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
      errore: 'Più clienti possibili: Mario Rossi, Luca Rossi.',
      per_alfire: 'Chiedi quale, con nome e cognome.',
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
    ['tempo', { azione: 'registra', progetto: 'Reel', durata: '1h30', task: 'Copertina' }, 'Registro 1h30 del tuo tempo su «Reel»', ['Giorno: oggi', 'Task: Copertina']],
    ['tempo', { azione: 'registra', progetto: 'Reel', dalle: '09:00', alle: '10:30' }, 'Registro 09:00–10:30 del tuo tempo su «Reel»', ['Giorno: oggi']],
    ['progetto', { azione: 'scegli_coach', progetto: 'Andrea Russo', coach: 'Marco Coach' }, 'Marco Coach diventa il coach di «Andrea Russo»', []],
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
    expect(await anteprima('call', input, 'closer')).toEqual(ESITO_SENZA_DATA)
    await esegui(strumenti('closer', 'employee'), 'call', input)
    expect(a.registraEsito).not.toHaveBeenCalled()
    // riprogrammata with a new day is a move: the outcome never carries it
    expect(
      await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata', data: '2026-09-30', ora: '18:00' }, 'closer'),
    ).toEqual(ESITO_SENZA_DATA)
    const descrizione = strumenti('closer', 'employee').call.description ?? ''
    expect(descrizione).toContain('riprogrammata = «In attesa di conferma»')
    expect(descrizione).toContain('con la nuova data già decisa usa sposta')
    expect(descrizione).toContain('lead stato')
  })

  describe('«In attesa di conferma»: riprogrammata senza data (Dany, 04/10/2026)', () => {
    const conStato = (stato: 'programmata' | 'no_show') => () => {
      const righe = mondo()
      righe.calls = [{ ...righe.calls[0], stato, esito: null, qualificata: null, obiezione_principale: null }]
      return righe
    }

    it('closer e admin la segnano su una call da fare: resta sul suo giorno, con le note del closer', async () => {
      for (const ruolo of ['closer', 'admin'] as const) {
        const p = await anteprima(
          'call',
          { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata', note_closer: 'Richiama lunedì' },
          ruolo,
          conStato('programmata')(),
        )
        expect(p, ruolo).toMatchObject({ titolo: expect.stringMatching(/: In attesa di conferma$/) })
        expect((p as { righe: string[] }).righe, ruolo).toContain(SPOSTA.attesa.descrizione)
        expect((p as { righe: string[] }).righe.join(' '), ruolo).toContain('Richiama lunedì')
      }
      await esegui(strumenti('closer', 'employee', conStato('programmata')()), 'call', {
        azione: 'esito',
        lead: 'Luca Neri',
        esito: 'riprogrammata',
        note_closer: 'Richiama lunedì',
      })
      expect(a.registraEsito).toHaveBeenCalledWith({ call_id: CALL, esito: 'riprogrammata', note_closer: 'Richiama lunedì' })
      expect(a.spostaCall).not.toHaveBeenCalled()
    })

    it('mai su una call svolta o un no show: non lasciano il loro giorno', async () => {
      expect(await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata' }, 'closer')).toEqual({
        errore: SPOSTA.svolta,
      })
      expect(
        await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata' }, 'admin', conStato('no_show')()),
      ).toEqual({ errore: SPOSTA.noShow })
      await esegui(strumenti('closer', 'employee'), 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'riprogrammata' })
      expect(a.registraEsito).not.toHaveBeenCalled()
    })

    it('il setter non ha l’esito: nemmeno «In attesa di conferma»', () => {
      const descrizione = strumenti('setter', 'employee').call.description ?? ''
      expect(descrizione).not.toContain('riprogrammata =')
    })
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
          per_alfire: SPOSTA.soloLaDataPerAlfire,
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
      const correggi = { errore: `${SPOSTA.noShow}. ${SPOSTA.soloLaData}`, per_alfire: SPOSTA.soloLaDataPerAlfire }
      for (const [ruolo, frase] of [
        // closer and admin also read that a wrong day is modifica's (Dany, 03/10/2026)
        ['closer', correggi],
        ['admin', correggi],
        ['setter', { errore: SPOSTA.setterNoShow }],
      ] as const) {
        // the card stops before the tap, whatever the day (the admin also moves to the past)
        for (const giorno of [domani, ieri]) {
          expect(await anteprima('call', { azione: 'sposta', lead: 'Luca Neri', data: giorno, ora: '18:00' }, ruolo, noShow()), ruolo).toEqual(frase)
        }
        await esegui(strumenti(ruolo, 'employee', noShow()), 'call', { azione: 'sposta', lead: 'Luca Neri', data: domani, ora: '18:00' })
      }
      expect(a.spostaCall).not.toHaveBeenCalled()
      // «è stata riprogrammata» is a move too: the outcome never carries a new day
      expect(
        await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'programmata', data: domani, ora: '18:00' }, 'closer', noShow()),
      ).toEqual(ESITO_SENZA_DATA)
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
    // a task's dates with their weekday, as a time entry's day (03/10/2026)
    expect(task.righe).toEqual(
      expect.arrayContaining(['Stato: In corso', 'Stima: 2 h', `Inizio ${giornoEsteso('2026-10-01')}`, `Descrizione: ${lunga}`]),
    )

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

    const dubbio = await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding' })
    expect(a.completaTask).not.toHaveBeenCalled()
    expect(dubbio).toEqual({
      errore: 'Più task possibili: «Call di onboarding» in Reel settembre, scadenza 03/10/2026; «Call di onboarding» in Percorso Tiziano Mele.',
      per_alfire: 'Chiedi quale (il progetto, o passa il task_id da progetto_dettaglio o miei_task).',
    })
    await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding', progetto: 'Tiziano' })
    expect(a.completaTask).toHaveBeenLastCalledWith({ id: 'k2', completato: true })
    const fatto = await esegui(s, 'task', { azione: 'completa', titolo: 'Call di onboarding', task_id: 'k1' })
    expect(a.completaTask).toHaveBeenLastCalledWith({ id: 'k1', completato: true })
    // the link opens the task where it lives, its sheet open (05/10/2026)
    expect(fatto).toMatchObject({ fatto: true, link: `/progetti/${PROGETTO}/attivita?task=k1` })
  })
})

// ---------------------------------------------------------------------------
// The second round on the team's time (03/10/2026): a move to another project
// as the form allows, the entry registered last, typos and the long lists.
// ---------------------------------------------------------------------------
describe('il tempo con Alfire: spostare, l’ultima voce, i nomi detti male (03/10/2026)', () => {
  const IERI = aggiungiGiorni(oggiRoma(), -1)

  it('nuovo_progetto sposta la voce su un altro progetto, sul task con lo stesso titolo; la scheda lo dice', async () => {
    const p = await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' })
    expect(p).toMatchObject({
      titolo: 'Correggo 45 min del tuo tempo su «Sergio Bellini» · Call di check',
      righe: [`Voce: ${giornoEsteso(IERI)}`, 'Progetto: Sergio Bellini → Stefano Moretti'],
    })
    // the sentence from the input, before the database answers
    expect(riassuntoScrittura('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' }).dettagli).toEqual([
      'Sposto sul progetto: Stefano Moretti',
    ])
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ id: VOCE_CALL, progetto_id: STEFANO, task_id: TASK(2, 5), durata: 45 }))

    // nuovo_task is found in the new project
    const altro = await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti', nuovo_task: 'assistenza in chat' })
    expect(altro).toMatchObject({ righe: expect.arrayContaining(['Progetto: Sergio Bellini → Stefano Moretti', 'Task: Call di check → Assistenza chat']) })
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', {
      azione: 'modifica',
      voce_id: VOCE_CALL,
      nuovo_progetto: 'Stefano Moretti',
      nuovo_task: 'assistenza in chat',
    })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ progetto_id: STEFANO, task_id: TASK(2, 6) }))

    // a project without that task: the entry goes without one, as the form leaves it
    const reel = await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Reel' })
    expect(reel).toMatchObject({ righe: [`Voce: ${giornoEsteso(IERI)}`, 'Progetto: Sergio Bellini → Reel settembre', 'Task: Call di check → –'] })
  })

  it('un progetto detto accanto a voce_id non viene mai ignorato: o è quello della voce, o si dice nuovo_progetto', async () => {
    // the person reads that it can move there, the model with which field
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, progetto: 'Stefano Moretti', durata: '1h' })).toEqual({
      errore: 'Questa voce è su «Sergio Bellini», non su «Stefano Moretti»: se vuoi, la sposto su «Stefano Moretti».',
      per_alfire: 'Per spostarla: voce_id e nuovo_progetto «Stefano Moretti», senza progetto (o col progetto della voce).',
    })
    // a deletion only says where the entry is
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'elimina', voce_id: VOCE_CALL, progetto: 'Stefano Moretti' })).toEqual({
      errore: 'Questa voce è su «Sergio Bellini», non su «Stefano Moretti».',
      per_alfire: 'Chiedi quale voce intendeva.',
    })
    expect(a.eliminaTempo).not.toHaveBeenCalled()
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, progetto: 'Sergio Bellini', durata: '1h' })).toMatchObject({
      righe: [`Voce: ${giornoEsteso(IERI)}`, 'Durata: 45 min → 1 h'],
    })
  })

  it('l’ultima voce è l’ultima registrata, con o senza fascia; registra, avvia e ferma danno la loro voce', async () => {
    const m = mondoCoach()
    // a duration registered after the afternoon range: it is the last one
    m.pm_tempo[0] = { ...m.pm_tempo[0], created_at: `${IERI}T17:00:00Z` }
    const letto = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { ultimi_giorni: 7 })) as { voci: { voce_id: string }[] }
    expect(letto.voci.map((v) => v.voce_id)).toEqual([VOCE_CALL, VOCE_VIDEO])
    const dubbio = (await anteprimaCoach('tempo', { azione: 'elimina', progetto: 'Sergio Bellini', data: IERI }, m)) as { errore: string }
    expect(spazi(dubbio.errore)).toMatch(new RegExp(`^Più voci possibili, dalla più recente: ${giornoEsteso(IERI)}, 45 min su «Sergio Bellini» · Call di check; `))
    const d = strumenti('coach', 'employee').mio_tempo.description ?? ''
    expect(d).toContain('nello stesso giorno dall’ultima registrata')

    a.registraTempo.mockResolvedValueOnce({ ok: true, id: VOCE_VIDEO })
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'registra', progetto: 'Sergio Bellini', durata: '30 min' })).toEqual({
      fatto: true,
      voce_id: VOCE_VIDEO,
      link: '/tempo',
    })
    a.avviaTimer.mockResolvedValueOnce({ ok: true, id: TIMER })
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'avvia', progetto: 'Stefano Moretti' })).toMatchObject({
      voce_id: TIMER,
    })
    a.fermaTimer.mockResolvedValueOnce({ ok: true, minuti: 30, id: TIMER })
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'ferma' })).toMatchObject({ minuti: 30, voce_id: TIMER })

    // the voce_id of a timer still running: stop it first, never "not found"
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: TIMER, durata: '1h' }, conTimer(mondoCoach()))).toEqual({
      errore: 'Non c’è una voce chiusa: il tempo che corre è il timer acceso su «Stefano Moretti». Fermalo, poi correggi la voce.',
      per_alfire: 'Per fermarlo: tempo, azione ferma.',
    })
  })

  it('un progetto detto male: i più vicini tra quelli che vedi; un nome lontano da tutti, mai se quel cliente esiste', async () => {
    const forse = 'Chiedi se è questo; se sì, usa il suo nome come scritto qui.'
    expect(await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Stefano Moreti', durata: '30 min' })).toEqual({
      errore: 'Progetto "Stefano Moreti" non trovato tra quelli che vedi. Forse: Stefano Moretti.',
      per_alfire: forse,
    })
    expect(await anteprimaCoach('tempo', { azione: 'avvia', progetto: 'Belini' })).toEqual({
      errore: 'Progetto "Belini" non trovato tra quelli che vedi. Forse: Sergio Bellini.',
      per_alfire: forse,
    })
    // the project of a client he is not in (03/10/2026): he reads that whoever manages it can add him, never his list
    // nor whether that client exists
    const fuori = {
      errore: 'Non sei in un progetto "Zorro": vedi solo quelli di cui fai parte. Se è il progetto di un cliente, chi lo gestisce può aggiungerti.',
      per_alfire: 'Non somiglia a nessuno dei suoi progetti: diglielo così, senza proporne altri al suo posto.',
    }
    expect(await anteprimaCoach('tempo', { azione: 'avvia', progetto: 'Zorro' })).toEqual(fuori)
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'progetto_dettaglio', { progetto: 'Zorro' })).toEqual(fuori)
    // who sees every project reads their names
    expect(await anteprimaScrittura(supabaseFinto(mondoCoach()) as never, profiloDi('admin'), 'admin', 'tempo', { azione: 'avvia', progetto: 'Zorro' })).toEqual({
      errore: 'Progetto "Zorro" non trovato tra quelli che vedi. Progetti: Reel settembre, Sergio Bellini, Stefano Moretti.',
      per_alfire: 'Chiedi quale.',
    })
    // the same from a task said with its project
    expect(await anteprimaCoach('task', { azione: 'completa', titolo: 'Revisione video', progetto: 'Moreti' })).toEqual({
      errore: 'Progetto "Moreti" non trovato tra quelli che vedi. Forse: Stefano Moretti.',
      per_alfire: forse,
    })
  })

  it('un titolo che hanno 13 clienti: nel testo fino a 15 candidati, i bottoni restano 4', async () => {
    const m = mondoCoach()
    const clienti = Array.from({ length: 13 }, (_, i) => `Cliente ${String(i + 1).padStart(2, '0')}`)
    m.v_pm_progetti = clienti.map((nome, i) => ({ ...m.v_pm_progetti[1], id: `p-${i}`, nome }))
    m.v_pm_task = clienti.map((_, i) => ({ ...taskDelPercorso(1, `p-${i}`)[4], id: `t-${i}` }))
    const dubbio = (await anteprimaCoach('tempo', { azione: 'avvia', task: 'Revisione video' }, m)) as { errore: string; per_alfire: string }
    for (const nome of clienti) expect(dubbio.errore).toContain(`«Revisione video» in ${nome}`)
    // how to ask is the model's: never on the card
    expect(dubbio.per_alfire).toContain('Nel testo elencali tutti: i bottoni ne mostrano 4, l’utente può scrivere il nome.')
    expect(dubbio.errore).not.toContain('bottoni')
  })

  it('il giorno col suo nome anche in una correzione; il timer di un altro giorno lo dice', async () => {
    const p = (await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, data: oggiRoma() })) as { righe: string[] }
    expect(p.righe).toContain(`Giorno: ${giornoEsteso(IERI)} → ${giornoEsteso(oggiRoma())}`)
    const m = conTimer(mondoCoach())
    const timer = m.pm_tempo.at(-1)!
    timer.data = IERI
    timer.inizio = `${IERI}T20:10:00.000Z`
    const fermo = (await anteprimaCoach('tempo', { azione: 'ferma' }, m)) as { righe: string[] }
    expect(fermo.righe[0]).toMatch(new RegExp(`^Acceso dalle \\d{2}:\\d{2} di ${giornoEsteso(IERI)}, finora`))
  })

  it('una data scritta in un altro formato in una scrittura: il formato giusto, mai «Data non valida» da sola', async () => {
    const atteso = DATA_SBAGLIATA
    expect(await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Sergio Bellini', data: '02/10/2026', durata: '30 min' })).toEqual(atteso)
    expect(await anteprimaCoach('tempo', { azione: 'elimina', progetto: 'Sergio Bellini', data: 'venerdì' })).toEqual(atteso)
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'registra', progetto: 'Sergio', data: '02/10/2026', durata: '30 min' })).toEqual(atteso)
    expect(a.registraTempo).not.toHaveBeenCalled()
    expect(await anteprimaCoach('task', { azione: 'modifica', titolo: 'Revisione video', progetto: 'Sergio', scadenza: '5/10' })).toEqual(atteso)
    // a form's own "Data non valida" says the format too
    a.registraTempo.mockResolvedValueOnce({ ok: false, errore: 'Data non valida' })
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'registra', progetto: 'Sergio', durata: '30 min' })).toEqual(
      DATA_SBAGLIATA,
    )
  })

  it('completare un task già fatto, o riaprirne uno aperto: la scheda lo dice; tra due uguali dice quale', async () => {
    const m = mondoCoach()
    m.v_pm_task[4] = { ...m.v_pm_task[4], stato: 'completato' }
    expect(await anteprimaCoach('task', { azione: 'completa', titolo: 'Revisione video', progetto: 'Sergio Bellini' }, m)).toEqual({
      errore: 'Il task «Revisione video» di «Sergio Bellini» è già completato: non c’è niente da segnare.',
    })
    await esegui(strumenti('coach', 'employee', m), 'task', { azione: 'completa', titolo: 'Revisione video', progetto: 'Sergio Bellini' })
    expect(a.completaTask).not.toHaveBeenCalled()
    expect(await anteprimaCoach('task', { azione: 'riapri', titolo: 'Call di check', progetto: 'Sergio Bellini' }, m)).toEqual({
      errore: 'Il task «Call di check» di «Sergio Bellini» è già aperto: non c’è niente da riaprire.',
    })

    // two «Call di check» in Sergio's project, one completed: the card says which one
    const due = mondoCoach()
    due.v_pm_task.push({ ...due.v_pm_task[5], id: TASK(1, 21), stato: 'completato' })
    expect(await anteprimaCoach('task', { azione: 'completa', titolo: 'Call di check', progetto: 'Sergio Bellini' }, due)).toEqual({
      titolo: 'Segno come fatto il task «Call di check»',
      righe: ['Progetto: Sergio Bellini', 'È quello aperto: nel progetto c’è un altro task con questo titolo.'],
      sostituisceDettagli: true,
    })
    expect(await anteprimaCoach('task', { azione: 'riapri', titolo: 'Call di check', progetto: 'Sergio Bellini' }, due)).toMatchObject({
      righe: ['Progetto: Sergio Bellini', 'È quello completato: nel progetto c’è un altro task con questo titolo.'],
    })
  })

  it('una scadenza col suo giorno della settimana', async () => {
    const p = (await anteprimaCoach('task', { azione: 'modifica', titolo: 'Revisione video', progetto: 'Sergio', scadenza: '2026-10-12' })) as { righe: string[] }
    expect(p.righe).toContain(`Scadenza: – → ${giornoEsteso('2026-10-12')}`)
    expect(giornoEsteso('2026-10-12', '2026-10-03')).toBe('lunedì 12/10/2026')
  })

  it('un task detto accanto a voce_id non viene mai ignorato: o è quello della voce, o si dice nuovo_task', async () => {
    const perSpostare = 'Per spostarla: voce_id e nuovo_task col titolo del task ("nessuno" lo toglie), senza task né task_id.'
    const atteso = {
      errore: 'Questa voce è sul task «Call di check», non su «Revisione video»: se vuoi, la sposto su «Revisione video».',
      per_alfire: perSpostare,
    }
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, task: 'Revisione video', durata: '1h' })).toEqual(atteso)
    await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'modifica', voce_id: VOCE_CALL, task: 'Revisione video', durata: '1h' })
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'elimina', voce_id: VOCE_CALL, task: 'Revisione video' })).toEqual({
      errore: 'Questa voce è sul task «Call di check», non su «Revisione video».',
      per_alfire: 'Chiedi quale voce intendeva.',
    })
    expect(a.modificaTempo).not.toHaveBeenCalled()
    expect(a.eliminaTempo).not.toHaveBeenCalled()
    // a task_id that is not the entry's, and "nessuno" for an entry that has one
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, task_id: TASK(1, 4), durata: '1h' })).toEqual({
      errore: 'Questa voce è sul task «Call di check», non su quel task: se vuoi, la sposto su quel task.',
      per_alfire: perSpostare,
    })
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, task: 'nessuno', durata: '1h' })).toEqual({
      errore: 'Questa voce è sul task «Call di check», non senza task: se vuoi, le tolgo il task.',
      per_alfire: perSpostare,
    })
    // its own task, said as it comes (no capitals, other little words): the card goes on
    for (const task of ['Call di check', 'le call di check']) {
      expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, task, durata: '1h' }), task).toMatchObject({
        righe: [`Voce: ${giornoEsteso(IERI)}`, 'Durata: 45 min → 1 h'],
      })
    }
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, task_id: TASK(1, 5), durata: '1h' })).toMatchObject({
      righe: [`Voce: ${giornoEsteso(IERI)}`, 'Durata: 45 min → 1 h'],
    })
  })

  it('spostata sul task con lo stesso titolo, già completato: la scheda lo dice', async () => {
    const m = mondoCoach()
    m.v_pm_task = m.v_pm_task.map((t) => (t.id === TASK(2, 5) ? { ...t, stato: 'completato' } : t))
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' }, m)).toMatchObject({
      righe: [`Voce: ${giornoEsteso(IERI)}`, 'Progetto: Sergio Bellini → Stefano Moretti', 'Task: Call di check → Call di check (completato)'],
    })
    // an open one with that title wins over the completed one
    m.v_pm_task.push({ ...m.v_pm_task.find((t) => t.id === TASK(2, 5))!, id: TASK(2, 21), stato: 'da_fare' })
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' }, m)).toMatchObject({
      righe: [`Voce: ${giornoEsteso(IERI)}`, 'Progetto: Sergio Bellini → Stefano Moretti'],
    })
    await esegui(strumenti('coach', 'employee', m), 'tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'Stefano Moretti' })
    expect(a.modificaTempo).toHaveBeenLastCalledWith(expect.objectContaining({ progetto_id: STEFANO, task_id: TASK(2, 21) }))
  })

  it('due clienti con lo stesso nome: la domanda li distingue, e il nome che dice trova il progetto', async () => {
    const OMONIMO = 'b0000000-0000-4000-8000-0000000000a3'
    const m = mondoCoach()
    const sergio = m.v_pm_progetti.find((p) => p.id === SERGIO)!
    m.v_pm_progetti.push({ ...sergio, id: OMONIMO, client_id: 'cl-a3', data_inizio: '2026-07-01' })
    m.v_pm_task.push(...taskDelPercorso(1, OMONIMO).map((t, n) => ({ ...t, id: `omonimo-${n}` })))
    expect(await anteprimaCoach('tempo', { azione: 'registra', progetto: 'Sergio Bellini', durata: '30 min' }, m)).toEqual({
      errore: 'Più progetti possibili: Sergio Bellini (dal 01/07/2026); Sergio Bellini (dal 01/09/2026).',
      per_alfire: 'Chiedi quale; poi passa il nome come scritto qui, con quello che c’è tra parentesi.',
    })
    // the name the question gave, with or without its brackets
    for (const progetto of ['Sergio Bellini (dal 01/07/2026)', 'sergio bellini dal 01/07/2026']) {
      expect(await anteprimaCoach('tempo', { azione: 'registra', progetto, durata: '30 min' }, m), progetto).toMatchObject({
        titolo: expect.stringContaining('del tuo tempo su «Sergio Bellini»'),
      })
    }
    await esegui(strumenti('coach', 'employee', m), 'tempo', { azione: 'registra', progetto: 'Sergio Bellini (dal 01/07/2026)', task: 'Revisione video', durata: '30 min' })
    expect(a.registraTempo).toHaveBeenLastCalledWith(expect.objectContaining({ progetto_id: OMONIMO, task_id: 'omonimo-4' }))
    // a task both have: the candidates name their project the same way
    const task = (await anteprimaCoach('task', { azione: 'completa', titolo: 'Revisione video', progetto: 'Sergio Bellini' }, m)) as { errore: string }
    expect(task.errore).toContain('«Revisione video» in Sergio Bellini (dal 01/07/2026)')
    expect(task.errore).toContain('«Revisione video» in Sergio Bellini (dal 01/09/2026)')
    // the same start too: the state, then a number
    m.v_pm_progetti = m.v_pm_progetti.map((p) => (p.id === OMONIMO ? { ...p, data_inizio: '2026-09-01', stato: 'in_pausa' } : p))
    expect(((await anteprimaCoach('tempo', { azione: 'avvia', progetto: 'Sergio Bellini' }, m)) as { errore: string }).errore).toContain(
      'Sergio Bellini (dal 01/09/2026, attivo); Sergio Bellini (dal 01/09/2026, in pausa)',
    )
  })
})

describe('i nomi dei progetti omonimi', () => {
  it('un nome che nessun altro ha resta com’è; due uguali con data e stato uguali prendono un numero', () => {
    const p = (id: string, nome: string, data_inizio: string | null, stato = 'attivo') => ({ id, nome, data_inizio, stato })
    const nomi = nomiDistinti([p('a', 'Reel', null), p('b', 'Mario', '2026-01-01'), p('c', 'mario', '2026-01-01'), p('d', 'Luca', null), p('e', 'Luca', '2026-02-01')])
    expect(nomi.get('a')).toBe('Reel')
    expect(nomi.get('b')).toBe('Mario (dal 01/01/2026, attivo, n. 1)')
    expect(nomi.get('c')).toBe('mario (dal 01/01/2026, attivo, n. 2)')
    expect(nomi.get('d')).toBe('Luca (senza date)')
    expect(nomi.get('e')).toBe('Luca (dal 01/02/2026)')
  })
})

// ---------------------------------------------------------------------------
// The third round (03/10/2026): the destination said as the entry's own, and
// an entry's project that cannot be taken away.
// ---------------------------------------------------------------------------
describe('il tempo con Alfire: la destinazione detta al posto della voce', () => {
  const IERI = aggiungiGiorni(oggiRoma(), -1)
  const voci = `${giornoEsteso(IERI)}, 1 h 30 min su «Sergio Bellini» · Revisione video, 15:00–16:30; ${giornoEsteso(IERI)}, 45 min su «Sergio Bellini» · Call di check`

  it('«quella di ieri va su Stefano Moretti»: nessuna voce lì, le voci di quel giorno e lo spostamento proposto', async () => {
    const esito = (await anteprimaCoach('tempo', { azione: 'modifica', progetto: 'Stefano Moretti', data: IERI })) as { errore: string; per_alfire: string }
    expect(spazi(esito.errore)).toBe(
      `Nessuna tua voce di tempo su «Stefano Moretti» del ${formatData(IERI)}. Quel giorno hai: ${voci}. Se è una di queste, posso spostarla su «Stefano Moretti».`,
    )
    // the model gets the ids and the field that moves it; the person never reads them
    expect(esito.per_alfire).toContain(`= ${VOCE_VIDEO}`)
    expect(esito.per_alfire).toContain(`= ${VOCE_CALL}`)
    expect(esito.per_alfire).toMatch(/^Chiedi quale; per spostarla: modifica con il suo voce_id \(.*\) e nuovo_progetto «Stefano Moretti»\.$/)
    expect(esito.errore).not.toMatch(/voce_id|nuovo_/)
    expect(a.modificaTempo).not.toHaveBeenCalled()
  })

  it('un task detto al posto di quello della voce: lo stesso, con nuovo_task; per eliminare solo le voci del giorno', async () => {
    const esito = (await anteprimaCoach('tempo', { azione: 'modifica', progetto: 'Sergio Bellini', task: 'Assistenza chat', data: IERI })) as {
      errore: string
      per_alfire: string
    }
    expect(spazi(esito.errore)).toContain('posso spostarla su «Sergio Bellini» · «Assistenza chat».')
    expect(esito.per_alfire).toContain('nuovo_progetto «Sergio Bellini» e nuovo_task «Assistenza chat»')

    const elimina = (await anteprimaCoach('tempo', { azione: 'elimina', progetto: 'Stefano Moretti', data: IERI })) as { errore: string; per_alfire: string }
    expect(spazi(elimina.errore)).toBe(`Nessuna tua voce di tempo su «Stefano Moretti» del ${formatData(IERI)}. Quel giorno hai: ${voci}.`)
    expect(elimina.per_alfire).toMatch(/^Chiedi se intendeva una di queste; poi usa il suo voce_id/)
    expect(a.eliminaTempo).not.toHaveBeenCalled()
  })

  it('un giorno senza voci resta «non trovata»: niente da spostare', async () => {
    const giorno = aggiungiGiorni(oggiRoma(), -3)
    expect(await anteprimaCoach('tempo', { azione: 'modifica', progetto: 'Stefano Moretti', data: giorno })).toEqual({
      errore: `Voce di tempo non trovata tra le tue del ${formatData(giorno)}.`,
    })
  })

  it('una voce sta sempre su un progetto: «nessuno» lo dice, invece di non cambiare niente', async () => {
    const atteso = {
      errore: 'Una voce di tempo sta sempre su un progetto: posso spostarla su un altro, non toglierglielo.',
      per_alfire: 'Chiedi su quale progetto spostarla.',
    }
    expect(await anteprimaCoach('tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'nessuno' })).toEqual(atteso)
    expect(await esegui(strumenti('coach', 'employee', mondoCoach()), 'tempo', { azione: 'modifica', voce_id: VOCE_CALL, nuovo_progetto: 'nessuno' })).toEqual(
      atteso,
    )
    expect(a.modificaTempo).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// One's own time per task (Dany, 03/10/2026: «Quanto ho dedicato alla revisione
// video di Rossi questo mese?»): the totals per project › task come from SQL
// (pm_mio_tempo_per_task), only of whoever chats, narrowed by name as the time
// tool finds projects and tasks.
// ---------------------------------------------------------------------------
describe('mio_tempo per task (03/10/2026)', () => {
  const PER_TASK = [
    { livello: 'totale', progetto_id: null, progetto: null, task_id: null, task: null, minuti: 135, voci: 2 },
    { livello: 'progetto', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: null, task: null, minuti: 135, voci: 2 },
    { livello: 'task', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: TASK(1, 4), task: 'Revisione video', minuti: 90, voci: 1 },
    { livello: 'task', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: TASK(1, 5), task: 'Call di check', minuti: 45, voci: 1 },
  ]

  it('ogni ruolo ce l’ha, con progetto e task facoltativi e mai una persona', async () => {
    for (const [ruolo, livello] of [
      ['coach', 'employee'],
      ['coach', 'manager'],
      ['setter', 'employee'],
      ['closer', 'employee'],
      ['admin', 'admin'],
    ] as const) {
      const campi = await campiDi(strumenti(ruolo, livello), 'mio_tempo')
      expect(campi, ruolo).toEqual(expect.arrayContaining(['ultimi_giorni', 'da', 'a', 'progetto', 'task', 'task_id']))
      for (const c of ['persona', 'profile_id', 'chi', 'setter']) expect(campi, `${ruolo}: ${c}`).not.toContain(c)
    }
    const d = strumenti('coach', 'employee').mio_tempo.description ?? ''
    expect(d).toContain('per task (progetto › task), da SQL: non sommare voci né totali')
    expect(d).toContain('«quanto ho dedicato alla revisione video di Rossi?» = progetto Rossi, task revisione video')
  })

  it('senza filtro: totali per giorno, progetto e task, tutti dal SQL e solo di chi chatta', async () => {
    const m = mondoCoach()
    m.pm_mio_tempo_per_task = PER_TASK
    m.pm_riepilogo_tempo = [
      { livello: 'giorno', data: aggiungiGiorni(oggiRoma(), -1), progetto_id: null, progetto: null, minuti: 135, voci: 2 },
      { livello: 'progetto', data: null, progetto_id: SERGIO, progetto: 'Sergio Bellini', minuti: 135, voci: 2 },
      { livello: 'totale', data: null, progetto_id: null, progetto: null, minuti: 135, voci: 2 },
    ]
    const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { ultimi_giorni: 7 })) as Record<string, unknown>
    const periodo = { p_da: aggiungiGiorni(oggiRoma(), -6), p_a: oggiRoma() }
    // never a person among the arguments: the RPC reads auth.uid() only
    expect(rpcChiamate).toContainEqual({ nome: 'pm_mio_tempo_per_task', args: periodo })
    expect(rpcChiamate).toContainEqual({ nome: 'pm_riepilogo_tempo', args: periodo })
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito).not.toHaveProperty('solo')
    expect(esito).toMatchObject({
      totale: { minuti: 135, durata: '2 h 15 min', voci: 2 },
      per_progetto: [{ progetto: 'Sergio Bellini', minuti: 135 }],
      per_task: [
        { progetto: 'Sergio Bellini', task: 'Revisione video', minuti: 90, durata: '1 h 30 min', voci: 1 },
        { progetto: 'Sergio Bellini', task: 'Call di check', minuti: 45, durata: '45 min', voci: 1 },
      ],
    })
    expect(esito.per_giorno).toHaveLength(1)
  })

  it('«quanto ho dedicato alla revisione video di Sergio?»: progetto e task per nome, totale e voci solo lì', async () => {
    const m = mondoCoach()
    // what pm_mio_tempo_per_task gives for that project and task
    m.pm_mio_tempo_per_task = [
      { livello: 'totale', progetto_id: null, progetto: null, task_id: null, task: null, minuti: 90, voci: 1 },
      { livello: 'progetto', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: null, task: null, minuti: 90, voci: 1 },
      PER_TASK[2],
    ]
    const registro: string[] = []
    const esito = (await esegui(strumenti('coach', 'employee', m, registro), 'mio_tempo', {
      progetto: 'Sergio',
      task: 'la revisione dei video',
    })) as Record<string, unknown>
    expect(rpcChiamate).toContainEqual({
      nome: 'pm_mio_tempo_per_task',
      args: { p_da: primoDelMeseISO(oggiRoma()), p_a: oggiRoma(), p_progetto: SERGIO, p_task: TASK(1, 4) },
    })
    // narrowed, the totals per day of the whole period would not be about that task: not read
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('pm_riepilogo_tempo')
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito).toMatchObject({
      solo: { progetto: 'Sergio Bellini', task: 'Revisione video' },
      totale: { minuti: 90, durata: '1 h 30 min', voci: 1 },
      per_task: [{ progetto: 'Sergio Bellini', task: 'Revisione video', minuti: 90 }],
    })
    expect(esito).not.toHaveProperty('per_giorno')
    expect(esito).not.toHaveProperty('per_progetto')
    // the entries too: mine, on that task
    expect(registro).toContain(`pm_tempo.profile_id=${IO}`)
    expect(registro).toContain(`pm_tempo.task_id=${TASK(1, 4)}`)
    expect((esito.voci as { voce_id: string }[]).map((v) => v.voce_id)).toEqual([VOCE_VIDEO])
  })

  // «Quanto ho dedicato alla revisione video questo mese?», across all his clients: one title every
  // client's project has, no project said. The sum is SQL's (p_tasks), never the model's.
  const VOCE_STEFANO = '7e000000-0000-4000-8000-000000000010'
  function conRevisioneDiStefano(m = mondoCoach()) {
    m.pm_tempo.push(
      {
        id: VOCE_STEFANO,
        profile_id: IO,
        progetto_id: STEFANO,
        task_id: TASK(2, 4),
        data: oggiRoma(),
        minuti: 30,
        nota: null,
        inizio: null,
        fine: null,
        created_at: new Date().toISOString(),
        progetto: { nome: 'Stefano Moretti' },
        task: { titolo: 'Revisione video' },
      },
      // someone else on the same task: never in his answer
      { ...m.pm_tempo[1], id: 'altrui', profile_id: MARCO, progetto_id: STEFANO, task_id: TASK(2, 4), data: oggiRoma(), minuti: 200 },
    )
    // what pm_mio_tempo_per_task gives for his entries on the two «Revisione video»
    m.pm_mio_tempo_per_task = [
      { livello: 'totale', progetto_id: null, progetto: null, task_id: null, task: null, minuti: 120, voci: 2 },
      { livello: 'progetto', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: null, task: null, minuti: 90, voci: 1 },
      { livello: 'progetto', progetto_id: STEFANO, progetto: 'Stefano Moretti', task_id: null, task: null, minuti: 30, voci: 1 },
      PER_TASK[2],
      { livello: 'task', progetto_id: STEFANO, progetto: 'Stefano Moretti', task_id: TASK(2, 4), task: 'Revisione video', minuti: 30, voci: 1 },
    ]
    return m
  }

  it('un task che hanno più clienti, senza progetto: la somma dal SQL con i progetti, solo di chi chatta', async () => {
    const registro: string[] = []
    const esito = (await esegui(strumenti('coach', 'employee', conRevisioneDiStefano(), registro), 'mio_tempo', {
      task: 'Revisione video',
    })) as Record<string, unknown>
    const chiamata = rpcChiamate.find((c) => c.nome === 'pm_mio_tempo_per_task')
    // the tasks of that title, never a person: the RPC reads auth.uid() only
    expect(chiamata?.args).toEqual({ p_da: primoDelMeseISO(oggiRoma()), p_a: oggiRoma(), p_tasks: expect.any(Array) })
    expect([...(chiamata?.args.p_tasks as string[])].sort()).toEqual([TASK(1, 4), TASK(2, 4)])
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('pm_riepilogo_tempo')
    // whose time, first; then that it is the sum of that task, made by the app
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.solo).toEqual({ task: 'Revisione video', progetti: 'tutti quelli dove c’è (2)' })
    expect(esito.somma).toBe(
      `Tempo di ${profiloDi('coach').nome} sul task «Revisione video» in tutti i progetti dove c’è (uno per cliente), sommato dall’app: dillo così, con il totale e, se serve, per_progetto. Non sommare altro.`,
    )
    expect(esito).toMatchObject({
      totale: { minuti: 120, durata: '2 h', voci: 2 },
      per_progetto: [
        { progetto: 'Sergio Bellini', minuti: 90, durata: '1 h 30 min', voci: 1 },
        { progetto: 'Stefano Moretti', minuti: 30, durata: '30 min', voci: 1 },
      ],
    })
    for (const via of ['per_task', 'per_giorno']) expect(esito).not.toHaveProperty(via)
    // his entries on those tasks only, the most recent first: never the other person's 200 minutes
    expect(registro).toContain(`pm_tempo.profile_id=${IO}`)
    expect((esito.voci as { voce_id: string }[]).map((v) => v.voce_id)).toEqual([VOCE_STEFANO, VOCE_VIDEO])
    expect(JSON.stringify(esito)).not.toContain('200')
  })

  it('lo stesso task detto a parole sue, o con accenti e spazi diversi: è lo stesso titolo, la somma', async () => {
    const m = conRevisioneDiStefano()
    // a third client, his task typed by hand: the same title, another accent and two spaces
    m.v_pm_task.push({ ...m.v_pm_task.find((t) => t.id === TASK(1, 4))!, id: 'terzo', progetto_id: 'progetto-terzo', titolo: 'REVISIONE  vìdeo' })
    for (const detto of ['la revisione dei video', 'Revisione video']) {
      rpcChiamate.length = 0
      const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { task: detto })) as Record<string, unknown>
      const chiamata = rpcChiamate.find((c) => c.nome === 'pm_mio_tempo_per_task')
      expect([...(chiamata?.args.p_tasks as string[])].sort(), detto).toEqual([TASK(1, 4), TASK(2, 4), 'terzo'])
      expect(esito.solo, detto).toEqual({ task: 'Revisione video', progetti: 'tutti quelli dove c’è (3)' })
    }
  })

  it('titoli diversi, senza progetto: chiede quale, con il task_id di ognuno, e non somma', async () => {
    const m = mondoCoach()
    // Stefano's review is a different task: «Revisione video tecnica»
    m.v_pm_task = m.v_pm_task.map((t) => (t.id === TASK(2, 4) ? { ...t, titolo: 'Revisione video tecnica' } : t))
    const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { task: 'revisione' })) as Errore
    expect(esito.errore).toBe(
      `Più task possibili: «Revisione video» in Sergio Bellini (task_id ${TASK(1, 4)}); «Revisione video tecnica» in Stefano Moretti (task_id ${TASK(2, 4)}).`,
    )
    expect(esito.per_alfire).toContain('mai sommare i loro tempi')
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('pm_mio_tempo_per_task')
  })

  it('una somma che non si legge non diventa mai «nessun tempo»', async () => {
    const s = strumentiAlfire(supabaseFinto(conRevisioneDiStefano(), [], ['pm_mio_tempo_per_task']) as never, profiloDi('coach'), 'employee')
    expect(await esegui(s, 'mio_tempo', { task: 'Revisione video' })).toEqual({ errore: 'Tempo non disponibile.' })
  })

  it('la somma è solo di mio_tempo: il tempo da registrare su un task che hanno più clienti chiede ancora di quale', async () => {
    const esito = await anteprimaCoach('tempo', { azione: 'registra', task: 'Revisione video', durata: '30 min' })
    expect(JSON.stringify(esito)).toContain('Più task possibili')
  })

  it('due task con lo stesso titolo nello stesso progetto: chiede quale, mai uno dei due a caso', async () => {
    // an old completed «Call di check» next to the open one: picking the open one would leave the other's time out
    const VECCHIA = '7a000000-0000-4000-8000-000000001099'
    const m = mondoCoach()
    m.v_pm_task.push({ ...m.v_pm_task.find((t) => t.id === TASK(1, 5))!, id: VECCHIA, stato: 'completato' })
    const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { progetto: 'Sergio', task: 'call di check' })) as Errore
    expect(esito.errore).toBe(
      `Più task possibili: «Call di check» in Sergio Bellini (task_id ${TASK(1, 5)}); «Call di check» in Sergio Bellini, completato (task_id ${VECCHIA}).`,
    )
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('pm_mio_tempo_per_task')

    // the one chosen, by its task_id: only its time
    m.pm_mio_tempo_per_task = [{ livello: 'totale', progetto_id: null, progetto: null, task_id: null, task: null, minuti: 30, voci: 1 }]
    await esegui(strumenti('coach', 'employee', m), 'mio_tempo', { progetto: 'Sergio', task_id: VECCHIA })
    expect(rpcChiamate).toContainEqual({
      nome: 'pm_mio_tempo_per_task',
      args: { p_da: primoDelMeseISO(oggiRoma()), p_a: oggiRoma(), p_progetto: SERGIO, p_task: VECCHIA },
    })
  })

  it('senza filtro, due task con lo stesso titolo in un progetto portano il loro task_id', async () => {
    const m = mondoCoach()
    m.pm_mio_tempo_per_task = [
      PER_TASK[0],
      { ...PER_TASK[3], minuti: 30 },
      { ...PER_TASK[3], task_id: 'vecchia', minuti: 15 },
      PER_TASK[2],
    ]
    const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', {})) as { per_task: Record<string, unknown>[] }
    expect(esito.per_task.map((x) => [x.task, x.task_id ?? null])).toEqual([
      ['Call di check', TASK(1, 5)],
      ['Call di check', 'vecchia'],
      ['Revisione video', null],
    ])
  })

  it('un progetto che non c’è non diventa mai «nessun tempo»', async () => {
    const esito = (await esegui(strumenti('coach', 'employee', mondoCoach()), 'mio_tempo', { progetto: 'Zzzz Inesistente' })) as Errore
    expect(esito).toHaveProperty('errore')
    expect(esito).not.toHaveProperty('totale')
  })

  it('un totale per task che non si legge non diventa mai «nessun tempo»', async () => {
    const s = strumentiAlfire(supabaseFinto(mondoCoach(), [], ['pm_mio_tempo_per_task']) as never, profiloDi('coach'), 'employee')
    expect(await esegui(s, 'mio_tempo', {})).toEqual({ errore: 'Tempo non disponibile.' })
  })

  it('il tempo senza task e i task oltre i 30 con più tempo lo dicono', async () => {
    const m = mondoCoach()
    m.pm_mio_tempo_per_task = [
      PER_TASK[0],
      { livello: 'task', progetto_id: SERGIO, progetto: 'Sergio Bellini', task_id: null, task: null, minuti: 20, voci: 1 },
      ...Array.from({ length: 31 }, (_, i) => ({
        livello: 'task',
        progetto_id: STEFANO,
        progetto: 'Stefano Moretti',
        task_id: `t-${i}`,
        task: i === 0 ? null : `Task ${i}`,
        minuti: 10,
        voci: 1,
      })),
    ]
    const esito = (await esegui(strumenti('coach', 'employee', m), 'mio_tempo', {})) as {
      per_task: { task: string }[]
      nota_task: string
    }
    expect(esito.per_task).toHaveLength(30)
    expect(esito.per_task[0].task).toBe('senza task')
    // a task the caller no longer sees keeps its minutes, without a name
    expect(esito.per_task[1].task).toBe('Task non più disponibile')
    expect(esito.nota_task).toBe('Qui i 30 task con più tempo su 32: per gli altri, chiedi con il progetto.')
  })
})

// ---------------------------------------------------------------------------
// The setter's and the closer's own money in Alfire (Dany, 03/10/2026): only
// theirs, exactly what the app shows them (CLAUDE.md section 6), never
// contacts, payment method or notes, and whose data it is said first.
// ---------------------------------------------------------------------------
const VENDITA_2 = '50000000-0000-4000-8000-000000000002'
const VENDITA_ALTRO = '50000000-0000-4000-8000-000000000003'

/** Rows of mie_vendite_setter as the RPC gives them to the setter: his sales only, filtered in SQL. */
function venditeDelSetter(): Riga[] {
  const base = {
    sale_id: VENDITA,
    cliente: 'Mario Rossi',
    prodotto: 'Percorso Alpha 3 mesi',
    tipo: 'nuovo',
    data_vendita: '2026-09-10',
    valore_contratto: 1500,
    numero_rate: 3,
    incassato_vendita: 500,
    rate_incassate: 1,
    rate_in_ritardo: 1,
    provvigione_vendita: 25,
    provvigione_prevista: true,
  }
  return [
    { ...base, numero_rata: 1, scadenza: '2026-09-10', importo_previsto: 500, stato: 'incassata', incassato_il: '2026-09-10', importo_incassato: 500, in_ritardo: false, percentuale: 0.05, provvigione: 25 },
    { ...base, numero_rata: 2, scadenza: '2026-09-25', importo_previsto: 500, stato: 'prevista', incassato_il: null, importo_incassato: null, in_ritardo: true, percentuale: null, provvigione: null },
    { ...base, numero_rata: 3, scadenza: '2026-11-10', importo_previsto: 500, stato: 'prevista', incassato_il: null, importo_incassato: null, in_ritardo: false, percentuale: null, provvigione: null },
    {
      sale_id: VENDITA_2,
      cliente: 'Luca Rossi',
      prodotto: 'Percorso Alpha 3 mesi',
      tipo: 'rinnovo',
      data_vendita: '2026-08-01',
      valore_contratto: 900,
      numero_rate: 1,
      numero_rata: 1,
      scadenza: '2026-08-01',
      importo_previsto: 900,
      stato: 'incassata',
      incassato_il: '2026-08-01',
      importo_incassato: 900,
      in_ritardo: false,
      percentuale: null,
      provvigione: null,
      incassato_vendita: 900,
      rate_incassate: 1,
      rate_in_ritardo: 0,
      provvigione_vendita: null,
      provvigione_prevista: false,
    },
  ]
}

/** What must never reach a collaborator through these reads. */
function senzaDatiRiservati(esito: unknown) {
  const testo = JSON.stringify(esito)
  for (const vietato of ['+39 111 111 1111', 'telefono', 'email', 'instagram', 'metodo', 'bonifico', 'percentuale', '0.05', 'Nota riservata', 'note']) {
    expect(testo, vietato).not.toContain(vietato)
  }
}

describe('i soldi del setter in Alfire: i clienti che ha portato (03/10/2026)', () => {
  it('solo il setter ha miei_clienti; solo il closer mie_vendite; la giornata a tutti e due e all’admin che chiude, a nessun altro', () => {
    for (const [ruolo, livello] of [
      ['admin', 'admin'],
      ['setter', 'employee'],
      ['closer', 'employee'],
      ['coach', 'employee'],
      ['coach', 'manager'],
      ['editor', 'employee'],
      ['nutrizione', 'employee'],
      ['dev', 'admin'],
    ] as const) {
      const suoi = strumentiConsentiti(ruolo, livello)
      expect(suoi.includes('miei_clienti'), `${ruolo}/${livello} miei_clienti`).toBe(ruolo === 'setter')
      expect(suoi.includes('mie_vendite'), `${ruolo}/${livello} mie_vendite`).toBe(ruolo === 'closer')
      expect(suoi.includes('mie_giornate'), `${ruolo}/${livello} mie_giornate`).toBe(ruolo === 'setter' || ruolo === 'closer' || ruolo === 'admin')
      // the closer's numbers of every setter: the setter's Closer page (07/10/2026); the closer reads his own, the admin as before
      expect(suoi.includes('giornate_closer'), `${ruolo}/${livello} giornate_closer`).toBe(ruolo === 'setter')
    }
  })

  it('le loro descrizioni dicono che sono solo di chi chatta, e nessuna sceglie una persona', async () => {
    const setter = strumenti('setter', 'employee')
    const closer = strumenti('closer', 'employee')
    const admin = strumenti('admin', 'admin')
    for (const [s, nome] of [
      [setter, 'miei_clienti'],
      [setter, 'mie_giornate'],
      [closer, 'mie_vendite'],
      [closer, 'mie_giornate'],
      [admin, 'mie_giornate'],
    ] as const) {
      expect(s[nome].description, nome).toContain('Solo di chi chatta: mai per un’altra persona.')
      for (const c of ['persona', 'setter', 'closer', 'profile_id']) expect(await campiDi(s, nome), `${nome}: ${c}`).not.toContain(c)
    }
    expect(setter.mie_giornate.description).toContain('gli esiti del closer sulle call col suo nome (quelle che ha fissato e le loro call di follow-up')
    expect(setter.mie_giornate.description).not.toContain('sulle call che ha fissato')
    expect(closer.mie_giornate.description).toContain('show rate e close rate')
    expect(admin.mie_giornate.description).toContain('La giornata da closer dell’admin che chatta')
    expect(admin.mie_giornate.description).toContain('Mai di un altro closer né del team: per quelli call_periodo e vendite_periodo.')
  })

  it('miei_clienti: per vendita revenue, pagato, rate e la provvigione maturata, dal SQL; mai la percentuale, i contatti o il metodo', async () => {
    const m = mondo()
    m.mie_vendite_setter = venditeDelSetter()
    const esito = (await esegui(strumenti('setter', 'employee', m), 'miei_clienti', {})) as Record<string, unknown>
    // the RPC filters on the caller: nobody to choose
    expect(rpcChiamate).toContainEqual({ nome: 'mie_vendite_setter', args: {} })
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.di_chi).toBe('Questi sono i dati di Dany Montagnolo, cioè di chi sta chattando: mai di un’altra persona.')
    expect(esito.vendite).toEqual([
      {
        cliente: 'Mario Rossi',
        prodotto: 'Percorso Alpha 3 mesi',
        tipo: 'Nuovo',
        venduta_il: '2026-09-10',
        revenue: 1500,
        pagato_in_tutto: 500,
        rate_pagate: '1 di 3',
        rate_in_ritardo: 1,
        a_te: 25,
      },
      {
        cliente: 'Luca Rossi',
        prodotto: 'Percorso Alpha 3 mesi',
        tipo: 'Rinnovo',
        venduta_il: '2026-08-01',
        revenue: 900,
        pagato_in_tutto: 900,
        rate_pagate: '1 di 1',
        a_te: 'non prevista (rinnovo)',
      },
    ])
    expect(esito.nota).toBe('Le rate e la provvigione di ogni incasso: chiedi per cliente. Quanto hanno pagato in un periodo: chiedi con le date.')
    senzaDatiRiservati(esito)
  })

  it('miei_clienti con da e a: gli incassi del periodo uno per uno e il totale dal SQL, mai sommato qui', async () => {
    const m = mondo()
    m.mie_vendite_setter = venditeDelSetter()
    // the SQL total of all his clients (04/10/2026): different from the rows on purpose, so it is never their sum
    m.incassi_clienti_setter = [{ incassato: 1234.5, numero_incassi: 3, rimborsato: 100, numero_rimborsi: 1, clienti: 2, provvigione: 56.78 }]
    const esito = (await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { da: '2026-09-01', a: '2026-09-30' })) as Record<string, unknown>
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(rpcChiamate).toContainEqual({ nome: 'incassi_clienti_setter', args: { p_da: '2026-09-01', p_a: '2026-09-30' } })
    expect(esito.periodo).toEqual({ da: '2026-09-01', a: '2026-09-30' })
    expect(esito.totale_periodo).toEqual({
      pagato_netto: 1234.5,
      incassi: 3,
      rimborsi: 1,
      rimborsato: 100,
      clienti: 2,
      provvigione_maturata: 56.78,
    })
    // Luca Rossi paid in August: not in September
    expect(esito.incassi).toEqual([
      { cliente: 'Mario Rossi', tipo: 'Nuovo', rata: '1 di 3', stato: 'pagata', pagata_il: '2026-09-10', importo: 500, a_te: 25 },
    ])
    expect(esito).not.toHaveProperty('vendite')
    expect(esito.nota).toBe('Un incasso per riga; il totale è totale_periodo, dal SQL: usa quello, non sommare le righe.')
    senzaDatiRiservati(esito)

    // a month without cash-ins says so, with the SQL's zeros; a date written otherwise is never the month
    m.incassi_clienti_setter = [{ incassato: 0, numero_incassi: 0, rimborsato: 0, numero_rimborsi: 0, clienti: 0, provvigione: 0 }]
    expect(await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { da: '2026-07-01', a: '2026-07-31' })).toMatchObject({
      totale_periodo: { pagato_netto: 0, incassi: 0, clienti: 0, provvigione_maturata: 0 },
      incassi: [],
      nota: 'Nessun incasso dei tuoi clienti nel periodo.',
    })
    expect(await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { da: '01/09/2026' })).toEqual(DATA_SBAGLIATA)
  })

  it('miei_clienti: il totale del periodo è di tutti i suoi clienti, mai di uno solo; una lettura che non riesce non è mai zero', async () => {
    const m = mondo()
    m.mie_vendite_setter = venditeDelSetter()
    rpcChiamate.length = 0
    const uno = (await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { cliente: 'Mario', da: '2026-09-01', a: '2026-09-30' })) as Record<string, unknown>
    expect(uno).not.toHaveProperty('totale_periodo')
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('incassi_clienti_setter')
    expect(uno.nota).toBe('Un incasso per riga, dal SQL: non sommarli; il totale di tutti i tuoi clienti nel periodo: chiedi senza cliente.')

    const s = strumentiAlfire(supabaseFinto(m, [], ['incassi_clienti_setter']) as never, profiloDi('setter'), 'employee')
    expect(await esegui(s, 'miei_clienti', { da: '2026-09-01', a: '2026-09-30' })).toEqual({
      errore: 'I tuoi clienti non sono disponibili in questo momento.',
    })
  })

  it('miei_clienti: la descrizione manda al totale del SQL, mai a sommare', () => {
    const d = strumenti('setter', 'employee').miei_clienti.description
    expect(d).toContain('«Quanto hanno pagato i miei clienti questo mese?»: da/a e rispondi con totale_periodo.')
    expect(d).toContain('non sommarli mai')
  })

  it('miei_clienti con un cliente: le sue rate, ognuna con la provvigione del suo incasso', async () => {
    const m = mondo()
    m.mie_vendite_setter = venditeDelSetter()
    const esito = (await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { cliente: 'Mario' })) as {
      cliente: string
      vendite: { rate: unknown[] }[]
    }
    expect(esito.cliente).toBe('Mario Rossi')
    expect(esito.vendite).toHaveLength(1)
    expect(esito.vendite[0].rate).toEqual([
      { rata: 1, stato: 'pagata', scadenza: '2026-09-10', pagata_il: '2026-09-10', importo: 500, a_te: 25 },
      { rata: 2, stato: 'in ritardo', scadenza: '2026-09-25', importo: 500, a_te: 'matura quando paga' },
      { rata: 3, stato: 'da pagare', scadenza: '2026-11-10', importo: 500, a_te: 'matura quando paga' },
    ])
    expect(esito).not.toHaveProperty('nota')
    senzaDatiRiservati(esito)

    // two of his clients fit: he says which, among his own only
    const doppio = (await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { cliente: 'Rossi' })) as Errore
    expect(doppio).toEqual({ errore: 'Più clienti possibili tra i tuoi: Mario Rossi, Luca Rossi.', per_alfire: 'Chiedi quale, con nome e cognome.' })
    // a client he did not bring: not among his, never someone else's sale
    expect(await esegui(strumenti('setter', 'employee', m), 'miei_clienti', { cliente: 'Bianchi' })).toMatchObject({
      persona: 'Dany Montagnolo',
      vendite: [],
      nota: 'Nessun cliente «Bianchi» tra quelli che ha portato Dany Montagnolo.',
    })
  })

  it('una lettura che non riesce non diventa mai «nessun cliente»', async () => {
    const s = strumentiAlfire(supabaseFinto(mondo(), [], ['mie_vendite_setter']) as never, profiloDi('setter'), 'employee')
    expect(await esegui(s, 'miei_clienti', {})).toEqual({ errore: 'I tuoi clienti non sono disponibili in questo momento.' })
  })
})

describe('i soldi del closer in Alfire: le vendite che ha chiuso (03/10/2026)', () => {
  const oggi = oggiRoma()
  const PASSATA = aggiungiGiorni(oggi, -8)
  const FUTURA = aggiungiGiorni(oggi, 22)
  const DOPO = aggiungiGiorni(oggi, 52)

  /** An instalment as the sale page reads it, through the sale (RLS: his sales only). */
  function rataVendita(n: number, stato: string, scadenza: string, extra: Riga = {}): Riga {
    return {
      numero_rata: n,
      scadenza,
      importo_previsto: 500,
      stato,
      incassato_il: null,
      importo_incassato: null,
      metodo: 'bonifico',
      created_at: `2026-09-10T10:00:0${n}Z`,
      ...extra,
    }
  }

  /** His two sales and one of another closer, as v_vendite and sales give them (the fake filters the eq). */
  function mondoCloser(): Record<string, Riga[]> {
    const m = mondo()
    const vendita = (id: string, cliente: { nome: string; cognome: string }, extra: Riga) => ({
      id,
      tipo: 'nuovo',
      data_inizio: '2026-09-17',
      data_fine: '2026-12-16',
      valore_contratto: 1500,
      numero_rate: 3,
      prodotto_personalizzato: null,
      note: 'Nota riservata',
      cliente: { ...cliente, telefono: '+39 111 111 1111', instagram_handle: '@mario' },
      prodotto: { nome: 'Percorso Alpha 3 mesi' },
      setter: { nome: 'Loris Setter' },
      rate: [],
      ...extra,
    })
    m.sales = [
      vendita(VENDITA, { nome: 'Mario', cognome: 'Rossi' }, {
        client_id: MARIO,
        closer_id: IO,
        data_vendita: '2026-09-10',
        // out of order, as the embedded rows may come: the plan order is the instalment number
        rate: [
          rataVendita(3, 'prevista', FUTURA),
          rataVendita(1, 'incassata', '2026-09-10', { incassato_il: '2026-09-10', importo_incassato: 500 }),
          rataVendita(2, 'prevista', PASSATA),
        ],
      }),
      vendita(VENDITA_2, { nome: 'Luca', cognome: 'Rossi' }, {
        client_id: LUCA_ROSSI,
        closer_id: IO,
        data_vendita: '2026-08-01',
        tipo: 'rinnovo',
        setter: null,
        numero_rate: 1,
        valore_contratto: 900,
        rate: [rataVendita(1, 'incassata', '2026-08-01', { importo_previsto: 900, incassato_il: '2026-08-01', importo_incassato: 900, metodo: 'contanti' })],
      }),
      vendita(VENDITA_ALTRO, { nome: 'Gino', cognome: 'Altri' }, { client_id: 'c-altro', closer_id: LORENZO, data_vendita: '2026-09-20' }),
    ]
    m.v_vendite = [
      { sale_id: VENDITA, closer_id: IO, client_id: MARIO, data_vendita: '2026-09-10', incassato: 500, da_incassare: 1000, in_ritardo: 500, rate_in_ritardo: 1, prossima_scadenza: PASSATA },
      { sale_id: VENDITA_2, closer_id: IO, client_id: LUCA_ROSSI, data_vendita: '2026-08-01', incassato: 900, da_incassare: 0, in_ritardo: 0, rate_in_ritardo: 0, prossima_scadenza: null },
      { sale_id: VENDITA_ALTRO, closer_id: LORENZO, client_id: 'c-altro', data_vendita: '2026-09-20', incassato: 0, da_incassare: 1500, in_ritardo: 0, rate_in_ritardo: 0, prossima_scadenza: '2026-10-20' },
    ]
    return m
  }

  it('mie_vendite: solo le sue, con incassato e da incassare dal SQL e la prossima rata da oggi; mai contatti, metodo o note', async () => {
    const registro: string[] = []
    const esito = (await esegui(strumenti('closer', 'employee', mondoCloser(), registro), 'mie_vendite', {})) as Record<string, unknown>
    expect(registro).toContain(`v_vendite.closer_id=${IO}`)
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.vendite).toEqual([
      {
        cliente: 'Mario Rossi',
        tipo: 'Nuovo',
        prodotto: 'Percorso Alpha 3 mesi',
        venduta_il: '2026-09-10',
        percorso: { inizio: '2026-09-17', fine: '2026-12-16' },
        setter: 'Loris Setter',
        contratto: 1500,
        numero_rate: 3,
        incassato: 500,
        da_incassare: 1000,
        in_ritardo: 500,
        rate_in_ritardo: 1,
        // the late one is in in_ritardo: the next is the one still ahead (v_vendite's prossima_scadenza is the late one)
        prossima_rata: { scadenza: FUTURA, importo: 500 },
      },
      {
        cliente: 'Luca Rossi',
        tipo: 'Rinnovo',
        prodotto: 'Percorso Alpha 3 mesi',
        venduta_il: '2026-08-01',
        percorso: { inizio: '2026-09-17', fine: '2026-12-16' },
        setter: null,
        contratto: 900,
        numero_rate: 1,
        incassato: 900,
        da_incassare: 0,
      },
    ])
    expect(esito).not.toHaveProperty('nota')
    // another closer's sale never shows up
    expect(JSON.stringify(esito)).not.toContain('Gino')
    senzaDatiRiservati(esito)
  })

  it('mie_vendite da incassare: solo le vendite con rate da incassare, ognuna con le sue rate previste; le fallite a parte', async () => {
    const m = mondoCloser()
    // the first instalment did not go through: not counted in da_incassare (section 9), said apart
    const mario = m.sales.find((v) => v.id === VENDITA)!
    mario.rate = [
      rataVendita(1, 'fallita', '2026-09-10'),
      rataVendita(2, 'prevista', PASSATA),
      rataVendita(3, 'prevista', FUTURA),
      rataVendita(4, 'prevista', DOPO),
    ]
    // the SQL total of all his sales (04/10/2026): never the sum of the listed ones
    m.da_incassare_closer = [
      { totale: 2100, numero_rate: 5, vendite: 2, in_ritardo: 500, numero_in_ritardo: 1, prossimi_30: 1000, numero_prossimi_30: 2, oltre: 600, numero_oltre: 2 },
    ]
    rpcChiamate.length = 0
    const esito = (await esegui(strumenti('closer', 'employee', m), 'mie_vendite', { da_incassare: true })) as {
      solo: string
      nota: string
      totale_da_incassare: unknown
      vendite: Record<string, unknown>[]
    }
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(rpcChiamate).toContainEqual({ nome: 'da_incassare_closer', args: {} })
    expect(esito.solo).toBe('le vendite con rate da incassare')
    expect(esito.totale_da_incassare).toEqual({
      totale: 2100,
      rate: 5,
      vendite: 2,
      in_ritardo: { importo: 500, rate: 1 },
      prossimi_30_giorni: { importo: 1000, rate: 2 },
      oltre_30_giorni: { importo: 600, rate: 2 },
    })
    expect(esito.vendite.map((v) => v.cliente)).toEqual(['Mario Rossi'])
    expect(esito.vendite[0].rate_da_incassare).toEqual([
      { rata: 2, stato: 'in ritardo', scadenza: PASSATA, importo: 500 },
      { rata: 3, stato: 'da incassare', scadenza: FUTURA, importo: 500 },
      { rata: 4, stato: 'da incassare', scadenza: DOPO, importo: 500 },
    ])
    expect(esito.vendite[0].rate_fallite).toEqual([{ rata: 1, stato: 'fallita', scadenza: '2026-09-10', importo: 500 }])
    expect(esito.nota).toBe(
      'totale_da_incassare è il totale di tutte le tue vendite, dal SQL: usa quello, non sommare le vendite. rate_fallite: pagamenti non andati a buon fine, non contati in da_incassare.',
    )
    senzaDatiRiservati(esito)
  })

  it('mie_vendite: il totale da incassare solo con da_incassare, mai per un cliente o un periodo; una lettura che non riesce non è mai zero', async () => {
    rpcChiamate.length = 0
    for (const input of [{}, { cliente: 'Mario Rossi', da_incassare: true }, { da: '2026-09-01', a: '2026-09-30', da_incassare: true }]) {
      const esito = await esegui(strumenti('closer', 'employee', mondoCloser()), 'mie_vendite', input)
      expect(esito, JSON.stringify(input)).not.toHaveProperty('totale_da_incassare')
    }
    expect(rpcChiamate.map((c) => c.nome)).not.toContain('da_incassare_closer')

    const s = strumentiAlfire(supabaseFinto(mondoCloser(), [], ['da_incassare_closer']) as never, profiloDi('closer'), 'employee')
    expect(await esegui(s, 'mie_vendite', { da_incassare: true })).toEqual({ errore: 'Le tue vendite non sono disponibili in questo momento.' })
  })

  it('mie_vendite: la descrizione manda al totale del SQL, mai a sommare', () => {
    const d = strumenti('closer', 'employee').mie_vendite.description
    expect(d).toContain('«Quanto mi resta da incassare?»: da_incassare e rispondi con totale_da_incassare, mai sommando le vendite.')
  })

  it('mie_vendite con un cliente: le sue vendite con tutte le rate, nell’ordine del piano', async () => {
    const esito = (await esegui(strumenti('closer', 'employee', mondoCloser()), 'mie_vendite', { cliente: 'Mario Rossi' })) as {
      cliente: string
      vendite: { cliente: string; rate: unknown[] }[]
    }
    expect(esito.cliente).toBe('Mario Rossi')
    expect(esito.vendite.map((v) => v.cliente)).toEqual(['Mario Rossi'])
    expect(esito.vendite[0].rate).toEqual([
      { rata: 1, stato: 'incassata', scadenza: '2026-09-10', incassata_il: '2026-09-10', importo: 500 },
      { rata: 2, stato: 'in ritardo', scadenza: PASSATA, importo: 500 },
      { rata: 3, stato: 'da incassare', scadenza: FUTURA, importo: 500 },
    ])
    senzaDatiRiservati(esito)
  })

  it('mie_vendite: un cliente che non è tra i suoi non diventa mai «crealo prima»', async () => {
    const esito = await esegui(strumenti('closer', 'employee', mondoCloser()), 'mie_vendite', { cliente: 'Zzzz Nessuno' })
    expect(esito).toEqual({
      persona: 'Dany Montagnolo',
      di_chi: 'Questi sono i dati di Dany Montagnolo, cioè di chi sta chattando: mai di un’altra persona.',
      vendite: [],
      nota: 'Nessun cliente «Zzzz Nessuno» tra le tue vendite.',
    })
  })

  it('mie_vendite con da e a: le vendite chiuse in quel periodo, per data di vendita', async () => {
    const esito = (await esegui(strumenti('closer', 'employee', mondoCloser()), 'mie_vendite', { da: '2026-09-01', a: '2026-09-30' })) as {
      periodo: unknown
      vendite: { cliente: string }[]
    }
    expect(esito.periodo).toEqual({ da: '2026-09-01', a: '2026-09-30' })
    expect(esito.vendite.map((v) => v.cliente)).toEqual(['Mario Rossi'])
    expect(await esegui(strumenti('closer', 'employee', mondoCloser()), 'mie_vendite', { da: '01/09/2026' })).toEqual(DATA_SBAGLIATA)
  })

  it('una lettura che non riesce non diventa mai «nessuna vendita»', async () => {
    for (const rotta of ['v_vendite', 'sales']) {
      const s = strumentiAlfire(supabaseFinto(mondoCloser(), [], [rotta]) as never, profiloDi('closer'), 'employee')
      expect(await esegui(s, 'mie_vendite', {}), rotta).toEqual({ errore: 'Le tue vendite non sono disponibili in questo momento.' })
    }
  })
})

describe('la giornata del setter e del closer in Alfire (03/10/2026)', () => {
  it('il setter: il suo report accanto agli esiti delle sue call e ai soldi dei suoi clienti nuovi, giorno per giorno', async () => {
    const m = mondo()
    const zero = {
      dm_outbound: 0, dm_inbound: 0, conversazioni: 0, call_proposte: 0, discovery_prenotate: 0, discovery_svolte: 0, call_qualificate: 0,
      strategy_prenotate: 0, follow_up: 0, dm_totali: 0, prenotate_inbound: 0, prenotate_outbound: 0, closer_call: 0, closer_qualificate: 0,
      closer_no_show: 0, closer_follow_up: 0, closer_cancellate: 0, closer_chiuse: 0, cash: 0, revenue: 0,
    }
    m.giornate_setter = [
      { ...zero, data: null, dm_outbound: 20, dm_totali: 20, discovery_prenotate: 1, closer_call: 1, closer_chiuse: 1, cash: 500, revenue: 1500 },
      { ...zero, data: '2026-10-02', closer_call: 1, closer_chiuse: 1, cash: 500, revenue: 1500 },
      { ...zero, data: '2026-10-01', dm_outbound: 20, dm_totali: 20, discovery_prenotate: 1 },
    ]
    const esito = (await esegui(strumenti('setter', 'employee', m), 'mie_giornate', { da: '2026-10-01', a: '2026-10-03' })) as Record<string, unknown>
    // his own days whatever is asked: always himself, said explicitly (never everyone's under his name)
    expect(rpcChiamate).toContainEqual({ nome: 'giornate_setter', args: { p_da: '2026-10-01', p_a: '2026-10-03', p_setter: IO } })
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.totale).toMatchObject({
      'DM outbound': 20,
      'DM totali': 20,
      'Discovery prenotate': 1,
      'Call svolte': 1,
      Chiuse: 1,
      // what they count, in the name: never read as everything his clients paid
      'Cash (prima rata dei clienti nuovi)': 500,
      'Revenue (contratti dei clienti nuovi)': 1500,
    })
    // strategy calls are history: no column when the period has none
    expect(esito.totale).not.toHaveProperty('Strategy (storico)')
    expect(esito.giorni).toEqual([
      { data: '2026-10-02', 'Call svolte': 1, Chiuse: 1, 'Cash (prima rata dei clienti nuovi)': 500, 'Revenue (contratti dei clienti nuovi)': 1500 },
      { data: '2026-10-01', 'DM outbound': 20, 'DM totali': 20, 'Discovery prenotate': 1 },
    ])
    expect(esito.link).toBe('/my-numbers?da=2026-10-01&a=2026-10-03')
  })

  it('il closer: la sua giornata, con show rate e close rate del periodo', async () => {
    const m = mondo()
    m.giornate_closer = [
      { data: null, call: 2, qualificate: 2, no_show: 2, follow_up: 1, cancellate: 0, chiuse: 1, cash: 500, revenue: 1500, show_rate: 0.5, close_rate: 0.5 },
      { data: '2026-10-02', call: 2, qualificate: 2, no_show: 2, follow_up: 1, cancellate: 0, chiuse: 1, cash: 500, revenue: 1500, show_rate: 0.5, close_rate: 0.5 },
    ]
    const esito = (await esegui(strumenti('closer', 'employee', m), 'mie_giornate', { da: '2026-10-01', a: '2026-10-03' })) as Record<string, unknown>
    // always his own, said explicitly (the RPC keeps a closer to himself anyway)
    expect(rpcChiamate).toContainEqual({ nome: 'giornate_closer', args: { p_da: '2026-10-01', p_a: '2026-10-03', p_closer: IO } })
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.totale).toEqual({
      'Call svolte': 2,
      Qualificate: 2,
      'No show': 2,
      'Follow up (esito call)': 1,
      Cancellate: 0,
      Chiuse: 1,
      'Cash (prima rata dei clienti nuovi)': 500,
      'Revenue (contratti dei clienti nuovi)': 1500,
      'Show rate': 0.5,
      'Close rate': 0.5,
    })
    expect(esito.giorni).toEqual([
      {
        data: '2026-10-02',
        'Call svolte': 2,
        Qualificate: 2,
        'No show': 2,
        'Follow up (esito call)': 1,
        Chiuse: 1,
        'Cash (prima rata dei clienti nuovi)': 500,
        'Revenue (contratti dei clienti nuovi)': 1500,
      },
    ])
  })

  // Dany is admin and closer (CLAUDE.md section 6): his own day as the closer, as Setting › Closer with himself chosen;
  // without p_closer the RPC would give the admin every closer's days under his name
  it('l’admin: la sua giornata da closer, sempre con sé come closer, mai quella di tutti', async () => {
    const m = mondo()
    m.giornate_closer = [
      { data: null, call: 1, qualificate: 1, no_show: 0, follow_up: 0, cancellate: 0, chiuse: 1, cash: 700, revenue: 2100, show_rate: 1, close_rate: 1 },
      { data: '2026-10-01', call: 1, qualificate: 1, no_show: 0, follow_up: 0, cancellate: 0, chiuse: 1, cash: 700, revenue: 2100, show_rate: 1, close_rate: 1 },
    ]
    const esito = (await esegui(strumenti('admin', 'admin', m), 'mie_giornate', { da: '2026-10-01', a: '2026-10-03' })) as Record<string, unknown>
    expect(rpcChiamate).toEqual([{ nome: 'giornate_closer', args: { p_da: '2026-10-01', p_a: '2026-10-03', p_closer: IO } }])
    expect(Object.keys(esito).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(esito.persona).toBe(profiloDi('admin').nome)
    expect(esito.totale).toMatchObject({ 'Call svolte': 1, Chiuse: 1, 'Cash (prima rata dei clienti nuovi)': 700, 'Show rate': 1, 'Close rate': 1 })
    // the page with himself chosen: without closer it shows every closer
    expect(esito.link).toBe(`/setting/closer?closer=${IO}&da=2026-10-01&a=2026-10-03`)
    // no person to choose: another closer's day never comes from here
    for (const c of ['persona', 'closer', 'setter', 'profile_id']) expect(await campiDi(strumenti('admin', 'admin'), 'mie_giornate')).not.toContain(c)
  })

  it('una giornata che non si legge non diventa mai «niente da fare»; una data scritta male non legge il mese', async () => {
    const s = strumentiAlfire(supabaseFinto(mondo(), [], ['giornate_closer']) as never, profiloDi('closer'), 'employee')
    expect(await esegui(s, 'mie_giornate', {})).toEqual({ errore: 'La tua giornata non è disponibile in questo momento.' })
    expect(await esegui(strumenti('setter', 'employee'), 'mie_giornate', { da: '01/10/2026' })).toEqual(DATA_SBAGLIATA)
  })

  it('un periodo senza giorni: nessun totale (la riga dei totali di SQL è tutta vuota), e lo dice', async () => {
    const m = mondo()
    m.giornate_closer = [
      { data: null, call: null, qualificate: null, no_show: null, follow_up: null, cancellate: null, chiuse: null, cash: null, revenue: null, show_rate: null, close_rate: null },
    ]
    const esito = await esegui(strumenti('closer', 'employee', m), 'mie_giornate', { da: '2021-01-01', a: '2021-01-31' })
    expect(esito).toMatchObject({ totale: null, giorni: [], nota: 'Nessun giorno con attività nel periodo.' })
  })
})

// ---------------------------------------------------------------------------
// The follow-up call and the closer's numbers for the setter (Dany, 07/10/2026)
// ---------------------------------------------------------------------------
describe('la call di follow-up in Alfire (07/10/2026)', () => {
  const domani = aggiungiGiorni(oggiRoma(), 1)
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  const FOLLOW = 'ca000000-0000-4000-8000-000000000002'
  const ESITO_FOLLOW_UP = { azione: 'esito', lead: 'Luca Neri', esito: 'follow_up', qualificata: true, motivo: 'Ci deve pensare' }
  const quando = (giorno: string, ora: string) => `${giornoEsteso(giorno)} alle ${ora}`

  /** Luca Neri's held call in follow-up, with its follow-up call booked (or not) and that call too. */
  function conFollowUp(statoSeguito = 'programmata') {
    const righe = mondo()
    const seguito = { id: FOLLOW, programmata_il: '2026-10-08T16:00:00Z', stato: statoSeguito }
    righe.calls = [
      { ...righe.calls[0], call_di_follow_up: [seguito] },
      {
        ...righe.calls[0],
        id: FOLLOW,
        programmata_il: seguito.programmata_il,
        stato: statoSeguito,
        esito: null,
        qualificata: null,
        obiezione_principale: null,
        note_closer: null,
        follow_up_di: CALL,
        partenza: { id: CALL, programmata_il: '2026-09-28T13:00:00Z' },
        call_di_follow_up: [],
      },
    ]
    return righe
  }

  it('esito follow-up con la call già fissata: la scheda dice quando, con lo stesso lead e lo stesso setter', async () => {
    const input = { ...ESITO_FOLLOW_UP, follow_up_data: domani, follow_up_ora: '18:00' }
    for (const ruolo of ['closer', 'admin'] as const) {
      expect(await anteprima('call', input, ruolo), ruolo).toEqual({
        titolo: 'Registro l’esito della call con Luca Neri del 28/09/2026 alle 15:00: Follow-up',
        righe: [
          'Ora: Follow-up',
          'Qualificata: sì',
          'Motivo di non chiusura: Ci deve pensare',
          `Call di follow-up: ${quando(domani, '18:00')}, stesso lead e stesso setter (Loris Setter)`,
        ],
        sostituisceDettagli: true,
      })
    }
    // the same server action as the sheet: the outcome and the follow-up call's day together
    a.registraEsito.mockResolvedValueOnce({ ok: true, vaiA: null, followUp: FOLLOW })
    const esito = await esegui(strumenti('closer', 'employee'), 'call', input)
    expect(a.registraEsito).toHaveBeenCalledWith({
      call_id: CALL,
      esito: 'follow_up',
      qualificata: true,
      motivo: 'Ci deve pensare',
      follow_up_data: domani,
      follow_up_ora: '18:00',
    })
    expect(esito).toEqual({ fatto: true, call_di_follow_up: quando(domani, '18:00'), link: '/calls' })
    // the description tells the model where the day goes
    expect(strumenti('closer', 'employee').call.description).toContain('follow_up_data e follow_up_ora')
    expect(await campiDi(strumenti('closer', 'employee'), 'call')).toEqual(expect.arrayContaining(['follow_up_data', 'follow_up_ora']))
  })

  it('esito follow-up senza data: «Follow-up in chat»; con la call già fissata, quella', async () => {
    expect(await anteprima('call', ESITO_FOLLOW_UP, 'closer')).toMatchObject({ righe: expect.arrayContaining([FOLLOW_UP.inChat]) })
    expect(await anteprima('call', { ...ESITO_FOLLOW_UP, call_id: CALL }, 'closer', conFollowUp())).toMatchObject({
      righe: expect.arrayContaining([FOLLOW_UP.giaFissata(quandoFollowUp('2026-10-08T16:00:00Z'))]),
    })
    await esegui(strumenti('closer', 'employee'), 'call', ESITO_FOLLOW_UP)
    expect(a.registraEsito).toHaveBeenCalledWith({ call_id: CALL, esito: 'follow_up', qualificata: true, motivo: 'Ci deve pensare' })
  })

  it('il giorno della call di follow-up: come lo controlla il foglio, prima del tocco', async () => {
    const prova = (extra: Record<string, unknown>, ruolo: 'closer' | 'admin' = 'closer', righe = mondo()) =>
      anteprima('call', { ...ESITO_FOLLOW_UP, ...extra }, ruolo, righe)
    // the day without the time
    expect(await prova({ follow_up_data: domani })).toEqual({ errore: FOLLOW_UP.manca })
    // the closer from today on; the admin also a follow-up already held, but after the first call
    expect(await prova({ follow_up_data: ieri, follow_up_ora: '18:00' })).toEqual({ errore: FOLLOW_UP.soloAvanti })
    expect(await prova({ follow_up_data: '2026-09-27', follow_up_ora: '18:00' }, 'admin')).toEqual({
      errore: FOLLOW_UP.dopoLaCall('28/09/2026 alle 15:00'),
    })
    // a lost call has no follow-up call; another outcome neither
    expect(await anteprima('call', { ...ESITO_FOLLOW_UP, esito: 'persa', follow_up_data: domani, follow_up_ora: '18:00' }, 'closer')).toEqual({
      errore: FOLLOW_UP.conPersa,
    })
    expect(await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'no_show', follow_up_data: domani, follow_up_ora: '18:00' }, 'closer')).toEqual({
      errore: 'Una call di follow-up si fissa solo con l’esito Follow-up.',
    })
    // its day in data and ora would read as a move: the model reads where it goes
    expect(await prova({ data: domani, ora: '18:00' })).toEqual({
      errore: 'Il giorno della call di follow-up va a parte: questa call resta nel suo giorno.',
      per_alfire: 'Con esito follow_up il giorno e l’ora della call di follow-up vanno in follow_up_data e follow_up_ora, mai in data e ora.',
    })
    // one follow-up call per call, in the database's words
    expect(await prova({ call_id: CALL, follow_up_data: domani, follow_up_ora: '18:00' }, 'closer', conFollowUp())).toEqual({
      errore: 'Questa call ha già la sua call di follow-up, il 08/10/2026 alle 18:00: per cambiarla usa Sposta su quella.',
    })
    expect(await prova({ call_id: CALL, follow_up_data: domani, follow_up_ora: '18:00' }, 'closer', conFollowUp('svolta'))).toEqual({
      errore: 'Questa call ha già la sua call di follow-up, del 08/10/2026 alle 18:00, e ha già il suo esito: ogni call ha una sola call di follow-up.',
    })
    expect(a.registraEsito).not.toHaveBeenCalled()
  })

  it('l’esito salvato senza la call di follow-up: lo dice, senza rifare l’esito', async () => {
    const avviso = 'Esito salvato, ma la call di follow-up non è fissata: Al massimo 6 mesi da oggi'
    a.registraEsito.mockResolvedValueOnce({ ok: true, vaiA: null, avviso })
    expect(await esegui(strumenti('closer', 'employee'), 'call', { ...ESITO_FOLLOW_UP, follow_up_data: domani, follow_up_ora: '18:00' })).toEqual({
      fatto: true,
      avviso,
      link: '/calls',
    })
  })

  it('«Fissa la call di follow-up» su una call svolta in follow-up: il lead, il momento e chi tiene la vendita', async () => {
    const input = { azione: 'follow_up', lead: 'Luca Neri', follow_up_data: domani, follow_up_ora: '18:00' }
    for (const ruolo of ['closer', 'admin'] as const) {
      expect(await anteprima('call', input, ruolo), ruolo).toEqual({
        titolo: `Fisso la call di follow-up con Luca Neri: ${quando(domani, '18:00')}`,
        righe: [
          'Follow-up della call del 28/09/2026 alle 15:00',
          'Stesso lead e stesso setter: se chiude, la vendita resta di Loris Setter',
          'Una call nuova, da fare nel suo giorno: conta nei numeri del closer come ogni call.',
        ],
        sostituisceDettagli: true,
      })
    }
    a.fissaFollowUp.mockResolvedValueOnce({ ok: true, id: FOLLOW })
    expect(await esegui(strumenti('closer', 'employee'), 'call', input)).toEqual({
      fatto: true,
      call_di_follow_up: quando(domani, '18:00'),
      link: '/calls',
    })
    expect(a.fissaFollowUp).toHaveBeenCalledWith({ call_id: CALL, data: domani, ora: '18:00' })
    // said as data and ora: the same day (nothing else to mean there)
    await esegui(strumenti(), 'call', { azione: 'follow_up', lead: 'Luca Neri', data: domani, ora: '09:30' })
    expect(a.fissaFollowUp).toHaveBeenLastCalledWith({ call_id: CALL, data: domani, ora: '09:30' })
    // without a setter on the call: the same lead and closer
    const senzaSetter = mondo()
    senzaSetter.calls = [{ ...senzaSetter.calls[0], setter_id: null }]
    expect(await anteprima('call', input, 'closer', senzaSetter)).toMatchObject({ righe: expect.arrayContaining([FOLLOW_UP.senzaSetter]) })
  })

  it('«Fissa la call di follow-up»: mai al setter, mai su una call non in follow-up o che ce l’ha già', async () => {
    const input = { azione: 'follow_up', lead: 'Luca Neri', follow_up_data: domani, follow_up_ora: '18:00' }
    expect(await anteprima('call', input, 'setter')).toEqual({ errore: 'Dati non validi per questa operazione.' })
    const daFare = mondo()
    daFare.calls = [{ ...daFare.calls[0], stato: 'programmata', esito: null }]
    expect(await anteprima('call', input, 'closer', daFare)).toEqual({ errore: FOLLOW_UP.soloSuFollowUp })
    expect(await anteprima('call', { ...input, call_id: CALL }, 'closer', conFollowUp())).toEqual({
      errore: 'Questa call ha già la sua call di follow-up, il 08/10/2026 alle 18:00: per cambiarla usa Sposta su quella.',
    })
    expect(await anteprima('call', { azione: 'follow_up', lead: 'Luca Neri' }, 'closer')).toEqual({
      errore: 'Dimmi il giorno e l’ora della call di follow-up.',
    })
    // one handed to another closer: the database's words, never its day, never a booking that fails
    const nascosta = mondo()
    nascosta.calls = [{ ...nascosta.calls[0], call_di_follow_up: [], ha_follow_up: true }]
    expect(await anteprima('call', input, 'closer', nascosta)).toEqual({ errore: FOLLOW_UP.altroCloser })
    expect(await anteprima('call', { ...ESITO_FOLLOW_UP, follow_up_data: domani, follow_up_ora: '18:00' }, 'closer', nascosta)).toEqual({
      errore: FOLLOW_UP.altroCloser,
    })
    await esegui(strumenti('closer', 'employee', daFare), 'call', input)
    expect(a.fissaFollowUp).not.toHaveBeenCalled()
  })

  it('tra le call di un lead: la call di follow-up si fissa su quella svolta in follow-up che non ce l’ha', async () => {
    const VECCHIA = 'ca000000-0000-4000-8000-000000000003'
    const righe = conFollowUp()
    // an older held call in follow-up, without its follow-up call
    righe.calls.push({ ...righe.calls[0], id: VECCHIA, programmata_il: '2026-09-20T13:00:00Z', call_di_follow_up: [] })
    a.fissaFollowUp.mockResolvedValueOnce({ ok: true, id: 'nuova' })
    await esegui(strumenti('closer', 'employee', righe), 'call', { azione: 'follow_up', lead: 'Luca Neri', follow_up_data: domani, follow_up_ora: '18:00' })
    expect(a.fissaFollowUp).toHaveBeenCalledWith({ call_id: VECCHIA, data: domani, ora: '18:00' })
    // the outcome still goes to the lead's one open call: its follow-up call
    await esegui(strumenti('closer', 'employee', conFollowUp()), 'call', { azione: 'esito', lead: 'Luca Neri', esito: 'chiusa' })
    expect(a.registraEsito).toHaveBeenCalledWith({ call_id: FOLLOW, esito: 'chiusa' })
    // two held calls: the candidates say which is the follow-up of which
    const due = conFollowUp('svolta')
    due.calls[1] = { ...due.calls[1], esito: 'persa' }
    const p = (await anteprima('call', { azione: 'modifica', lead: 'Luca Neri', note_closer: 'X' }, 'closer', due)) as Errore
    expect(p.errore).toContain('Più call con Luca Neri')
    expect(p.errore).toContain(`(persa, follow-up della call del ${quandoBreve('2026-09-28T13:00:00Z')})`)
    expect(p.errore).toContain(`(follow_up, call di follow-up: ${quandoFollowUp('2026-10-08T16:00:00Z')})`)
  })

  it('call_periodo: la call di follow-up dice di quale call è, quella in follow-up se ha la sua e quando', async () => {
    const righe = conFollowUp()
    const letto = (await esegui(strumenti('admin', 'admin', righe), 'call_periodo', { da: '2026-09-28', a: '2026-10-08' })) as {
      call: Record<string, unknown>[]
    }
    expect(letto.call).toEqual([
      expect.objectContaining({ call_id: CALL, call_di_follow_up: `call di follow-up: ${quandoFollowUp('2026-10-08T16:00:00Z')}` }),
      expect.objectContaining({ call_id: FOLLOW, follow_up_della_call: `follow-up della call del ${quandoBreve('2026-09-28T13:00:00Z')}` }),
    ])
    expect(letto.call[0]).not.toHaveProperty('follow_up_della_call')
    expect(letto.call[1]).not.toHaveProperty('call_di_follow_up')
    // the follow-up call carries the first call's setter, but the closer booked it: never his booking
    expect(letto.call[1]).toMatchObject({ fissata_da: FISSATA_DA_FOLLOW_UP })
    expect(letto.call[0]).not.toHaveProperty('fissata_da')
    // its first call deleted: still a follow-up call, still not booked by the setter
    const senzaPartenza = conFollowUp()
    senzaPartenza.calls = [{ ...senzaPartenza.calls[1], follow_up_di: null, di_follow_up: true, partenza: null }]
    const orfana = (await esegui(strumenti('setter', 'employee', senzaPartenza), 'call_periodo', { da: '2026-10-08', a: '2026-10-08' })) as {
      call: Record<string, unknown>[]
    }
    expect(orfana.call[0]).toMatchObject({ follow_up_della_call: 'follow-up di una call precedente', fissata_da: FISSATA_DA_FOLLOW_UP })
    // handed to another closer: the first call's closer reads that it is there, never when
    const nascosta = mondo()
    nascosta.calls = [{ ...nascosta.calls[0], call_di_follow_up: [], ha_follow_up: true }]
    const altro = (await esegui(strumenti('closer', 'employee', nascosta), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as {
      call: Record<string, unknown>[]
    }
    expect(altro.call[0]).toMatchObject({ call_di_follow_up: 'call di follow-up fissata, assegnata a un altro closer' })
    // a held call in follow-up without one goes on by chat; any other call says nothing
    const solo = (await esegui(strumenti('setter', 'employee'), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as { call: Record<string, unknown>[] }
    expect(solo.call[0]).toMatchObject({ call_di_follow_up: 'follow-up in chat' })
    const daFare = mondo()
    daFare.calls = [{ ...daFare.calls[0], stato: 'programmata', esito: null }]
    const nessuno = (await esegui(strumenti('closer', 'employee', daFare), 'call_periodo', { da: '2026-09-28', a: '2026-09-28' })) as { call: Record<string, unknown>[] }
    expect(nessuno.call[0]).not.toHaveProperty('call_di_follow_up')
    expect(nessuno.call[0]).not.toHaveProperty('follow_up_della_call')
  })

  it('la scheda dall’input: la call di follow-up col suo giorno', () => {
    expect(riassuntoScrittura('call', { azione: 'follow_up', lead: 'Luca Neri', follow_up_data: '2026-10-08', follow_up_ora: '18:00' })).toEqual({
      titolo: 'Fisso la call di follow-up con Luca Neri',
      dettagli: [quando('2026-10-08', '18:00')],
    })
    expect(riassuntoScrittura('call', { ...ESITO_FOLLOW_UP, follow_up_data: '2026-10-08', follow_up_ora: '18:00' }).dettagli).toContain(
      `Call di follow-up: ${quando('2026-10-08', '18:00')}`,
    )
    expect(azioneDistruttiva('call', { azione: 'follow_up', lead: 'Luca Neri' })).toBeNull()
  })
})

describe('i numeri del closer per il setter (07/10/2026)', () => {
  const RIGHE = [
    { data: null, call: 3, qualificate: 2, no_show: 1, follow_up: 1, cancellate: 0, chiuse: 1, cash: 617.28, revenue: 1234.56, show_rate: 0.75, close_rate: 0.3333 },
    { data: '2026-10-06', call: 2, qualificate: 1, no_show: 1, follow_up: 1, cancellate: 0, chiuse: 0, cash: 0, revenue: 0, show_rate: 0.6667, close_rate: 0 },
    { data: '2026-10-05', call: 1, qualificate: 1, no_show: 0, follow_up: 0, cancellate: 0, chiuse: 1, cash: 617.28, revenue: 1234.56, show_rate: 1, close_rate: 1 },
  ]

  it('di tutti i closer: la pagina Closer giorno per giorno, detto per primo che non sono i suoi', async () => {
    const m = mondo()
    m.giornate_closer = RIGHE
    const esito = (await esegui(strumenti('setter', 'employee', m), 'giornate_closer', { da: '2026-10-05', a: '2026-10-07' })) as Record<string, unknown>
    // every closer: no person passed, as the page's «Tutti i closer»
    expect(rpcChiamate).toEqual([{ nome: 'giornate_closer', args: { p_da: '2026-10-05', p_a: '2026-10-07' } }])
    expect(Object.keys(esito).slice(0, 2)).toEqual(['numeri_di', 'di_chi'])
    expect(esito.numeri_di).toBe('tutti i closer')
    expect(esito.di_chi).toBe(
      'I numeri del closer (tutti i closer) sulle call fissate da tutti i setter, come la pagina Closer: non sono i numeri di Dany Montagnolo, che sta chattando (i suoi sono in mie_giornate).',
    )
    expect(esito.totale).toEqual({
      'Call svolte': 3,
      Qualificate: 2,
      'No show': 1,
      'Follow up (esito call)': 1,
      Cancellate: 0,
      Chiuse: 1,
      'Cash (prima rata dei clienti nuovi)': 617.28,
      'Revenue (contratti dei clienti nuovi)': 1234.56,
      'Show rate': 0.75,
      'Close rate': 0.3333,
    })
    expect(esito.giorni).toEqual([
      { data: '2026-10-06', 'Call svolte': 2, Qualificate: 1, 'No show': 1, 'Follow up (esito call)': 1 },
      {
        data: '2026-10-05',
        'Call svolte': 1,
        Qualificate: 1,
        Chiuse: 1,
        'Cash (prima rata dei clienti nuovi)': 617.28,
        'Revenue (contratti dei clienti nuovi)': 1234.56,
      },
    ])
    expect(esito.link).toBe('/setting/closer?da=2026-10-05&a=2026-10-07')
    // "tutti" said in words is the same
    rpcChiamate.length = 0
    await esegui(strumenti('setter', 'employee', m), 'giornate_closer', { closer: 'tutti i closer' })
    expect(rpcChiamate[0].args).not.toHaveProperty('p_closer')
  })

  it('di un closer detto per nome, tra quelli della pagina (i closer e l’admin attivi)', async () => {
    const m = mondo()
    m.giornate_closer = RIGHE
    const esito = (await esegui(strumenti('setter', 'employee', m), 'giornate_closer', { da: '2026-10-05', a: '2026-10-07', closer: 'Lorenzo' })) as Record<string, unknown>
    expect(rpcChiamate).toEqual([{ nome: 'giornate_closer', args: { p_da: '2026-10-05', p_a: '2026-10-07', p_closer: LORENZO } }])
    expect(esito.numeri_di).toBe('Lorenzo Closer')
    expect(esito.link).toBe(`/setting/closer?closer=${LORENZO}&da=2026-10-05&a=2026-10-07`)
    // a setter is no closer: the names to choose from
    expect(await esegui(strumenti('setter', 'employee', m), 'giornate_closer', { closer: 'Loris' })).toEqual({
      errore: 'Nessun closer «Loris». Closer: Dany Montagnolo, Lorenzo Closer.',
    })
  })

  it('una lettura che non riesce non è mai «niente»; una data scritta male non legge il mese; nessun giorno lo dice', async () => {
    const s = strumentiAlfire(supabaseFinto(mondo(), [], ['giornate_closer']) as never, profiloDi('setter'), 'employee')
    expect(await esegui(s, 'giornate_closer', {})).toEqual({ errore: 'I numeri del closer non sono disponibili in questo momento.' })
    expect(await esegui(strumenti('setter', 'employee'), 'giornate_closer', { da: '05/10/2026' })).toEqual(DATA_SBAGLIATA)
    const m = mondo()
    m.giornate_closer = [{ ...RIGHE[0], call: null, qualificate: null, no_show: null, chiuse: null, cash: null, revenue: null }]
    expect(await esegui(strumenti('setter', 'employee', m), 'giornate_closer', { da: '2021-01-01', a: '2021-01-31' })).toMatchObject({
      totale: null,
      giorni: [],
      nota: 'Nessun giorno con attività nel periodo.',
    })
  })

  it('le descrizioni: i numeri del closer non sono i suoi, e mie_giornate manda lì', () => {
    const setter = strumenti('setter', 'employee')
    expect(setter.giornate_closer.description).toContain('sulle call fissate da tutti i setter')
    expect(setter.giornate_closer.description).toContain('Non sono i numeri di chi chatta: i suoi sono in mie_giornate.')
    expect(setter.mie_giornate.description).toContain('I numeri del closer sulle call di tutti i setter: giornate_closer.')
    // the closer reads only his own; the admin as before
    expect(Object.keys(strumenti('closer', 'employee'))).not.toContain('giornate_closer')
    expect(Object.keys(strumenti('admin', 'admin'))).not.toContain('giornate_closer')
  })
})

describe('la guida dopo il 07/10/2026: Setter e Closer, il follow-up, la vendita della call chiusa, il riepilogo del venerdì', () => {
  const testo = async (ruolo: AppRole, argomento: string) =>
    ((await esegui(strumenti(ruolo, ruolo === 'admin' ? 'admin' : 'employee'), 'guida', { argomento })) as { testo: string }).testo

  it('il menu dal lato di chi legge: l’admin due voci, il setter la pagina Closer', async () => {
    const admin = await testo('admin', 'setting')
    expect(admin).toContain('«Setter» (/setting)')
    expect(admin).toContain('«Closer» (/setting/closer), che si apre sulle call da registrare')
    expect(admin).not.toContain('Scheda Closer')
    const setter = await testo('setter', 'setting')
    expect(setter).toContain('La pagina Closer (/setting/closer; sul telefono in «Altro»)')
    expect(setter).toContain('Mai le call, i lead o le note degli altri setter.')
    expect(setter).not.toContain('«Setter» (/setting)')
    expect(await testo('setter', 'permessi')).toContain('Nella pagina Closer (/setting/closer), in sola lettura')
    expect(await testo('setter', 'alfire')).toContain('i numeri del closer sulle call di tutti i setter')
    expect(await testo('admin', 'permessi')).toContain('Nella pagina Closer (/setting/closer) legge i numeri del closer')
  })

  it('il follow-up e la vendita della call chiusa, per chi legge le call', async () => {
    for (const ruolo of ['admin', 'setter', 'closer'] as const) {
      const call = await testo(ruolo, 'call')
      expect(call, ruolo).toContain('«Hai fissato una call di follow-up?»')
      expect(call, ruolo).toContain('«Fissa la call di follow-up»')
      expect(call, ruolo).toContain('la vendita resta del setter della prima call')
      expect(call, ruolo).toContain('«Registra la vendita»')
      expect(call, ruolo).toContain('mostra in cima le loro call passate ancora senza esito («Da registrare»)')
    }
    expect(await testo('closer', 'vendite')).toContain('«Vendita da registrare»')
    expect(await testo('closer', 'alfire')).toContain('anche la call di follow-up')
  })

  it('il riepilogo del venerdì sera è dell’admin: mai nei testi del team', async () => {
    expect(await testo('admin', 'panoramica')).toContain('solo il venerdì sera')
    for (const ruolo of ['setter', 'closer', 'coach'] as const) {
      for (const argomento of await azioniDi(strumenti(ruolo, 'employee'), 'guida', 'argomento')) {
        expect(await testo(ruolo, argomento), `${ruolo}: ${argomento}`).not.toMatch(/riepilogo|venerdì sera/)
      }
    }
  })
})

describe('la registrazione di Fathom con l’esito (Dany, 16/10/2026)', () => {
  const ESITO = { azione: 'esito', lead: 'Luca Neri', esito: 'persa', qualificata: true, motivo: 'Troppo caro' }
  const NUOVA = 'Manca la registrazione della call: incolla il link di Fathom, oppure dimmi che la call non è stata registrata.'

  /** Luca Neri's call after the day the link became required, still without a recording. */
  function callDopo() {
    const righe = mondo()
    righe.calls = [{ ...righe.calls[0], programmata_il: '2026-10-20T13:00:00Z', link_registrazione: null, registrazione: null }, ...righe.calls.slice(1)]
    return righe
  }

  it('una call svolta dopo il 16/10 non si registra senza il link o senza «non registrata»', async () => {
    for (const ruolo of ['closer', 'admin'] as const) {
      const r = await anteprima('call', ESITO, ruolo, callDopo())
      expect(r, ruolo).toMatchObject({ errore: NUOVA })
    }
    // the older call of the same lead is not asked
    expect(await anteprima('call', ESITO, 'closer')).not.toMatchObject({ errore: NUOVA })
  })

  it('con il link o con «non registrata» la scheda lo dice e l’esito parte con la scelta', async () => {
    const link = 'https://fathom.video/share/AbCdEf123456789_xyz'
    const conLink = await anteprima('call', { ...ESITO, registrazione: link }, 'closer', callDopo())
    expect(conLink).not.toHaveProperty('errore')
    expect(JSON.stringify(conLink)).toContain('Registrazione: link di Fathom')
    const senza = await anteprima('call', { ...ESITO, registrazione: 'non registrata' }, 'closer', callDopo())
    expect(JSON.stringify(senza)).toContain('Registrazione: call non registrata')
  })

  it('no show e cancellata non la chiedono', async () => {
    const r = await anteprima('call', { azione: 'esito', lead: 'Luca Neri', esito: 'no_show' }, 'closer', callDopo())
    expect(r).not.toMatchObject({ errore: NUOVA })
  })

  it('il setter non ha la performance né il link nelle letture, e non registra l’esito', async () => {
    expect(await campiDi(strumenti('setter', 'employee'), 'call')).not.toContain('registrazione')
    expect(await campiDi(strumenti('closer', 'employee'), 'call')).toContain('registrazione')
  })
})
