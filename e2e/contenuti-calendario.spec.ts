import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma, primoDelMeseISO } from '../lib/date'
import { formatData } from '../lib/format'
import { creaContenutoDiProva, dbLocale, leggiContenuto, pulisciContenuti } from './db'
import { accedi } from './utenti'

/**
 * The calendar view of the Piano editoriale (1.69.0, Dany, 31/10/2026: «la parte
 * di visualizzazione a calendario per i reel… come su notion»; «devo avere tutta
 * la panoramica chiara»). Rows of these tests start with PREFISSO and go away at
 * the end; the seed's contents stay as they are. The days are in the current
 * month, so they are in the grid that opens by default.
 */
const PREFISSO = 'E2E Calendario '

const mese = primoDelMeseISO(oggiRoma())
const giorno = (gg: number) => `${mese.slice(0, 8)}${String(gg).padStart(2, '0')}`

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
})

test.afterAll(async () => {
  await pulisciContenuti(PREFISSO)
})

function escape(testo: string) {
  return testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

function sezioneContenuti(page: Page) {
  return page.getByRole('region', { name: 'Piano editoriale', exact: true })
}

function cella(page: Page, data: string) {
  return sezioneContenuti(page).locator(`td[data-giorno="${data}"]`)
}

async function senzaScrollLaterale(page: Page) {
  const [pagina, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(pagina, 'scroll orizzontale della pagina').toBeLessThanOrEqual(finestra)
}

test.describe('dal computer', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('la vista resta su questo dispositivo; filtri e scheda restano cambiando vista', async ({ page }) => {
    await accedi(page, 'marketing')
    await page.goto('/marketing/contenuti?stato=posted')
    const vista = page.getByRole('group', { name: 'Vista del Piano editoriale' })
    await expect(vista.getByRole('link', { name: 'Tabella' })).toHaveAttribute('aria-current', 'page')

    await vista.getByRole('link', { name: 'Calendario' }).click()
    await expect(page).toHaveURL(/vista=calendario/)
    await expect(page).toHaveURL(/stato=posted/)
    await expect(sezioneContenuti(page).getByRole('table').first()).toBeVisible()

    // without ?vista the cookie decides: the calendar again
    await page.goto('/marketing/contenuti')
    await expect(vista.getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page')
    // the YouTube tab keeps the view
    await page.getByRole('link', { name: 'YouTube', exact: true }).click()
    await expect(page).toHaveURL(/canale=youtube/)
    await expect(vista.getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page')

    await vista.getByRole('link', { name: 'Tabella' }).click()
    await expect(vista.getByRole('link', { name: 'Tabella' })).toHaveAttribute('aria-current', 'page')
    await page.goto('/marketing/contenuti')
    await expect(vista.getByRole('link', { name: 'Tabella' })).toHaveAttribute('aria-current', 'page')
  })

  test('ogni contenuto nel suo giorno con lo Status come etichetta; la legenda conta e filtra', async ({ page }) => {
    const nome = `${PREFISSO}nel giorno`
    await creaContenutoDiProva(nome, { post_date: giorno(10), stato: 'to_be_edited', reel_type: 'education' })
    await creaContenutoDiProva(`${PREFISSO}senza data`)

    await accedi(page, 'marketing')
    await page.goto('/marketing/contenuti?vista=calendario')
    const scheda = cella(page, giorno(10)).getByRole('link', { name: new RegExp(`^${escape(nome)}, To be edited, Education`) })
    await expect(scheda).toBeVisible()
    // the Status reads in words next to its colour, never the colour alone
    await expect(scheda.locator('.pillola[data-colore="purple"]')).toHaveText('To be edited')
    await senzaScrollLaterale(page)

    // the contents without a Post Date at the bottom
    await expect(page.getByRole('heading', { name: /^Senza data/ })).toBeVisible()
    await expect(sezioneContenuti(page).locator(`li[data-nome-contenuto="${PREFISSO}senza data"]:visible`)).toBeVisible()

    // the legend: every Status with its number this month; one tap filters, the second removes the filter
    const legenda = page.getByRole('region', { name: 'Status del mese' })
    const voce = legenda.getByRole('link', { name: /^To be edited, \d+ contenut/ })
    await expect(voce).toBeVisible()
    await voce.click()
    await expect(page).toHaveURL(/stato=to_be_edited/)
    await expect(page).toHaveURL(/vista=calendario/)
    await expect(scheda).toBeVisible()
    await legenda.getByRole('link', { name: /^To be edited, .*filtro attivo/ }).click()
    await expect(page).not.toHaveURL(/stato=/)

    // the panel opens from the card, as from the table
    await scheda.click()
    await expect(page.getByRole('dialog', { name: nome, exact: true })).toBeVisible()
    await expect(page).toHaveURL(/contenuto=/)
  })

  test('il «+» di un giorno crea un contenuto in quel giorno e lo apre nel pannello', async ({ page }) => {
    await accedi(page, 'marketing')
    await page.goto('/marketing/contenuti?vista=calendario')
    const piu = cella(page, giorno(12)).getByRole('button', { name: /^Nuovo contenuto per / })
    await cella(page, giorno(12)).hover()
    await piu.click()
    await expect(page.getByRole('dialog', { name: 'Senza titolo', exact: true })).toBeVisible()
    const id = new URL(page.url()).searchParams.get('contenuto')
    expect(id).toBeTruthy()
    const salvato = await leggiContenuto(id!)
    expect(salvato?.post_date).toBe(giorno(12))
    expect(salvato?.tipo).toBe('reel')
    // renamed so the cleanup finds it
    await dbLocale().from('marketing_contenuti').update({ nome: `${PREFISSO}dal più` }).eq('id', id!)
  })

  test('trascinato su un altro giorno cambia la Post Date', async ({ page }) => {
    const nome = `${PREFISSO}da spostare`
    const id = await creaContenutoDiProva(nome, { post_date: giorno(14) })
    await accedi(page, 'marketing')
    await page.goto('/marketing/contenuti?vista=calendario')
    const scheda = cella(page, giorno(14)).locator(`li[data-nome-contenuto="${nome}"]`)
    await expect(scheda).toBeVisible()
    await scheda.dragTo(cella(page, giorno(16)))
    await expect(toast(page, `Post Date: ${formatData(giorno(16))}`)).toBeVisible()
    await expect(cella(page, giorno(16)).locator(`li[data-nome-contenuto="${nome}"]`)).toBeVisible()
    await expect(cella(page, giorno(14)).locator(`li[data-nome-contenuto="${nome}"]`)).toHaveCount(0)
    expect((await leggiContenuto(id))?.post_date).toBe(giorno(16))
  })

  test('un mese vuoto lo dice, con l’azione', async ({ page }) => {
    await accedi(page, 'marketing')
    // three years ahead: nothing planned there
    const lontano = aggiungiGiorni(oggiRoma(), 365 * 3).slice(0, 7)
    await page.goto(`/marketing/contenuti?vista=calendario&mese=${lontano}`)
    await expect(page.getByText(/^Niente in calendario a /)).toBeVisible()
    await expect(sezioneContenuti(page).getByRole('button', { name: 'Nuovo contenuto', exact: true })).toBeVisible()
  })
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('il mini mese: un pallino per contenuto col colore del suo Status, poi l’agenda', async ({ page }) => {
    const nome = `${PREFISSO}sul telefono`
    await creaContenutoDiProva(nome, { post_date: giorno(18), stato: 'posted' })
    await accedi(page, 'marketing')
    await page.goto('/marketing/contenuti?vista=calendario')
    const giornoMini = sezioneContenuti(page).getByRole('link', { name: /contenut.*: .*Posted/ }).filter({
      has: page.locator('.pillola-punto[data-colore="green"]'),
    })
    await expect(giornoMini.first()).toBeVisible()
    await expect(sezioneContenuti(page).locator(`li[data-nome-contenuto="${nome}"]:visible`)).toBeVisible()
    await senzaScrollLaterale(page)
  })
})
