import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import * as clienti from '@/lib/mcp/clienti'
import type { ContestoMcp, RuoloMcp } from '@/lib/mcp/contesto'
import { schemaMcp } from '@/lib/mcp/schema'
import { STRUMENTI } from '@/lib/mcp/strumenti'
import * as vendite from '@/lib/mcp/vendite'
import { oggiRoma } from '@/lib/date'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The MCP tools on clients, sales, instalments and cash-ins (Claude a 360
 * gradi, phase 3, 23/10/2026) against a fake client: what reaches the
 * database, as whom, and what never does (a deletion, the clients table for the
 * closer and the setter, the percentage of the setter's rule, the method of
 * payment or the notes to the closer, a refund or an interruption without the
 * preview).
 */

const ADMIN = '11111111-1111-4111-8111-111111111111'
const SETTER = '22222222-2222-4222-8222-222222222222'
const CLOSER = '33333333-3333-4333-8333-333333333333'
const CLIENTE = 'c1030000-0000-4000-8000-000000000001'
const VENDITA = 'c1030000-0000-4000-8000-000000000011'
const RATA = 'c1030000-0000-4000-8000-000000000041'
const CALL = 'c1030000-0000-4000-8000-000000000031'
const PRODOTTO = 'aaaaaaa1-0000-4000-8000-000000000002'

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

/** A sale as the sales table gives it (with the embedded client and product). */
function vendita(campi: Record<string, unknown> = {}) {
  return {
    id: VENDITA,
    client_id: CLIENTE,
    tipo: 'nuovo',
    product_id: PRODOTTO,
    prodotto_personalizzato: null,
    data_vendita: '2026-09-13',
    data_inizio: '2026-09-20',
    data_fine: '2027-03-19',
    valore_contratto: 1500,
    numero_rate: 3,
    call_id: null,
    setter_id: SETTER,
    closer_id: CLOSER,
    note: 'Nota interna',
    updated_at: '2026-10-01T10:00:00.000Z',
    cliente: { nome: 'Cliente', cognome: 'Centotre' },
    prodotto: { nome: 'Percorso Alpha 6 mesi' },
    ...campi,
  }
}

const rata = (campi: Record<string, unknown> = {}) => ({
  id: RATA,
  sale_id: VENDITA,
  numero_rata: 1,
  scadenza: '2026-09-13',
  importo_previsto: 500,
  stato: 'incassata',
  incassato_il: '2026-09-13',
  importo_incassato: 500,
  metodo: 'bonifico',
  note: 'Bonifico di Mario',
  created_at: '2026-09-13T10:00:00.000Z',
  updated_at: '2026-09-13T10:00:00.000Z',
  ...campi,
})

/** The reads of a sale, for leggi_vendita and the writes that read back. */
function letturaVendita(c: Chiamata): RispostaFinta | null {
  if (c.nome === 'sales') return { data: ha(c, 'maybeSingle') ? vendita() : [vendita()] }
  if (c.nome === 'v_vendite') return { data: { incassato: 500, da_incassare: 1000, in_ritardo: 0, rate_incassate: 1, rate_totali: 3 } }
  if (c.nome === 'payments') return { data: ha(c, 'maybeSingle') ? rata() : [rata(), rata({ id: 'r2', numero_rata: 2, stato: 'prevista', incassato_il: null, importo_incassato: null, metodo: null, note: null })] }
  if (c.nome === 'vendite_contratti') return { data: { url: 'https://drive.google.com/file/d/contratto' } }
  if (c.nome === 'profiles') return { data: [{ id: SETTER, nome: 'Loris' }, { id: CLOSER, nome: 'Closer' }] }
  return null
}

describe('le letture: ognuno vede i soldi che vede nell’app', () => {
  it('leggi_vendita del closer: le sue rate, mai metodo, note o il contratto su Drive', async () => {
    rispondi = (c) => letturaVendita(c) ?? { data: [] }
    const esito = await vendite.leggiVendita({ sale_id: VENDITA }, contesto('closer', CLOSER))
    expect(esito.ok).toBe(true)
    const testo = JSON.stringify(esito.ok ? esito.dati : null)
    expect(testo).toContain('Cliente Centotre')
    expect(testo).toContain(RATA)
    expect(testo).not.toMatch(/bonifico|Bonifico|Nota interna|drive\.google|"metodo"|"note"|contratto_drive/)
    // the contract is never even asked for the closer, the clients table never read
    expect(fake.chiamate.some((c) => c.nome === 'vendite_contratti')).toBe(false)
    expect(fake.chiamate.some((c) => c.tipo === 'from' && c.nome === 'clients')).toBe(false)
  })

  it('leggi_vendita dell’admin: metodo, note e il contratto su Drive, gli importi come numeri in euro', async () => {
    rispondi = (c) => letturaVendita(c) ?? { data: [] }
    const esito = await vendite.leggiVendita({ sale_id: VENDITA }, contesto('admin'))
    expect(esito.ok).toBe(true)
    const dati = (esito.ok ? esito.dati : {}) as { valuta?: string; vendita?: Record<string, unknown>; rate: Record<string, unknown>[] }
    expect(dati.valuta).toBe('EUR')
    expect(dati.vendita).toMatchObject({ contratto: 1500, incassato: 500, da_incassare: 1000, note: 'Nota interna', contratto_drive: 'https://drive.google.com/file/d/contratto' })
    expect(dati.rate[0]).toMatchObject({ payment_id: RATA, metodo: 'Bonifico', stato: 'Incassata' })
  })

  it('elenco_vendite del closer: il nome del cliente dalla vendita, mai la tabella dei clienti; i filtri dell’admin ignorati', async () => {
    rispondi = (c) => {
      if (c.nome === 'v_vendite') return { data: [{ sale_id: VENDITA, client_id: CLIENTE, tipo: 'nuovo', setter_id: SETTER, closer_id: CLOSER, data_vendita: '2026-09-13', incassato: 500, da_incassare: 1000, in_ritardo: 0, rate_incassate: 1, rate_totali: 3, numero_rate: 3 }], count: 1 }
      return letturaVendita(c) ?? { data: [] }
    }
    const esito = await vendite.elencoVendite({ setter_id: ADMIN, closer_id: ADMIN }, contesto('closer', CLOSER))
    expect(esito.ok).toBe(true)
    expect(JSON.stringify(esito.ok ? esito.dati : null)).toContain('Cliente Centotre')
    const lista = fake.chiamate.find((c) => c.nome === 'v_vendite')
    expect(lista && ha(lista, 'eq', 'closer_id', ADMIN)).toBe(false)
    expect(fake.chiamate.some((c) => c.tipo === 'from' && c.nome === 'clients')).toBe(false)
  })

  it('da_incassare: al closer il suo totale dal SQL, all’admin le fasce e le rate in ritardo', async () => {
    rispondi = (c) =>
      c.nome === 'da_incassare_closer'
        ? { data: { totale: 1000, numero_rate: 2, vendite: 1, in_ritardo: 0, numero_in_ritardo: 0, prossimi_30: 500, numero_prossimi_30: 1, oltre: 500, numero_oltre: 1 } }
        : { data: [] }
    const closer = await vendite.daIncassare(contesto('closer', CLOSER))
    expect(closer.ok && closer.dati.totale_da_incassare).toMatchObject({ totale: 1000, rate: 2 })
    expect(fake.chiamate.some((c) => c.nome === 'da_incassare' || c.nome === 'v_rate')).toBe(false)

    rispondi = (c) => (c.nome === 'da_incassare' ? { data: [{ fascia: 'in_ritardo', totale: 300, numero: 1 }] } : { data: [], count: 0 })
    const admin = await vendite.daIncassare(contesto('admin'))
    expect(admin.ok && admin.dati.per_fascia).toEqual([{ fascia: 'in ritardo', importo: 300, rate: 1 }])
  })

  it('miei_clienti del setter: solo le sue due funzioni, mai la percentuale, i contatti o le tabelle dei soldi', async () => {
    rispondi = (c) => {
      if (c.nome === 'mie_vendite_setter') {
        return {
          data: [
            { sale_id: VENDITA, cliente: 'Cliente Centotre', prodotto: 'Percorso', tipo: 'nuovo', data_vendita: '2026-09-13', valore_contratto: 1500, numero_rate: 3, numero_rata: 1, scadenza: '2026-09-13', importo_previsto: 500, stato: 'incassata', incassato_il: oggiRoma(), importo_incassato: 500, in_ritardo: false, percentuale: 0.05, provvigione: 25, incassato_vendita: 500, rate_incassate: 1, rate_in_ritardo: 0, provvigione_vendita: 25, provvigione_prevista: true },
          ],
        }
      }
      if (c.nome === 'incassi_clienti_setter') return { data: { incassato: 500, numero_incassi: 1, rimborsato: 0, numero_rimborsi: 0, clienti: 1, provvigione: 25 } }
      return { data: [] }
    }
    const esito = await vendite.mieiClienti({ da: oggiRoma() }, contesto('setter', SETTER))
    expect(esito.ok).toBe(true)
    const testo = JSON.stringify(esito.ok ? esito.dati : null)
    expect(testo).not.toMatch(/percentuale|0\.05/)
    expect(esito.ok && esito.dati.totale_periodo).toMatchObject({ pagato_netto: 500, provvigione_maturata: 25 })
    expect(fake.chiamate.every((c) => c.tipo === 'rpc')).toBe(true)
  })

  it('leggi_cliente: un cliente che non c’è lo dice, e una lettura che fallisce lancia', async () => {
    rispondi = () => ({ data: null })
    const nessuno = await clienti.leggiCliente({ client_id: CLIENTE }, contesto('admin'))
    expect(nessuno).toEqual({ ok: false, messaggio: clienti.CLIENTE_NON_TROVATO, esito: 'non_trovato' })
    rispondi = () => ({ error: { code: '42501', message: 'no' } })
    await expect(clienti.leggiCliente({ client_id: CLIENTE }, contesto('admin'))).rejects.toThrow()
  })

  it('elenco_clienti: clienti_elenco con gli stati della vista, la ricerca senza accenti, mai la tabella', async () => {
    rispondi = (c) =>
      c.nome === 'clienti_elenco'
        ? { data: [{ client_id: CLIENTE, nome: 'Nicolò', cognome: 'Centotre', stato: 'sospeso', sale_id: VENDITA, tipo: 'nuovo', numero_percorso: 1, data_inizio: '2026-09-20', data_fine: '2027-03-19', mese: 2, mesi_totali: 6, settimana: 5, settimane_totali: 26, valore_contratto: 1500, incassato: 500, da_incassare: 1000, in_ritardo: 0, rate_totali: 3, rate_incassate: 1, prossima_scadenza: null, prossimo_importo: null, metodi: ['bonifico'], contratto_url: null, cartella_url: null, ltv: 500, sospeso_il: '2026-10-20', chiuso_il: null, rate: [] }] }
        : { data: [] }
    const esito = await clienti.elencoClienti({ vista: 'sospesi', cerca: 'nicolo' }, contesto('admin'))
    expect(esito.ok && esito.dati.totale).toBe(1)
    expect(rpc('clienti_elenco')).toEqual({ p_stati: ['sospeso'] })
    expect(fake.chiamate.some((c) => c.tipo === 'from')).toBe(false)
  })
})

describe('le scritture passano dal nucleo dell’app, mai un’eliminazione', () => {
  it('rata incassa: segna_rata_incassata con gli argomenti dell’app', async () => {
    rispondi = (c) =>
      c.nome === 'segna_rata_incassata' ? { data: { importo_registrato: 500, data_registrata: oggiRoma(), rata: 1 } } : (letturaVendita(c) ?? { data: null })
    const esito = await vendite.rata({ payment_id: RATA, azione: 'incassa', metodo: 'bonifico' }, contesto('closer', CLOSER))
    expect(esito.ok).toBe(true)
    expect(rpc('segna_rata_incassata')).toMatchObject({ p_payment_id: RATA, p_metodo: 'bonifico' })
    nessunaEliminazione()
  })

  it('rata modifica dal closer: il piano lo cambia l’admin, nessuna richiesta parte', async () => {
    const esito = await vendite.rata({ payment_id: RATA, azione: 'modifica', importo_previsto: 1 }, contesto('closer', CLOSER))
    expect(esito).toEqual({ ok: false, messaggio: 'Il piano rate lo modifica l’admin: tu registri gli incassi.', esito: undefined })
    expect(fake.chiamate).toHaveLength(0)
  })

  it('annulla_incasso: l’update dell’app sulle rate incassate o fallite', async () => {
    rispondi = (c) => (c.nome === 'payments' && ha(c, 'update') ? { data: { sale_id: VENDITA } } : (letturaVendita(c) ?? { data: null }))
    const esito = await vendite.rata({ payment_id: RATA, azione: 'annulla_incasso' }, contesto('closer', CLOSER))
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => c.nome === 'payments' && ha(c, 'update'))
    expect(update && argomenti(update, 'update')?.[0]).toEqual({ stato: 'prevista', incassato_il: null, importo_incassato: null, metodo: null })
    nessunaEliminazione()
  })

  it('registra_vendita del closer: mai un cliente che c’è già', async () => {
    const esito = await vendite.registraVendita(
      { client_id: CLIENTE, tipo: 'rinnovo', product_id: PRODOTTO, valore_contratto: 1500 },
      contesto('closer', CLOSER),
    )
    expect(esito.ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })

  it('registra_vendita dalla call: il giorno della call, l’inizio una settimana dopo, il piano scritto a mano', async () => {
    rispondi = (c) => {
      if (c.nome === 'call_per_claude') return { data: { programmata_il: '2026-10-20T16:00:00.000Z', lead_nome: 'Marco De Luca', lead_handle: '@marco.deluca' } }
      if (c.nome === 'registra_vendita') return { data: { id_vendita: VENDITA, id_cliente: CLIENTE, cliente_nuovo: true } }
      return letturaVendita(c) ?? { data: null }
    }
    const esito = await vendite.registraVendita(
      {
        call_id: CALL,
        tipo: 'nuovo',
        product_id: PRODOTTO,
        valore_contratto: 1200,
        rate: [
          { scadenza: '2026-10-20', importo: 600 },
          { scadenza: '2026-11-20', importo: 600 },
        ],
      },
      contesto('closer', CLOSER),
    )
    expect(esito.ok).toBe(true)
    expect(rpc('registra_vendita')).toMatchObject({
      p_call_id: CALL,
      p_tipo: 'nuovo',
      p_data_vendita: '2026-10-20',
      p_data_inizio: '2026-10-27',
      p_numero_rate: 2,
      p_nome: 'Marco',
      p_cognome: 'De Luca',
      p_instagram_handle: '@marco.deluca',
      p_rate: [
        { scadenza: '2026-10-20', importo: 600 },
        { scadenza: '2026-11-20', importo: 600 },
      ],
    })
    nessunaEliminazione()
  })

  it('interrompi_percorso: senza il codice dell’anteprima non scrive niente; con quello sì', async () => {
    const anteprima = { rate_tolte: 2, importo_tolto: 1000, valore_prima: 1500, valore_dopo: 500, rate_restanti: 1 }
    rispondi = (c) => (c.nome === 'interrompi_percorso' ? { data: anteprima } : (letturaVendita(c) ?? { data: null }))
    const valori = { sale_id: VENDITA, ultimo_giorno: '2026-10-20', togli_rate: true }
    const sbagliato = await vendite.interrompiPercorso({ ...valori, codice_anteprima: '0123456789abcdef' }, contesto('admin'))
    expect(sbagliato.ok).toBe(false)
    expect(sbagliato.esito).toBe('cambiato')
    expect(fake.chiamate.filter((c) => c.nome === 'interrompi_percorso').every((c) => argomenti(c, 'args')?.[0] && (argomenti(c, 'args')?.[0] as Record<string, unknown>).p_esegui === false)).toBe(true)

    const pre = await vendite.anteprimaInterruzione(valori, contesto('admin'))
    expect(pre.ok).toBe(true)
    const codice = (pre.ok ? pre.dati.codice_anteprima : '') as string
    expect(pre.ok && (pre.dati.cosa_cambia as string[]).join(' ')).toMatch(/Gli incassi già fatti non cambiano/)
    const giusto = await vendite.interrompiPercorso({ ...valori, codice_anteprima: codice }, contesto('admin'))
    expect(giusto.ok).toBe(true)
    expect(fake.chiamate.some((c) => c.nome === 'interrompi_percorso' && (argomenti(c, 'args')?.[0] as Record<string, unknown>).p_esegui === true)).toBe(true)
    nessunaEliminazione()
  })

  it('registra_rimborso: solo col codice di anteprima_rimborso', async () => {
    rispondi = (c) => (c.nome === 'registra_rimborso' ? { data: 'r9' } : (letturaVendita(c) ?? { data: null }))
    const valori = { payment_id: RATA, importo: 100, data: oggiRoma() }
    const senza = await vendite.registraRimborso({ ...valori, codice_anteprima: 'ffffffffffffffff' }, contesto('admin'))
    expect(senza.ok).toBe(false)
    expect(fake.chiamate.some((c) => c.nome === 'registra_rimborso')).toBe(false)
    const pre = await vendite.anteprimaRimborso(valori, contesto('admin'))
    expect(pre.ok && (pre.dati.cosa_cambia as string[]).join(' ')).toMatch(/provvigione torna indietro nel mese del rimborso/)
    const con = await vendite.registraRimborso({ ...valori, codice_anteprima: (pre.ok ? pre.dati.codice_anteprima : '') as string }, contesto('admin'))
    expect(con.ok).toBe(true)
    expect(rpc('registra_rimborso')).toMatchObject({ p_payment_id: RATA, p_importo: 100 })
  })

  it('stato_cliente: «Riapri» e «Riattiva» con le funzioni dell’app, mai un DELETE', async () => {
    rispondi = (c) => (c.nome === 'riapri_cliente' || c.nome === 'riattiva_cliente' ? { data: true } : { data: null })
    expect((await clienti.statoCliente({ client_id: CLIENTE, azione: 'riapri' }, contesto('admin'))).ok).toBe(true)
    expect((await clienti.statoCliente({ client_id: CLIENTE, azione: 'riattiva' }, contesto('admin'))).ok).toBe(true)
    expect(rpc('riapri_cliente')).toEqual({ p_client_id: CLIENTE })
    expect(rpc('riattiva_cliente')).toEqual({ p_client_id: CLIENTE })
    nessunaEliminazione()
  })

  it('stato_cliente «Non rinnova»: l’upsert dell’app, di base oggi', async () => {
    rispondi = () => ({ data: null })
    const esito = await clienti.statoCliente({ client_id: CLIENTE, azione: 'non_rinnova', motivo: 'Non ha tempo' }, contesto('admin'))
    expect(esito.ok).toBe(true)
    const upsert = fake.chiamate.find((c) => c.nome === 'clienti_chiusure' && ha(c, 'upsert'))
    expect(upsert && argomenti(upsert, 'upsert')?.[0]).toEqual({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo: 'Non ha tempo' })
  })

  it('modifica_cliente: rilegge il cliente e cambia solo quello che dice; "" toglie', async () => {
    rispondi = (c) =>
      c.nome === 'clients' && !ha(c, 'update')
        ? { data: { id: CLIENTE, nome: 'Cliente', cognome: 'Centotre', email: 'c@example.test', telefono: '+39 333 000 0103', instagram_handle: '@centotre', fonte: 'referral', setter_id: SETTER, closer_id: CLOSER, note: 'Vecchia' } }
        : { data: null }
    const esito = await clienti.modificaCliente({ client_id: CLIENTE, telefono: '', note: 'Nuova' }, contesto('admin'))
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => c.nome === 'clients' && ha(c, 'update'))
    expect(update && argomenti(update, 'update')?.[0]).toMatchObject({ nome: 'Cliente', email: 'c@example.test', telefono: null, note: 'Nuova', setter_id: SETTER })
  })

  it('il business coach (se mai arrivasse a una scrittura): la frase dell’app, nessuna scrittura', async () => {
    const esito = await clienti.statoCliente({ client_id: CLIENTE, azione: 'riapri' }, contesto('business_coach', 'bc000000-0000-4000-8000-000000000001'))
    expect(esito.ok).toBe(false)
    expect(fake.chiamate).toHaveLength(0)
  })
})

describe('gli strumenti dei clienti e delle vendite', () => {
  const nomi = [
    'elenco_clienti',
    'leggi_cliente',
    'rinnovi',
    'elenco_vendite',
    'leggi_vendita',
    'da_incassare',
    'incassi',
    'miei_clienti',
    'anteprima_interruzione',
    'anteprima_rimborso',
    'crea_cliente',
    'modifica_cliente',
    'stato_cliente',
    'registra_vendita',
    'modifica_vendita',
    'interrompi_percorso',
    'registra_rimborso',
    'rata',
    'aggiungi_rata',
  ]

  it('nessuno elimina, e i loro schemi si leggono come JSON Schema', () => {
    for (const nome of nomi) {
      const s = STRUMENTI.find((x) => x.nome === nome)
      expect(s, nome).toBeDefined()
      expect(s!.nome).not.toMatch(/elimina|scollega/)
      expect(schemaMcp(s!.input)['~standard'].jsonSchema.input({ target: 'draft-2020-12' })).toMatchObject({ type: 'object' })
    }
  })

  it('i ruoli: i clienti all’admin, le vendite e le rate anche al closer, i suoi clienti al setter', () => {
    const ruoli = Object.fromEntries(STRUMENTI.filter((s) => nomi.includes(s.nome)).map((s) => [s.nome, [...s.ruoli].sort()]))
    for (const nome of ['elenco_clienti', 'leggi_cliente', 'rinnovi', 'incassi', 'crea_cliente', 'modifica_cliente', 'stato_cliente', 'modifica_vendita', 'interrompi_percorso', 'registra_rimborso', 'aggiungi_rata']) {
      expect(ruoli[nome], nome).toEqual(['admin'])
    }
    for (const nome of ['elenco_vendite', 'leggi_vendita', 'da_incassare', 'registra_vendita', 'rata']) {
      expect(ruoli[nome], nome).toEqual(['admin', 'closer'])
    }
    expect(ruoli.miei_clienti).toEqual(['setter'])
  })

  it('le descrizioni dicono che i totali li calcola il gestionale', () => {
    const per = Object.fromEntries(STRUMENTI.map((s) => [s.nome, s.descrizione]))
    expect(per.da_incassare).toContain('già sommato dal gestionale')
    expect(per.miei_clienti).toContain('Mai i clienti di altri, i contatti, il metodo di pagamento, le note o la percentuale')
    expect(per.interrompi_percorso).toContain('codice_anteprima')
    expect(per.registra_rimborso).toContain('codice_anteprima')
  })
})
