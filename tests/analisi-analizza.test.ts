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
const richiesta = () =>
  ((finto.ultime()[0].corpo as { messages: { content: { text?: string }[] }[] }).messages[0].content.map((b) => b.text ?? '').join('\n'))

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
    expect(fine.p_fonti).toEqual({ fotogrammi: 31, video: 'si', trascrizione: 'si', lead: 'si', note_team: false })
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
})
