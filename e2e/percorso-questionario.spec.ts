import { deflateSync, crc32 } from 'node:zlib'

import { expect, test, type Browser, type Page } from '@playwright/test'

import { DOMANDE, SCHERMATE } from '../lib/percorso/questionario'
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
  await expect(page.getByTestId('indicatore')).toHaveText('1 di 4')

  // the questions of the form, screen by screen, with their words
  for (const s of SCHERMATE) {
    await page.goto(`/percorso/questionario?schermata=${s.numero}`)
    await expect(page.getByRole('heading', { level: 2, name: s.titolo })).toBeVisible()
    const chiavi = await page.locator('[data-domanda]').evaluateAll((el) => el.map((e) => e.getAttribute('data-domanda')))
    expect(chiavi).toEqual(DOMANDE.filter((d) => d.schermata === s.numero).map((d) => d.chiave))
    for (const d of DOMANDE.filter((x) => x.schermata === s.numero)) {
      await expect(page.locator(`[data-domanda="${d.chiave}"]`)).toContainText(d.testo)
      if ('opzioni' in d) {
        for (const o of d.opzioni) await expect(page.locator(`[data-domanda="${d.chiave}"]`).getByText(o.etichetta, { exact: true })).toBeVisible()
      }
    }
    await senzaScrollDiLato(page, `schermata ${s.numero}`)
  }

  // screen 1: name and email already written from the card
  await page.goto('/percorso/questionario?schermata=1')
  await pronto(page)
  await expect(page.getByLabel('Nome e Cognome')).toHaveValue(`${nome} Incassi`)
  await expect(page.getByLabel('Indirizzo email')).toHaveValue(email)
  await page.getByLabel(/Numero di telefono/).fill('+39 333 000 0099')
  await page.getByLabel('Altezza', { exact: true }).fill('175')
  await page.getByLabel('Peso', { exact: true }).fill('300')
  await page.getByLabel('Peso', { exact: true }).blur()
  await expect(page.locator('[data-domanda="altezza_peso"]')).toContainText('Scrivi il peso in kg, da 35 a 250')
  await page.getByLabel('Peso', { exact: true }).fill('72,5')
  await expect(page.locator('[data-domanda="altezza_peso"] [data-errore]')).toHaveCount(0)
  await page.getByLabel('Data di nascita').fill('2009-04-10')
  await page.getByLabel(/Occupazione/).fill('Studente')
  await aspettaSalvato(page)

  // screen 2, with a photo of the equipment
  await page.getByTestId('avanti').click()
  await expect(page.getByTestId('indicatore')).toHaveText('2 di 4')
  await expect(page.getByRole('heading', { level: 2, name: 'Allenamento' })).toBeFocused()
  await page.getByLabel(/Da quanto tempo/).fill('Calcio da ragazzo')
  await page.locator('[data-domanda="giorni_settimana"]').getByText('3', { exact: true }).click()
  await page.locator('[data-domanda="minuti_giorno"]').getByText('40-60 minuti').click()
  await page.getByLabel(/Hai infortuni/).fill('Nessuno')
  await page.getByLabel(/Di quale attrezzatura/).fill('Una sbarra')
  await page.getByLabel('Piegamenti', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Non lo so: Trazioni' }).click()
  await page.getByLabel('Dip', { exact: true }).fill('4')
  await page.getByLabel(/Esercizi su cui/).fill('Le trazioni')
  await page.getByLabel(/Quanto reputi/).fill('Molto')
  await page.getByTestId('file-attrezzatura').setInputFiles({ name: 'sbarra.png', mimeType: 'image/png', buffer: png() })
  const file = page.locator('[data-allegati="attrezzatura"] [data-allegato]')
  await expect(file).toHaveCount(1, { timeout: 20_000 })
  await expect(file).toContainText('sbarra.jpg')
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

  // another device: the same answers, from the screen where the client was
  const altro = await contestoCliente(browser, email, 1440)
  await altro.page.goto('/percorso/questionario')
  await pronto(altro.page)
  await expect(altro.page.getByTestId('indicatore')).toHaveText('2 di 4')
  await expect(altro.page.getByLabel(/Da quanto tempo/)).toHaveValue('Calcio da ragazzo')
  await expect(altro.page.locator('[data-allegati="attrezzatura"] [data-allegato]')).toHaveCount(1)
  // it saves too: the first device is now one version behind
  await altro.page.getByLabel(/Quanto reputi/).fill('Moltissimo')
  await aspettaSalvato(altro.page)
  await altro.contesto.close()

  // the first device writes over an older version: it reloads the answers of the other one
  await page.getByLabel(/Esercizi su cui/).fill('Le trazioni e i dip')
  await expect(page.getByText('Il questionario è cambiato da un altro dispositivo: ricarico le tue risposte.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel(/Quanto reputi/)).toHaveValue('Moltissimo')

  // the last screen with the third empty: the sending goes to the first missing answer
  await page.goto('/percorso/questionario?schermata=4')
  await pronto(page)
  await page.getByLabel(/Il tuo obiettivo/).fill('La prima trazione')
  await page.getByLabel(/Cosa ti ha spinto/).fill('I video')
  await page.getByLabel(/Cosa ti piacerebbe/).fill('Cinque trazioni')
  await page.getByLabel(/Cosa vorrebbe dire/).fill('Allenarmi con costanza')
  await page.locator('[data-domanda="pronto"]').getByText('Sì', { exact: true }).click()
  await page.getByTestId('invia-questionario').click()
  await expect(page.getByTestId('indicatore')).toHaveText('3 di 4')
  await expect(page.getByText('Qui mancano 5 risposte.')).toBeVisible()
  await expect(page.getByLabel(/Quante ore dormi/)).toBeFocused()
  await expect(page.locator('[data-domanda="ore_sonno"]')).toContainText('Scrivi la tua risposta.')
  await expect(page.getByLabel(/Quante ore dormi/)).toHaveAttribute('aria-invalid', 'true')
  await senzaScrollDiLato(page, 'schermata con gli errori')

  await page.getByLabel(/Quante ore dormi/).fill('Sette')
  await expect(page.locator('[data-domanda="ore_sonno"] [data-errore]')).toHaveCount(0)
  await page.locator('[data-domanda="livello_attivita"]').getByText('Attivo', { exact: true }).click()
  await page.getByLabel(/Organizzi la tua giornata/).fill('Scuola la mattina')
  await page.locator('[data-domanda="seguito_alimentazione"]').getByText('No', { exact: true }).click()
  await page.getByLabel(/Hai idea/).fill('Abbastanza')
  await page.locator('[data-domanda="cattive_abitudini"]').getByText('Dormire meno di 6 ore a notte').click()
  await page.getByTestId('avanti').click()
  await page.getByTestId('invia-questionario').click()
  await expect(page.getByText('Questionario inviato').first()).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/percorso$/)
  await expect(page.getByTestId('pannello-passo')).toHaveAttribute('data-vista', 'attesa')
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
