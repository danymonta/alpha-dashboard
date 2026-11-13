import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  ERRORI_ONBOARDING,
  INCARICHI,
  STATI_INVITO,
  STATI_PASSO,
  STATI_PERCORSO,
  avviaOnboardingSchema,
  clienteOnboardingSchema,
  consensoGenitoreSchema,
  eStatoInvito,
  eStatoPasso,
  eStatoPercorso,
  impostazioniOnboardingSchema,
  incarichiSchema,
  invitoSchema,
  normalizzaLinkTelegram,
  normalizzaTelegram,
  revocaSchema,
  teamOnboardingSchema,
  telegramClienteSchema,
  validaNuovoCliente,
  venditaDelWizard,
} from '@/lib/validation/onboarding'
import { PERSONALIZZATO } from '@/lib/validation/vendita'
import { Constants } from '@/lib/supabase/database.types'

/**
 * The schemas of the guided onboarding (1.77.0): the same ones validate the wizard, the
 * card and the settings in the browser and in the server actions. Invented people only.
 */

const DANY = '11111111-1111-4111-8111-111111111111'
const COACH = '44444444-4444-4444-8444-444444444444'
const PRODOTTO = 'aaaaaaa1-0000-4000-8000-000000000002'
const INVITO = '0b0a0000-0000-4000-8000-000000000021'
const CLIENTE = '0b0a0000-0000-4000-8000-000000000001'
const VENDITA = '0b0a0000-0000-4000-8000-000000000011'
const OGGI = oggiRoma()

const cliente = { nome: 'Tommaso', cognome: 'Galli' }
const vendita = {
  product_id: PRODOTTO,
  valore_contratto: '1.500,00',
  numero_rate: 3,
  data_vendita: OGGI,
  data_inizio: aggiungiGiorni(OGGI, 7),
}
const team = { coach: COACH, revisore: '', responsabile: DANY }

describe('gli stati: gli stessi dei check delle tabelle', () => {
  it('invito, percorso e passo', () => {
    expect([...STATI_INVITO]).toEqual(['in_attesa_pagamento', 'attivo', 'usato', 'scaduto', 'revocato'])
    expect([...STATI_PERCORSO]).toEqual(['in_attesa', 'in_corso', 'sospeso', 'completato'])
    expect([...STATI_PASSO]).toEqual(['bloccato', 'disponibile', 'in_corso', 'inviato', 'in_attesa_team', 'fatto'])
    expect([...INCARICHI]).toEqual(['coach', 'revisore', 'responsabile'])
  })

  it('un valore fuori elenco non è uno stato', () => {
    expect(eStatoInvito('attivo')).toBe(true)
    expect(eStatoInvito('pending_payment')).toBe(false)
    expect(eStatoInvito(null)).toBe(false)
    expect(eStatoPercorso('sospeso')).toBe(true)
    expect(eStatoPercorso('attivo')).toBe(false)
    expect(eStatoPasso('in_attesa_team')).toBe(true)
    expect(eStatoPasso('')).toBe(false)
  })

  it('nessun ruolo nuovo: cliente e revisore non sono ruoli dell’app', () => {
    expect(Constants.public.Enums.app_role).not.toContain('client')
    expect(Constants.public.Enums.app_role).not.toContain('cliente')
    expect(Constants.public.Enums.app_role).not.toContain('revisore')
  })
})

describe('lo username di Telegram', () => {
  it('come lo si incolla: con la @, con le maiuscole, come link', () => {
    expect(normalizzaTelegram('@Mario_Rossi ')).toBe('mario_rossi')
    expect(normalizzaTelegram('mario_rossi')).toBe('mario_rossi')
    expect(normalizzaTelegram('t.me/Mario_Rossi')).toBe('mario_rossi')
    expect(normalizzaTelegram('https://t.me/mario_rossi')).toBe('mario_rossi')
    expect(normalizzaTelegram('https://www.telegram.me/mario_rossi/')).toBe('mario_rossi')
    expect(normalizzaTelegram('https://t.me/mario_rossi?start=1')).toBe('mario_rossi')
    expect(normalizzaTelegram('  ')).toBeNull()
    expect(normalizzaTelegram(null)).toBeNull()
    expect(normalizzaTelegram('@')).toBeNull()
  })

  it('da 5 a 32 caratteri tra lettere, numeri e trattino basso, come il check della tabella', () => {
    const prova = (telegram: string) => clienteOnboardingSchema.safeParse({ nome: 'Mario', telegram })
    expect(prova('mario').success).toBe(true)
    expect(prova('a'.repeat(32)).success).toBe(true)
    for (const sbagliato of ['mari', 'a'.repeat(33), 'mario.rossi', 'mario-rossi', 'mario rossi', 'màrio_rossi']) {
      const esito = prova(sbagliato)
      expect(esito.success, sbagliato).toBe(false)
      if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.telegram)
    }
  })
})

describe('un link di Telegram', () => {
  it('prende https:// da solo e resta com’è quando lo ha', () => {
    expect(normalizzaLinkTelegram('t.me/+abcDEF')).toBe('https://t.me/+abcDEF')
    expect(normalizzaLinkTelegram('http://t.me/percorsoalpha')).toBe('https://t.me/percorsoalpha')
    expect(normalizzaLinkTelegram(' https://t.me/percorsoalpha ')).toBe('https://t.me/percorsoalpha')
    expect(normalizzaLinkTelegram('')).toBeNull()
    expect(normalizzaLinkTelegram(undefined)).toBeNull()
  })

  it('solo t.me, senza spazi, al massimo 300 caratteri', () => {
    const prova = (gruppo_privato_url: string) => telegramClienteSchema.safeParse({ client_id: CLIENTE, gruppo_privato_url })
    expect(prova('https://t.me/+abcDEF123').success).toBe(true)
    expect(prova('t.me/+abcDEF123').success).toBe(true)
    for (const sbagliato of ['https://example.test/gruppo', 'https://t.me/', 'https://t.me/un gruppo', 'gruppo', 'javascript:alert(1)']) {
      const esito = prova(sbagliato)
      expect(esito.success, sbagliato).toBe(false)
      if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.linkTelegram)
    }
    const lungo = prova(`https://t.me/${'a'.repeat(300)}`)
    expect(lungo.success).toBe(false)
    if (!lungo.success) expect(lungo.error.issues[0].message).toBe(ERRORI_ONBOARDING.linkLungo)
  })
})

describe('la schermata «Cliente»', () => {
  it('il nome è obbligatorio, il resto no; i vuoti diventano null', () => {
    const esito = clienteOnboardingSchema.parse({ nome: '  Tommaso ', cognome: ' ', email: '', telefono: '', instagram_handle: '', telegram: '' })
    expect(esito).toEqual({
      nome: 'Tommaso',
      cognome: null,
      email: null,
      telefono: null,
      instagram_handle: null,
      telegram: null,
      minorenne: false,
    })
    const senza = clienteOnboardingSchema.safeParse({ nome: '   ' })
    expect(senza.success).toBe(false)
    if (!senza.success) expect(senza.error.issues[0].message).toBe(ERRORI_ONBOARDING.nome)
  })

  it('i contatti si puliscono come in «Nuova vendita»: email minuscola, handle con la @, Telegram senza', () => {
    const esito = clienteOnboardingSchema.parse({
      nome: 'Tommaso',
      cognome: 'Galli',
      email: ' Tommaso.Galli@Example.Test ',
      telefono: '+39 333 000 0000',
      instagram_handle: 'Tommaso.Galli',
      telegram: '@Tommaso_Galli',
      minorenne: true,
    })
    expect(esito.email).toBe('tommaso.galli@example.test')
    expect(esito.instagram_handle).toBe('@tommaso.galli')
    expect(esito.telegram).toBe('tommaso_galli')
    expect(esito.minorenne).toBe(true)
  })

  it('email, telefono e handle sbagliati si dicono', () => {
    const messaggio = (campi: Record<string, string>) => {
      const esito = clienteOnboardingSchema.safeParse({ nome: 'Tommaso', ...campi })
      return esito.success ? null : esito.error.issues[0].message
    }
    expect(messaggio({ email: 'tommaso@' })).toBe(ERRORI_ONBOARDING.email)
    expect(messaggio({ telefono: 'abc' })).toBe(ERRORI_ONBOARDING.telefono)
    expect(messaggio({ instagram_handle: 'tommaso galli!' })).toBe(ERRORI_ONBOARDING.handle)
  })
})

describe('la schermata «Team»', () => {
  it('il responsabile è obbligatorio, coach e revisore possono mancare', () => {
    expect(teamOnboardingSchema.parse({ coach: '', revisore: null, responsabile: DANY })).toEqual({
      coach: null,
      revisore: null,
      responsabile: DANY,
    })
    expect(teamOnboardingSchema.parse({ responsabile: DANY })).toEqual({ coach: null, revisore: null, responsabile: DANY })
    for (const responsabile of ['', null, undefined, 'dany']) {
      const esito = teamOnboardingSchema.safeParse({ coach: COACH, responsabile })
      expect(esito.success, String(responsabile)).toBe(false)
      if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.responsabile)
    }
  })

  it('una persona che non è un id si rifiuta', () => {
    const esito = teamOnboardingSchema.safeParse({ coach: 'marco', responsabile: DANY })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.persona)
  })
})

describe('il wizard intero: le tre schermate insieme', () => {
  it('la vendita passa da nuovaVenditaSchema, sempre «nuovo», con il cliente della prima schermata', () => {
    const esito = validaNuovoCliente({ cliente: { ...cliente, email: 'T.Galli@example.test' }, vendita, team })
    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.dati.vendita.tipo).toBe('nuovo')
    expect(esito.dati.vendita.nome).toBe('Tommaso')
    expect(esito.dati.vendita.cognome).toBe('Galli')
    expect(esito.dati.vendita.email).toBe('t.galli@example.test')
    expect(esito.dati.vendita.valore_contratto).toBe(1500)
    expect(esito.dati.vendita.numero_rate).toBe(3)
    expect(esito.dati.team).toEqual({ coach: COACH, revisore: null, responsabile: DANY })
    expect(esito.dati.cliente.minorenne).toBe(false)
  })

  it('un tipo diverso scritto dal browser non passa: resta «nuovo»', () => {
    const esito = validaNuovoCliente({ cliente, vendita: { ...vendita, tipo: 'rinnovo', nome: 'Un altro' }, team })
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.dati.vendita.tipo).toBe('nuovo')
      expect(esito.dati.vendita.nome).toBe('Tommaso')
    }
    expect(venditaDelWizard({ ...clienteOnboardingSchema.parse(cliente) }, { tipo: 'upsell' })).toMatchObject({ tipo: 'nuovo' })
  })

  it('dice ogni campo da sistemare, schermata per schermata, in una volta', () => {
    const esito = validaNuovoCliente({
      cliente: { nome: '', email: 'no' },
      vendita: { ...vendita, valore_contratto: '' },
      team: { coach: COACH },
    })
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.campi.cliente).toEqual({ nome: ERRORI_ONBOARDING.nome, email: ERRORI_ONBOARDING.email })
    expect(esito.campi.team).toEqual({ responsabile: ERRORI_ONBOARDING.responsabile })
    expect(esito.campi.vendita).toEqual({ valore_contratto: 'Scrivi il valore del contratto, ad esempio 1.500' })
  })

  it('con la prima schermata sbagliata la vendita si controlla lo stesso, e il nome mancante non diventa un suo errore', () => {
    const esito = validaNuovoCliente({
      cliente: { nome: '' },
      vendita: { ...vendita, data_vendita: aggiungiGiorni(OGGI, 1) },
      team,
    })
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.campi.cliente).toEqual({ nome: ERRORI_ONBOARDING.nome })
    expect(esito.campi.team).toBeUndefined()
    expect(esito.campi.vendita).toEqual({ data_vendita: 'La data della vendita non può essere nel futuro' })
  })

  it('le regole di «Nuova vendita» valgono tutte: fuori catalogo, piano a mano, inizio entro tre mesi', () => {
    const fuori = validaNuovoCliente({ cliente, vendita: { ...vendita, product_id: PERSONALIZZATO }, team })
    expect(fuori.ok).toBe(false)
    if (!fuori.ok) {
      expect(fuori.campi.vendita?.prodotto_personalizzato).toBe('Scrivi cosa hai venduto, ad esempio Annuale')
      expect(fuori.campi.vendita?.data_fine).toBe('Indica quando finisce il percorso')
    }
    const piano = validaNuovoCliente({ cliente, vendita: { ...vendita, piano: 'personalizzato', rate: [] }, team })
    expect(piano.ok).toBe(false)
    if (!piano.ok) expect(piano.campi.vendita?.rate).toBe('Aggiungi almeno una rata')
    const lontano = validaNuovoCliente({ cliente, vendita: { ...vendita, data_inizio: aggiungiGiorni(OGGI, 200) }, team })
    expect(lontano.ok).toBe(false)
    if (!lontano.ok) expect(lontano.campi.vendita?.data_inizio).toBe('L’inizio deve cadere entro tre mesi dalla vendita')
  })

  it('un ingresso che non è un oggetto non rompe niente', () => {
    for (const input of [null, undefined, 'x', [], 3]) {
      const esito = validaNuovoCliente(input)
      expect(esito.ok).toBe(false)
      if (!esito.ok) {
        expect(esito.campi.cliente?.nome).toBeTruthy()
        expect(esito.campi.team?.responsabile).toBe(ERRORI_ONBOARDING.responsabile)
        expect(esito.campi.vendita).toBeTruthy()
      }
    }
  })
})

describe('«Avvia onboarding» su una vendita che c’è già', () => {
  it('la vendita, il cliente e il team', () => {
    const esito = avviaOnboardingSchema.parse({ sale_id: VENDITA, cliente: { ...cliente, telegram: '@tommaso_galli' }, team })
    expect(esito.sale_id).toBe(VENDITA)
    expect(esito.cliente.telegram).toBe('tommaso_galli')
    expect(esito.team.responsabile).toBe(DANY)
  })

  it('senza la vendita non parte', () => {
    const esito = avviaOnboardingSchema.safeParse({ sale_id: 'x', cliente, team })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.vendita)
  })
})

describe('le azioni sul link', () => {
  it('conferma, riattiva e rigenera vogliono solo il link', () => {
    expect(invitoSchema.parse({ invito_id: INVITO })).toEqual({ invito_id: INVITO })
    const esito = invitoSchema.safeParse({ invito_id: '' })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.invito)
  })

  it('il consenso del genitore ha una nota facoltativa, al massimo 300 caratteri', () => {
    expect(consensoGenitoreSchema.parse({ invito_id: INVITO, nota: '  ' })).toEqual({ invito_id: INVITO, nota: null })
    expect(consensoGenitoreSchema.parse({ invito_id: INVITO })).toEqual({ invito_id: INVITO, nota: null })
    expect(consensoGenitoreSchema.parse({ invito_id: INVITO, nota: ' Il padre, al telefono ' }).nota).toBe('Il padre, al telefono')
    expect(consensoGenitoreSchema.safeParse({ invito_id: INVITO, nota: 'a'.repeat(300) }).success).toBe(true)
    const lunga = consensoGenitoreSchema.safeParse({ invito_id: INVITO, nota: 'a'.repeat(301) })
    expect(lunga.success).toBe(false)
    if (!lunga.success) expect(lunga.error.issues[0].message).toBe(ERRORI_ONBOARDING.nota)
  })

  it('la revoca dice sempre perché', () => {
    expect(revocaSchema.parse({ invito_id: INVITO, motivo: ' Ha cambiato idea ' }).motivo).toBe('Ha cambiato idea')
    for (const motivo of ['', '   ', null, undefined]) {
      const esito = revocaSchema.safeParse({ invito_id: INVITO, motivo })
      expect(esito.success, String(motivo)).toBe(false)
      if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.motivo)
    }
    const lungo = revocaSchema.safeParse({ invito_id: INVITO, motivo: 'a'.repeat(301) })
    expect(lungo.success).toBe(false)
    if (!lungo.success) expect(lungo.error.issues[0].message).toBe(ERRORI_ONBOARDING.motivoLungo)
  })
})

describe('incarichi, Telegram e impostazioni', () => {
  it('gli incarichi di un cliente: il cliente e le tre persone', () => {
    expect(incarichiSchema.parse({ client_id: CLIENTE, ...team })).toEqual({
      client_id: CLIENTE,
      coach: COACH,
      revisore: null,
      responsabile: DANY,
    })
    expect(incarichiSchema.safeParse({ client_id: 'x', ...team }).success).toBe(false)
  })

  it('Telegram del cliente: lo username e il gruppo si svuotano con un campo vuoto', () => {
    expect(telegramClienteSchema.parse({ client_id: CLIENTE, username: '', gruppo_privato_url: '' })).toEqual({
      client_id: CLIENTE,
      username: null,
      gruppo_privato_url: null,
    })
    expect(telegramClienteSchema.parse({ client_id: CLIENTE, username: '@Tommaso_Galli', gruppo_privato_url: 't.me/+abc' })).toEqual({
      client_id: CLIENTE,
      username: 'tommaso_galli',
      gruppo_privato_url: 'https://t.me/+abc',
    })
  })

  it('le impostazioni: i giorni del link da 1 a 90, interi', () => {
    const base = { coach_predefinito_id: COACH, revisore_predefinito_id: '', responsabile_predefinito_id: DANY, link_community: '' }
    expect(impostazioniOnboardingSchema.parse({ ...base, giorni_validita_link: '14' })).toEqual({
      coach_predefinito_id: COACH,
      revisore_predefinito_id: null,
      responsabile_predefinito_id: DANY,
      link_community: null,
      link_prenotazione: null,
      avvisa_cliente_email: true,
      giorni_validita_link: 14,
    })
    for (const giorni of [0, 91, 1.5, 'tanti', '']) {
      const esito = impostazioniOnboardingSchema.safeParse({ ...base, giorni_validita_link: giorni })
      expect(esito.success, String(giorni)).toBe(false)
      if (!esito.success) expect(esito.error.issues[0].message).toBe(ERRORI_ONBOARDING.giorni)
    }
    expect(impostazioniOnboardingSchema.safeParse({ ...base, giorni_validita_link: 1 }).success).toBe(true)
    expect(impostazioniOnboardingSchema.safeParse({ ...base, giorni_validita_link: 90 }).success).toBe(true)
  })

  it('aperto_ai_clienti non si scrive da qui: lo schema non lo conosce', () => {
    const esito = impostazioniOnboardingSchema.parse({ giorni_validita_link: 14, aperto_ai_clienti: true })
    expect(esito).not.toHaveProperty('aperto_ai_clienti')
  })
})
