import Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import { analizzaReel } from '@/lib/marketing/analisi/analizza'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'

// The second pass against the fake Anthropic server and an in-memory database:
// what reaches Claude, what comes back through the final check, how the job is closed.

type Finto = {
  url: string
  chiudi: () => Promise<void>
  ultime: () => { corpo: Record<string, unknown>; beta: string | null }[]
  azzera: () => void
}
let finto: Finto
let client: Anthropic

beforeAll(async () => {
  finto = (await creaClaudeFinto({ lentoMs: 400 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: finto.url, maxRetries: 0 })
})
afterAll(async () => {
  await finto.chiudi()
})
beforeEach(() => {
  finto.azzera()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

type Tabelle = Record<string, Record<string, unknown>[]>

function dbFinto(tabelle: Tabelle, rpc: Record<string, unknown>) {
  const chiamate: { nome: string; args: Record<string, unknown> }[] = []
  const costruttore = (righe: Record<string, unknown>[]) => {
    let r = righe
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => ((r = r.filter((x) => x[c] === v)), b),
      neq: (c: string, v: unknown) => ((r = r.filter((x) => x[c] !== v)), b),
      is: (c: string, v: unknown) => ((r = r.filter((x) => (x[c] ?? null) === v)), b),
      limit: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: r[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: r, error: null }).then(ok),
    }
    return b
  }
  const db = {
    from: (t: string) => costruttore(tabelle[t] ?? []),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chiamate.push({ nome, args })
      return { data: rpc[nome] ?? null, error: null }
    },
  } as unknown as AdminClient
  return { db, chiamate }
}

const NUMERI = {
  eta_ore: 400,
  verdetto: 'spingere',
  fascia_pubblico: 'sopra',
  fascia_lead: 'sopra',
  views: 14000,
  views_mediana: 10000,
  views_rapporto: 1.4,
  lead: { finestra: 'vita', contati: true, dm: 5, lead_in_target: 3, call_prenotate: 1, in_target_p75: 2 },
}

const BASE: Tabelle = {
  marketing_analisi: [{ id: 'a1', media_id: 'm1', stato: 'in_corso', periodo_da: '2026-09-18', periodo_a: '2026-10-15' }],
  instagram_contenuti: [
    { media_id: 'm1', shortcode: 'SeedPost02', permalink: 'https://www.instagram.com/reel/SeedPost02/', pubblicato_il: '2026-10-03T08:00:00Z', didascalia: 'Niente sbarra? Allenati a casa con Gustavo.', durata_ms: 30000, audio_tipo: 'ORIGINAL_SOUND', like_count: 10, comments_count: 2 },
  ],
  instagram_letture: [{ media_id: 'm1', stato: 'pronta', trascrizione_esito: 'pronta', trascrizione: 'x', segmenti: [{ da: 0, a: 3, testo: 'Ciao sono Gustavo' }], scheda: null, fotogrammi: 31, fonte_visione: 'video', video: 'letto' }],
  marketing_contenuti: [{ id: 'c1', nome: 'Reel con gancio sulla sbarra', tipo: 'reel', url: null, stato: 'posted', post_date: '2026-10-03', messaggio: 'm', bozza: 'b', finale: 'f', instagram_shortcode: null }],
  marketing_abbinamenti_rifiutati: [],
}

const FONTI_SPENTE = { note_del_team: 'spente', da_oscurare: ['Gustavo Rossiniello'], mediane: { views: 10000 } }
const FONTI_ACCESE = { note_del_team: 'accese', da_oscurare: ['Gustavo Rossiniello'], commenti_setter: { scale: {}, testi: [{ testo: 'Gustavo non aveva tempo la sera' }] }, motivi_closer: [] }

/** The user's turn of the first request as plain text (the system holds the ICP and the rules, not the data). */
const testoDi = (u: { corpo: Record<string, unknown> }) =>
  (u.corpo as { messages: { content: { text?: string }[] }[] }).messages[0].content.map((b) => b.text ?? '').join('\n')
/** The analysis request and the score request go out together (1.39.0): each is found by its step. */
const richiestaDi = (passo: string) => finto.ultime().map(testoDi).find((t) => t.includes(`<passo>${passo}</passo>`)) ?? ''
const richiesta = () => richiestaDi('analisi_reel')
const richiestaPunteggio = () => richiestaDi('punteggio_reel')

const entro = () => Date.now() + 200_000

describe('analizzaReel', () => {
  it('l’analisi arriva a marketing_analisi_fine come pronta, con i numeri, le fonti e le idee del verdetto', async () => {
    const { db, chiamate } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('ok')
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as Record<string, unknown>
    expect(fine.p_stato).toBe('pronta')
    expect(fine.p_versione).toBeTruthy()
    expect((fine.p_contenuto as { idee: unknown[] }).idee).toHaveLength(2)
    expect(fine.p_fonti).toEqual({ fotogrammi: 31, video: 'si', trascrizione: 'si', lead: 'si', note_team: false, punteggio: 'si' })
    expect((fine.p_numeri as { verdetto: string }).verdetto).toBe('spingere')
  })

  it('con le note spente nulla delle note è nella richiesta; il nome del lead è tolto dalla didascalia e dal parlato', async () => {
    const { db } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const testo = richiesta()
    expect(testo).toContain('"note_del_team":"spente"')
    expect(testo).not.toContain('commenti_setter')
    expect(testo).not.toContain('Gustavo')
  })

  it('con le note accese arrivano i temi, ripuliti dei nomi; il nome non c’è mai', async () => {
    const { db } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_ACCESE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const testo = richiesta()
    expect(testo).toContain('non aveva tempo la sera')
    expect(testo).not.toContain('Gustavo')
  })

  it('una frase copiata dalle note del setter si toglie dalla risposta', async () => {
    const tabelle: Tabelle = {
      ...BASE,
      instagram_contenuti: [{ ...BASE.instagram_contenuti[0], didascalia: '[[copia-setter]]' }],
    }
    const fonti = { ...FONTI_ACCESE, commenti_setter: { scale: {}, testi: [{ testo: 'molti uomini non hanno tempo la sera perché tornano tardi dal lavoro' }] } }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: fonti })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_contenuto: { cosa_ha_funzionato: string[] } }
    expect(fine.p_contenuto.cosa_ha_funzionato).toEqual(['Il gancio dice subito cosa si ottiene.'])
  })

  it('un contenuto del calendario senza URL è un candidato; Claude lo collega e il ref diventa l’id', async () => {
    const { db, chiamate } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_contenuto: { collegamento: { contenuto_id: string } | null } }
    expect(fine.p_contenuto.collegamento?.contenuto_id).toBe('c1')
  })

  it('un ref che non è stato mandato non collega niente', async () => {
    const tabelle: Tabelle = { ...BASE, instagram_contenuti: [{ ...BASE.instagram_contenuti[0], didascalia: '[[ref-falso]]' }] }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_contenuto: { collegamento: unknown } }
    expect(fine.p_contenuto.collegamento).toBeNull()
  })

  it('una coppia rifiutata non è più un candidato', async () => {
    const tabelle: Tabelle = { ...BASE, marketing_abbinamenti_rifiutati: [{ shortcode: 'SeedPost02', contenuto_id: 'c1' }] }
    const { db } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(richiesta()).not.toContain('Reel con gancio sulla sbarra')
  })

  it('anche i Name del calendario, i ganci dei reel migliori e i temi dei DM arrivano senza i nomi', async () => {
    const fonti = {
      ...FONTI_ACCESE,
      in_calendario: [{ name: 'Testimonianza di Gustavo', reel_type: 'education', format: 'storytelling', status: 'to_be_recorded' }],
      account: { migliori: [{ gancio: 'Gustavo ha perso 8 kg', views_rapporto: 2 }], peggiori: [{ gancio: 'scrivi a gustavo@esempio.it', views_rapporto: 0.4 }] },
      temi_dm: [{ tema: 'dubbi di Gustavo sul tempo', quanti: 3 }],
    }
    const { db } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: fonti })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const testo = richiesta()
    expect(testo).not.toMatch(/gustavo/i)
    expect(testo).not.toContain('esempio.it')
    expect(testo).toContain('Testimonianza di [lead]')
    expect(testo).toContain('dubbi di [lead] sul tempo')
  })

  it('senza il tempo per Claude il lavoro torna in coda senza tentativo e senza chiamare Claude', async () => {
    const { db, chiamate } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: Date.now() + 30_000, cliente: client })
    expect(r.esito).toBe('parziale')
    expect(finto.ultime()).toHaveLength(0)
    expect((chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_stato: string }).p_stato).toBe('in_coda')
  })

  it('una chiave rifiutata chiude fallita col limite del fornitore, con la frase fissa', async () => {
    const sbagliato = new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: finto.url, maxRetries: 0 })
    const { db, chiamate } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: sbagliato })
    expect(r.esito).toBe('limite_fornitore')
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_stato: string; p_errore: string }
    expect(fine.p_stato).toBe('fallita')
    expect(fine.p_errore).toContain('console Anthropic')
  })

  it('un’analisi che non è in corso non si tocca', async () => {
    const tabelle: Tabelle = { ...BASE, marketing_analisi: [{ ...BASE.marketing_analisi[0], stato: 'pronta' }] }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('fallito')
    expect(chiamate).toHaveLength(0)
  })

  it('i numeri che il database non dà fanno tornare il lavoro in coda con un’attesa', async () => {
    const { db, chiamate } = dbFinto(BASE, {})
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_stato: string; p_riprova_il: string | null }
    expect(fine.p_stato).toBe('in_coda')
    expect(fine.p_riprova_il).toBeTruthy()
  })

  // ---------------------------------------------------------------------------
  // The score of the same click (1.39.0)
  // ---------------------------------------------------------------------------
  const fineDi = (chiamate: { nome: string; args: Record<string, unknown> }[]) =>
    chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as {
      p_stato: string
      p_fonti: { punteggio?: string }
      p_punteggio: { totale: number; fascia: string; tipo: string; tipo_origine: string; criteri: { id: string; citazione_trovata: boolean }[]; rifacimento: { hook_alternativi: unknown[] } } | null
      p_versione_guida: string | null
    }

  it('lo stesso click chiede anche il punteggio: due richieste, e il punteggio arriva con l’analisi', async () => {
    const { db, chiamate } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('ok')
    expect(finto.ultime()).toHaveLength(2)
    const fine = fineDi(chiamate)
    expect(fine.p_stato).toBe('pronta')
    expect(fine.p_fonti.punteggio).toBe('si')
    expect(fine.p_punteggio?.tipo).toBe('mof')
    expect(fine.p_punteggio?.tipo_origine).toBe('dedotto')
    expect(fine.p_punteggio!.totale).toBeGreaterThan(0)
    expect(fine.p_punteggio!.criteri.every((c) => c.citazione_trovata)).toBe(true)
    expect(fine.p_versione_guida).toMatch(/^2026-10-16\./)
  })

  // ---------------------------------------------------------------------------
  // The Reel Type the people created (21/10/2026)
  // ---------------------------------------------------------------------------
  const COLLEGATO = (reel_type: string | null, formato: string | null = null): Tabelle => ({
    ...BASE,
    marketing_contenuti: [{ ...BASE.marketing_contenuti[0], instagram_shortcode: 'SeedPost02', reel_type, formato }],
    marketing_opzioni: [
      { id: 'o1', campo: 'reel_type', valore: 'education', nome: 'Education', colore: 'yellow', ordine: 20 },
      { id: 'o2', campo: 'reel_type', valore: 'case_study', nome: 'Case study', colore: 'orange', ordine: 60 },
      { id: 'o3', campo: 'formato', valore: 'meme', nome: 'Meme', colore: 'pink', ordine: 110 },
    ],
  })

  it('un Reel Type creato dalla persona arriva a Claude col suo nome e non dichiara nessun tipo: lo deduce Claude', async () => {
    const { db, chiamate } = dbFinto(COLLEGATO('case_study', 'meme'), { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('ok')
    expect(richiesta()).toContain('"reel_type":"Case study"')
    expect(richiesta()).toContain('"format":"Meme"')
    // no invented score type: the declared type is null, the one of Claude's reading is used and said so
    const fine = fineDi(chiamate)
    expect(fine.p_punteggio?.tipo_origine).toBe('dedotto')
  })

  it('un Reel Type di partenza (Education) dichiara il suo tipo', async () => {
    const { db, chiamate } = dbFinto(COLLEGATO('education'), { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(richiesta()).toContain('"reel_type":"Education"')
    expect(fineDi(chiamate).p_punteggio?.tipo).toBe('mof')
    expect(fineDi(chiamate).p_punteggio?.tipo_origine).toBe('dichiarato')
  })

  it('la guida e l’ICP stanno nel sistema del punteggio, senza prezzi; il reel nel turno dell’utente, senza i nomi', async () => {
    const { db } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const p = finto.ultime().find((u) => testoDi(u).includes('<passo>punteggio_reel</passo>'))!
    const sistema = ((p.corpo as { system: { text: string }[] }).system.map((s) => s.text)).join('\n')
    expect(sistema).toContain('<guida>')
    expect(sistema).toContain('## 21. Tabelle pesi')
    expect(sistema).toContain('<icp>')
    expect(sistema).not.toMatch(/\d\s*(euro|€)/i)
    const testo = richiestaPunteggio()
    expect(testo).toContain('"trascrizione":')
    expect(testo).not.toContain('Gustavo')
    // the calendar content and its script are context, the numbers are the ratios against the medians
    expect(testo).toContain('"views_rapporto":1.4')
  })

  it('con le note accese nulla delle note è nella richiesta del punteggio: serve solo l’analisi', async () => {
    const { db } = dbFinto(BASE, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_ACCESE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(richiestaPunteggio()).not.toContain('non aveva tempo la sera')
  })

  it('il Reel Type del contenuto collegato dichiara il tipo (Education è MOF); Radio lo lascia a Claude', async () => {
    const collegato: Tabelle = {
      ...BASE,
      marketing_contenuti: [{ id: 'c1', nome: 'Il contenuto', tipo: 'reel', url: null, stato: 'posted', reel_type: 'converting', formato: null, instagram_shortcode: 'SeedPost02', messaggio: 'm', bozza: 'b', finale: 'f' }],
    }
    const { db, chiamate } = dbFinto(collegato, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(richiestaPunteggio()).toContain('"tipo_dichiarato":"REEL_BOF"')
    const fine = fineDi(chiamate)
    expect(fine.p_punteggio).toMatchObject({ tipo: 'bof', tipo_origine: 'dichiarato' })
    finto.azzera()
    const radio: Tabelle = { ...collegato, marketing_contenuti: [{ ...collegato.marketing_contenuti[0], reel_type: 'radio' }] }
    const altro = dbFinto(radio, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db: altro.db, id: 'a1', entro: entro(), cliente: client })
    expect(richiestaPunteggio()).toContain('"tipo_dichiarato":null')
  })

  it('se il punteggio non diventa un punteggio l’analisi si salva lo stesso, e lo dice', async () => {
    const tabelle: Tabelle = { ...BASE, instagram_contenuti: [{ ...BASE.instagram_contenuti[0], didascalia: '[[manca-criterio]]' }] }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('ok')
    const fine = fineDi(chiamate)
    expect(fine.p_stato).toBe('pronta')
    expect(fine.p_punteggio).toBeNull()
    expect(fine.p_versione_guida).toBeNull()
    expect(fine.p_fonti.punteggio).toBe('non_riuscito')
  })

  it('una citazione inventata, il trattino, l’emoji, il prezzo, l’elenco e l’hook lungo si sistemano o cadono', async () => {
    const tabelle: Tabelle = {
      ...BASE,
      instagram_contenuti: [{ ...BASE.instagram_contenuti[0], didascalia: '[[citazione-falsa]] [[trattino]] [[emoji]] [[prezzo]] [[elenco]] [[hook-lungo]] [[atteso-alto]]' }],
    }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    const p = JSON.stringify(fineDi(chiamate).p_punteggio)
    expect(fineDi(chiamate).p_punteggio!.criteri.find((c) => c.id === 'H')!.citazione_trovata).toBe(false)
    expect(p).not.toMatch(/[–—]/)
    expect(p).not.toContain('\u{1F525}')
    expect(p).not.toMatch(/1\.500|€/)
    expect(p).toContain('il prezzo')
    expect(p).not.toContain('- Primo punto')
    expect(fineDi(chiamate).p_punteggio!.rifacimento.hook_alternativi).toHaveLength(2)
    // the expected score never goes past 100
    expect((fineDi(chiamate).p_punteggio as unknown as { rifacimento: { punteggio_atteso: number } }).rifacimento.punteggio_atteso).toBeLessThanOrEqual(100)
  })

  it('se l’analisi fallisce non si salva niente del punteggio; i token di tutte e due si contano', async () => {
    const tabelle: Tabelle = { ...BASE, instagram_contenuti: [{ ...BASE.instagram_contenuti[0], didascalia: '[[tronca]]' }] }
    const { db, chiamate } = dbFinto(tabelle, { analisi_numeri_reel: NUMERI, marketing_fonti_analisi: FONTI_SPENTE })
    const r = await analizzaReel({ db, id: 'a1', entro: entro(), cliente: client })
    expect(r.esito).toBe('fallito')
    const fine = chiamate.find((c) => c.nome === 'marketing_analisi_fine')!.args as { p_stato: string; p_punteggio: unknown }
    expect(fine.p_stato).toBe('fallita')
    expect(fine.p_punteggio).toBeNull()
    expect(r.uso.output_tokens).toBeGreaterThan(0)
  })
})
