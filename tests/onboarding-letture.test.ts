import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  ELENCO_MAX,
  EVENTI_MAX,
  IMPOSTAZIONI_DI_BASE,
  LetturaNonRiuscita,
  dividiNome,
  leggiElenco,
  leggiImpostazioni,
  leggiIngressoWizard,
  leggiOnboardingDelCliente,
  leggiPersone,
  leggiScheda,
} from '@/lib/onboarding/letture'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * How the onboarding is read (1.77.0) against a fake client: which tables and views, what
 * the wizard's way in decides, and the one rule on the link: the token in clear is read
 * only once the client area is open. Invented people only.
 */

const CLIENTE = '0b0a0000-0000-4000-8000-000000000001'
const VENDITA = '0b0a0000-0000-4000-8000-000000000011'
const INVITO = '0b0a0000-0000-4000-8000-000000000021'
const CALL = '0b0a0000-0000-4000-8000-000000000031'
const LEAD = '0b0a0000-0000-4000-8000-000000000041'
const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const OGGI = '2026-11-12'

let tabelle: Record<string, (c: Chiamata) => RispostaFinta>
let fake: ReturnType<typeof supabaseFinto>

beforeEach(() => {
  tabelle = {}
  fake = supabaseFinto((c) => (tabelle[c.nome] ? tabelle[c.nome](c) : { data: null }))
})

const db = () => fake.client as never
const lette = () => fake.chiamate.map((c) => c.nome)

function riga(campi: Record<string, unknown> = {}) {
  return {
    client_id: CLIENTE,
    nome: 'Tommaso',
    cognome: 'Galli',
    sale_id: VENDITA,
    invito_id: INVITO,
    slug: 'tommaso-galli',
    invito_stato: 'in_attesa_pagamento',
    percorso_stato: 'in_attesa',
    minorenne: false,
    created_at: '2026-11-10T10:00:00+00:00',
    ...campi,
  }
}

const impostazioni = (aperto: boolean) => () => ({ data: { ...IMPOSTAZIONI_DI_BASE, aperto_ai_clienti: aperto } })

const clienteLetto = {
  id: CLIENTE,
  nome: 'Tommaso',
  cognome: 'Galli',
  email: 'tommaso.galli@example.test',
  telefono: null,
  instagram_handle: '@tommaso.galli',
}

function venditaLetta(campi: Record<string, unknown> = {}) {
  return {
    id: VENDITA,
    tipo: 'nuovo',
    client_id: CLIENTE,
    call_id: null,
    data_vendita: '2026-11-08',
    data_inizio: '2026-11-15',
    data_fine: '2027-05-14',
    prodotto_personalizzato: null,
    prodotto: { nome: 'Percorso Alpha 6 mesi' },
    ...campi,
  }
}

describe('le impostazioni e le persone', () => {
  it('le impostazioni della riga unica; senza la riga, quelle della migration', async () => {
    tabelle.onboarding_impostazioni = impostazioni(true)
    expect((await leggiImpostazioni(db())).aperto_ai_clienti).toBe(true)
    tabelle.onboarding_impostazioni = () => ({ data: null })
    expect(await leggiImpostazioni(db())).toEqual(IMPOSTAZIONI_DI_BASE)
    expect(IMPOSTAZIONI_DI_BASE).toMatchObject({ aperto_ai_clienti: false, giorni_validita_link: 14 })
  })

  it('chi può seguire un cliente: le persone attive, mai il business coach, per nome', async () => {
    tabelle.profiles = () => ({ data: [{ id: 'a', nome: 'Dany Montagnolo', ruolo: 'admin' }] })
    expect(await leggiPersone(db())).toEqual([{ id: 'a', nome: 'Dany Montagnolo', ruolo: 'admin' }])
    const [c] = fake.chiamate
    expect(ha(c, 'eq', 'attivo', true)).toBe(true)
    expect(ha(c, 'neq', 'ruolo', 'business_coach')).toBe(true)
    expect(ha(c, 'order', 'nome')).toBe(true)
    // never the email of a person
    expect(argomenti(c, 'select')?.[0]).toBe('id, nome, ruolo')
  })

  it('una lettura che non riesce lancia con il codice, mai con il messaggio di PostgREST', async () => {
    tabelle.profiles = () => ({ error: { code: '42501', message: 'permission denied for table profiles' } })
    const errore = await leggiPersone(db()).catch((e) => e)
    expect(errore).toBeInstanceOf(LetturaNonRiuscita)
    expect(errore.codice).toBe('42501')
    expect(errore.message).not.toContain('permission denied')
  })
})

describe('la sezione Onboarding', () => {
  it('le due view e le impostazioni, con la sessione di chi legge', async () => {
    tabelle.v_onboarding = () => ({ data: [riga(), riga({ client_id: 'altro' })] })
    tabelle.v_vendite_senza_onboarding = () => ({ data: [{ sale_id: VENDITA, client_id: CLIENTE, nome: 'Fausto' }], count: 15 })
    tabelle.onboarding_impostazioni = impostazioni(false)
    const elenco = await leggiElenco(db())
    expect(elenco.righe).toHaveLength(2)
    expect(elenco.tagliato).toBe(false)
    expect(elenco.senza).toHaveLength(1)
    // the title counts them all, also the ones the page does not list
    expect(elenco.senzaTotale).toBe(15)
    expect(elenco.aperto).toBe(false)
    expect(lette().sort()).toEqual(['onboarding_impostazioni', 'v_onboarding', 'v_vendite_senza_onboarding'])
    // never the base tables of the money: the views say no amount
    expect(lette()).not.toContain('sales')
    expect(lette()).not.toContain('payments')
  })

  it('oltre il massimo lo dice, senza mostrarne di più', async () => {
    tabelle.v_onboarding = () => ({ data: Array.from({ length: ELENCO_MAX + 1 }, (_, i) => riga({ client_id: `c${i}` })) })
    tabelle.onboarding_impostazioni = impostazioni(false)
    const elenco = await leggiElenco(db())
    expect(elenco.righe).toHaveLength(ELENCO_MAX)
    expect(elenco.tagliato).toBe(true)
  })

  it('per chi non è l’admin le view non rispondono righe: la sezione è vuota, non un errore', async () => {
    tabelle.v_onboarding = () => ({ data: [] })
    tabelle.v_vendite_senza_onboarding = () => ({ data: [], count: 0 })
    const elenco = await leggiElenco(db())
    expect(elenco).toMatchObject({ righe: [], senza: [], senzaTotale: 0, aperto: false })
  })

  it('una view che non si legge è un errore della pagina', async () => {
    tabelle.v_onboarding = () => ({ error: { code: 'PGRST301', message: 'JWT expired' } })
    await expect(leggiElenco(db())).rejects.toBeInstanceOf(LetturaNonRiuscita)
  })

  it('l’onboarding di un cliente, per gli agganci: la riga o niente', async () => {
    tabelle.v_onboarding = () => ({ data: riga({ invito_stato: 'attivo' }) })
    expect((await leggiOnboardingDelCliente(db(), CLIENTE))?.invito_stato).toBe('attivo')
    expect(ha(fake.chiamate[0], 'eq', 'client_id', CLIENTE)).toBe(true)
    tabelle.v_onboarding = () => ({ data: null })
    expect(await leggiOnboardingDelCliente(db(), CLIENTE)).toBeNull()
    const prima = fake.chiamate.length
    expect(await leggiOnboardingDelCliente(db(), 'non-un-id')).toBeNull()
    expect(fake.chiamate.length).toBe(prima)
  })
})

describe('la scheda di un cliente in onboarding', () => {
  beforeEach(() => {
    tabelle.clienti_telegram = () => ({ data: { username: 'tommaso_galli', gruppo_privato_url: null } })
    tabelle.onboarding_passi = () => ({
      data: [
        { passo: 'programma', stato: 'bloccato', iniziato_il: null, inviato_il: null, completato_il: null, def: { ordine: 9, titolo: 'Il tuo programma', nodo: 'inizio_percorso', attore: 'team', richiede_verifica: true } },
        { passo: 'benvenuto', stato: 'bloccato', iniziato_il: null, inviato_il: null, completato_il: null, def: { ordine: 1, titolo: 'Benvenuto', nodo: 'benvenuto', attore: 'cliente', richiede_verifica: false } },
        { passo: 'senza_definizione', stato: 'bloccato', iniziato_il: null, inviato_il: null, completato_il: null, def: null },
        { passo: 'call', stato: 'bloccato', iniziato_il: null, inviato_il: null, completato_il: null, def: { ordine: 6, titolo: 'Call di onboarding', nodo: 'call_onboarding', attore: 'team', richiede_verifica: true } },
      ],
    })
    tabelle.onboarding_eventi = () => ({
      data: [
        { id: 'e2', tipo: 'link_attivo', attore: 'team', dettagli: { attivato_da: 'manuale' }, created_at: '2026-11-11T10:00:00+00:00', autore: { nome: 'Dany Montagnolo' } },
        { id: 'e1', tipo: 'avviato', attore: 'team', dettagli: {}, created_at: '2026-11-10T10:00:00+00:00', autore: null },
      ],
    })
    tabelle.onboarding_inviti_token = () => ({ data: { token: TOKEN } })
  })

  it('la riga, Telegram, i passi nel loro ordine e il registro con chi ha fatto le azioni dell’admin', async () => {
    tabelle.v_onboarding = () => ({ data: riga() })
    tabelle.onboarding_impostazioni = impostazioni(false)
    const scheda = await leggiScheda(db(), CLIENTE)
    expect(scheda?.riga.client_id).toBe(CLIENTE)
    expect(scheda?.telegram).toEqual({ username: 'tommaso_galli', gruppo_privato_url: null })
    expect(scheda?.passi.map((p) => p.passo)).toEqual(['benvenuto', 'call', 'programma', 'senza_definizione'])
    expect(scheda?.passi[1]).toMatchObject({ titolo: 'Call di onboarding', attore: 'team', richiede_verifica: true, stato: 'bloccato' })
    expect(scheda?.eventi).toEqual([
      { id: 'e2', tipo: 'link_attivo', attore: 'team', dettagli: { attivato_da: 'manuale' }, created_at: '2026-11-11T10:00:00+00:00', autore: 'Dany Montagnolo' },
      { id: 'e1', tipo: 'avviato', attore: 'team', dettagli: {}, created_at: '2026-11-10T10:00:00+00:00', autore: null },
    ])
    expect(scheda?.eventiTagliati).toBe(false)
    // everything of that client only
    for (const c of fake.chiamate.filter((x) => x.nome !== 'onboarding_impostazioni')) {
      expect(ha(c, 'eq', 'client_id', CLIENTE), c.nome).toBe(true)
    }
  })

  it('con l’area clienti chiusa il token non si legge nemmeno, anche a link attivo', async () => {
    tabelle.v_onboarding = () => ({ data: riga({ invito_stato: 'attivo' }) })
    tabelle.onboarding_impostazioni = impostazioni(false)
    const scheda = await leggiScheda(db(), CLIENTE)
    expect(scheda?.link).toBeNull()
    expect(lette()).not.toContain('onboarding_inviti_token')
  })

  it('con l’area aperta e il link attivo: l’indirizzo da APP_URL e il messaggio pronto', async () => {
    tabelle.v_onboarding = () => ({ data: riga({ invito_stato: 'attivo' }) })
    tabelle.onboarding_impostazioni = impostazioni(true)
    const prima = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://esempio.test'
    try {
      const scheda = await leggiScheda(db(), CLIENTE)
      const indirizzo = `https://esempio.test/join/tommaso-galli-${TOKEN}`
      expect(scheda?.link).toEqual({
        indirizzo,
        messaggio: `Benvenuto nel Percorso Alpha, Tommaso. Da qui parte tutto: registrati con la tua email e segui gli step uno alla volta. ${indirizzo}`,
      })
      const token = fake.chiamate.find((c) => c.nome === 'onboarding_inviti_token')!
      expect(ha(token, 'eq', 'invito_id', INVITO)).toBe(true)
    } finally {
      if (prima === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prima
    }
  })

  it('con l’area aperta ma il link non attivo (in attesa, revocato, scaduto, usato) niente da copiare', async () => {
    tabelle.onboarding_impostazioni = impostazioni(true)
    for (const invito_stato of ['in_attesa_pagamento', 'revocato', 'scaduto', 'usato']) {
      tabelle.v_onboarding = () => ({ data: riga({ invito_stato }) })
      expect((await leggiScheda(db(), CLIENTE))?.link, invito_stato).toBeNull()
    }
    expect(lette()).not.toContain('onboarding_inviti_token')
  })

  it('un token che non c’è più (link usato nel frattempo) non rompe la scheda', async () => {
    tabelle.v_onboarding = () => ({ data: riga({ invito_stato: 'attivo' }) })
    tabelle.onboarding_impostazioni = impostazioni(true)
    tabelle.onboarding_inviti_token = () => ({ data: null })
    expect((await leggiScheda(db(), CLIENTE))?.link).toBeNull()
  })

  it('il registro mostra i più recenti e dice quando ce ne sono altri', async () => {
    tabelle.v_onboarding = () => ({ data: riga() })
    tabelle.onboarding_eventi = () => ({
      data: Array.from({ length: EVENTI_MAX + 1 }, (_, i) => ({ id: `e${i}`, tipo: 'avviato', attore: 'team', dettagli: {}, created_at: '2026-11-10T10:00:00+00:00', autore: null })),
    })
    const scheda = await leggiScheda(db(), CLIENTE)
    expect(scheda?.eventi).toHaveLength(EVENTI_MAX)
    expect(scheda?.eventiTagliati).toBe(true)
  })

  it('un cliente senza onboarding, o un id che non è un id: nessuna scheda', async () => {
    tabelle.v_onboarding = () => ({ data: null })
    expect(await leggiScheda(db(), CLIENTE)).toBeNull()
    const prima = fake.chiamate.length
    expect(await leggiScheda(db(), '../etc')).toBeNull()
    expect(fake.chiamate.length).toBe(prima)
  })

  it('mai l’hash del token, mai una tabella dei soldi', async () => {
    tabelle.v_onboarding = () => ({ data: riga({ invito_stato: 'attivo' }) })
    tabelle.onboarding_impostazioni = impostazioni(true)
    await leggiScheda(db(), CLIENTE)
    expect(lette()).not.toContain('onboarding_inviti')
    expect(lette()).not.toContain('payments')
    expect(lette()).not.toContain('sales')
    expect(JSON.stringify(fake.chiamate)).not.toContain('token_hash')
  })
})

describe('da dove parte il wizard', () => {
  it('dal menu: le tre schermate, vuote, con la vendita di oggi', async () => {
    expect(await leggiIngressoWizard(db(), {}, OGGI)).toEqual({
      modo: 'nuovo',
      origine: 'menu',
      cliente: { nome: '', cognome: '', email: '', telefono: '', instagram_handle: '', telegram: '' },
      clienteId: null,
      callId: null,
      call: null,
      dataVendita: OGGI,
      simili: [],
    })
    expect(fake.chiamate).toEqual([])
  })

  it('un parametro che non è un id non arriva al database', async () => {
    expect(await leggiIngressoWizard(db(), { vendita: 'x' })).toEqual({ modo: 'impossibile', motivo: 'vendita_non_trovata' })
    expect(await leggiIngressoWizard(db(), { call: "' or 1=1" })).toEqual({ modo: 'impossibile', motivo: 'call_non_trovata' })
    expect(await leggiIngressoWizard(db(), { cliente: '123' })).toEqual({ modo: 'impossibile', motivo: 'cliente_non_trovato' })
    expect(fake.chiamate).toEqual([])
  })

  it('una vendita «nuovo» che c’è già: «Avvia onboarding», senza la schermata Vendita e senza importi', async () => {
    tabelle.sales = () => ({ data: venditaLetta({ call_id: CALL }) })
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.onboarding_inviti = () => ({ data: [] })
    tabelle.clienti_telegram = () => ({ data: { username: 'tommaso_galli' } })
    const ingresso = await leggiIngressoWizard(db(), { vendita: VENDITA }, OGGI)
    expect(ingresso).toEqual({
      modo: 'avvia',
      cliente: {
        nome: 'Tommaso',
        cognome: 'Galli',
        email: 'tommaso.galli@example.test',
        telefono: '',
        instagram_handle: '@tommaso.galli',
        telegram: 'tommaso_galli',
      },
      clienteId: CLIENTE,
      callId: CALL,
      vendita: {
        saleId: VENDITA,
        prodotto: 'Percorso Alpha 6 mesi',
        data_vendita: '2026-11-08',
        data_inizio: '2026-11-15',
        data_fine: '2027-05-14',
      },
    })
    const vendita = fake.chiamate.find((c) => c.nome === 'sales')!
    expect(String(argomenti(vendita, 'select')?.[0])).not.toContain('valore_contratto')
  })

  it('un percorso fuori catalogo porta il suo nome', async () => {
    tabelle.sales = () => ({ data: venditaLetta({ prodotto: null, prodotto_personalizzato: 'Percorso su misura' }) })
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.onboarding_inviti = () => ({ data: [] })
    const ingresso = await leggiIngressoWizard(db(), { vendita: VENDITA }, OGGI)
    expect(ingresso).toMatchObject({ modo: 'avvia', vendita: { prodotto: 'Percorso su misura' } })
  })

  it('un rinnovo o un upsell non avviano niente', async () => {
    for (const tipo of ['rinnovo', 'upsell']) {
      tabelle.sales = () => ({ data: venditaLetta({ tipo }) })
      expect(await leggiIngressoWizard(db(), { vendita: VENDITA }, OGGI)).toEqual({
        modo: 'impossibile',
        motivo: 'vendita_non_nuovo',
        saleId: VENDITA,
      })
    }
    expect(lette()).not.toContain('clients')
  })

  it('un cliente con un link vivo non si avvia due volte: si va alla sua scheda', async () => {
    tabelle.sales = () => ({ data: venditaLetta() })
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.onboarding_inviti = () => ({ data: [{ id: INVITO }] })
    expect(await leggiIngressoWizard(db(), { vendita: VENDITA }, OGGI)).toEqual({
      modo: 'impossibile',
      motivo: 'gia_avviato',
      clienteId: CLIENTE,
      saleId: VENDITA,
    })
    // the same rule as public.avvia_onboarding: waiting, active or used
    const inviti = fake.chiamate.find((c) => c.nome === 'onboarding_inviti')!
    expect(ha(inviti, 'in', 'stato', ['in_attesa_pagamento', 'attivo', 'usato'])).toBe(true)
  })

  it('una vendita che non c’è', async () => {
    tabelle.sales = () => ({ data: null })
    expect(await leggiIngressoWizard(db(), { vendita: VENDITA }, OGGI)).toEqual({ modo: 'impossibile', motivo: 'vendita_non_trovata' })
  })

  const callChiusa = (campi: Record<string, unknown> = {}) => ({
    id: CALL,
    esito: 'chiusa',
    lead_id: LEAD,
    programmata_il: '2026-11-10T18:00:00+00:00',
    lead: { nome: 'Marco De Luca', instagram_handle: '@marco.deluca' },
    setter: { nome: 'Loris Setter' },
    closer: { nome: 'Dany Montagnolo' },
    ...campi,
  })

  it('una call chiusa senza vendita: le tre schermate con i dati del lead, firmata il giorno della call', async () => {
    tabelle.calls = () => ({ data: callChiusa() })
    tabelle.sales = () => ({ data: null })
    tabelle.clients = () => ({ data: null })
    tabelle.vendite_da_collegare = () => ({
      data: [
        { sale_id: 's1', cliente: 'Marco De Luca', tipo: 'nuovo', data_vendita: '2026-11-09', stesso_cliente: true, valore_contratto: 1500, setter: 'x' },
        { sale_id: 's2', cliente: 'Un altro', tipo: 'nuovo', data_vendita: '2026-11-09', stesso_cliente: false, valore_contratto: 900, setter: 'x' },
        { sale_id: 's3', cliente: 'Marco De Luca', tipo: 'nuovo', data_vendita: '2026-06-01', stesso_cliente: true, valore_contratto: 900, setter: 'x' },
      ],
    })
    const ingresso = await leggiIngressoWizard(db(), { call: CALL }, OGGI)
    expect(ingresso).toEqual({
      modo: 'nuovo',
      origine: 'call',
      cliente: { nome: 'Marco', cognome: 'De Luca', email: '', telefono: '', instagram_handle: '@marco.deluca', telegram: '' },
      clienteId: null,
      callId: CALL,
      call: { giorno: '2026-11-10', setter: 'Loris Setter', closer: 'Dany Montagnolo' },
      dataVendita: '2026-11-10',
      // only the same client's sales near the call, and never their amount
      simili: [{ sale_id: 's1', cliente: 'Marco De Luca', tipo: 'nuovo', data_vendita: '2026-11-09' }],
    })
  })

  it('una call di oggi si firma oggi; il cliente nato dal lead c’è già: la vendita va su di lui', async () => {
    tabelle.calls = () => ({ data: callChiusa({ programmata_il: `${OGGI}T09:00:00+00:00` }) })
    tabelle.sales = () => ({ data: null })
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.onboarding_inviti = () => ({ data: [] })
    tabelle.clienti_telegram = () => ({ data: null })
    const ingresso = await leggiIngressoWizard(db(), { call: CALL }, OGGI)
    expect(ingresso).toMatchObject({
      modo: 'nuovo',
      origine: 'call',
      clienteId: CLIENTE,
      dataVendita: OGGI,
      cliente: { nome: 'Tommaso', cognome: 'Galli', telegram: '' },
    })
  })

  it('una call non chiusa, o che non c’è, non apre il wizard', async () => {
    tabelle.calls = () => ({ data: callChiusa({ esito: 'follow_up' }) })
    expect(await leggiIngressoWizard(db(), { call: CALL }, OGGI)).toEqual({ modo: 'impossibile', motivo: 'call_non_chiusa' })
    tabelle.calls = () => ({ data: null })
    expect(await leggiIngressoWizard(db(), { call: CALL }, OGGI)).toEqual({ modo: 'impossibile', motivo: 'call_non_trovata' })
  })

  it('una call che ha già la sua vendita: manca solo l’onboarding, su quella vendita', async () => {
    tabelle.calls = () => ({ data: callChiusa() })
    tabelle.sales = () => ({ data: venditaLetta({ call_id: CALL }) })
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.onboarding_inviti = () => ({ data: [] })
    const ingresso = await leggiIngressoWizard(db(), { call: CALL }, OGGI)
    expect(ingresso).toMatchObject({ modo: 'avvia', callId: CALL, vendita: { saleId: VENDITA } })
    expect(lette()).not.toContain('vendite_da_collegare')
  })

  it('un cliente con la sua vendita «nuovo»: «Avvia onboarding» sulla più recente', async () => {
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.sales = () => ({ data: [venditaLetta()] })
    tabelle.onboarding_inviti = () => ({ data: [] })
    const ingresso = await leggiIngressoWizard(db(), { cliente: CLIENTE }, OGGI)
    expect(ingresso).toMatchObject({ modo: 'avvia', clienteId: CLIENTE, vendita: { saleId: VENDITA } })
    const vendite = fake.chiamate.find((c) => c.nome === 'sales')!
    expect(ha(vendite, 'eq', 'tipo', 'nuovo')).toBe(true)
    expect(ha(vendite, 'limit', 1)).toBe(true)
  })

  it('un cliente senza una vendita «nuovo»: le tre schermate su di lui', async () => {
    tabelle.clients = () => ({ data: clienteLetto })
    tabelle.sales = () => ({ data: [] })
    tabelle.onboarding_inviti = () => ({ data: [] })
    const ingresso = await leggiIngressoWizard(db(), { cliente: CLIENTE }, OGGI)
    expect(ingresso).toMatchObject({ modo: 'nuovo', origine: 'cliente', clienteId: CLIENTE, callId: null, dataVendita: OGGI })
  })

  it('un cliente che non c’è', async () => {
    tabelle.clients = () => ({ data: null })
    tabelle.sales = () => ({ data: [] })
    expect(await leggiIngressoWizard(db(), { cliente: CLIENTE }, OGGI)).toEqual({ modo: 'impossibile', motivo: 'cliente_non_trovato' })
  })

  it('la vendita vince sulla call e sul cliente', async () => {
    tabelle.sales = () => ({ data: venditaLetta({ tipo: 'rinnovo' }) })
    expect(await leggiIngressoWizard(db(), { vendita: VENDITA, call: CALL, cliente: CLIENTE }, OGGI)).toMatchObject({
      motivo: 'vendita_non_nuovo',
    })
    expect(lette()).toEqual(['sales'])
  })
})

describe('il nome del lead diviso in nome e cognome', () => {
  it('è solo un precompilato', () => {
    expect(dividiNome('Marco De Luca')).toEqual({ nome: 'Marco', cognome: 'De Luca' })
    expect(dividiNome('  Marco  ')).toEqual({ nome: 'Marco', cognome: '' })
    expect(dividiNome('')).toEqual({ nome: '', cognome: '' })
    expect(dividiNome(null)).toEqual({ nome: '', cognome: '' })
  })
})
