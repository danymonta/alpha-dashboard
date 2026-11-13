import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'

import { SOLA_LETTURA, TUTTI_I_RUOLI, type AppRole } from '@/lib/auth/roles'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import * as onboarding from '@/lib/onboarding/operazioni'
import { ERRORI_ONBOARDING } from '@/lib/validation/onboarding'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The core of the onboarding (1.77.0) against a fake client: who may write (the admin
 * only, whatever the action), what reaches the database and as what, how its answers and
 * its refusals come back, which pages refresh. And the edges of the release: no tool for
 * Alfire or Claude, never the service role, no authentication touched.
 */

const ADMIN = '11111111-1111-4111-8111-111111111111'
const COACH = '44444444-4444-4444-8444-444444444444'
const CLIENTE = '0b0a0000-0000-4000-8000-000000000001'
const VENDITA = '0b0a0000-0000-4000-8000-000000000011'
const INVITO = '0b0a0000-0000-4000-8000-000000000021'
const CALL = '0b0a0000-0000-4000-8000-000000000031'
const PRODOTTO = 'aaaaaaa1-0000-4000-8000-000000000002'
const OGGI = oggiRoma()

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

beforeEach(() => {
  rispondi = () => ({ data: null })
  fake = supabaseFinto((c) => rispondi(c))
  vi.mocked(revalidatePath).mockClear()
})

function contesto(ruolo: AppRole | null = 'admin', attivo = true): onboarding.Contesto {
  return {
    db: fake.client as never,
    chi: async () => (ruolo ? { id: ADMIN, ruolo, attivo } : null),
  }
}

function rpc(nome: string) {
  const c = fake.chiamate.find((x) => x.tipo === 'rpc' && x.nome === nome)
  return c ? (argomenti(c, 'args')?.[0] as Record<string, unknown>) : undefined
}

const rivalidati = () => vi.mocked(revalidatePath).mock.calls.map((c) => c.join(' '))

const wizard = {
  cliente: {
    nome: 'Tommaso',
    cognome: 'Galli',
    email: 'Tommaso.Galli@example.test',
    telefono: '',
    instagram_handle: 'tommaso.galli',
    telegram: '@Tommaso_Galli',
    minorenne: false,
  },
  vendita: {
    product_id: PRODOTTO,
    valore_contratto: '1.500,00',
    numero_rate: 3,
    data_vendita: OGGI,
    data_inizio: aggiungiGiorni(OGGI, 7),
    call_id: CALL,
  },
  team: { coach: COACH, revisore: '', responsabile: ADMIN },
}

/** Every write of the core, with an input its schema accepts. */
const AZIONI: Record<string, (ctx: onboarding.Contesto) => Promise<{ ok: boolean; errore?: string }>> = {
  nuovoCliente: (ctx) => onboarding.nuovoCliente(ctx, wizard),
  avviaOnboarding: (ctx) => onboarding.avviaOnboarding(ctx, { sale_id: VENDITA, cliente: wizard.cliente, team: wizard.team }),
  confermaPagamento: (ctx) => onboarding.confermaPagamento(ctx, { invito_id: INVITO }),
  registraConsensoGenitore: (ctx) => onboarding.registraConsensoGenitore(ctx, { invito_id: INVITO, nota: 'Il padre' }),
  revocaLink: (ctx) => onboarding.revocaLink(ctx, { invito_id: INVITO, motivo: 'Ha cambiato idea' }),
  riattivaLink: (ctx) => onboarding.riattivaLink(ctx, { invito_id: INVITO }),
  rigeneraLink: (ctx) => onboarding.rigeneraLink(ctx, { invito_id: INVITO }),
  impostaIncarichi: (ctx) => onboarding.impostaIncarichi(ctx, { client_id: CLIENTE, ...wizard.team }),
  salvaTelegram: (ctx) => onboarding.salvaTelegram(ctx, { client_id: CLIENTE, username: 'tommaso_galli' }),
  salvaImpostazioni: (ctx) => onboarding.salvaImpostazioni(ctx, { giorni_validita_link: 14 }),
  // 1.78.0
  segnaProva: (ctx) => onboarding.segnaProva(ctx, { invito_id: INVITO, prova: true }),
  eliminaOnboarding: (ctx) => onboarding.eliminaOnboarding(ctx, { client_id: CLIENTE }),
}

describe('chi può scrivere: solo l’admin, su ogni azione', () => {
  it('il nucleo non ha altre scritture oltre a queste', () => {
    const esportate = Object.entries(onboarding)
      .filter(([, v]) => typeof v === 'function')
      .map(([nome]) => nome)
      .sort()
    expect(esportate).toEqual(Object.keys(AZIONI).sort())
  })

  for (const [nome, azione] of Object.entries(AZIONI)) {
    it(`${nome}: setter, closer, coach e gli altri ruoli sono rifiutati prima di toccare il database`, async () => {
      for (const ruolo of TUTTI_I_RUOLI.filter((r) => r !== 'admin')) {
        const esito = await azione(contesto(ruolo))
        expect(esito.ok, ruolo).toBe(false)
        // the business coach reads and never writes: his own sentence, as everywhere
        expect(esito.errore, ruolo).toBe(ruolo === 'business_coach' ? SOLA_LETTURA : ERRORI_ONBOARDING.soloAdmin)
      }
      expect(fake.chiamate).toEqual([])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it(`${nome}: senza sessione, o con l’account disattivato, niente`, async () => {
      for (const ctx of [contesto(null), contesto('admin', false)]) {
        const esito = await azione(ctx)
        expect(esito).toEqual({ ok: false, errore: 'Sessione scaduta. Rientra e riprova.' })
      }
      expect(fake.chiamate).toEqual([])
    })
  }

  it('nessuna azione elimina mai una riga', async () => {
    rispondi = (c) =>
      c.tipo === 'rpc'
        ? { data: { invito_id: INVITO, client_id: CLIENTE, sale_id: VENDITA, stato: 'in_attesa_pagamento' } }
        : { data: { id: true } }
    for (const azione of Object.values(AZIONI)) await azione(contesto())
    expect(fake.chiamate.length).toBeGreaterThanOrEqual(Object.keys(AZIONI).length)
    expect(fake.chiamate.some((c) => ha(c, 'delete'))).toBe(false)
  })
})

describe('il wizard «Nuovo cliente»', () => {
  it('una sola chiamata, public.nuovo_cliente: la vendita e l’onboarding insieme', async () => {
    rispondi = () => ({ data: { sale_id: VENDITA, client_id: CLIENTE, invito_id: INVITO, stato: 'in_attesa_pagamento' } })
    const esito = await onboarding.nuovoCliente(contesto(), wizard)
    expect(esito).toEqual({ ok: true, idCliente: CLIENTE, idInvito: INVITO, idVendita: VENDITA, stato: 'in_attesa_pagamento' })
    expect(fake.chiamate.map((c) => `${c.tipo} ${c.nome}`)).toEqual(['rpc nuovo_cliente'])

    const { p_vendita, p_onboarding } = rpc('nuovo_cliente') as { p_vendita: Record<string, unknown>; p_onboarding: Record<string, unknown> }
    // the arguments of registra_vendita by name, the amount as a number, no empty key
    expect(p_vendita).toEqual({
      product_id: PRODOTTO,
      data_vendita: OGGI,
      data_inizio: aggiungiGiorni(OGGI, 7),
      valore_contratto: 1500,
      numero_rate: 3,
      call_id: CALL,
      nome: 'Tommaso',
      cognome: 'Galli',
      email: 'tommaso.galli@example.test',
      instagram_handle: '@tommaso.galli',
    })
    // never a type: the function registers a «nuovo» sale, whatever the browser says
    expect(p_vendita).not.toHaveProperty('tipo')
    expect(p_onboarding).toEqual({
      coach: COACH,
      responsabile: ADMIN,
      telegram: 'tommaso_galli',
      // every field of the screen «Cliente» is written, the emptied ones empty
      contatti: {
        nome: 'Tommaso',
        cognome: 'Galli',
        email: 'tommaso.galli@example.test',
        telefono: null,
        instagram_handle: '@tommaso.galli',
      },
      minorenne: false,
    })
  })

  it('un percorso fuori catalogo e un piano scritto a mano arrivano come li vuole registra_vendita', async () => {
    rispondi = () => ({ data: { sale_id: VENDITA, client_id: CLIENTE, invito_id: INVITO, stato: 'in_attesa_pagamento' } })
    const fine = aggiungiGiorni(OGGI, 200)
    await onboarding.nuovoCliente(contesto(), {
      ...wizard,
      cliente: { ...wizard.cliente, minorenne: true },
      vendita: {
        product_id: 'personalizzato',
        prodotto_personalizzato: 'Percorso su misura',
        data_fine: fine,
        valore_contratto: 1000,
        numero_rate: 2,
        piano: 'personalizzato',
        rate: [
          { scadenza: OGGI, importo: '400' },
          { scadenza: aggiungiGiorni(OGGI, 30), importo: 600 },
        ],
        data_vendita: OGGI,
        data_inizio: OGGI,
      },
    })
    const { p_vendita, p_onboarding } = rpc('nuovo_cliente') as { p_vendita: Record<string, unknown>; p_onboarding: Record<string, unknown> }
    expect(p_vendita).not.toHaveProperty('product_id')
    expect(p_vendita).toMatchObject({
      prodotto_personalizzato: 'Percorso su misura',
      data_fine: fine,
      rate: [
        { scadenza: OGGI, importo: 400 },
        { scadenza: aggiungiGiorni(OGGI, 30), importo: 600 },
      ],
    })
    expect(p_onboarding.minorenne).toBe(true)
  })

  it('con un campo sbagliato non chiama niente e dice quale, schermata per schermata', async () => {
    const esito = await onboarding.nuovoCliente(contesto(), { ...wizard, cliente: { nome: '' }, team: { coach: COACH } })
    expect(esito).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.controlla,
      campi: { cliente: { nome: ERRORI_ONBOARDING.nome }, team: { responsabile: ERRORI_ONBOARDING.responsabile } },
    })
    expect(fake.chiamate).toEqual([])
  })

  it('la call ha già la sua vendita: lo dice e indica quale, per avviare l’onboarding da lì', async () => {
    rispondi = (c) =>
      c.tipo === 'rpc'
        ? { error: { code: '23505', message: 'duplicate key value violates unique constraint "sales_una_per_call"' } }
        : { data: { id: VENDITA } }
    const esito = await onboarding.nuovoCliente(contesto(), wizard)
    expect(esito).toEqual({ ok: false, errore: ERRORI_ONBOARDING.callConVendita, idEsistente: VENDITA })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('le regole del database tornano con le loro parole, il resto con una frase sola', async () => {
    rispondi = () => ({ error: { code: '22023', message: 'Questo cliente ha già un onboarding avviato.' } })
    expect(await onboarding.nuovoCliente(contesto(), wizard)).toEqual({
      ok: false,
      errore: 'Questo cliente ha già un onboarding avviato.',
    })
    rispondi = () => ({ error: { code: '23514', message: 'Il piano rate non coincide con il contratto' } })
    expect(await onboarding.nuovoCliente(contesto(), wizard)).toMatchObject({ errore: 'Il piano rate non coincide con il contratto' })
    rispondi = () => ({ error: { code: '08006', message: 'connection failure: host db.internal' } })
    expect(await onboarding.nuovoCliente(contesto(), wizard)).toEqual({ ok: false, errore: ERRORI_ONBOARDING.nonAvviato })
    // a unique violation without a call: the living link of the client
    rispondi = () => ({ error: { code: '23505', message: 'duplicate key' } })
    const senzaCall = { ...wizard, vendita: { ...wizard.vendita, call_id: null } }
    expect(await onboarding.nuovoCliente(contesto(), senzaCall)).toEqual({ ok: false, errore: ERRORI_ONBOARDING.giaAvviato })
  })

  it('rivalida l’onboarding, la scheda del cliente, la vendita e il progetto', async () => {
    rispondi = () => ({ data: { sale_id: VENDITA, client_id: CLIENTE, invito_id: INVITO, stato: 'in_attesa_pagamento' } })
    await onboarding.nuovoCliente(contesto(), wizard)
    expect(rivalidati()).toEqual(
      expect.arrayContaining([
        '/onboarding layout',
        '/clients',
        '/clients/[id] page',
        '/sales',
        '/sales/[id] page',
        '/calls',
        '/progetti layout',
        '/payments',
        '/',
      ]),
    )
    expect(rivalidati()).not.toContain('/ layout')
  })

  it('una vendita già incassata dà il link attivo: la notifica nella campanella rivalida tutta l’app', async () => {
    rispondi = () => ({ data: { sale_id: VENDITA, client_id: CLIENTE, invito_id: INVITO, stato: 'attivo' } })
    const esito = await onboarding.nuovoCliente(contesto(), wizard)
    expect(esito).toMatchObject({ ok: true, stato: 'attivo' })
    expect(rivalidati()).toContain('/ layout')
  })

  it('una risposta che non si legge non passa per un successo, ma le pagine si aggiornano', async () => {
    rispondi = () => ({ data: { stato: 'boh' } })
    expect(await onboarding.nuovoCliente(contesto(), wizard)).toEqual({ ok: false, errore: ERRORI_ONBOARDING.risposta })
    expect(rivalidati()).toContain('/onboarding layout')
  })
})

describe('«Avvia onboarding» su una vendita che c’è già', () => {
  it('public.avvia_onboarding con la vendita, il team, i contatti e Telegram', async () => {
    rispondi = () => ({ data: { invito_id: INVITO, client_id: CLIENTE, stato: 'attivo' } })
    const esito = await onboarding.avviaOnboarding(contesto(), {
      sale_id: VENDITA,
      cliente: { ...wizard.cliente, minorenne: true },
      team: { responsabile: ADMIN },
    })
    expect(esito).toEqual({ ok: true, idCliente: CLIENTE, idInvito: INVITO, idVendita: VENDITA, stato: 'attivo' })
    expect(rpc('avvia_onboarding')).toEqual({
      p_sale_id: VENDITA,
      p_coach: null,
      p_revisore: null,
      p_responsabile: ADMIN,
      p_contatti: {
        nome: 'Tommaso',
        cognome: 'Galli',
        email: 'tommaso.galli@example.test',
        telefono: null,
        instagram_handle: '@tommaso.galli',
      },
      p_telegram: 'tommaso_galli',
      p_minorenne: true,
    })
    expect(rivalidati()).toContain('/ layout')
  })

  it('i campi sbagliati tornano per schermata', async () => {
    const esito = await onboarding.avviaOnboarding(contesto(), { sale_id: VENDITA, cliente: { nome: ' ' }, team: {} })
    expect(esito).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.controlla,
      campi: { cliente: { nome: ERRORI_ONBOARDING.nome }, team: { responsabile: ERRORI_ONBOARDING.responsabile } },
    })
    expect(await onboarding.avviaOnboarding(contesto(), { sale_id: 'x', cliente: wizard.cliente, team: wizard.team })).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.vendita,
    })
    expect(fake.chiamate).toEqual([])
  })

  it('un rinnovo è rifiutato dal database, con le sue parole', async () => {
    rispondi = () => ({ error: { code: '22023', message: "L'onboarding parte solo da una vendita a un nuovo cliente." } })
    expect(await onboarding.avviaOnboarding(contesto(), { sale_id: VENDITA, cliente: wizard.cliente, team: wizard.team })).toEqual({
      ok: false,
      errore: "L'onboarding parte solo da una vendita a un nuovo cliente.",
    })
  })
})

describe('le azioni sul link', () => {
  const risposta = (stato: string) => ({ data: { invito_id: INVITO, client_id: CLIENTE, stato } })

  it('ognuna chiama la sua funzione e dice lo stato del link dopo', async () => {
    rispondi = () => risposta('attivo')
    expect(await onboarding.confermaPagamento(contesto(), { invito_id: INVITO })).toEqual({ ok: true, idCliente: CLIENTE, stato: 'attivo' })
    expect(rpc('onboarding_conferma_pagamento')).toEqual({ p_invito: INVITO })

    expect(await onboarding.registraConsensoGenitore(contesto(), { invito_id: INVITO, nota: ' Il padre, al telefono ' })).toMatchObject({ ok: true })
    expect(rpc('onboarding_consenso_genitore')).toEqual({ p_invito: INVITO, p_nota: 'Il padre, al telefono' })

    rispondi = () => risposta('revocato')
    expect(await onboarding.revocaLink(contesto(), { invito_id: INVITO, motivo: 'Ha cambiato idea' })).toEqual({
      ok: true,
      idCliente: CLIENTE,
      stato: 'revocato',
    })
    expect(rpc('onboarding_revoca')).toEqual({ p_invito: INVITO, p_motivo: 'Ha cambiato idea' })

    rispondi = () => risposta('in_attesa_pagamento')
    expect(await onboarding.riattivaLink(contesto(), { invito_id: INVITO })).toMatchObject({ ok: true, stato: 'in_attesa_pagamento' })
    expect(rpc('onboarding_riattiva')).toEqual({ p_invito: INVITO })
    expect(await onboarding.rigeneraLink(contesto(), { invito_id: INVITO })).toMatchObject({ ok: true })
    expect(rpc('onboarding_rigenera_link')).toEqual({ p_invito: INVITO })
  })

  it('«Conferma pagamento» non registra nessun incasso: non tocca payments né sales', async () => {
    rispondi = () => risposta('attivo')
    await onboarding.confermaPagamento(contesto(), { invito_id: INVITO })
    expect(fake.chiamate.map((c) => c.nome)).toEqual(['onboarding_conferma_pagamento'])
  })

  it('un minorenne senza consenso resta in attesa anche dopo la conferma: lo stato lo dice', async () => {
    rispondi = () => risposta('in_attesa_pagamento')
    expect(await onboarding.confermaPagamento(contesto(), { invito_id: INVITO })).toEqual({
      ok: true,
      idCliente: CLIENTE,
      stato: 'in_attesa_pagamento',
    })
    expect(rivalidati()).not.toContain('/ layout')
    expect(rivalidati()).toEqual(expect.arrayContaining(['/onboarding layout', `/clients/${CLIENTE}`, '/sales/[id] page']))
  })

  it('la revoca senza motivo non parte', async () => {
    expect(await onboarding.revocaLink(contesto(), { invito_id: INVITO, motivo: '  ' })).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.motivo,
    })
    expect(fake.chiamate).toEqual([])
  })

  it('i rifiuti del database tornano con le loro parole, un guasto con la frase dell’azione', async () => {
    rispondi = () => ({ error: { code: '22023', message: 'Il pagamento si conferma solo per un link in attesa di pagamento.' } })
    expect(await onboarding.confermaPagamento(contesto(), { invito_id: INVITO })).toEqual({
      ok: false,
      errore: 'Il pagamento si conferma solo per un link in attesa di pagamento.',
    })
    rispondi = () => ({ error: { code: '42501', message: "Un link lo revoca l'admin" } })
    expect(await onboarding.revocaLink(contesto(), { invito_id: INVITO, motivo: 'x' })).toMatchObject({ errore: "Un link lo revoca l'admin" })
    rispondi = () => ({ error: { code: 'XX000', message: 'internal error at 10.0.0.3' } })
    expect(await onboarding.confermaPagamento(contesto(), { invito_id: INVITO })).toEqual({ ok: false, errore: ERRORI_ONBOARDING.nonConfermato })
    expect(await onboarding.riattivaLink(contesto(), { invito_id: INVITO })).toEqual({ ok: false, errore: ERRORI_ONBOARDING.nonRiattivato })
    expect(await onboarding.rigeneraLink(contesto(), { invito_id: INVITO })).toEqual({ ok: false, errore: ERRORI_ONBOARDING.nonRigenerato })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('incarichi, Telegram e impostazioni', () => {
  it('gli incarichi passano dalla funzione, mai da un update della tabella', async () => {
    rispondi = () => ({ data: { client_id: CLIENTE } })
    expect(await onboarding.impostaIncarichi(contesto(), { client_id: CLIENTE, coach: '', revisore: COACH, responsabile: ADMIN })).toEqual({ ok: true })
    expect(fake.chiamate.map((c) => `${c.tipo} ${c.nome}`)).toEqual(['rpc onboarding_imposta_incarichi'])
    expect(rpc('onboarding_imposta_incarichi')).toEqual({
      p_client_id: CLIENTE,
      p_coach: null,
      p_revisore: COACH,
      p_responsabile: ADMIN,
    })
    expect(rivalidati()).toEqual(expect.arrayContaining(['/onboarding layout', '/progetti layout', `/clients/${CLIENTE}`]))
  })

  it('Telegram: un upsert sulla riga del cliente, pulito', async () => {
    rispondi = () => ({ data: null })
    expect(
      await onboarding.salvaTelegram(contesto(), { client_id: CLIENTE, username: '@Tommaso_Galli', gruppo_privato_url: 't.me/+abc' }),
    ).toEqual({ ok: true })
    const [c] = fake.chiamate
    expect(c.nome).toBe('clienti_telegram')
    expect(argomenti(c, 'upsert')).toEqual([
      { client_id: CLIENTE, username: 'tommaso_galli', gruppo_privato_url: 'https://t.me/+abc' },
      { onConflict: 'client_id' },
    ])
  })

  it('un rifiuto di RLS su una tabella non mostra mai le parole di Postgres', async () => {
    rispondi = () => ({ error: { code: '42501', message: 'new row violates row-level security policy for table "clienti_telegram"' } })
    expect(await onboarding.salvaTelegram(contesto(), { client_id: CLIENTE, username: 'tommaso_galli' })).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.telegramNonSalvato,
    })
    rispondi = () => ({ error: { code: '23514', message: 'new row for relation "onboarding_impostazioni" violates check constraint' } })
    expect(await onboarding.salvaImpostazioni(contesto(), { giorni_validita_link: 14 })).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.impostazioniNonSalvate,
    })
  })

  it('le impostazioni: la riga unica, con chi le ha cambiate, mai aperto_ai_clienti', async () => {
    rispondi = () => ({ data: { id: true } })
    expect(
      await onboarding.salvaImpostazioni(contesto(), {
        coach_predefinito_id: COACH,
        revisore_predefinito_id: '',
        responsabile_predefinito_id: ADMIN,
        link_community: 't.me/percorsoalpha_prova',
        giorni_validita_link: '21',
        aperto_ai_clienti: true,
      }),
    ).toEqual({ ok: true })
    const [c] = fake.chiamate
    expect(c.nome).toBe('onboarding_impostazioni')
    expect(argomenti(c, 'update')).toEqual([
      {
        coach_predefinito_id: COACH,
        revisore_predefinito_id: null,
        responsabile_predefinito_id: ADMIN,
        link_community: 'https://t.me/percorsoalpha_prova',
        giorni_validita_link: 21,
        updated_by: ADMIN,
      },
    ])
    expect(ha(c, 'eq', 'id', true)).toBe(true)
  })

  it('se nessuna riga si aggiorna (RLS) non dice «salvato»', async () => {
    rispondi = () => ({ data: null })
    expect(await onboarding.salvaImpostazioni(contesto(), { giorni_validita_link: 14 })).toEqual({
      ok: false,
      errore: ERRORI_ONBOARDING.impostazioniNonSalvate,
    })
  })
})

// ---------------------------------------------------------------------------
// The edges of release A, read from the code
// ---------------------------------------------------------------------------
const RADICE = process.cwd()

function file(cartella: string): string[] {
  const percorso = join(RADICE, cartella)
  return readdirSync(percorso).flatMap((nome) => {
    const relativo = join(cartella, nome)
    return statSync(join(RADICE, relativo)).isDirectory() ? file(relativo) : /\.(ts|tsx)$/.test(nome) ? [relativo] : []
  })
}

const leggi = (percorso: string) => readFileSync(join(RADICE, percorso), 'utf8')

describe('i confini del rilascio A', () => {
  const codice = ['lib/onboarding', 'app/(app)/onboarding'].flatMap(file)

  it('mai il service role: né il client admin né la chiave segreta', () => {
    expect(codice.length).toBeGreaterThanOrEqual(5)
    for (const f of [...codice, 'lib/validation/onboarding.ts']) {
      const testo = leggi(f)
      expect(testo, f).not.toMatch(/supabase\/admin/)
      expect(testo, f).not.toMatch(/SUPABASE_SECRET_KEY|service_role|createAdminClient/)
    }
  })

  it('il nucleo e le letture sono solo del server; le action usano la sessione dei cookie', () => {
    expect(leggi('lib/onboarding/operazioni.ts')).toMatch(/^import 'server-only'/)
    expect(leggi('lib/onboarding/letture.ts')).toMatch(/^import 'server-only'/)
    const action = leggi('app/(app)/onboarding/actions.ts')
    expect(action).toMatch(/^'use server'/)
    expect(action).toContain("from '@/lib/supabase/server'")
    expect(action).toContain('getProfilo')
  })

  it('ogni scrittura del nucleo ha la sua server action, e nessuna action scrive da sola', () => {
    const action = leggi('app/(app)/onboarding/actions.ts')
    for (const nome of Object.keys(AZIONI)) {
      expect(action, nome).toContain(`export async function ${nome}(`)
      expect(action, nome).toContain(`onboarding.${nome}(await nucleo(), input)`)
    }
    expect(action).not.toMatch(/\.from\(|\.rpc\(/)
  })

  it('Alfire e il server MCP non ricevono niente dell’onboarding', () => {
    for (const cartella of ['lib/alfire', 'lib/mcp', 'app/mcp', 'app/api/alfire']) {
      for (const f of file(cartella)) {
        const testo = leggi(f)
        expect(testo, f).not.toMatch(/lib\/onboarding|validation\/onboarding/)
        // neither its functions nor its tables and views (valore_medio_nuovo_cliente is a metric, not the wizard)
        expect(testo, f).not.toMatch(/rpc\(\s*'(nuovo_cliente|avvia_onboarding|onboarding_)/)
        expect(testo, f).not.toMatch(/onboarding_(inviti|percorsi|passi|eventi|incarichi|impostazioni)|clienti_telegram|v_onboarding|v_vendite_senza_onboarding/)
      }
    }
  })

  it('l’autenticazione non è toccata: nessun file dell’onboarding la importa per cambiarla', () => {
    for (const f of codice) {
      const testo = leggi(f)
      expect(testo, f).not.toMatch(/lib\/auth\/(dopo-login|accesso|dev-login)|supabase\/middleware|signInWithOtp|auth\.admin/)
    }
  })

  it('le letture non leggono il token del link finché l’area clienti è chiusa', () => {
    const letture = leggi('lib/onboarding/letture.ts')
    const dove = letture.indexOf("from('onboarding_inviti_token')")
    expect(dove).toBeGreaterThan(0)
    // the only read of the token sits behind aperto_ai_clienti
    expect(letture.indexOf("from('onboarding_inviti_token')", dove + 1)).toBe(-1)
    const prima = letture.slice(letture.lastIndexOf('if (', dove), dove)
    expect(prima).toContain('impostazioni.aperto_ai_clienti')
    // and never the hash: nobody needs it in the app
    expect(letture).not.toContain('token_hash')
  })
})
