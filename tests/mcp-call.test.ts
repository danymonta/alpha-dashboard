import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { SPOSTA } from '@/lib/call/spostamento'
import * as call from '@/lib/mcp/call'
import type { ContestoMcp, RuoloMcp } from '@/lib/mcp/contesto'
import { schemaMcp } from '@/lib/mcp/schema'
import { STRUMENTI } from '@/lib/mcp/strumenti'
import { MOTIVO_NON_CHIUSURA } from '@/lib/setting/commento'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The MCP tools on calls, leads and outcomes (Claude a 360 gradi, phase 2,
 * 23/10/2026) against a fake client: what reaches the database, as whom, and
 * what never does (an outcome from a setter, an amount or a Fathom link to the
 * setter, a deletion). The outcome follows the rules of the app's sheet.
 */

const IO = '33333333-3333-4333-8333-333333333333'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const SETTER = '22222222-2222-4222-8222-222222222222'
const CALL = 'a1020000-0000-4000-8000-000000000013'
const LEAD = 'a1020000-0000-4000-8000-000000000001'

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

beforeEach(() => {
  rispondi = () => ({ data: [] })
  fake = supabaseFinto((c) => rispondi(c))
})

function contesto(ruolo: RuoloMcp = 'closer', persona = IO): ContestoMcp {
  return { db: fake.client as never, ruolo, livello: 'employee', persona, sessione: 's' }
}

function rpc(nome: string) {
  const c = fake.chiamate.find((x) => x.tipo === 'rpc' && x.nome === nome)
  return c ? (argomenti(c, 'args')?.[0] as Record<string, unknown>) : undefined
}

/** A row of call_per_claude: a held, lost call of today, with its link and its amount. */
function riga(campi: Record<string, unknown> = {}) {
  return {
    id: CALL,
    lead_id: LEAD,
    lead_nome: 'Lead Centodue',
    lead_handle: '@lead.centodue',
    lead_stato: 'follow_up',
    lead_fonte: 'dm_inbound',
    setter_id: SETTER,
    setter_nome: 'Loris',
    closer_id: IO,
    closer_nome: 'Closer',
    tipo: 'discovery',
    programmata_il: new Date(Date.now() - 3_600_000).toISOString(),
    stato: 'programmata',
    esito: null,
    qualificata: null,
    motivo: null,
    note_setter: 'Nota del setter',
    note_closer: null,
    spostata_dal: null,
    volte_spostata: 0,
    follow_up_di: null,
    di_follow_up: false,
    partenza_il: null,
    follow_up_id: null,
    follow_up_il: null,
    follow_up_stato: null,
    importata: false,
    prenotata_il: new Date().toISOString(),
    prodotto_proposto_id: null,
    prodotto: null,
    link_registrazione: 'https://fathom.video/share/centodue',
    performance: 'buona',
    importo_proposto: 1500,
    registrazione: 'collegata',
    totale: 1,
    ...campi,
  }
}

describe('le letture: le call da call_per_claude, con le colonne del ruolo', () => {
  it('elenco_call del setter: mai il link di Fathom, la performance o un importo, nemmeno se arrivassero', async () => {
    rispondi = (c) => (c.nome === 'call_per_claude' ? { data: [riga()] } : { data: [] })
    const esito = await call.elencoCall({}, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    const testo = JSON.stringify(esito.ok ? esito.dati : null)
    expect(testo).not.toContain('fathom.video')
    expect(testo).not.toContain('1500')
    expect(testo).not.toMatch(/"performance"|"registrazione"|"importo_proposto"/)
    expect(testo).toContain('Lead Centodue')
    // a default window, the table of the calls never read directly
    expect(rpc('call_per_claude')).toMatchObject({ p_limite: 50 })
    expect(rpc('call_per_claude')?.p_da).toBeDefined()
    expect(fake.chiamate.some((c) => c.tipo === 'from' && c.nome === 'calls')).toBe(false)
  })

  it('leggi_call del closer: registrazione, performance e importo, e gli stati con le parole dell’app', async () => {
    rispondi = (c) => (c.nome === 'call_per_claude' ? { data: [riga({ stato: 'riprogrammata' })] } : { data: [] })
    const esito = await call.leggiCall({ call_id: CALL }, contesto('closer'))
    expect(esito.ok).toBe(true)
    const dati = (esito.ok ? esito.dati : {}) as { call: Record<string, unknown> }
    expect(dati.call).toMatchObject({
      stato: SPOSTA.attesa.etichetta,
      performance: 'Buona',
      importo_proposto: 1500,
      registrazione: { link: 'https://fathom.video/share/centodue', stato: 'collegata' },
    })
    expect(rpc('call_per_claude')).toEqual({ p_id: CALL })
  })

  it('una call che non vede: la frase, mai un errore grezzo', async () => {
    const esito = await call.leggiCall({ call_id: CALL }, contesto('closer'))
    expect(esito).toEqual({ ok: false, messaggio: 'Questa call non c’è, o non è tra quelle che vedi.', esito: 'non_trovato' })
  })

  it('una lettura che fallisce non vale «nessuna call»: lancia', async () => {
    rispondi = () => ({ error: { code: '42501', message: 'no' } })
    await expect(call.elencoCall({}, contesto('closer'))).rejects.toThrow()
  })

  it('elenco_lead: la pipeline contata dal database e la ricerca senza sintassi di PostgREST', async () => {
    rispondi = (c) => {
      if (c.nome === 'leads' && ha(c, 'select', 'id', { count: 'exact', head: true })) return { count: 2 }
      if (c.nome === 'leads') return { data: [{ id: LEAD, nome: 'Lead', instagram_handle: null, fonte: 'referral', stato: 'perso', setter_id: SETTER, note: null, created_at: new Date().toISOString() }] }
      if (c.nome === 'profiles') return { data: [{ id: SETTER, nome: 'Loris' }] }
      return { data: [] }
    }
    const esito = await call.elencoLead({ cerca: 'ma,rio*(x)' }, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    expect(esito.ok && esito.dati.pipeline).toEqual({ 'Call da fare': 2, 'Follow-up': 2, Cliente: 2, Perso: 2 })
    const lista = fake.chiamate.find((c) => c.nome === 'leads' && ha(c, 'or'))
    expect(lista && argomenti(lista, 'or')?.[0]).toBe('nome.ilike.*ma rio  x*,instagram_handle.ilike.*ma rio  x*')
  })
})

describe('le scritture passano dal nucleo dell’app, con le sue regole', () => {
  it('registra_esito: con persa servono qualificata e motivo, con le parole del foglio', async () => {
    const esito = await call.registraEsito({ call_id: CALL, esito: 'persa', qualificata: true }, contesto())
    expect(esito).toEqual({ ok: false, messaggio: MOTIVO_NON_CHIUSURA.manca, esito: undefined })
    expect(fake.chiamate).toHaveLength(0)
  })

  it('registra_esito: senza la registrazione di Fathom su una call di oggi non salva niente', async () => {
    rispondi = (c) => {
      if (c.nome === 'calls') return { data: { programmata_il: new Date().toISOString(), link_registrazione: null } }
      if (c.nome === 'call_registrazioni') return { data: null }
      return { data: [] }
    }
    const esito = await call.registraEsito(
      { call_id: CALL, esito: 'persa', qualificata: true, motivo: 'Deve parlarne con la moglie' },
      contesto(),
    )
    expect(esito.ok).toBe(false)
    expect(!esito.ok && esito.messaggio).toMatch(/Manca la registrazione della call/)
    expect(fake.chiamate.some((c) => ha(c, 'update'))).toBe(false)
  })

  it('registra_esito: persa con «non registrata», l’update del closer sulle sue call e collega_registrazione', async () => {
    rispondi = (c) => {
      if (c.nome === 'calls' && ha(c, 'update')) return { data: { id: CALL } }
      if (c.nome === 'calls') return { data: { programmata_il: new Date().toISOString(), link_registrazione: null } }
      if (c.nome === 'call_registrazioni') return { data: null }
      if (c.nome === 'call_per_claude') return { data: [riga({ stato: 'svolta', esito: 'persa' })] }
      return { data: null }
    }
    const esito = await call.registraEsito(
      { call_id: CALL, esito: 'persa', qualificata: false, motivo: 'Prezzo', non_registrata: true },
      contesto(),
    )
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => c.nome === 'calls' && ha(c, 'update'))
    expect(update && argomenti(update, 'update')?.[0]).toEqual({
      stato: 'svolta',
      esito: 'persa',
      qualificata: false,
      obiezione_principale: 'Prezzo',
    })
    expect(update && ha(update, 'eq', 'closer_id', IO)).toBe(true)
    expect(rpc('collega_registrazione')).toEqual({ p_call_id: CALL, p_scelta: { tipo: 'non_registrata' } })
  })

  it('registra_esito: il link e «non registrata» insieme, o un giorno nuovo con un altro esito, si fermano prima', async () => {
    const due = await call.registraEsito(
      { call_id: CALL, esito: 'chiusa', link_fathom: 'https://fathom.video/share/x', non_registrata: true },
      contesto(),
    )
    expect(due.ok).toBe(false)
    const giorno = await call.registraEsito({ call_id: CALL, esito: 'no_show', data: '2026-11-02', ora: '18:00' }, contesto())
    expect(giorno.ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })

  it('registra_esito da un setter (se mai arrivasse): la frase dell’app, nessuna scrittura', async () => {
    const esito = await call.registraEsito({ call_id: CALL, esito: 'no_show' }, contesto('setter', SETTER))
    expect(esito).toEqual({ ok: false, messaggio: 'L’esito lo registra chi ha fatto la call.', esito: undefined })
    expect(fake.chiamate).toHaveLength(0)
  })

  it('fissa_call del setter: sempre discovery, per sé, col closer predefinito dell’app (il primo admin)', async () => {
    rispondi = (c) => {
      if (c.nome === 'profiles') return { data: [{ id: ADMIN, ruolo: 'admin' }, { id: IO, ruolo: 'closer' }] }
      if (c.nome === 'fissa_call') return { data: { id_call: CALL, id_lead: LEAD, lead_esistente: false } }
      if (c.nome === 'call_per_claude') return { data: [riga()] }
      return { data: [] }
    }
    const domani = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const esito = await call.fissaCall({ nome: 'Mario Rossi', fonte: 'dm_inbound', data: domani, ora: '18:00' }, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    expect(rpc('fissa_call')).toMatchObject({ p_nome: 'Mario Rossi', p_tipo: 'discovery', p_closer_id: ADMIN })
    expect(rpc('fissa_call')?.p_setter_id).toBeUndefined()
  })

  it('fissa_call: il setter non fissa per un altro', async () => {
    const esito = await call.fissaCall(
      { nome: 'Mario Rossi', fonte: 'dm_inbound', data: '2026-11-02', ora: '18:00', setter_id: ADMIN },
      contesto('setter', SETTER),
    )
    expect(esito.ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })

  it('modifica_call: il setter non cambia il tipo, il closer non scrive le note del setter', async () => {
    rispondi = (c) => (c.nome === 'call_per_claude' ? { data: [riga()] } : { data: [] })
    const tipo = await call.modificaCall({ call_id: CALL, tipo: 'strategy' }, contesto('setter', SETTER))
    expect(tipo).toEqual({ ok: false, messaggio: 'Il tipo della call lo cambiano il closer e l’admin.', esito: undefined })
    const note = await call.modificaCall({ call_id: CALL, note: 'Mie' }, contesto('closer'))
    expect(note.ok).toBe(false)
    expect(fake.chiamate.some((c) => c.nome === 'modifica_call')).toBe(false)
  })

  it('modifica_call del setter: passa la call a un altro closer, il resto resta com’è', async () => {
    // the core reads the type of the setter's call through call_per_claude too (one row: maybeSingle)
    rispondi = (c) =>
      c.nome === 'call_per_claude' ? { data: ha(c, 'maybeSingle') ? riga() : [riga()] } : { data: null }
    const esito = await call.modificaCall({ call_id: CALL, closer_id: ADMIN }, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    expect(rpc('modifica_call')).toMatchObject({ p_call_id: CALL, p_tipo: 'discovery', p_closer_id: ADMIN, p_note: 'Nota del setter' })
    expect(fake.chiamate.some((c) => c.nome === 'dettagli_call')).toBe(false)
  })

  it('dettagli_call: solo quello che dice cambia, "" toglie l’importo come nell’app', async () => {
    rispondi = (c) => (c.nome === 'call_per_claude' ? { data: [riga()] } : { data: null })
    const esito = await call.dettagliCall({ call_id: CALL, importo_proposto: '' }, contesto('closer'))
    expect(esito.ok).toBe(true)
    expect(rpc('dettagli_call')).toMatchObject({
      p_call_id: CALL,
      p_link_registrazione: 'https://fathom.video/share/centodue',
      p_performance: 'buona',
    })
    expect(rpc('dettagli_call')?.p_importo_proposto).toBeUndefined()
    // the closer never sends the setter's note
    expect(rpc('modifica_call')?.p_note).toBeUndefined()
  })

  it('stato_lead: aggiorna_stato_lead, e il rifiuto del database in parole', async () => {
    rispondi = () => ({ error: { code: '42501', message: 'Lead non trovato o non tuo' } })
    const esito = await call.statoLead({ lead_id: LEAD, stato: 'perso' }, contesto('setter', SETTER))
    expect(esito).toEqual({ ok: false, messaggio: 'Questo lead non c’è, o non è tra quelli che vedi.', esito: undefined })
    expect(rpc('aggiorna_stato_lead')).toEqual({ p_lead_id: LEAD, p_stato: 'perso' })
  })
})

describe('gli strumenti delle call', () => {
  const nomi = ['elenco_call', 'leggi_call', 'elenco_lead', 'prodotti', 'fissa_call', 'registra_esito', 'sposta_call', 'fissa_follow_up', 'modifica_call', 'dettagli_call', 'stato_lead']

  it('nessuno elimina, e i loro schemi si leggono come JSON Schema', () => {
    for (const nome of nomi) {
      const s = STRUMENTI.find((x) => x.nome === nome)
      expect(s, nome).toBeDefined()
      expect(s!.nome).not.toMatch(/elimina|scollega/)
      expect(schemaMcp(s!.input)['~standard'].jsonSchema.input({ target: 'draft-2020-12' })).toMatchObject({ type: 'object' })
    }
  })

  it('i ruoli: le letture ad admin, setter e closer; esito, follow-up e dettagli al closer e all’admin; fissare al setter e all’admin', () => {
    const ruoli = Object.fromEntries(STRUMENTI.filter((s) => nomi.includes(s.nome)).map((s) => [s.nome, [...s.ruoli].sort()]))
    expect(ruoli.elenco_call).toEqual(['admin', 'closer', 'setter'])
    expect(ruoli.registra_esito).toEqual(['admin', 'closer'])
    expect(ruoli.dettagli_call).toEqual(['admin', 'closer'])
    expect(ruoli.fissa_follow_up).toEqual(['admin', 'closer'])
    expect(ruoli.fissa_call).toEqual(['admin', 'setter'])
    expect(ruoli.sposta_call).toEqual(['admin', 'closer', 'setter'])
  })
})
