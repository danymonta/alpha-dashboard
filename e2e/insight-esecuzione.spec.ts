import { existsSync, readFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { parse } from 'dotenv'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'
import { eseguiInsightFinoAllaFine, esecuzione, rimettiInsight, statoInsight, ultimaEsecuzione, type StatoInsight } from './insight-db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * A whole run of the Insight (1.35.0, CLAUDE.md section 29) from «Aggiorna
 * dati» to the page, against the two fakes: e2e/graph-finto.mjs for Meta
 * (Instagram and Messenger) and e2e/claude-finto.mjs for Anthropic. Never
 * graph.instagram.com, graph.facebook.com or api.anthropic.com: the dev server
 * runs with ANTHROPIC_API_KEY=finta, ANTHROPIC_BASE_URL and E2E_GRAPH_FINTO on
 * loopback, and INSIGHT_URL_PASSO=manuale (the test plays the scheduler,
 * e2e/insight-db.ts). Skipped unless E2E_INSIGHT_FINTO=1 and both fakes
 * answer.
 *
 * Test tokens go into the local Vault with the admin's session and come out
 * at the end; every row a run writes is put back as it was (the seed's recaps
 * of today, the counts per post, the chats, the settings).
 *
 * The fakes' addresses come from .env.local itself: a shell may export
 * ANTHROPIC_BASE_URL (Claude Code does, with the real API), and neither dotenv
 * nor Next override a variable already set. Start the dev server with
 * ANTHROPIC_BASE_URL=http://127.0.0.1:6011 written in the command, or it
 * would send the fake chats to api.anthropic.com.
 */

const LOCALE = existsSync('.env.local') ? parse(readFileSync('.env.local')) : {}
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
const CLAUDE = LOOPBACK.test(LOCALE.ANTHROPIC_BASE_URL ?? '') ? (LOCALE.ANTHROPIC_BASE_URL as string) : ''
const GRAFO = LOOPBACK.test(LOCALE.E2E_GRAPH_FINTO ?? '') ? (LOCALE.E2E_GRAPH_FINTO as string) : ''
const RUN = Date.now().toString(36)

type Richiesta = { corpo: Record<string, unknown>; beta: string | null }

async function json<T>(url: string): Promise<T> {
  return (await (await fetch(url)).json()) as T
}

/** The admin's own session on the local database (the tokens as he pastes them). */
async function sessioneAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

/** The admin taps «Aggiorna dati»: the run is queued, the test drives it to the end. */
async function aggiornaDati(page: Page) {
  const dal = new Date(Date.now() - 1000).toISOString()
  await page.getByRole('button', { name: 'Aggiorna dati' }).click()
  await expect.poll(async () => (await ultimaEsecuzione(dal))?.id ?? null, { timeout: 30_000 }).not.toBeNull()
  return (await ultimaEsecuzione(dal))!
}

function scheda(page: Page, username: string) {
  return page.getByRole('article', { name: new RegExp(`@${username.replace(/\./g, '\\.')}`) })
}

let prima: StatoInsight | null = null
let tokenMessi = false

test.describe('l’esecuzione dell’Insight contro i server finti', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.skip((process.env.E2E_INSIGHT_FINTO ?? LOCALE.E2E_INSIGHT_FINTO) !== '1', 'Serve E2E_INSIGHT_FINTO=1 col dev server dei server finti')
    test.skip(!CLAUDE || !GRAFO, 'I server finti vanno su 127.0.0.1 (ANTHROPIC_BASE_URL ed E2E_GRAPH_FINTO in .env.local)')
    const claude = await fetch(`${CLAUDE}/__azzera`).catch(() => null)
    const grafo = await fetch(`${GRAFO}/__azzera`).catch(() => null)
    test.skip(!claude?.ok || !grafo?.ok, 'I server finti di Claude e di Meta non rispondono')
    const db = dbLocale()
    const [{ data: ig }, { data: fb }] = await Promise.all([db.rpc('instagram_token'), db.rpc('messenger_token')])
    test.skip(Boolean(ig) || Boolean(fb), 'C’è già un token nel Vault locale: il test non lo sovrascrive')

    prima = await statoInsight()
    // the run's start: the automation off, no address (nothing dispatched by itself), the chats excluded
    const { error: e1 } = await db.from('insight_impostazioni').update({ url_passo: null, attivo: false }).eq('id', true)
    if (e1) throw e1
    if (!prima.esclusi.includes('coachplus.app')) {
      const { error } = await db.from('instagram_esclusi').insert({ username: 'coachplus.app', motivo: 'Servizio (test)' })
      if (error) throw error
    }
    const admin = await sessioneAdmin()
    const { error: e2 } = await admin.rpc('instagram_imposta_token', { p_token: `IGAAe2eFinto${RUN}QwErTyUiOpAsDf` })
    if (e2) throw e2
    const { error: e3 } = await admin.rpc('messenger_imposta_token', {
      p_token: `EAAe2eFinto${RUN}QwErTyUiOpAsDfGh`,
      p_pagina_id: '100000000000042',
      p_pagina_nome: 'Percorso Alpha (finta)',
    })
    if (e3) throw e3
    tokenMessi = true
    await fetch(`${GRAFO}/__modo?scenario=insight`)
  })

  test.afterAll(async () => {
    if (tokenMessi) {
      const admin = await sessioneAdmin()
      await admin.rpc('instagram_togli_token')
      await admin.rpc('messenger_togli_token')
    }
    if (prima) await rimettiInsight(prima)
    if (GRAFO) await fetch(`${GRAFO}/__modo`).catch(() => null)
  })

  test('Aggiorna dati: il recap arriva dal server, coi lead attribuiti ai post', async ({ page }) => {
    test.setTimeout(240_000)
    await fetch(`${CLAUDE}/__azzera`)
    await fetch(`${GRAFO}/__azzera`)
    await accedi(page, 'admin')
    await page.goto('/insight?canale=instagram')
    await expect(page.getByRole('heading', { level: 1, name: 'Insight delle ultime 24h' })).toBeVisible({ timeout: 60_000 })

    const run = await aggiornaDati(page)
    const fine = await eseguiInsightFinoAllaFine(run.id)
    expect(fine.errore).toBeNull()
    expect(fine.stato).toBe('pronta')

    // the page: the headline, the tiles, the wait, where the leads come from
    await page.reload()
    await expect(page.getByRole('region', { name: 'Verdetto della giornata' })).toContainText(/Giornata con \d+ chat/, { timeout: 30_000 })
    await expect(page.getByRole('group', { name: 'Filtra le chat' }).getByRole('button', { name: /Attendono risposta/ })).toBeVisible()
    const marco = scheda(page, 'marco.finto')
    await expect(marco).toContainText(/aspetta da (meno di 1 ora|\d+ or[ae])/)
    await expect(marco).toContainText(/Arriva da: reel del \d\d\/\d\d/)
    await expect(marco).toContainText('condiviso in DM')
    await expect(scheda(page, 'luca.finto')).toContainText('parola chiave «ALPHA»')
    // the excluded chat is nowhere in the page
    expect(await page.content()).not.toContain('coachplus')

    // what reached Claude (the fake's last requests)
    const richieste = await json<Richiesta[]>(`${CLAUDE}/__ultime`)
    expect(richieste.length).toBeGreaterThan(0)
    for (const r of richieste) {
      expect(r.corpo.model).toBe('claude-sonnet-5-5')
      expect((r.corpo.output_config as { effort: string }).effort).toBe('medium')
      expect(r.beta ?? '').toContain('server-side-fallback-2026-07-01')
      expect(r.corpo.fallbacks).toBe('default')
      const system = r.corpo.system as { text: string; cache_control?: unknown }[]
      expect(system.at(-1)?.cache_control).toBeTruthy()
      expect(system.some((b) => b.text.startsWith('<icp>'))).toBe(true)
    }
    const testo = JSON.stringify(richieste)
    expect(testo).not.toContain('coachplus')
    expect(testo).not.toContain('e2eFinto')
    expect(testo).not.toContain('Il tuo abbonamento')

    // the database after the run
    const db = dbLocale()
    const { data: chat, error } = await db.from('insight_chat').select('username, messaggi, non_lead, minore_14, origine_tipo, origine_shortcode, origine_giorno')
    if (error) throw error
    const per = Object.fromEntries((chat ?? []).map((c) => [c.username, c]))
    expect(per['amico.finto']).toMatchObject({ non_lead: true, messaggi: [] })
    expect(per['giovane.finto']).toMatchObject({ minore_14: true, messaggi: [] })
    expect(per['coachplus.app']).toBeUndefined()
    expect(per['marco.finto']).toMatchObject({ origine_tipo: 'condivisione', origine_shortcode: 'GraphFinto02' })
    expect(per['luca.finto']).toMatchObject({ origine_tipo: 'parola_chiave', origine_shortcode: 'GraphFinto04' })
    const { data: conteggi } = await db.from('instagram_contenuti_dm').select('shortcode, giorno, dm, dm_certi').like('shortcode', 'GraphFinto%')
    expect(conteggi).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shortcode: 'GraphFinto02', giorno: per['marco.finto'].origine_giorno, dm: 1, dm_certi: 1 }),
        expect.objectContaining({ shortcode: 'GraphFinto04', giorno: per['luca.finto'].origine_giorno, dm: 1, dm_certi: 1 }),
      ]),
    )
    // the finished days the run re-read are counted, today never (1.36.0's R2)
    const { data: giorni, error: erroreGiorni } = await db.from('instagram_contenuti_dm_giorni').select('giorno')
    if (erroreGiorni) throw erroreGiorni
    const contati = (giorni ?? []).map((g) => g.giorno)
    expect(contati).toContain(aggiungiGiorni(oggiRoma(), -1))
    expect(contati).not.toContain(oggiRoma())
    // the statistics of the posts of the last 14 days, read (D28)
    const { data: post } = await db.from('instagram_contenuti').select('shortcode, metriche_il, metriche_stato').like('shortcode', 'GraphFinto%')
    const statistiche = Object.fromEntries((post ?? []).map((p) => [p.shortcode, p]))
    for (const s of ['GraphFinto02', 'GraphFinto03', 'GraphFinto04', 'GraphFinto05']) {
      expect(statistiche[s]).toMatchObject({ metriche_stato: 'lette' })
      expect(statistiche[s].metriche_il).not.toBeNull()
    }
    // the token is read, never refreshed (N6)
    const { percorsi } = await json<{ percorsi: string[] }>(`${GRAFO}/__richieste`)
    expect(percorsi.some((p) => p.includes('refresh_access_token'))).toBe(false)
    // the recap of today, both channels
    const { data: recap } = await db.from('insight_recap').select('canale, stato').eq('giorno', oggiRoma()).eq('esecuzione_id', run.id)
    expect((recap ?? []).map((r) => r.canale).sort()).toEqual(['instagram', 'messenger'])
  })

  test('un secondo aggiornamento: niente del tredicenne arriva a Claude, e senza il permesso delle statistiche lo dice', async ({ page }) => {
    test.setTimeout(240_000)
    await fetch(`${CLAUDE}/__azzera`)
    await fetch(`${GRAFO}/__modo?scenario=insight&insights=senza_permesso`)
    await accedi(page, 'admin')
    await page.goto('/insight?canale=instagram')
    await expect(page.getByRole('heading', { level: 1, name: 'Insight delle ultime 24h' })).toBeVisible({ timeout: 60_000 })
    const run = await aggiornaDati(page)
    const fine = await eseguiInsightFinoAllaFine(run.id)
    expect(fine.stato).toBe('pronta')
    expect(fine.avvisi.some((a) => a.startsWith('Statistiche dei contenuti non disponibili'))).toBe(true)
    const testo = JSON.stringify(await json<Richiesta[]>(`${CLAUDE}/__ultime`))
    expect(testo).not.toContain('13 anni')
    expect(testo).not.toContain('mettere su muscoli')
    const { data: post } = await dbLocale().from('instagram_contenuti').select('shortcode, metriche_stato').eq('shortcode', 'GraphFinto03').single()
    expect(post?.metriche_stato).toBe('senza_permesso')
    await fetch(`${GRAFO}/__modo?scenario=insight`)
  })

  test('un’esecuzione fallita dopo la lettura non lascia i messaggi che aveva letto (D25)', async () => {
    test.setTimeout(180_000)
    const db = dbLocale()
    // every chat read again: as after a failed run
    const { error: e0 } = await db.from('insight_chat').update({ aggiornata_il: null }).like('conversazione_id', 'igc_finto_%')
    if (e0) throw e0
    const admin = await sessioneAdmin()
    const { data: id, error } = await admin.rpc('insight_richiedi', { p_url: null as unknown as string })
    if (error) throw error
    const dopoLettura = await eseguiInsightFinoAllaFine(id as string, { fino: 'analisi' })
    expect(dopoLettura.passo).toBe('analisi')
    const { count } = await db.from('insight_chat').select('id', { count: 'exact', head: true }).eq('letta_da', id as string)
    expect(count).toBeGreaterThan(0)
    // the run fails as the watchdog or a fatal error ends it
    const { error: e1 } = await db.rpc('insight_fallita', { p_esecuzione: id as string, p_errore: 'Aggiornamento interrotto: il server non ha completato i passi. Riprova con Aggiorna dati.' })
    if (e1) throw e1
    expect((await esecuzione(id as string)).stato).toBe('fallita')
    const { data: lette } = await db.from('insight_chat').select('messaggi, aggiornata_il').eq('letta_da', id as string)
    expect(lette?.length).toBeGreaterThan(0)
    expect(lette?.every((c) => Array.isArray(c.messaggi) && c.messaggi.length === 0 && c.aggiornata_il === null)).toBe(true)
  })
})
