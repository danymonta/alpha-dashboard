import { deflateSync, crc32 } from 'node:zlib'

import { expect, test, type Browser, type Page } from '@playwright/test'

import { DOMANDE, INTRO_QUESTIONARIO, type Domanda } from '../lib/percorso/questionario'
import { ID_ADMIN, dbLocale } from './db'
import { attivaDiProva, creaOnboardingDiProva, emailDiProva, pulisciClientiPercorso, registraCliente } from './percorso-db'
import { PASSWORD_SEED, accedi, attendiStreaming } from './utenti'

/*
 * The questionnaire of the client's area (release B1b): the questions and the options of Dany's
 * Google form, the save by itself and the resumption from another device, a photo uploaded to the
 * local Storage and confirmed on its first bytes (and a page dressed as a photo refused), the
 * missing answers at the sending, the sending; then the admin reads answers and files and records
 * the revocation of the consent. At 390 px, no sideways scroll. Local database only.
 */
const PREFISSO = 'E2EQuest'
const BUCKET = 'onboarding-allegati'
const clienti: string[] = []

test.afterAll(async () => {
  const db = dbLocale()
  for (const id of clienti) {
    const { data } = await db.storage.from(BUCKET).list(id)
    if (data && data.length > 0) await db.storage.from(BUCKET).remove(data.map((o) => `${id}/${o.name}`))
  }
  await pulisciClientiPercorso(PREFISSO)
})

/** A valid PNG of 4x4 pixels, made here: the browser decodes it and sends it on as JPEG. */
function png(): Buffer {
  const pezzo = (tipo: string, dati: Buffer) => {
    const lunghezza = Buffer.alloc(4)
    lunghezza.writeUInt32BE(dati.length)
    const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dati])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([lunghezza, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(4, 0)
  ihdr.writeUInt32BE(4, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const righe = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array(12).fill(200)])))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', ihdr),
    pezzo('IDAT', deflateSync(righe)),
    pezzo('IEND', Buffer.alloc(0)),
  ])
}

/** An invented client with the welcome and the rules done and the consent given: the questionnaire is open. */
async function clientePronto(nome: string, email: string) {
  const { clientId } = await creaOnboardingDiProva(nome, email)
  clienti.push(clientId)
  await attivaDiProva(clientId)
  await registraCliente(clientId, email)
  const db = dbLocale()
  const { data: testo } = await db.from('clienti_consensi_testi').select('versione').eq('tipo', 'salute').eq('in_vigore', true).single()
  await db.from('clienti_consensi').insert({ client_id: clientId, tipo: 'salute', versione: testo!.versione })
  await db.from('onboarding_passi').update({ stato: 'fatto', completato_il: new Date().toISOString() }).eq('client_id', clientId).in('passo', ['benvenuto', 'regole'])
  const { error } = await db.rpc('onboarding_sblocca', { p_client_id: clientId })
  if (error) throw error
  return clientId
}

async function entraCome(page: Page, email: string) {
  attendiStreaming(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await expect(page).toHaveURL(/\/percorso$/, { timeout: 30_000 })
}

async function contestoCliente(browser: Browser, email: string, larghezza = 390) {
  const contesto = await browser.newContext({ viewport: { width: larghezza, height: 844 }, reducedMotion: 'reduce' })
  const page = await contesto.newPage()
  await entraCome(page, email)
  return { contesto, page }
}

async function aspettaSalvato(page: Page) {
  await expect(page.getByTestId('stato-salvataggio')).toHaveAttribute('data-stato', 'salvato', { timeout: 15_000 })
  await expect(page.getByTestId('stato-salvataggio')).toContainText(/Salvato alle \d{2}:\d{2}/)
}

const N = DOMANDE.length

/** What a client writes for every question of the form (the email and the name come from the card). */
const RISPOSTE: Record<string, string> = {
  telefono: '+39 333 000 0099',
  obiettivo_principale: 'La prima trazione',
  occupazione: 'Studente',
  storia_allenamento: 'Calcio da ragazzo',
  importanza_tecnica: 'Molto',
  conoscenza_alimentazione: 'Abbastanza',
  ore_sonno: 'Sette',
  organizzazione_giornata: 'Scuola la mattina',
  infortuni: 'Nessuno',
  successo: 'Allenarmi con costanza',
  perche_noi: 'I video',
  obiettivi_3_6_mesi: 'Cinque trazioni',
  attrezzatura: 'Una sbarra',
  esercizi_difficolta: 'Le trazioni',
}
const SCELTE: Record<string, string> = {
  livello_attivita: 'Attivo',
  seguito_alimentazione: 'No',
  giorni_settimana: '3',
  minuti_giorno: '40-60 minuti',
  pronto: 'Sì',
}

const titolo = (page: Page) => page.getByTestId('schermata-questionario').getByRole('heading', { level: 1 })
const campo = (chiave: string) => `#campo-${chiave}`

/** The question on the screen is the one number `i` (from 0): its words, its counter, its options. */
async function siVedeLaDomanda(page: Page, i: number) {
  const d = DOMANDE[i]!
  await expect(page.getByTestId('indicatore')).toHaveText(`${i + 1} di ${N}`)
  await expect(titolo(page)).toContainText(d.testo)
  await expect(page.locator(`[data-domanda="${d.chiave}"]`)).toBeVisible()
  if ('opzioni' in d) {
    for (const o of d.opzioni) await expect(page.locator(`[data-domanda="${d.chiave}"]`).getByText(o.etichetta, { exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('progresso')).toHaveAttribute('aria-valuenow', String(i + 1))
}

/** The answer of a question, then the way out of it (OK or the beat of a single choice). */
async function rispondi(page: Page, d: Domanda) {
  const blocco = page.locator(`[data-domanda="${d.chiave}"]`)
  switch (d.tipo) {
    case 'email':
    case 'data':
      if (d.tipo === 'data') await page.locator(campo(d.chiave)).fill('2009-04-10')
      break
    case 'testo':
      if (RISPOSTE[d.chiave]) await page.locator(campo(d.chiave)).fill(RISPOSTE[d.chiave]!)
      break
    case 'altezza_peso':
      await page.locator(campo(d.chiave)).fill('175')
      await page.locator(`${campo(d.chiave)}-peso`).fill('72,5')
      break
    case 'scelta':
      await blocco.getByText(SCELTE[d.chiave]!, { exact: true }).click()
      return // a single choice goes on by itself
    case 'massimali':
      await page.locator(campo(d.chiave)).fill('12')
      await page.getByRole('button', { name: 'Non lo so: Trazioni' }).click()
      await page.locator(`${campo(d.chiave)}-dip`).fill('4')
      break
    case 'abitudini':
      await blocco.getByText('Dormire meno di 6 ore a notte').click()
      break
  }
  await page.getByTestId('avanti').click()
}

/** React holds the fields: a fill before the hydration would be lost or mixed with the text there. */
async function pronto(page: Page) {
  await expect(page.getByTestId('questionario')).toHaveAttribute('data-pronto', 'true')
}

async function senzaScrollDiLato(page: Page, dove: string) {
  const [larga, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(larga, `${dove} senza scroll di lato`).toBeLessThanOrEqual(finestra!)
}

test('il questionario del modulo: salvataggio, ripresa, file, invio; poi l’admin legge e registra la revoca', async ({ browser }) => {
  test.setTimeout(240_000)
  const nome = `${PREFISSO}Carla${Date.now().toString().slice(-5)}`
  const email = emailDiProva('questionario')
  const clientId = await clientePronto(nome, email)
  const db = dbLocale()

  const { contesto, page } = await contestoCliente(browser, email)

  // the panel of the step opens the questionnaire
  const pannello = page.getByTestId('pannello-passo')
  await expect(pannello).toHaveAttribute('data-vista', 'passo:questionario')
  await expect(pannello).toContainText('Niente foto del fisico qui: quelle vanno su Coach Plus.')
  await pannello.getByRole('link', { name: 'Compila il questionario' }).click()
  await expect(page).toHaveURL(/\/percorso\/questionario/)
  await pronto(page)

  // the introduction of the form, first and only once: «Inizia»
  await expect(titolo(page)).toHaveText(INTRO_QUESTIONARIO.titolo)
  for (const p of INTRO_QUESTIONARIO.paragrafi) await expect(page.getByTestId('intro-questionario')).toContainText(p)
  await expect(page.getByTestId('progresso')).toHaveAttribute('aria-valuenow', '0')
  await senzaScrollDiLato(page, 'introduzione')
  await page.getByTestId('inizia').click()

  // question 1: the email from the card; a required one empty says so and the focus stays
  await siVedeLaDomanda(page, 0)
  await expect(page.locator(campo('email'))).toHaveValue(email)
  await page.getByTestId('avanti').click()
  await siVedeLaDomanda(page, 1)
  await page.getByTestId('avanti').click()
  await expect(page.locator('[data-domanda="telefono"]')).toContainText('Scrivi la tua risposta.')
  await expect(page.locator(campo('telefono'))).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('indicatore')).toHaveText(`2 di ${N}`)
  await expect(page.locator(campo('telefono'))).toBeFocused()
  // Invio goes on, from the keyboard
  await page.locator(campo('telefono')).fill(RISPOSTE.telefono!)
  await expect(page.locator('[data-domanda="telefono"] [data-errore]')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await siVedeLaDomanda(page, 2)
  await expect(page.locator(campo('nome_cognome'))).toHaveValue(`${nome} Incassi`)
  await senzaScrollDiLato(page, 'domanda 3')
  await page.getByTestId('avanti').click()

  // height and weight: the wrong weight says so on leaving the field; Invio goes from one field to the other
  await siVedeLaDomanda(page, 3)
  await page.locator(campo('altezza_peso')).fill('175')
  await page.keyboard.press('Enter')
  await expect(page.locator(`${campo('altezza_peso')}-peso`)).toBeFocused()
  await page.locator(`${campo('altezza_peso')}-peso`).fill('300')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-domanda="altezza_peso"]')).toContainText('Scrivi il peso in kg, da 35 a 250')
  await expect(page.getByTestId('indicatore')).toHaveText(`4 di ${N}`)
  await page.locator(`${campo('altezza_peso')}-peso`).fill('72,5')
  await expect(page.locator('[data-domanda="altezza_peso"] [data-errore]')).toHaveCount(0)
  await page.keyboard.press('Enter')

  // a long answer: Maiusc + Invio is a new line, Invio goes on
  await siVedeLaDomanda(page, 4)
  await page.locator(campo('data_nascita')).fill('2009-04-10')
  await page.keyboard.press('Enter')
  await siVedeLaDomanda(page, 5)
  await page.locator(campo('obiettivo_principale')).fill('La prima')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('trazione')
  await expect(page.locator(campo('obiettivo_principale'))).toHaveValue('La prima\ntrazione')
  await expect(page.getByTestId('indicatore')).toHaveText(`6 di ${N}`)
  await page.keyboard.press('Enter')

  // every other question up to the equipment: its words, its options, the answer, the way on
  for (let i = 6; i < DOMANDE.findIndex((d) => d.chiave === 'attrezzatura'); i++) {
    await siVedeLaDomanda(page, i)
    await senzaScrollDiLato(page, `domanda ${i + 1}`)
    await rispondi(page, DOMANDE[i]!)
  }

  // the equipment, with a photo
  const iAttrezzatura = DOMANDE.findIndex((d) => d.chiave === 'attrezzatura')
  await siVedeLaDomanda(page, iAttrezzatura)
  await page.locator(campo('attrezzatura')).fill(RISPOSTE.attrezzatura!)
  await page.getByTestId('file-attrezzatura').setInputFiles({ name: 'sbarra.png', mimeType: 'image/png', buffer: png() })
  const file = page.locator('[data-allegati="attrezzatura"] [data-allegato]')
  await expect(file).toHaveCount(1, { timeout: 20_000 })
  await expect(file).toContainText('sbarra.jpg')
  await page.getByTestId('avanti').click()
  await siVedeLaDomanda(page, iAttrezzatura + 1)
  await aspettaSalvato(page)

  // the file is in the bucket, confirmed on its first bytes, never public
  const { data: righe } = await db.from('onboarding_allegati').select('id, percorso, stato, tipo').eq('client_id', clientId)
  expect(righe).toHaveLength(1)
  expect(righe![0]).toMatchObject({ stato: 'caricato', tipo: 'image/jpeg', percorso: `${clientId}/${righe![0]!.id}` })
  const { data: oggetti } = await db.storage.from(BUCKET).list(clientId)
  expect(oggetti?.map((o) => o.name)).toEqual([righe![0]!.id])

  // a page dressed as a photo: the server reads its bytes and refuses it, the row goes to delete
  const rifiuto = await page.evaluate(async () => {
    const p = await fetch('/api/percorso/allegati', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campo: 'vecchia_scheda', nome: 'scheda.png', tipo: 'image/png', byte: 40 }),
    })
    const { id, url } = await p.json()
    const dati = new FormData()
    dati.append('', new File(['<!doctype html><script>alert(1)</script>'], 'scheda.png', { type: 'image/png' }))
    await fetch(url, { method: 'PUT', body: dati })
    const c = await fetch(`/api/percorso/allegati/${id}/conferma`, { method: 'POST' })
    return { stato: c.status, corpo: await c.json(), id }
  })
  expect(rifiuto.stato).toBe(422)
  expect(rifiuto.corpo.errore).toBe('File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.')
  const { data: scartato } = await db.from('onboarding_allegati').select('stato').eq('id', rifiuto.id).single()
  expect(scartato?.stato).toBe('da_cancellare')

  // another device: the same answers, from the first question left (the maximums), with the file
  const altro = await contestoCliente(browser, email, 1440)
  await altro.page.goto('/percorso/questionario')
  await pronto(altro.page)
  await expect(altro.page.getByTestId('intro-questionario')).toHaveCount(0)
  await siVedeLaDomanda(altro.page, DOMANDE.findIndex((d) => d.chiave === 'massimali'))
  await altro.page.goto('/percorso/questionario?domanda=infortuni')
  await pronto(altro.page)
  await expect(altro.page.locator(campo('infortuni'))).toHaveValue('Nessuno')
  await altro.page.goto('/percorso/questionario?domanda=attrezzatura')
  await pronto(altro.page)
  await expect(altro.page.locator('[data-allegati="attrezzatura"] [data-allegato]')).toHaveCount(1)
  // it saves too: the first device is now one version behind
  await altro.page.goto('/percorso/questionario?domanda=infortuni')
  await pronto(altro.page)
  await altro.page.locator(campo('infortuni')).fill('Nessuno, ma una spalla')
  await aspettaSalvato(altro.page)
  await altro.contesto.close()

  // the first device writes over an older version: it reloads the answers of the other one
  await page.locator(campo('massimali')).fill('9')
  await expect(page.getByText('Il questionario è cambiato da un altro dispositivo: ricarico le tue risposte.')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(campo('massimali'))).toHaveValue('')
  await page.goto('/percorso/questionario?domanda=infortuni')
  await pronto(page)
  await expect(page.locator(campo('infortuni'))).toHaveValue('Nessuno, ma una spalla')
  await page.goto('/percorso/questionario?domanda=massimali')
  await pronto(page)

  // the last questions, then the recap with nothing missing and the sending
  for (let i = DOMANDE.findIndex((d) => d.chiave === 'massimali'); i < N; i++) {
    await siVedeLaDomanda(page, i)
    if (DOMANDE[i]!.chiave === 'note') {
      await expect(titolo(page)).toContainText('(facoltativa)')
      await page.getByTestId('avanti').click() // optional: it goes on empty
      continue
    }
    await rispondi(page, DOMANDE[i]!)
  }
  await expect(page.getByTestId('recap-questionario')).toBeVisible()
  await expect(titolo(page)).toHaveText('Hai risposto a tutto')
  await expect(page.getByTestId('progresso')).toHaveAttribute('aria-valuenow', String(N))
  await senzaScrollDiLato(page, 'recap')
  await page.getByTestId('invia-questionario').click()
  await expect(page.getByText('Questionario inviato').first()).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/percorso$/)
  // release B2: the booking of the call opens right after the questionnaire
  await expect(page.getByTestId('pannello-passo')).toHaveAttribute('data-vista', 'passo:prenotazione')
  // sent: the page of the questionnaire goes back to the path
  await page.goto('/percorso/questionario')
  await expect(page).toHaveURL(/\/percorso$/)
  await contesto.close()

  // in the database: sent, the step done, the notification to the admin (never an answer in it)
  const { data: q } = await db.from('onboarding_questionari').select('inviato_il, risposte').eq('client_id', clientId).single()
  expect(q?.inviato_il).not.toBeNull()
  expect(q?.risposte).toMatchObject({
    altezza_peso: { altezza: 175, peso: 72.5 },
    data_nascita: '2009-04-10',
    massimali: { piegamenti: 12, trazioni: 'non_lo_so', dip: 4 },
    giorni_settimana: 3,
    minuti_giorno: '40_60',
    cattive_abitudini: { scelte: ['sonno'] },
    infortuni: 'Nessuno, ma una spalla',
  })
  const { data: passo } = await db.from('onboarding_passi').select('stato').eq('client_id', clientId).eq('passo', 'questionario').single()
  expect(passo?.stato).toBe('fatto')
  const { data: notifica } = await db.from('notifiche').select('titolo, anteprima').eq('destinatario_id', ID_ADMIN).like('chiave', `onboarding/${clientId}/questionario/%`).single()
  expect(notifica?.titolo).toBe(`Questionario inviato da ${nome} Incassi`)

  // the admin reads answers and files, opens a file through a signed address, records the revocation
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pa = await admin.newPage()
  await accedi(pa, 'admin')
  await pa.goto(`/onboarding/${clientId}`)
  const riquadro = pa.getByTestId('riquadro-questionario')
  await expect(riquadro.getByTestId('questionario-stato')).toContainText('Inviato il')
  await expect(riquadro.locator('[data-risposta="altezza_peso"]')).toContainText('175 cm · 72,5 kg')
  await expect(riquadro.locator('[data-risposta="massimali"]')).toContainText('Trazioni: non lo so')
  const link = riquadro.locator('[data-allegato-admin]')
  await expect(link).toHaveCount(1)
  const href = await link.getAttribute('href')
  const apertura = await pa.request.get(href!, { maxRedirects: 0 })
  expect(apertura.status()).toBe(302)
  expect(apertura.headers()['location']).toMatch(/\/storage\/v1\/object\/sign\/onboarding-allegati\//)
  expect(apertura.headers()['cache-control']).toContain('no-store')

  await pa.getByTestId('revoca-consenso').click()
  await pa.getByTestId('revoca-consenso-si').click()
  await expect(pa.getByText('Scegli come il cliente ha chiesto la revoca.')).toBeVisible()
  await pa.getByRole('radio', { name: 'Su Telegram' }).check()
  await pa.getByTestId('revoca-consenso-si').click()
  await expect(pa.getByTestId('revoca-consenso-seconda')).toBeVisible()
  await pa.getByTestId('revoca-consenso-si').click()
  await expect(pa.getByText('Revoca registrata: risposte e file cancellati')).toBeVisible()
  await expect(pa.locator('[data-evento="consenso_revocato"]')).toContainText('Su Telegram')
  await admin.close()

  const { count: risposte } = await db.from('onboarding_questionari').select('client_id', { count: 'exact', head: true }).eq('client_id', clientId)
  expect(risposte).toBe(0)
  const { data: fileDopo } = await db.from('onboarding_allegati').select('stato').eq('client_id', clientId)
  expect(new Set(fileDopo?.map((f) => f.stato))).toEqual(new Set(['da_cancellare']))
  const { data: oggettiDopo } = await db.storage.from(BUCKET).list(clientId)
  expect(oggettiDopo ?? []).toEqual([])
  const { data: regole } = await db.from('onboarding_passi').select('stato').eq('client_id', clientId).eq('passo', 'regole').single()
  expect(regole?.stato).toBe('disponibile')
})

test('la ripresa e il riepilogo: si riparte dalla prima risposta che manca, il vecchio ?schermata= vale ancora', async ({ browser }) => {
  test.setTimeout(180_000)
  const nome = `${PREFISSO}Dario${Date.now().toString().slice(-5)}`
  const email = emailDiProva('questionario-ripresa')
  const clientId = await clientePronto(nome, email)
  const db = dbLocale()
  // everything answered but two questions
  const risposte = {
    ...RISPOSTE,
    email,
    nome_cognome: 'Dario Prova',
    altezza_peso: { altezza: 180, peso: 80 },
    data_nascita: '1990-05-05',
    livello_attivita: 'attivo',
    seguito_alimentazione: 'no',
    giorni_settimana: 3,
    minuti_giorno: '40_60',
    massimali: { piegamenti: 10, trazioni: 3, dip: 5 },
    cattive_abitudini: { scelte: ['sonno'], altro: '' },
  } as Record<string, unknown>
  delete risposte.ore_sonno
  const { error } = await db.from('onboarding_questionari').insert({ client_id: clientId, risposte: risposte as never, versione: 1, schermata: 3 })
  if (error) throw error

  const { contesto, page } = await contestoCliente(browser, email)
  await page.goto('/percorso/questionario')
  await pronto(page)
  // no introduction (it was started): the first question left open
  await expect(page.getByTestId('intro-questionario')).toHaveCount(0)
  await siVedeLaDomanda(page, DOMANDE.findIndex((d) => d.chiave === 'ore_sonno'))

  // the old address of a part opens its first question
  await page.goto('/percorso/questionario?schermata=3')
  await pronto(page)
  await siVedeLaDomanda(page, DOMANDE.findIndex((d) => d.schermata === 3))

  // the recap: «pronto» is also missing; a tap goes to the question, and OK comes back to the recap
  await page.goto('/percorso/questionario?domanda=fine')
  await pronto(page)
  await expect(titolo(page)).toHaveText('Ti mancano 2 risposte')
  await expect(page.getByTestId('invia-questionario')).toHaveCount(0)
  await page.getByTestId('mancante-pronto').click()
  await siVedeLaDomanda(page, DOMANDE.findIndex((d) => d.chiave === 'pronto'))
  await page.locator('[data-domanda="pronto"]').getByText('Sì', { exact: true }).click()
  await expect(titolo(page)).toHaveText('Ti manca una risposta')
  await page.getByTestId('vai-prima-mancante').click()
  await siVedeLaDomanda(page, DOMANDE.findIndex((d) => d.chiave === 'ore_sonno'))
  await page.keyboard.press('Enter') // required and empty
  await expect(page.locator('[data-domanda="ore_sonno"]')).toContainText('Scrivi la tua risposta.')
  await page.locator(campo('ore_sonno')).fill('Sette')
  await page.keyboard.press('Enter')
  await expect(titolo(page)).toHaveText('Hai risposto a tutto')
  await aspettaSalvato(page)
  const { data } = await db.from('onboarding_questionari').select('risposte, inviato_il').eq('client_id', clientId).single()
  expect(data?.inviato_il).toBeNull()
  expect(data?.risposte).toMatchObject({ ore_sonno: 'Sette', pronto: 'si' })

  // the browser's Back goes to the question before
  await page.goBack()
  await expect(page.getByTestId('recap-questionario')).toHaveCount(0)
  await contesto.close()
})
