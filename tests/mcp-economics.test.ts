import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { aggiungiMesi, oggiRoma, primoDelMeseISO } from '@/lib/date'
import type { ContestoMcp, RuoloMcp } from '@/lib/mcp/contesto'
import * as economics from '@/lib/mcp/economics'
import { schemaMcp } from '@/lib/mcp/schema'
import { STRUMENTI } from '@/lib/mcp/strumenti'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The MCP tools on costs, commissions, the month's goals, the Panoramica's
 * economics and the team (Claude a 360 gradi, phase 4, 23/10/2026) against a
 * fake client: every number from the SQL functions of the pages (never summed
 * here), the writes through the shared core with the app's schemas, nothing
 * deleted, the setter only through miei_numeri_periodo.
 */

const ADMIN = '11111111-1111-4111-8111-111111111111'
const SETTER = '22222222-2222-4222-8222-222222222222'
const COSTO = 'e1040000-0000-4000-8000-000000000001'
const PAGAMENTO = 'e1040000-0000-4000-8000-000000000002'
const REGOLA = 'e1040000-0000-4000-8000-000000000003'

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

beforeEach(() => {
  rispondi = () => ({ data: [] })
  fake = supabaseFinto((c) => rispondi(c))
})

function contesto(ruolo: RuoloMcp = 'admin', persona = ADMIN): ContestoMcp {
  return { db: fake.client as never, ruolo, livello: 'employee', persona, sessione: 's' }
}

function rpc(nome: string) {
  const c = fake.chiamate.find((x) => x.tipo === 'rpc' && x.nome === nome)
  return c ? (argomenti(c, 'args')?.[0] as Record<string, unknown>) : undefined
}

const nessunaEliminazione = () => expect(fake.chiamate.some((c) => ha(c, 'delete'))).toBe(false)

const METRICHE = {
  dm_totali: 120,
  conversazioni: 30,
  call_proposte: 10,
  call_prenotate: 5,
  tasso_conversazione: 0.25,
  tasso_prenotazione: 0.5,
  dm_per_call: 24,
  call_svolte: 4,
  no_show: 1,
  qualificate: 3,
  chiuse: 0,
  show_rate: 0.8,
  tasso_qualificazione: 0.75,
  close_rate: 0,
  close_rate_qualificate: null,
  cash_incassato: 4500,
  cash_nuovi_clienti: 1500,
  cash_rate_precedenti: 2000,
  cash_rinnovo: 900,
  cash_upsell: 100,
  revenue_firmata: 6000,
  revenue_nuovi: 4500,
  numero_vendite: 4,
  nuovi_clienti: 3,
  rinnovi: 1,
  valore_medio_nuovo: 1500,
  cash_per_call_svolta: 375,
  cash_per_dm: 12.5,
  revenue_per_dm: 37.5,
  provvigioni_maturate: 225,
  costi: 800,
  margine_operativo: 3475,
  in_scadenza: 2,
  rinnovati: 1,
  tasso_rinnovo: 0.5,
}

describe('le letture dell’admin: i numeri dal SQL, mai sommati qui', () => {
  it('numeri_periodo: metriche_periodo, kpi_periodo e funnel_periodo sul mese, il cash in quattro parti e il margine', async () => {
    rispondi = (c) => {
      if (c.nome === 'metriche_periodo') return { data: METRICHE }
      if (c.nome === 'kpi_periodo') return { data: [{ chiave: 'margine_operativo', valore: 3475, precedente: 3000, delta: 0.1583 }] }
      if (c.nome === 'funnel_periodo') return { data: [{ ordine: 1, fase: 'DM totali', valore: 120, passaggio: null }] }
      return { data: [] }
    }
    const esito = await economics.numeriPeriodo({ mese: '2026-09' }, contesto())
    expect(esito.ok).toBe(true)
    expect(rpc('metriche_periodo')).toEqual({ p_da: '2026-09-01', p_a: '2026-09-30' })
    expect(rpc('kpi_periodo')).toEqual({ p_da: '2026-09-01', p_a: '2026-09-30' })
    const dati = (esito.ok ? esito.dati : {}) as Record<string, unknown> & { cash: { incassato: number; di_cui: Record<string, number> } }
    expect(dati.valuta).toBe('EUR')
    expect(dati.cash).toEqual({
      incassato: 4500,
      di_cui: { nuovi_clienti_del_periodo: 1500, rate_di_clienti_gia_entrati: 2000, rinnovi: 900, upsell: 100 },
    })
    expect(dati.margine_operativo).toBe(3475)
    expect(JSON.stringify(dati)).toContain('non è l’utile')
    // a ratio over zero is «–», never NaN
    expect((dati.call as Record<string, string>).close_rate_su_qualificate).toBe('–')
    expect(dati.confronto_col_periodo_prima).toEqual([
      { voce: 'Margine operativo', valore: 3475, prima: 3000, variazione: expect.stringMatching(/15,8\s?%/) },
    ])
  })

  it('il periodo: il mese in corso se non si dice niente, da e a insieme, mai uno solo', async () => {
    const oggi = oggiRoma()
    expect(economics.periodoDi({}, oggi)).toMatchObject({ da: primoDelMeseISO(oggi) })
    expect(economics.periodoDi({ da: '2026-09-01' })).toBe('Servono da e a insieme (AAAA-MM-GG), o il mese (AAAA-MM).')
    expect(economics.periodoDi({ mese: '2026-09', da: '2026-09-01' })).toBe('O il mese, o da e a: non tutti e due.')
    expect(economics.periodoDi({ da: '2026-10-01', a: '2026-09-01' })).toBe('Il periodo va dal giorno più vecchio al più recente.')
    const esito = await economics.numeriPeriodo({ da: '2026-09-01' }, contesto())
    expect(esito.ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })

  it('una regola del SQL (22023, un periodo oltre i 3 anni) torna con le sue parole; un altro errore lancia', async () => {
    rispondi = () => ({ error: { code: '22023', message: 'Periodo non valido: al massimo 3 anni' } })
    const esito = await economics.numeriPeriodo({ da: '2020-01-01', a: '2026-01-01' }, contesto())
    expect(esito).toEqual({ ok: false, messaggio: 'Periodo non valido: al massimo 3 anni', esito: undefined })
    rispondi = () => ({ error: { code: '42501', message: 'x' } })
    await expect(economics.numeriPeriodo({ mese: '2026-09' }, contesto())).rejects.toThrow()
  })

  it('costi: le righe e il totale del periodo da metriche_periodo, mai sommato qui', async () => {
    rispondi = (c) => {
      if (c.nome === 'expenses') {
        return {
          data: [
            { id: COSTO, data: '2026-09-03', categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true },
            { id: 'e1', data: '2026-09-01', categoria: 'ads', descrizione: 'Meta', importo: 300, ricorrente: false },
          ],
          count: 2,
        }
      }
      if (c.nome === 'metriche_periodo') return { data: { ...METRICHE, costi: 777.77 } }
      return { data: [] }
    }
    const esito = await economics.costi({ mese: '2026-09', categoria: 'software' }, contesto())
    const dati = (esito.ok ? esito.dati : {}) as { totale_costi_del_periodo: number; costi: Record<string, unknown>[] }
    // the SQL's total, even if the rows say otherwise: never added up here
    expect(dati.totale_costi_del_periodo).toBe(777.77)
    expect(dati.costi[0]).toEqual({ id: COSTO, data: '2026-09-03', categoria: 'Software', descrizione: 'Canva', importo: 12.99, ricorrente: true })
    const lista = fake.chiamate.find((c) => c.nome === 'expenses')!
    expect(ha(lista, 'eq', 'categoria', 'software')).toBe(true)
    expect(ha(lista, 'gte', 'data', '2026-09-01')).toBe(true)
  })

  it('provvigioni: per persona e mese da provvigioni_riepilogo, il saldo è l’ultimo progressivo del SQL', async () => {
    rispondi = (c) => {
      if (c.nome === 'provvigioni_riepilogo') {
        return {
          data: [
            { profile_id: SETTER, nome: 'Loris', mese: '2026-08-01', maturato: 100, pagato: 0, saldo_mese: 100, saldo_progressivo: 150 },
            { profile_id: SETTER, nome: 'Loris', mese: '2026-09-01', maturato: 80, pagato: 150, saldo_mese: -70, saldo_progressivo: 80 },
          ],
        }
      }
      if (c.nome === 'commission_payouts') return { data: [{ id: PAGAMENTO, profile_id: SETTER, periodo: '2026-08-01', importo: 150, pagato_il: '2026-09-25', metodo: 'bonifico', note: null }] }
      if (c.nome === 'profiles') return { data: [{ id: SETTER, nome: 'Loris' }] }
      return { data: [] }
    }
    const esito = await economics.provvigioni({ mesi: 2 }, contesto())
    const dati = (esito.ok ? esito.dati : {}) as { persone: Record<string, unknown>[]; pagamenti_recenti: Record<string, unknown>[] }
    expect(rpc('provvigioni_riepilogo')).toEqual({ p_mesi: 2 })
    expect(dati.persone[0]).toMatchObject({ profile_id: SETTER, nome: 'Loris', saldo_da_pagare: 80 })
    expect(dati.pagamenti_recenti[0]).toMatchObject({ id: PAGAMENTO, nome: 'Loris', mese: '2026-08', importo: 150, metodo: 'Bonifico' })
  })

  it('regole_provvigioni: la percentuale come la mostra l’app, mai la frazione grezza', async () => {
    rispondi = (c) => {
      if (c.nome === 'commission_rules') return { data: [{ id: REGOLA, profile_id: SETTER, percentuale: 0.05, applica_a: ['nuovo'], valida_dal: '2026-01-01', valida_al: null }] }
      if (c.nome === 'profiles') return { data: [{ id: SETTER, nome: 'Loris' }] }
      return { data: [] }
    }
    const esito = await economics.regoleProvvigioni({}, contesto())
    const regola = ((esito.ok ? esito.dati : {}) as { regole: Record<string, unknown>[] }).regole[0]
    expect(regola).toMatchObject({ id: REGOLA, nome: 'Loris', su: ['Nuovo'], in_vigore: true })
    expect(String(regola.percentuale)).toMatch(/^5,0\s?%$/)
  })

  it('team: persone e inviti in attesa, in sola lettura', async () => {
    rispondi = (c) => {
      if (c.nome === 'profiles' && ha(c, 'order', 'nome')) {
        return { data: [{ id: SETTER, nome: 'Loris', email: 'loris@x.test', ruolo: 'setter', attivo: true, livello_pm: 'employee' }] }
      }
      if (c.nome === 'invites') return { data: [{ email: 'nuovo@x.test', ruolo: 'closer', invitato_da: ADMIN, created_at: '2026-10-20T10:00:00Z' }] }
      if (c.nome === 'profiles') return { data: [{ id: ADMIN, nome: 'Dany' }] }
      return { data: [] }
    }
    const esito = await economics.team({}, contesto())
    const dati = (esito.ok ? esito.dati : {}) as { persone: Record<string, unknown>[]; inviti_in_attesa: Record<string, unknown>[] }
    expect(dati.persone[0]).toEqual({ id: SETTER, nome: 'Loris', email: 'loris@x.test', ruolo: 'Setter', livello_progetti: 'Employee' })
    expect(dati.inviti_in_attesa[0]).toEqual({ email: 'nuovo@x.test', ruolo: 'Closer', invitato_da: 'Dany', invitato_il: '2026-10-20' })
    const inviti = fake.chiamate.find((c) => c.nome === 'invites')!
    expect(ha(inviti, 'is', 'usato_at', null) && ha(inviti, 'eq', 'revocato', false)).toBe(true)
    // only active people unless asked
    expect(ha(fake.chiamate.find((c) => c.nome === 'profiles')!, 'eq', 'attivo', true)).toBe(true)
  })
})

describe('il setter: solo le sue provvigioni, da miei_numeri_periodo', () => {
  it('mie_provvigioni: un mese per riga, dal più recente, mai una tabella delle provvigioni o la regola', async () => {
    rispondi = (c) => (c.nome === 'miei_numeri_periodo' ? { data: { provvigioni_maturate: 75, provvigioni_pagate: 50, dm_totali: 999 } } : { data: [] })
    const esito = await economics.mieProvvigioni({ mesi: 2 }, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    const corrente = primoDelMeseISO(oggiRoma())
    const chiamate = fake.chiamate.filter((c) => c.nome === 'miei_numeri_periodo').map((c) => argomenti(c, 'args')?.[0])
    expect(chiamate.map((a) => (a as { p_da: string }).p_da)).toEqual([corrente, aggiungiMesi(corrente, -1)])
    const dati = (esito.ok ? esito.dati : {}) as { mesi: Record<string, unknown>[] }
    expect(dati.mesi[0]).toEqual({ mese: corrente.slice(0, 7), maturate: 75, pagate: 50 })
    expect(fake.chiamate.every((c) => c.nome === 'miei_numeri_periodo')).toBe(true)
    // only the commissions: never his DM or anything else of his report
    expect(JSON.stringify(dati)).not.toMatch(/dm_totali|999|"percentuale"|"regola"/)
  })
})

describe('le scritture dell’admin: il nucleo dell’app, niente si elimina', () => {
  it('registra_costo: l’insert dell’app, di base oggi, e il costo riletto', async () => {
    rispondi = (c) => {
      if (c.nome === 'expenses' && ha(c, 'insert')) return { data: { id: COSTO } }
      if (c.nome === 'expenses') return { data: { id: COSTO, data: oggiRoma(), categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true } }
      return { data: [] }
    }
    const esito = await economics.registraCosto({ categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true }, contesto())
    expect(esito.ok).toBe(true)
    const insert = fake.chiamate.find((c) => ha(c, 'insert'))!
    expect(argomenti(insert, 'insert')?.[0]).toEqual({ data: oggiRoma(), categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true })
    expect((esito.ok ? esito.dati : {}) as Record<string, unknown>).toMatchObject({ esito: 'registrato', costo: { id: COSTO, categoria: 'Software' } })
    nessunaEliminazione()
  })

  it('registra_costo nel futuro: la frase dello schema dell’app, nessuna scrittura', async () => {
    const esito = await economics.registraCosto({ data: '2999-01-01', categoria: 'software', descrizione: 'Canva', importo: 10 }, contesto())
    expect(esito).toMatchObject({ ok: false, messaggio: 'Un costo non può essere nel futuro' })
    expect(fake.chiamate.some((c) => ha(c, 'insert'))).toBe(false)
  })

  it('modifica_costo: rilegge il costo e cambia solo quello che dice', async () => {
    rispondi = (c) => {
      if (c.nome === 'expenses' && ha(c, 'update')) return { data: { id: COSTO } }
      if (c.nome === 'expenses') return { data: { id: COSTO, data: '2026-09-03', categoria: 'software', descrizione: 'Canva', importo: 12.99, ricorrente: true } }
      return { data: [] }
    }
    const esito = await economics.modificaCosto({ id: COSTO, importo: 14.99 }, contesto())
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => ha(c, 'update'))!
    expect(argomenti(update, 'update')?.[0]).toEqual({ data: '2026-09-03', categoria: 'software', descrizione: 'Canva', importo: 14.99, ricorrente: true })
    expect(ha(update, 'eq', 'id', COSTO)).toBe(true)
  })

  it('copia_costi_ricorrenti: copia_costi_ricorrenti dell’app sul primo del mese', async () => {
    rispondi = (c) => (c.nome === 'copia_costi_ricorrenti' ? { data: 2 } : { data: [] })
    const esito = await economics.copiaCostiRicorrenti({ mese: '2026-10' }, contesto())
    expect(rpc('copia_costi_ricorrenti')).toEqual({ p_mese: '2026-10-01' })
    expect((esito.ok ? esito.dati : {}) as Record<string, unknown>).toMatchObject({ copiati: 2 })
  })

  it('registra_pagamento_provvigione: il mese diventa il primo del mese, come il foglio', async () => {
    rispondi = (c) => (c.nome === 'commission_payouts' && ha(c, 'insert') ? { data: { id: PAGAMENTO } } : { data: null })
    const esito = await economics.registraPagamento({ profile_id: SETTER, mese: '2026-09', importo: 150 }, contesto())
    expect(esito.ok).toBe(true)
    const insert = fake.chiamate.find((c) => ha(c, 'insert'))!
    expect(argomenti(insert, 'insert')?.[0]).toEqual({
      profile_id: SETTER,
      periodo: '2026-09-01',
      importo: 150,
      pagato_il: oggiRoma(),
      metodo: null,
      note: null,
    })
  })

  it('regola_provvigione nuova: i punti diventano la frazione una volta sola, di base sulle vendite nuove', async () => {
    rispondi = (c) => (c.nome === 'nuova_regola_provvigione' ? { data: REGOLA } : { data: [] })
    const esito = await economics.regolaProvvigione({ azione: 'nuova', profile_id: SETTER, percentuale: 7, valida_dal: '2026-11-01' }, contesto())
    expect(esito.ok).toBe(true)
    expect(rpc('nuova_regola_provvigione')).toEqual({ p_profile_id: SETTER, p_percentuale: 0.07, p_applica_a: ['nuovo'], p_valida_dal: '2026-11-01' })
  })

  it('regola_provvigione modifica: rilegge la regola, la percentuale salvata torna in punti senza cambiare', async () => {
    rispondi = (c) => {
      if (c.nome === 'commission_rules' && ha(c, 'update')) return { data: { id: REGOLA } }
      if (c.nome === 'commission_rules') return { data: { id: REGOLA, percentuale: 0.05, applica_a: ['nuovo'], valida_dal: '2026-01-01', valida_al: null } }
      return { data: [] }
    }
    const esito = await economics.regolaProvvigione({ azione: 'modifica', rule_id: REGOLA, valida_al: '2026-12-31' }, contesto())
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => ha(c, 'update'))!
    expect(argomenti(update, 'update')?.[0]).toEqual({ percentuale: 0.05, applica_a: ['nuovo'], valida_dal: '2026-01-01', valida_al: '2026-12-31' })
  })

  it('regola_provvigione: senza i dati che servono non parte niente; la persona di una regola non cambia', async () => {
    expect((await economics.regolaProvvigione({ azione: 'nuova', profile_id: SETTER }, contesto())).ok).toBe(false)
    expect((await economics.regolaProvvigione({ azione: 'chiudi', rule_id: REGOLA }, contesto())).ok).toBe(false)
    expect((await economics.regolaProvvigione({ azione: 'modifica', rule_id: REGOLA, profile_id: SETTER }, contesto())).ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })

  it('imposta_obiettivi: tiene il valore che non dice, e non li toglie mai tutti e due', async () => {
    rispondi = (c) => {
      if (c.nome === 'obiettivi_mese' && ha(c, 'upsert')) return { data: null }
      if (c.nome === 'obiettivi_mese') return { data: { cash: 10000, nuovi_clienti: 5 } }
      return { data: null }
    }
    const esito = await economics.impostaObiettivi({ mese: '2026-11', cash: 12000 }, contesto())
    expect(esito.ok).toBe(true)
    const upsert = fake.chiamate.find((c) => ha(c, 'upsert'))!
    expect(argomenti(upsert, 'upsert')?.[0]).toEqual({ mese: '2026-11-01', cash: 12000, nuovi_clienti: 5 })

    fake.chiamate.length = 0
    rispondi = (c) => (c.nome === 'obiettivi_mese' ? { data: { cash: 10000, nuovi_clienti: null } } : { data: null })
    const tutti = await economics.impostaObiettivi({ mese: '2026-11', cash: '' }, contesto())
    expect(tutti.ok).toBe(false)
    expect(fake.chiamate.some((c) => ha(c, 'upsert') || ha(c, 'delete'))).toBe(false)
  })

  it('il business coach (se mai arrivasse a una scrittura): la frase dell’app, nessuna scrittura', async () => {
    const esito = await economics.registraCosto({ categoria: 'altro', descrizione: 'Prova', importo: 1 }, contesto('business_coach'))
    expect(esito.ok).toBe(false)
    expect(fake.chiamate.some((c) => ha(c, 'insert'))).toBe(false)
  })
})

describe('gli strumenti della fase 4', () => {
  const NOMI = [
    'numeri_periodo',
    'cash_mensile',
    'previsione_cassa',
    'obiettivi',
    'numeri_per_fonte',
    'costi',
    'provvigioni',
    'provvigioni_per_vendita',
    'regole_provvigioni',
    'team',
    'mie_provvigioni',
    'registra_costo',
    'modifica_costo',
    'copia_costi_ricorrenti',
    'registra_pagamento_provvigione',
    'modifica_pagamento_provvigione',
    'regola_provvigione',
    'imposta_obiettivi',
  ]

  it('nessuno elimina, e i loro schemi si leggono come JSON Schema', () => {
    for (const nome of NOMI) {
      const s = STRUMENTI.find((x) => x.nome === nome)
      expect(s, nome).toBeDefined()
      expect(s!.nome).not.toMatch(/elimina|togli|cancella/)
      expect(() => schemaMcp(s!.input)).not.toThrow()
    }
  })

  it('i ruoli: tutto all’admin, al setter solo mie_provvigioni', () => {
    for (const nome of NOMI) {
      const s = STRUMENTI.find((x) => x.nome === nome)!
      expect(s.ruoli, nome).toEqual(nome === 'mie_provvigioni' ? ['setter'] : ['admin'])
    }
  })

  it('il team si legge e basta, e nessuna descrizione parla di classifiche', () => {
    expect(STRUMENTI.find((s) => s.nome === 'team')?.annotazioni.readOnlyHint).toBe(true)
    for (const nome of NOMI) {
      expect(STRUMENTI.find((s) => s.nome === nome)!.descrizione, nome).not.toMatch(/classific|confront\w* tra (persone|collaboratori)/i)
    }
  })
})
