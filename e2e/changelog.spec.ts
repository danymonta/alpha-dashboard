import { expect, test, type Page } from '@playwright/test'

import { VERSIONI, type Pubblico, type Voce } from '../lib/changelog/versioni'
import { versioniPer } from '../lib/changelog/visibili'
import { formatData } from '../lib/format'
import { accedi, type RuoloSeed } from './utenti'

const CORRENTE = VERSIONI[0]
const TUTTE: Voce[] = VERSIONI.flatMap((v) => [...v.novita, ...(v.correzioni ?? [])])
/** The admin's words of the items the team reads in its own words. */
const PAROLE_DELL_ADMIN: string[] = TUTTE.filter((voce) => voce.testoTeam).map((voce) => voce.testo)

/** Items tagged exactly for these audiences. */
function voci(...per: Pubblico[]): Voce[] {
  return TUTTE.filter((voce) => voce.per.join() === per.join())
}

async function testiLetti(page: Page): Promise<string[]> {
  return page.getByTestId('changelog-voce').allTextContents()
}

/** Nothing the role does not read reaches its browser: not in the page, not in the data sent with it. */
async function maiNellaPagina(page: Page, testi: string[]) {
  const html = await page.content()
  for (const testo of testi) expect(html, testo).not.toContain(testo)
}

test('l’admin apre le novità da Impostazioni e le vede tutte, con per chi è ogni voce', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/settings')

  const voce = page.getByTestId('voce-changelog')
  await expect(voce).toContainText('Novità')
  await expect(voce).toContainText(`Versione ${CORRENTE.versione}`)
  await voce.click()

  await expect(page).toHaveURL(/\/changelog$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Novità' })).toBeVisible()
  // the sidebar says where he is: Novità, not Impostazioni
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(nav.getByRole('link', { name: 'Novità' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Impostazioni' })).not.toHaveAttribute('aria-current', 'page')

  const inUso = page.getByTestId('versione-corrente')
  await expect(inUso).toContainText(`v${CORRENTE.versione}`)
  await expect(inUso).toContainText(formatData(CORRENTE.data))
  await expect(inUso).toContainText(CORRENTE.titolo)

  // every version, newest first
  const schede = page.getByTestId('versione')
  await expect(schede).toHaveCount(VERSIONI.length)
  await expect(schede.first()).toContainText(`v${CORRENTE.versione} · ${formatData(CORRENTE.data)}`)
  await expect(schede.first().getByRole('heading', { level: 2 })).toHaveText(CORRENTE.titolo)

  // every item, and who reads it
  expect(await page.getByTestId('changelog-voce').count()).toBe(TUTTE.length)
  const soloAdmin = voci('admin')[0]
  await expect(page.getByTestId('changelog-voce').filter({ hasText: soloAdmin.testo })).toContainText('Solo admin')
  const condivisa = CORRENTE.novita.find((v) => v.per.join() === 'tutti')!
  await expect(page.getByTestId('changelog-voce').filter({ hasText: condivisa.testo })).toContainText('Tutto il team')

  // the oldest version reads closed: title and counts, the lists open with a tap
  const primaVersione = VERSIONI.at(-1)!
  const ultima = schede.last()
  await expect(ultima).toContainText(`v${primaVersione.versione}`)
  await expect(ultima.getByText(primaVersione.novita[0].testo)).toBeHidden()
  await ultima.getByRole('heading', { name: primaVersione.titolo }).click()
  await expect(ultima.getByText(primaVersione.novita[0].testo)).toBeVisible()
})

test.describe('dal telefono, ognuno apre le novità da «Altro»', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const ruolo of ['admin', 'setter', 'closer', 'coach'] as RuoloSeed[]) {
    test(ruolo, async ({ page }) => {
      await accedi(page, ruolo)
      const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
      await barra.getByRole('button', { name: 'Altro' }).click()
      await page.getByRole('dialog', { name: 'Altro' }).getByRole('link', { name: 'Novità' }).click()

      await expect(page).toHaveURL(/\/changelog$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Novità' })).toBeVisible()
      // the version in use, for everyone
      await expect(page.getByTestId('versione-corrente')).toContainText(`v${CORRENTE.versione}`)
      await expect(page.getByTestId('versione')).toHaveCount(versioniPer(ruolo).length)
      await expect(barra.getByRole('button', { name: 'Altro' })).toBeVisible()

      const larghezze = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
      expect(larghezze[0]).toBeLessThanOrEqual(larghezze[1])
    })
  }
})

test('il setter legge le sue novità e quelle di tutti, mai quelle dell’admin o del closer', async ({ page }) => {
  await accedi(page, 'setter')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Novità' }).click()
  await expect(page).toHaveURL(/\/changelog$/)

  const vista = versioniPer('setter')
  await expect(page.getByTestId('versione')).toHaveCount(vista.length)
  const letti = await testiLetti(page)
  expect(letti).toEqual(vista.flatMap((v) => [...v.novita, ...v.correzioni].map((voce) => voce.testo)))

  // his items, in the team's words
  const sua = voci('setter').find((voce) => voce.testoTeam)!
  expect(letti).toContain(sua.testoTeam)
  expect(letti).toContain(voci('tutti')[0].testoTeam ?? voci('tutti')[0].testo)

  // never the admin's items, the admin's words of shared items, the closer's items or the tags
  await maiNellaPagina(page, [
    ...voci('admin').map((voce) => voce.testo),
    ...PAROLE_DELL_ADMIN,
    ...voci('closer').map((voce) => voce.testoTeam ?? voce.testo),
  ])
  await expect(page.getByText('Solo admin')).toHaveCount(0)

  // a version whose title speaks of the admin's numbers: a neutral heading
  const neutra = VERSIONI.find((v) => v.intestazionePer.join() === 'admin' && vista.some((x) => x.versione === v.versione))!
  const scheda = page.getByTestId('versione').filter({ hasText: `v${neutra.versione}` })
  await expect(scheda.getByRole('heading', { level: 2 })).toHaveText(/per te$/)
  await maiNellaPagina(page, [neutra.titolo, neutra.riassunto])
})

test('il closer apre le novità dal profilo e legge le sue, non quelle del setter', async ({ page }) => {
  await accedi(page, 'closer')
  await page.goto('/account?scheda=account')
  const link = page.getByTestId('voce-novita-profilo')
  await expect(link).toContainText(`Versione ${CORRENTE.versione}`)
  await link.click()
  await expect(page).toHaveURL(/\/changelog$/)
  // the page streams in after the URL changes: read it once its title is there
  await expect(page.getByRole('heading', { level: 1, name: 'Novità' })).toBeVisible()

  const letti = await testiLetti(page)
  for (const voce of voci('closer')) expect(letti).toContain(voce.testoTeam ?? voce.testo)
  await maiNellaPagina(page, [
    ...voci('admin').map((voce) => voce.testo),
    ...PAROLE_DELL_ADMIN,
    ...voci('setter').map((voce) => voce.testoTeam ?? voce.testo),
  ])
})

test('il coach legge solo le novità dei progetti e di tutto il team', async ({ page }) => {
  await accedi(page, 'coach')
  await page.goto('/changelog')
  await expect(page.getByRole('heading', { level: 1, name: 'Novità' })).toBeVisible()

  const letti = await testiLetti(page)
  expect(letti).toEqual(
    versioniPer('coach').flatMap((v) => [...v.novita, ...v.correzioni].map((voce) => voce.testo)),
  )
  for (const voce of voci('progetti')) expect(letti).toContain(voce.testoTeam ?? voce.testo)
  await maiNellaPagina(page, [
    ...voci('admin').map((voce) => voce.testo),
    ...PAROLE_DELL_ADMIN,
    ...[...voci('setter'), ...voci('closer'), ...voci('setter', 'closer')].map((voce) => voce.testoTeam ?? voce.testo),
  ])

  // the time version reads with the team's heading, never the admin's
  const tempo = VERSIONI.find((v) => v.versione === '1.7.0')!
  await expect(page.getByTestId('versione').filter({ hasText: 'v1.7.0' }).getByRole('heading', { level: 2 })).toHaveText(
    tempo.intestazioneTeam!.titolo,
  )
  await maiNellaPagina(page, [tempo.titolo, tempo.riassunto])
})
