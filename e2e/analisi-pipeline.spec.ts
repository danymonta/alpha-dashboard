import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'
import { eseguiPassiMarketing, rimettiLavori, statoLavori } from './marketing-db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * The whole path of a reel analysis (1.36.0) against the fake servers, never
 * Instagram, Groq or Anthropic: «Aggiorna da Instagram» reads the posts and
 * their statistics from the fake Graph API, «Analizza» queues the reading and
 * the analysis, the steps run on the dev server (the video is downloaded and
 * its frames cut by the real ffmpeg, Whisper and Claude are the fake models),
 * and the panel shows the result. Needs the dev server started with
 * E2E_GRAPH_FINTO, ANTHROPIC_BASE_URL and ALFIRE_BASE_URL pointing at
 * e2e/graph-finto.mjs, e2e/claude-finto.mjs and e2e/llm-finto.mjs (the
 * Whisper of Groq), and a non-empty ALFIRE_API_KEY; this test reaches the two
 * last servers through E2E_CLAUDE_FINTO and E2E_GROQ_FINTO (the shell's own
 * ANTHROPIC_BASE_URL is never trusted).
 */

const GRAPH = process.env.E2E_GRAPH_FINTO
const CLAUDE = process.env.E2E_CLAUDE_FINTO
const GROQ = process.env.E2E_GROQ_FINTO
const REEL = '17990000000000002' // GraphFinto02: a reel with a video, statistics and a caption
const RUN = Date.now().toString(36)

async function raggiungibile(url: string | undefined, percorso: string) {
  if (!url) return false
  return (await fetch(`${url}${percorso}`).catch(() => null))?.ok === true
}

async function sessioneAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

/**
 * The fake servers, a token in the local Vault, the morning run and, at the
 * end, everything put back as it was (the fake Graph returns only its own
 * posts: a complete listing marks every other post as gone). `corpo` is the
 * test itself, on a page logged in as marketing.
 */
async function conGiro(page: Page, modo: string, corpo: (costoPrima: number) => Promise<void>) {
  test.skip(!GRAPH || !CLAUDE || !GROQ, 'Servono E2E_GRAPH_FINTO, E2E_CLAUDE_FINTO ed E2E_GROQ_FINTO e i tre server finti.')
  test.skip(!(await raggiungibile(GRAPH, '/__azzera')), 'Il Graph finto non risponde.')
  test.skip(!(await raggiungibile(CLAUDE, '/__azzera')), 'Il Claude finto non risponde.')
  test.skip(!(await raggiungibile(GROQ, '/__ultime')), 'Il Groq finto non risponde.')
  const db = dbLocale()
  const { data: token } = await db.rpc('instagram_token')
  test.skip(Boolean(token), 'Nel Vault locale c’è già un token.')

  const { data: presenti } = await db.from('instagram_contenuti').select('media_id').is('eliminato_il', null)
  const { data: propostePrima } = await db.from('marketing_abbinamenti').select('*').eq('esito', 'proposto')
  const { data: statoGiro } = await db.from('instagram_contenuti_stato').select('*').maybeSingle()
  const lavoriPrima = await statoLavori()
  await db.from('instagram_contenuti_stato').update({ ultimo_giro_il: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', true)

  const admin = await sessioneAdmin()
  const { error } = await admin.rpc('instagram_imposta_token', { p_token: `IGAAe2eFinto${RUN}QwErTyUiOpAsDf` })
  if (error) throw error
  await fetch(`${GRAPH}/__azzera`)
  await fetch(`${GRAPH}/__modo${modo}`)
  await fetch(`${CLAUDE}/__azzera`)
  await fetch(`${GROQ}/__voce?modo=normale`)
  try {
    // the morning run: posts and their statistics
    await accedi(page, 'admin')
    await page.goto('/marketing/instagram')
    await page.getByRole('button', { name: 'Aggiorna da Instagram' }).click()
    await expect(page.getByText(/^Aggiornato: 5 post letti.*numeri di \d+ post/)).toBeVisible({ timeout: 60_000 })
    const { data: numeri } = await db.from('instagram_contenuti').select('views, metriche_stato').eq('media_id', REEL).single()
    expect(numeri).toMatchObject({ metriche_stato: 'lette' })
    expect(numeri?.views).toBeGreaterThan(0)

    await page.context().clearCookies()
    await accedi(page, 'marketing')
    await corpo(Number(lavoriPrima.costo_mese_usd))
  } finally {
    await admin.rpc('instagram_togli_token')
    await fetch(`${GRAPH}/__modo`)
    await db.from('marketing_analisi').delete().in('media_id', [REEL])
    await db.from('instagram_letture').delete().eq('media_id', REEL)
    await db.from('instagram_contenuti').delete().like('shortcode', 'GraphFinto%')
    const ids = (presenti ?? []).map((x) => x.media_id)
    if (ids.length) await db.from('instagram_contenuti').update({ eliminato_il: null }).in('media_id', ids)
    await db.from('marketing_abbinamenti').delete().eq('esito', 'proposto')
    if (propostePrima?.length) await db.from('marketing_abbinamenti').upsert(propostePrima)
    if (statoGiro) {
      const { id: _id, created_at: _c, updated_at: _u, ...resto } = statoGiro
      void _id
      void _c
      void _u
      await db.from('instagram_contenuti_stato').update(resto).eq('id', true)
    }
    await rimettiLavori(lavoriPrima)
  }
}

test('Aggiorna da Instagram, Analizza, i passi e il pannello: dalla statistica al verdetto e alle idee', async ({ page }) => {
  test.setTimeout(240_000)
  await conGiro(page, '', async (costoPrima) => {
    const db = dbLocale()
    await page.goto(`/marketing/analisi?reel=${REEL}`)
    const p = page.getByTestId('pannello-reel')
    await expect(p.getByTestId('reel-numeri')).toBeVisible({ timeout: 60_000 })
    // up to here the morning run read the posts and their numbers, and Claude was asked nothing: it works only after a click (1.39.0)
    expect(await (await fetch(`${CLAUDE}/__ultime`)).json()).toHaveLength(0)
    expect(await eseguiPassiMarketing()).toBe(0)
    await expect(p.getByTestId('punteggio-vuoto')).toContainText('Non valutato')
    await p.getByTestId('analizza-reel').click()
    await expect(p.getByTestId('reel-in-corso')).toBeVisible()

    // the steps: the reading (video, frames, speech, visual card), then the analysis and the score
    expect(await eseguiPassiMarketing()).toBeGreaterThanOrEqual(2)
    const { data: lettura } = await db
      .from('instagram_letture')
      .select('stato, video, trascrizione_esito, trascrizione, fotogrammi, visione_esito, fonte_visione')
      .eq('media_id', REEL)
      .single()
    expect(lettura).toMatchObject({ stato: 'fatta', video: 'letto', trascrizione_esito: 'pronta', visione_esito: 'pronta', fonte_visione: 'video' })
    expect(lettura?.fotogrammi).toBeGreaterThan(5)
    expect(lettura?.trascrizione).toContain('Niente sbarra')
    const { data: analisi } = await db
      .from('marketing_analisi')
      .select('stato, verdetto, contenuto, fonti, punteggio, punteggio_totale, punteggio_fascia, punteggio_tipo, versione_guida')
      .eq('media_id', REEL)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(analisi?.stato).toBe('pronta')
    expect((analisi?.contenuto as { idee: unknown[] }).idee.length).toBeGreaterThanOrEqual(2)
    // the score of the same click: made by the app from the votes of Claude, with the passages that are in the reel
    expect(analisi?.fonti).toMatchObject({ punteggio: 'si' })
    const punteggio = analisi?.punteggio as {
      tipo: string
      tipo_origine: string
      totale: number
      hook: { testo: string }
      criteri: { citazione_trovata: boolean }[]
      rifacimento: { script_riscritto: string; hook_alternativi: unknown[] }
    }
    expect(analisi).toMatchObject({ punteggio_tipo: 'mof' })
    expect(analisi?.punteggio_totale).toBe(punteggio.totale)
    expect(analisi?.versione_guida).toMatch(/^2026-10-16\./)
    expect(punteggio).toMatchObject({ tipo: 'mof', tipo_origine: 'dedotto' })
    expect(punteggio.hook.testo).toContain('Niente sbarra')
    expect(punteggio.criteri.every((c) => c.citazione_trovata)).toBe(true)
    expect(punteggio.rifacimento.hook_alternativi).toHaveLength(3)

    // what reached the fakes: the frames as images, the audio to Whisper
    const richieste = (await (await fetch(`${CLAUDE}/__ultime`)).json()) as { corpo: { messages: { content: { type: string; text?: string }[] }[] } }[]
    expect(richieste.some((r) => r.corpo.messages[0].content.some((b) => b.type === 'image'))).toBe(true)
    // the look, the analysis and the score: three requests, one click
    const passi = richieste.map((r) => /<passo>([a-z_]+)<\/passo>/.exec(r.corpo.messages[0].content.map((b) => b.text ?? '').join('\n'))?.[1]).sort()
    expect(passi).toEqual(['analisi_reel', 'punteggio_reel', 'visione_reel'])
    const voce = (await (await fetch(`${GROQ}/__ultime`)).json()) as { voce: { modello: string; byte: number } | null }
    expect(voce.voce?.byte).toBeGreaterThan(1000)

    // the cost of the month is SQL's and grew; no step is left holding the lease
    const dopo = await statoLavori()
    expect(Number(dopo.costo_mese_usd)).toBeGreaterThan(costoPrima)
    expect(dopo.passo_id).toBeNull()

    // the panel shows it, with what Claude saw
    await page.goto(`/marketing/analisi?reel=${REEL}`)
    await expect(p.getByTestId('reel-analisi-pronta')).toBeVisible({ timeout: 60_000 })
    await expect(p.getByTestId('punteggio-totale')).toHaveText(String(punteggio.totale))
    await expect(p.getByTestId('reel-punteggio')).toContainText('Valutato come Consapevolezza (MOF), dedotto da Claude')
    await expect(p.getByTestId('reel-fonti')).toContainText('fotogrammi')
    await p.getByTestId('reel-parlato-blocco').locator('summary').click()
    await expect(p.getByTestId('reel-parlato')).toContainText('Niente sbarra? Nessun problema.')
    await expect(page.getByTestId('elenco-reel').getByTestId('colonna-analisi').first()).toBeVisible()
  })
})

test('le trappole del controllo finale: la citazione inventata cade, il trattino e l’emoji li vede il codice, lo script esce pulito', async ({ page }) => {
  test.setTimeout(240_000)
  await conGiro(page, '', async () => {
    const db = dbLocale()
    // a caption with a long dash and an emoji (the code's own flags), and the markers that make the fake Claude misbehave
    await db
      .from('instagram_contenuti')
      .update({ didascalia: 'Allenati a casa — davvero 🔥 [[citazione-falsa]] [[trattino]] [[emoji]] [[prezzo]] [[elenco]] [[hook-lungo]] [[atteso-alto]]' })
      .eq('media_id', REEL)
    await page.goto(`/marketing/analisi?reel=${REEL}`)
    const p = page.getByTestId('pannello-reel')
    await expect(p.getByTestId('reel-numeri')).toBeVisible({ timeout: 60_000 })
    await p.getByTestId('analizza-reel').click()
    await expect(p.getByTestId('reel-in-corso')).toBeVisible()
    await eseguiPassiMarketing()

    const { data } = await db.from('marketing_analisi').select('punteggio, punteggio_totale').eq('media_id', REEL).eq('stato', 'pronta').single()
    const s = data?.punteggio as {
      penalita: { flag: string; da: string; valore: number }[]
      penalita_totali: number
      criteri: { id: string; citazione_trovata: boolean; voto: number; voto_modello: number }[]
      rifacimento: { script_riscritto: string; hook_alternativi: unknown[]; punteggio_atteso: number }
      totale: number
    }
    // the code saw the dash and the emoji, whatever Claude said
    expect(s.penalita.filter((x) => x.da === 'codice').map((x) => x.flag).sort()).toEqual(['EMOJI', 'EM_DASH'])
    expect(s.penalita_totali).toBe(-8)
    // two formal violations (10 - 4 = 6), and the long dash caps the conformity at 4 on its own
    expect(s.criteri.find((c) => c.id === 'CF')).toMatchObject({ voto: 4, voto_modello: 10 })
    expect(s.criteri.find((c) => c.id === 'H')?.citazione_trovata).toBe(false)
    expect(s.rifacimento.hook_alternativi).toHaveLength(2)
    expect(s.rifacimento.punteggio_atteso).toBeLessThanOrEqual(100)
    expect(s.rifacimento.punteggio_atteso).toBeGreaterThanOrEqual(s.totale)
    expect(s.rifacimento.script_riscritto).not.toMatch(/[–—€]|1\.500|\u{1F525}|^\s*[-*•]\s/mu)
    expect(JSON.stringify(s)).not.toContain('Loris')

    await page.goto(`/marketing/analisi?reel=${REEL}`)
    await expect(p.getByTestId('punteggio-totale')).toHaveText(String(s.totale), { timeout: 60_000 })
    await expect(p.getByTestId('punteggio-penalita')).toContainText('Contiene un trattino lungo o medio')
    await expect(p.getByTestId('punteggio-penalita')).toContainText('Contiene emoji')
    await p.getByTestId('punteggio-criteri').locator('summary').click()
    await expect(p.locator('[data-criterio="H"]').getByTestId('citazione-non-trovata')).toBeVisible()
    await p.getByTestId('punteggio-come-rifarlo').locator('summary').click()
    await expect(p.getByTestId('punteggio-hook')).toHaveCount(2)
    expect(await p.getByTestId('punteggio-script').innerText()).not.toMatch(/[–—€]/)
  })
})

test('senza il video di Instagram (musica protetta): Claude vede la copertina, e lo dice', async ({ page }) => {
  test.setTimeout(240_000)
  await conGiro(page, '?video=assente', async () => {
    const db = dbLocale()
    await page.goto(`/marketing/analisi?reel=${REEL}`)
    const p = page.getByTestId('pannello-reel')
    await p.getByTestId('analizza-reel').click()
    await expect(p.getByTestId('reel-in-corso')).toBeVisible()
    await eseguiPassiMarketing()
    const { data: lettura } = await db.from('instagram_letture').select('video, fonte_visione, trascrizione_esito, fotogrammi').eq('media_id', REEL).single()
    expect(lettura).toMatchObject({ video: 'senza_media_url', fonte_visione: 'copertina', trascrizione_esito: 'senza_video' })
    await page.goto(`/marketing/analisi?reel=${REEL}`)
    await expect(p.getByTestId('reel-analisi-pronta')).toBeVisible({ timeout: 60_000 })
    await expect(p.getByTestId('reel-fonti')).toContainText('Instagram non dà il video di questo reel')
    await p.getByTestId('reel-parlato-blocco').locator('summary').click()
    await expect(p.getByTestId('reel-parlato-vuoto')).toContainText('Instagram non dà il video')
  })
})
