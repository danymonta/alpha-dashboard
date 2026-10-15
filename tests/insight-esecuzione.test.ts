import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import Anthropic from '@anthropic-ai/sdk'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { SEGNO_TOKEN_FINTO } from '@/lib/instagram/richieste'
import type { ChatSalvata, EsitoLettura, StatoLeadApp, VoceAgendaApp } from '@/lib/insight/contratti'
import { BETA_FALLBACK, eseguiBlocco, TIMEOUT_TENTATIVO_MS } from '@/lib/insight/esegui'
import { eseguiPasso, pianoDi, type DipendenzePasso } from '@/lib/insight/esecuzione'
import { AVVISI_INSIGHT, FRASI_INSIGHT } from '@/lib/insight/frasi'
import { ICP_PERCORSO_ALPHA } from '@/lib/insight/icp'
import { inizioStorico, progressoLettura, rigaDaSalvare } from '@/lib/insight/lettura'
import { leggiRecap } from '@/lib/insight/recap'
import { AVVISO_STATISTICHE } from '@/lib/insight/stato'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import { ArchivioFinto } from './insight-archivio-finto'
import { chatFinta, msg, postFinto, statoFinto, voceAgendaFinta } from './fixture-insight'

// The state machine of a run of the Insight (1.35.0) against an archive in
// memory, the fake Anthropic server (e2e/claude-finto.mjs, in process) and the
// fake Graph API of the e2e tests (e2e/graph-finto.mjs, on a free port): never
// Meta, never api.anthropic.com. Every chat is invented.

type Finto = {
  url: string
  chiudi: () => Promise<void>
  ultime: () => { corpo: Record<string, unknown>; beta: string | null }[]
  azzera: () => void
}

let claude: Finto
let client: Anthropic
let grafo = ''
let processoGrafo: ChildProcess | null = null

const TOKEN_IG = `IGAA${SEGNO_TOKEN_FINTO}${'i'.repeat(40)}`
const TOKEN_FB = `EAA${SEGNO_TOKEN_FINTO}${'f'.repeat(40)}`
const subito = async () => {}

beforeAll(async () => {
  claude = (await creaClaudeFinto({ lentoMs: 400 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: claude.url, maxRetries: 0, timeout: TIMEOUT_TENTATIVO_MS })

  const libera = createServer()
  await new Promise<void>((pronto) => libera.listen(0, '127.0.0.1', () => pronto()))
  const porta = (libera.address() as AddressInfo).port
  await new Promise<void>((chiuso) => libera.close(() => chiuso()))
  processoGrafo = spawn(process.execPath, ['e2e/graph-finto.mjs'], {
    env: { ...process.env, PORTA_GRAPH_FINTO: String(porta) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((pronto, fallito) => {
    const timer = setTimeout(() => fallito(new Error('il Graph finto non è partito')), 10_000)
    processoGrafo?.stdout?.on('data', (d: Buffer) => {
      if (String(d).includes('graph finto su')) {
        clearTimeout(timer)
        pronto()
      }
    })
    processoGrafo?.on('exit', () => fallito(new Error('il Graph finto è uscito')))
  })
  grafo = `http://127.0.0.1:${porta}`
})

afterAll(async () => {
  await claude.chiudi()
  processoGrafo?.kill()
})

beforeEach(async () => {
  claude.azzera()
  await fetch(`${grafo}/__modo`)
  await fetch(`${grafo}/__azzera`)
  vi.stubEnv('INSIGHT_MODEL', '')
  vi.stubEnv('INSIGHT_EFFORT', '')
  vi.stubEnv('INSIGHT_CONCORRENZA', '')
  vi.stubEnv('INSIGHT_COSTO_MAX_USD', '')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const FRASI = new Set<string>(Object.values(FRASI_INSIGHT).filter((f) => typeof f === 'string'))
const eFraseInsight = (errore: string) => FRASI.has(errore) || /^Recap non generato: troppe chat in un solo aggiornamento \(\d+\)\.$/.test(errore)

/** Runs a run step by step, as the scheduler would, until it is ready or failed. */
async function giro(archivio: ArchivioFinto, id: string, dip: DipendenzePasso, opzioni: { entroMs?: number; passiMax?: number } = {}) {
  for (let i = 0; i < (opzioni.passiMax ?? 20); i++) {
    const preso = archivio.prendiPasso(id)
    if (!preso) break
    await eseguiPasso(
      { db: null as never, esecuzione: id, passo: preso.passo, giorno: preso.giorno, motivo: preso.motivo, progresso: preso.progresso, entro: Date.now() + (opzioni.entroMs ?? 240_000) },
      { cliente: () => client, ...dip, archivio },
    )
    const e = archivio.esecuzioni.get(id)
    if (e?.stato === 'pronta' || e?.stato === 'fallita') break
  }
  return archivio.esecuzioni.get(id)!
}

const corpi = () => claude.ultime().map((u) => JSON.stringify(u.corpo))
const passiChiesti = () =>
  claude.ultime().map((u) => {
    const blocchi = ((u.corpo.messages as { content: { text: string }[] }[])?.[0]?.content ?? []).map((b) => b.text)
    return /^<passo>([a-z_]+)<\/passo>/.exec(blocchi.find((t) => t.startsWith('<passo>')) ?? '')?.[1] ?? ''
  })

async function richiesteGrafo(): Promise<string[]> {
  const r = (await (await fetch(`${grafo}/__richieste`)).json()) as { percorsi: string[] }
  return r.percorsi
}

// ---------------------------------------------------------------------------
// A whole run, from the fake Meta to the recap
// ---------------------------------------------------------------------------

describe('un giro intero contro Meta e Claude finti', () => {
  function archivioDelGiro() {
    const archivio = new ArchivioFinto()
    archivio.instagramToken = TOKEN_IG
    archivio.messengerToken = TOKEN_FB
    archivio.esclusiIg.add('coachplus.app')
    return archivio
  }
  const dip = (): DipendenzePasso => ({ graph: { base: grafo, attendi: subito } })

  it('legge, analizza, unisce: recap, chat, conteggi e statistiche', async () => {
    await fetch(`${grafo}/__modo?scenario=insight`)
    const archivio = archivioDelGiro()
    const oggi = oggiRoma()
    const id = archivio.creaEsecuzione(oggi)
    const fine = await giro(archivio, id, dip())
    expect(fine.errore).toBeNull()
    expect(fine.stato).toBe('pronta')

    // the documents
    const ig = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)
    const fb = leggiRecap(archivio.recap.get(`${oggi}|messenger`)?.documento)
    expect(ig).not.toBeNull()
    expect(fb).not.toBeNull()
    expect(ig!.escluse).toBe(1)
    const per = Object.fromEntries(ig!.leads.map((l) => [l.username, l]))
    expect(per['marco.finto'].origine).toMatchObject({ tipo: 'condivisione', shortcode: 'GraphFinto02' })
    expect(per['marco.finto'].source).toMatch(/^reel del \d\d\/\d\d condiviso in DM$/)
    expect(per['luca.finto'].origine).toMatchObject({ tipo: 'parola_chiave', shortcode: 'GraphFinto04', parola: 'ALPHA' })
    expect(per['andrea.finto'].origine).toMatchObject({ tipo: 'storia' })
    expect(per['andrea.finto'].origine?.shortcode).toBeUndefined()
    // under 14: a card without the chat while he has the last word (D25)
    expect(per['giovane.finto']).toMatchObject({ minore_14: true, messages: [], priority: 'alta', stage: 'uscita' })
    expect(ig!.non_leads.map((n) => n.username)).toContain('amico.finto')
    expect(fb!.leads.map((l) => l.user_id).sort()).toEqual(['24680135790001', '24680135790002'])
    // every message has its instant (the nightly cleanup prunes by it)
    expect(ig!.leads.flatMap((l) => l.messages).every((m) => typeof m.at === 'string' && m.at !== '')).toBe(true)
    // the excluded chat is nowhere
    expect(JSON.stringify([...archivio.recap.values()])).not.toContain('coachplus')

    // the chats as the run leaves them (C14, D25)
    const amico = [...archivio.chat.values()].find((c) => c.username === 'amico.finto')!
    const tredici = [...archivio.chat.values()].find((c) => c.username === 'giovane.finto')!
    expect(amico).toMatchObject({ non_lead: true, messaggi: [] })
    expect(tredici).toMatchObject({ minore_14: true, messaggi: [], codici_condivisi: [] })
    expect([...archivio.chat.values()].some((c) => c.username === 'coachplus.app')).toBe(false)
    expect([...archivio.chat.values()].find((c) => c.username === 'marco.finto')).toMatchObject({ origine_tipo: 'condivisione', origine_shortcode: 'GraphFinto02' })

    // the counts per post and day (D27): the two posts, on the day each chat began
    const marco = [...archivio.chat.values()].find((c) => c.username === 'marco.finto')!
    const luca = [...archivio.chat.values()].find((c) => c.username === 'luca.finto')!
    expect(archivio.conteggi).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shortcode: 'GraphFinto02', giorno: giornoRoma(marco.messaggi[0].il), dm: 1, dm_certi: 1 }),
        expect.objectContaining({ shortcode: 'GraphFinto04', giorno: giornoRoma(luca.messaggi[0].il), dm: 1, dm_certi: 1 }),
      ]),
    )
    expect(archivio.conteggi.every((r) => r.dm > 0)).toBe(true)
    // the first run, on an empty insight_chat, says where the history starts
    expect(archivio.storico).toBe(aggiungiGiorni(oggi, -14))

    // the posts: the listing saved as 1.33.0 does, the statistics only for the last 14 days (D28)
    expect(archivio.registro.salvaElenco).toHaveLength(1)
    expect(archivio.registro.salvaElenco[0].map((m) => m.shortcode).sort()).toEqual(['GraphFinto01', 'GraphFinto02', 'GraphFinto03', 'GraphFinto04', 'GraphFinto05'])
    const conStatistiche = archivio.registro.statistiche.map((s) => archivio.mediaIds.get(s.mediaId)).sort()
    expect(conStatistiche).toEqual(['GraphFinto02', 'GraphFinto03', 'GraphFinto04', 'GraphFinto05'])
    expect(archivio.registro.statistiche.every((s) => s.statistiche.stato === 'lette')).toBe(true)

    // the token is only read, never refreshed (N6), and never leaves for Claude
    const percorsi = await richiesteGrafo()
    expect(percorsi.some((p) => p.includes('refresh_access_token'))).toBe(false)
    const tuttiICorpi = corpi().join('\n')
    expect(tuttiICorpi).not.toContain(SEGNO_TOKEN_FINTO)
    expect(tuttiICorpi).not.toContain('coachplus')
    expect(tuttiICorpi).not.toContain('Il tuo abbonamento')

    // the requests (D14): model, effort, fallback, cache, ICP
    const richieste = claude.ultime()
    expect(richieste.length).toBeGreaterThan(0)
    for (const r of richieste) {
      expect(r.corpo.model).toBe('claude-sonnet-5-5')
      expect((r.corpo.output_config as { effort: string }).effort).toBe('medium')
      expect(r.corpo.fallbacks).toBe('default')
      expect(r.beta ?? '').toContain(BETA_FALLBACK)
      const system = r.corpo.system as { text: string; cache_control?: unknown }[]
      expect(system.at(-1)?.cache_control).toBeDefined()
      expect(system.some((b) => b.text.includes(ICP_PERCORSO_ALPHA))).toBe(true)
      expect(r.corpo).not.toHaveProperty('thinking')
      expect(r.corpo).not.toHaveProperty('temperature')
    }
    expect(new Set(passiChiesti())).toEqual(new Set(['schede', 'sintesi']))

    // the run's counters
    expect(fine.contatori.chat_escluse).toBe(1)
    expect(fine.contatori.blocchi_fatti).toBe(fine.contatori.blocchi_totali)
    expect(fine.token_output).toBeGreaterThan(0)
    expect(fine.contatori.chat_attribuite).toBe(2)
  })

  it('un secondo aggiornamento lo stesso giorno: niente da rileggere né da rimandare a Claude', async () => {
    const archivio = archivioDelGiro()
    const oggi = oggiRoma()
    const primo = await giro(archivio, archivio.creaEsecuzione(oggi), dip())
    expect(primo.stato).toBe('pronta')
    claude.azzera()
    await fetch(`${grafo}/__azzera`)

    const secondo = await giro(archivio, archivio.creaEsecuzione(oggi), dip())
    expect(secondo.stato).toBe('pronta')
    // the cards copied by impronta: only the sintesi goes to Claude again
    expect(passiChiesti().filter((p) => p !== 'sintesi')).toEqual([])
    // the unchanged chats are not read again from Meta
    expect((await richiesteGrafo()).filter((p) => /^\/v26\.0\/igc_finto_/.test(p))).toEqual([])
    // the non-lead and the 13-year-old never reach Claude again
    const testo = corpi().join('\n')
    expect(testo).not.toContain('calcetto')
    expect(testo).not.toContain('13 anni')
    const ig = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)
    expect(ig!.leads.find((l) => l.username === 'giovane.finto')).toMatchObject({ minore_14: true, messages: [] })
    expect(ig!.non_leads.map((n) => n.username)).toContain('amico.finto')
  })

  it('una chat di un minore di 14 anni riletta da Meta non salva mai il testo e non va a Claude (D25)', async () => {
    const archivio = archivioDelGiro()
    const oggi = oggiRoma()
    await giro(archivio, archivio.creaEsecuzione(oggi), dip())
    const tredici = [...archivio.chat.values()].find((c) => c.username === 'giovane.finto')!
    // a failed run forced it to be read again
    archivio.metti({ ...tredici, aggiornata_il: null })
    claude.azzera()
    const id = archivio.creaEsecuzione(oggi)
    const fine = await giro(archivio, id, dip())
    expect(fine.stato).toBe('pronta')
    const dopo = archivio.chatDi('instagram', tredici.conversazione_id)!
    expect(dopo).toMatchObject({ minore_14: true, messaggi: [], codici_condivisi: [], letta_da: id })
    expect(dopo.aggiornata_il).not.toBeNull()
    expect(corpi().join('\n')).not.toContain('13 anni')
  })

  it('senza il permesso delle statistiche: l’avviso, una volta, e lo stato dei post', async () => {
    await fetch(`${grafo}/__modo?insights=senza_permesso`)
    const archivio = archivioDelGiro()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), dip())
    expect(fine.stato).toBe('pronta')
    expect(fine.avvisi.filter((a) => a === AVVISO_STATISTICHE)).toHaveLength(1)
    expect(archivio.registro.statistiche.length).toBeGreaterThan(0)
    expect(archivio.registro.statistiche.every((s) => s.statistiche.stato === 'senza_permesso' && Object.keys(s.statistiche.valori).length === 0)).toBe(true)
    const ig = leggiRecap(archivio.recap.get(`${oggiRoma()}|instagram`)?.documento)
    expect(ig!.avvisi).toContain(AVVISO_STATISTICHE)
  })

  it('un token di Instagram scaduto ferma il giro, con la sua frase e l’errore per Impostazioni', async () => {
    const archivio = archivioDelGiro()
    const scaduto: typeof fetch = async (url, init) => {
      if (String(url).includes('/v26.0/me?')) {
        return new Response(JSON.stringify({ error: { message: 'Error validating access token', code: 190 } }), { status: 400 })
      }
      return fetch(url, init)
    }
    const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), { graph: { base: grafo, attendi: subito, fetch: scaduto } })
    expect(fine).toMatchObject({ stato: 'fallita', errore: FRASI_INSIGHT.token })
    expect(archivio.registro.erroriInstagram).toEqual([FRASI_ERRORE.token])
    expect(claude.ultime()).toHaveLength(0)
  })

  it('un token della Pagina rifiutato è solo un avviso: il giro finisce e Messenger lo dice', async () => {
    const archivio = archivioDelGiro()
    const pagina: typeof fetch = async (url, init) => {
      if (new URL(String(url)).pathname.startsWith('/v23.0/')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 400 })
      }
      return fetch(url, init)
    }
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), { graph: { base: grafo, attendi: subito, fetch: pagina } })
    expect(fine.stato).toBe('pronta')
    expect(fine.avvisi).toContain(AVVISI_INSIGHT.messenger_token)
    expect(archivio.registro.erroriMessenger).toEqual([AVVISI_INSIGHT.messenger_token])
    const fb = leggiRecap(archivio.recap.get(`${oggi}|messenger`)?.documento)
    expect(fb?.avvisi).toContain(AVVISI_INSIGHT.messenger_token)
    expect(fb?.leads).toEqual([])
  })

  it('senza i partecipanti la chat esclusa si legge e si scarta in memoria: mai salvata né mandata (D5)', async () => {
    const archivio = archivioDelGiro()
    archivio.messengerToken = null
    const senzaPartecipanti: typeof fetch = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname.endsWith('/me/conversations') && (u.searchParams.get('fields') ?? '').includes('participants')) {
        return new Response(JSON.stringify({ error: { message: '(#100) Tried accessing nonexisting field (participants)', code: 100 } }), { status: 400 })
      }
      return fetch(url, init)
    }
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), { graph: { base: grafo, attendi: subito, fetch: senzaPartecipanti } })
    expect(fine.stato).toBe('pronta')
    // read (Meta did not say whose it was), then dropped
    expect(await richiesteGrafo()).toContain('/v26.0/igc_finto_escluso')
    expect([...archivio.chat.values()].some((c) => c.username === 'coachplus.app')).toBe(false)
    expect(fine.contatori.chat_escluse).toBe(1)
    expect(leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!.escluse).toBe(1)
    expect(corpi().join('\n')).not.toContain('coachplus')
  })

  it('senza la Pagina collegata non c’è il recap di Messenger', async () => {
    const archivio = archivioDelGiro()
    archivio.messengerToken = null
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), dip())
    expect(fine.stato).toBe('pronta')
    expect(archivio.recap.has(`${oggi}|messenger`)).toBe(false)
    expect(archivio.recap.has(`${oggi}|instagram`)).toBe(true)
    expect((await richiesteGrafo()).some((p) => p.startsWith('/v23.0/'))).toBe(false)
  })

  it('una chiave di Claude rifiutata ferma il giro, e le chat lette restano senza messaggi (D25)', async () => {
    const archivio = archivioDelGiro()
    const sbagliato = new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: claude.url, maxRetries: 0, timeout: TIMEOUT_TENTATIVO_MS })
    const id = archivio.creaEsecuzione(oggiRoma())
    const fine = await giro(archivio, id, { ...dip(), cliente: () => sbagliato })
    expect(fine).toMatchObject({ stato: 'fallita', errore: FRASI_INSIGHT.claude })
    const lette = [...archivio.chat.values()].filter((c) => c.letta_da === id)
    expect(lette.length).toBeGreaterThan(0)
    expect(lette.every((c) => c.messaggi.length === 0 && c.aggiornata_il === null)).toBe(true)
    expect(archivio.recap.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// With prepared chats: the reading replaced, the rest real
// ---------------------------------------------------------------------------

describe('con chat preparate', () => {
  const ADESSO = new Date()
  const ora = (oreFa: number) => new Date(ADESSO.getTime() - oreFa * 3_600_000).toISOString()

  /** A reading that stores these chats as the run's and gives the app's state. */
  function leggiCon(chats: ChatSalvata[], contesto: { agenda?: VoceAgendaApp[]; stato_lead?: StatoLeadApp[] } = {}): DipendenzePasso['leggi'] {
    return async (op) => {
      const archivio = op.archivio as ArchivioFinto
      for (const c of chats) archivio.metti({ ...c, letta_da: op.esecuzione })
      const ids = (canale: 'instagram' | 'messenger') => chats.filter((c) => c.canale === canale).map((c) => c.conversazione_id)
      const lettura = progressoLettura({
        lettura: {
          vuota: false,
          storico_da: null,
          instagram: { elencato: true, finito: true, oggi: ids('instagram') },
          messenger: { elencato: true, finito: true, oggi: ids('messenger'), stato: ids('messenger').length ? 'letto' : 'senza_token' },
          profili: true,
          contenuti: true,
          origini: true,
        },
      })
      return {
        ok: true,
        completa: true,
        progresso: { lettura },
        avvisi: [],
        contatori: { chat_instagram: ids('instagram').length, chat_messenger: ids('messenger').length, chat_escluse: 0, contenuti: 0 },
        contesto: { agenda: contesto.agenda ?? [], stato_lead: contesto.stato_lead ?? [] },
      } satisfies EsitoLettura
    }
  }

  function chat(testo: string, extra: Partial<ChatSalvata> = {}) {
    return chatFinta({ messaggi: [msg('alpha', ora(5), 'Ciao! Che obiettivo hai?'), msg('lead', ora(4), testo)], ...extra })
  }

  it('il rifiuto di una chat dà la sua scheda «analisi non disponibile» e un recap parziale', async () => {
    const archivio = new ArchivioFinto()
    const buona = chat('Vorrei perdere la pancia, ho 35 anni')
    const rifiutata = chat('Una domanda strana [[rifiuto]]')
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([buona, rifiutata]) })
    expect(fine.stato).toBe('pronta')
    const doc = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!
    expect(doc.stato).toBe('parziale')
    expect(doc.leads.find((l) => l.username === rifiutata.username)).toMatchObject({ analisi_mancante: true, status: expect.stringContaining('analisi non disponibile') })
    expect(doc.leads.find((l) => l.username === buona.username)?.analisi_mancante).toBeUndefined()
    // the card stores the refusal's code, never a text of the model
    const scheda = archivio.schede.find((s) => s.chiave === rifiutata.conversazione_id)
    expect(scheda?.dati).toEqual({ tipo: 'lead', analisi_mancante: true, motivo: 'refusal:general_harms' })
  })

  it('un link estraneo nel messaggio suggerito non arriva mai alla pagina', async () => {
    const archivio = new ArchivioFinto()
    const c = chat('Mandami qualcosa da leggere [[link-estraneo]]')
    const oggi = oggiRoma()
    await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([c]) })
    const lead = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!.leads[0]
    expect(lead.suggested_message).toBe('')
    expect(lead.next_action).toBe('Messaggio non mostrato: link diverso dal Calendly. Scrivilo a mano.')
    expect(JSON.stringify(archivio.recap.get(`${oggi}|instagram`))).not.toContain('esempio.test')
  })

  it('il post che cita il lead (post_ref) diventa la sua origine e conta nei conteggi', async () => {
    const archivio = new ArchivioFinto()
    archivio.posts = [
      postFinto('PostUnoFinto', ora(30), { didascalia: 'Un reel finto sul poco tempo.' }),
      postFinto('PostDueFinto', ora(80), { didascalia: 'Un reel finto più vecchio.' }),
    ]
    // post 2 of the context: the second most recent
    const c = chat('Ho visto il tuo video vecchio, ho 30 anni [[post-ref:2]]')
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([c]) })
    expect(fine.stato).toBe('pronta')
    expect(archivio.chatDi('instagram', c.conversazione_id)).toMatchObject({ origine_tipo: 'testo', origine_shortcode: 'PostDueFinto' })
    expect(archivio.conteggi).toEqual([
      { shortcode: 'PostDueFinto', giorno: giornoRoma(c.messaggi[0].il), dm: 1, lead_in_target: 1, call_prenotate: 0, dm_certi: 0 },
    ])
    expect(leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!.leads[0].origine).toMatchObject({ tipo: 'testo', shortcode: 'PostDueFinto' })
  })

  it('i conteggi per contenuto che non si salvano sono solo un avviso', async () => {
    const archivio = new ArchivioFinto()
    archivio.guasti.add('salvaConteggi')
    const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), { leggi: leggiCon([chat('Ciao, ho 30 anni')]) })
    expect(fine.stato).toBe('pronta')
    expect(fine.avvisi).toContain(AVVISI_INSIGHT.conteggi)
  })

  it('oltre il tetto di spesa il giro non parte e Claude non riceve niente', async () => {
    vi.stubEnv('INSIGHT_COSTO_MAX_USD', '0.01')
    const archivio = new ArchivioFinto()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), { leggi: leggiCon([chat('Ciao'), chat('Salve')]) })
    expect(fine).toMatchObject({ stato: 'fallita', errore: 'Recap non generato: troppe chat in un solo aggiornamento (2).' })
    expect(claude.ultime()).toHaveLength(0)
  })

  it('il tempo finito ripete lo stesso passo: la lettura a metà, poi l’analisi senza un minuto davanti', async () => {
    const archivio = new ArchivioFinto()
    const id = archivio.creaEsecuzione(oggiRoma())
    // the reading stops halfway: the same step again
    const meta: DipendenzePasso['leggi'] = async () => ({ ok: true, completa: false, progresso: { lettura: { profili: false } }, avvisi: [], contatori: {}, contesto: null })
    let preso = archivio.prendiPasso(id)!
    await eseguiPasso({ db: null as never, esecuzione: id, ...preso, entro: Date.now() + 240_000 }, { archivio, leggi: meta, cliente: () => client })
    expect(archivio.registro.passi.at(-1)?.prossimo).toBe('lettura')
    expect(archivio.esecuzioni.get(id)?.passo).toBe('lettura')

    // the reading completes; then the analysis with 50 seconds left starts nothing
    preso = archivio.prendiPasso(id)!
    await eseguiPasso(
      { db: null as never, esecuzione: id, ...preso, entro: Date.now() + 240_000 },
      { archivio, leggi: leggiCon([chat('Ciao, ho 40 anni')]), cliente: () => client },
    )
    expect(archivio.esecuzioni.get(id)?.passo).toBe('analisi')
    preso = archivio.prendiPasso(id)!
    await eseguiPasso({ db: null as never, esecuzione: id, ...preso, entro: Date.now() + 50_000 }, { archivio, cliente: () => client })
    expect(archivio.registro.passi.at(-1)?.prossimo).toBe('analisi')
    expect(claude.ultime()).toHaveLength(0)
    expect(archivio.blocchiSalvati.filter((b) => b.esecuzione_id === id).every((b) => b.stato === 'da_fare')).toBe(true)

    // with time again, it ends
    const fine = await giro(archivio, id, {})
    expect(fine.stato).toBe('pronta')
  })

  it('un limite di Claude dimezza la concorrenza per il resto del giro', async () => {
    vi.stubEnv('INSIGHT_CONCORRENZA', '4')
    const archivio = new ArchivioFinto()
    const chats = Array.from({ length: 12 }, (_, i) => chat(`${'Mi alleno poco. '.repeat(250)} ${i}`))
    // the first block meets Anthropic's limit (esegui.ts already waited and retried once)
    let primo = true
    const esegui = (async (op: Parameters<typeof eseguiBlocco>[0]) => {
      if (primo && op.payload.passo === 'schede') {
        primo = false
        op.alPrimoEvento?.()
        return { ok: false, errore: 'rate_limit', esito: 'da_rifare', usage: null }
      }
      return eseguiBlocco(op)
    }) as typeof eseguiBlocco
    const id = archivio.creaEsecuzione(oggiRoma())
    const fine = await giro(archivio, id, { leggi: leggiCon(chats), esegui })
    expect(fine.stato).toBe('pronta')
    expect(pianoDi(fine.progresso)?.concorrenza).toBe(2)
  })

  it('un blocco che non riesce tre volte (rete, server, limiti) dà alle sue chat la scheda segnaposto', async () => {
    const archivio = new ArchivioFinto()
    const c = chat('Ciao, ho 31 anni e poco tempo')
    let tentativi = 0
    const esegui = (async (op: Parameters<typeof eseguiBlocco>[0]) => {
      if (op.payload.passo === 'schede') {
        tentativi++
        op.alPrimoEvento?.()
        return { ok: false, errore: 'rete', esito: 'da_rifare', usage: null }
      }
      return eseguiBlocco(op)
    }) as typeof eseguiBlocco
    const oggi = oggiRoma()
    const id = archivio.creaEsecuzione(oggi)
    const fine = await giro(archivio, id, { leggi: leggiCon([c]), esegui })
    expect(fine.stato).toBe('pronta')
    // one attempt per invocation of analisi, the third gives up
    expect(tentativi).toBe(3)
    expect(archivio.registro.passi.filter((p) => p.prossimo === 'analisi')).toHaveLength(3)
    const blocco = archivio.blocchiSalvati.find((b) => b.esecuzione_id === id && b.tipo === 'schede')
    expect(blocco).toMatchObject({ stato: 'fallito', tentativi: 3, errore: 'rete' })
    const doc = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!
    expect(doc.stato).toBe('parziale')
    expect(doc.leads[0]).toMatchObject({ analisi_mancante: true })
  })

  it('una chat che una scheda precedente dice sotto i 14 anni non torna a Claude, anche dopo un giro fallito', async () => {
    const archivio = new ArchivioFinto()
    const oggi = oggiRoma()
    // a failed run had classified it (its card stays, its messages went: D25 step 5)
    const minore = chat('Sono in seconda media e voglio i muscoli', { minore_14: false })
    await archivio.salvaSchede('00000000-0000-4000-9999-000000000001', aggiungiGiorni(oggi, -1), 'instagram', [
      {
        tipo: 'lead',
        chiave: minore.conversazione_id,
        impronta: 'f'.repeat(64),
        dati: { tipo: 'lead', fascia_eta: 'sotto_14', age: '13', suggested_message: 'Grazie davvero per avermi scritto!\nTi lascio i miei contenuti gratuiti.' },
      },
    ])
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([minore]) })
    expect(fine.stato).toBe('pronta')
    expect(corpi().join('\n')).not.toContain('seconda media')
    expect(archivio.chatDi('instagram', minore.conversazione_id)).toMatchObject({ minore_14: true, messaggi: [] })
    const lead = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!.leads[0]
    expect(lead).toMatchObject({ minore_14: true, messages: [], suggested_message: 'Grazie davvero per avermi scritto!\nTi lascio i miei contenuti gratuiti.' })
  })

  it('un blocco lasciato a metà tre volte da invocazioni morte: le sue chat hanno la scheda segnaposto (C39)', async () => {
    const archivio = new ArchivioFinto()
    const c = chat('Ciao, ho 29 anni')
    const oggi = oggiRoma()
    const id = archivio.creaEsecuzione(oggi)
    // the reading, then a dead invocation left the block in_corso for the third time
    await giro(archivio, id, { leggi: leggiCon([c]) }, { passiMax: 1 })
    const blocco = archivio.blocchiSalvati.find((b) => b.esecuzione_id === id && b.tipo === 'schede')!
    Object.assign(blocco, { stato: 'in_corso', tentativi: 2 })
    const fine = await giro(archivio, id, {})
    expect(fine.stato).toBe('pronta')
    expect(blocco).toMatchObject({ stato: 'fallito', errore: 'interrotto' })
    expect(passiChiesti().filter((p) => p === 'schede')).toEqual([])
    const doc = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!
    expect(doc.leads.map((l) => [l.username, l.analisi_mancante])).toEqual([[c.username, true]])
    expect(doc.stato).toBe('parziale')
  })

  it('un non lead che non è cambiato non costa una chiamata: riprende la sua scheda', async () => {
    const archivio = new ArchivioFinto()
    const oggi = oggiRoma()
    const amico = chat('Stasera calcetto? [[non-lead]]')
    await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([amico]) })
    expect(archivio.chatDi('instagram', amico.conversazione_id)).toMatchObject({ non_lead: true, messaggi: [] })
    claude.azzera()
    // the next run finds it unchanged: the reading does not touch it
    const stessa = archivio.chatDi('instagram', amico.conversazione_id)!
    const secondo = await giro(archivio, archivio.creaEsecuzione(oggi), { leggi: leggiCon([stessa]) })
    expect(secondo.stato).toBe('pronta')
    expect(passiChiesti().filter((p) => p !== 'sintesi')).toEqual([])
    expect(leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!.non_leads.map((n) => n.username)).toEqual([amico.username])
  })

  it('l’agenda dalle call dell’app: un blocco solo, la call di un lead con un no show «a rischio»', async () => {
    const archivio = new ArchivioFinto()
    const lead = chat('Ci vediamo stasera alla call', { username: 'lead.in.agenda' })
    const voce = voceAgendaFinta({ giorno: 'oggi', programmata_il: ora(-3), username: 'lead.in.agenda', no_show_precedenti: 1 })
    const ieri = voceAgendaFinta({ giorno: 'ieri', programmata_il: ora(20), stato: 'no_show', username: 'altro.lead' })
    const oggi = oggiRoma()
    const fine = await giro(archivio, archivio.creaEsecuzione(oggi), {
      leggi: leggiCon([lead], { agenda: [voce, ieri], stato_lead: [statoFinto('lead.in.agenda')] }),
    })
    expect(fine.stato).toBe('pronta')
    expect(passiChiesti().filter((p) => p === 'agenda')).toHaveLength(1)
    const doc = leggiRecap(archivio.recap.get(`${oggi}|instagram`)?.documento)!
    expect(doc.agenda?.[0]).toMatchObject({ call_id: voce.call_id, status: 'a rischio' })
    expect(doc.show_up?.[0]).toMatchObject({ call_id: ieri.call_id, outcome: 'no-show' })
    // the lead has a call in the app: its card says so to Claude, never notes or amounts
    expect(corpi().join('\n')).not.toMatch(/importo|note_closer|closer_id/)
  })

  it('un errore del database ferma il giro con la sua frase, mai con il messaggio dell’errore', async () => {
    const archivio = new ArchivioFinto()
    archivio.guasti.add('salvaRecap')
    const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), { leggi: leggiCon([chat('Ciao, ho 33 anni')]) })
    expect(fine.stato).toBe('fallita')
    expect(eFraseInsight(fine.errore as string)).toBe(true)
    expect(fine.errore).not.toContain('guasto finto')
  })

  it('ogni fallimento finisce in insight_fallita con una frase di FRASI_INSIGHT', async () => {
    const casi: { dip: DipendenzePasso; prepara?: (a: ArchivioFinto) => void }[] = [
      { dip: {}, prepara: (a) => (a.instagramToken = null) },
      { dip: { leggi: leggiCon([chat('Ciao')]), cliente: () => new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: claude.url, maxRetries: 0 }) } },
      { dip: { leggi: leggiCon([chat('Ciao')]) }, prepara: () => vi.stubEnv('INSIGHT_COSTO_MAX_USD', '0.001') },
      { dip: { leggi: leggiCon([chat('Ciao')]) }, prepara: (a) => a.guasti.add('inserisciBlocchi' as never) },
      {
        dip: {
          leggi: leggiCon([chat('Ciao')]),
          cliente: () => {
            throw Object.assign(new Error('x'), { name: 'InsightNonConfigurato' })
          },
        },
      },
    ]
    for (const caso of casi) {
      const archivio = new ArchivioFinto()
      caso.prepara?.(archivio)
      const fine = await giro(archivio, archivio.creaEsecuzione(oggiRoma()), { graph: { base: grafo, attendi: subito }, ...caso.dip })
      expect(fine.stato).toBe('fallita')
      expect(archivio.registro.fallite.length).toBeGreaterThan(0)
      expect(archivio.registro.fallite.every(eFraseInsight)).toBe(true)
      vi.stubEnv('INSIGHT_COSTO_MAX_USD', '')
    }
  })
})

// ---------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------

describe('le frasi dell’esecuzione', () => {
  it('la frase del watchdog è la stessa nel SQL e nel codice', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('supabase/migrations/20261014090100_insight_funzioni.sql', 'utf8')
    expect(sql).toContain(`'${FRASI_INSIGHT.interrotto}'`)
  })

  it('un errore si dice per il suo tipo, mai col suo messaggio', async () => {
    const { motivoInItaliano, ErroreInsight } = await import('@/lib/insight/frasi')
    const { ErroreInstagram } = await import('@/lib/instagram/richieste')
    expect(motivoInItaliano(new ErroreInstagram('token', 'Meta API: token EAAsegreto (code 190)'))).toBe(FRASI_INSIGHT.token)
    expect(motivoInItaliano(new ErroreInstagram('limite', 'x'))).toBe(FRASI_INSIGHT.limite)
    expect(motivoInItaliano(new ErroreInsight('database'))).toBe(FRASI_INSIGHT.database)
    expect(motivoInItaliano(new Error('il testo di un DM: ciao'))).toBe(FRASI_INSIGHT.imprevisto)
    expect(motivoInItaliano('una stringa qualsiasi')).toBe(FRASI_INSIGHT.imprevisto)
    for (const f of Object.values(FRASI_INSIGHT)) {
      const frase = typeof f === 'function' ? f(3) : f
      expect(frase.length).toBeLessThanOrEqual(500)
      expect(frase).not.toMatch(/[—–]/)
    }
    expect(Object.values(AVVISI_INSIGHT).every((a) => a.length <= 500 && !/[—–]/.test(a))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The reading's own rules
// ---------------------------------------------------------------------------

describe('la lettura', () => {
  const ADESSO = new Date('2026-10-14T16:45:00.000Z')
  const QUATTORDICI = new Date(ADESSO.getTime() - 14 * 86_400_000)

  it('lo storico da Meta: 14 giorni finché insight_chat copre meno di 7 giorni, poi solo dopo giorni saltati', () => {
    // never read, or fewer than 7 days covered
    expect(inizioStorico({ adesso: ADESSO, storicoDal: null, ultimaLettura: null })).toEqual(QUATTORDICI)
    expect(inizioStorico({ adesso: ADESSO, storicoDal: '2026-10-09', ultimaLettura: '2026-10-13T16:30:00Z' })).toEqual(QUATTORDICI)
    // 7 days covered and read yesterday: only today's chats
    expect(inizioStorico({ adesso: ADESSO, storicoDal: '2026-10-08', ultimaLettura: '2026-10-13T16:50:00Z' })).toBeNull()
    // three days skipped: from the last reading, one hour before it
    expect(inizioStorico({ adesso: ADESSO, storicoDal: '2026-09-20', ultimaLettura: '2026-10-11T16:00:00Z' })).toEqual(new Date('2026-10-11T15:00:00Z'))
    // a month skipped: 14 days at most
    expect(inizioStorico({ adesso: ADESSO, storicoDal: '2026-08-01', ultimaLettura: '2026-09-01T16:00:00Z' })).toEqual(QUATTORDICI)
  })

  it('una chat salvata: senza i messaggi oltre 30 giorni, e senza nessun testo se è di un minore di 14 anni', () => {
    const vecchio = new Date(ADESSO.getTime() - 31 * 86_400_000).toISOString()
    const recente = new Date(ADESSO.getTime() - 3_600_000).toISOString()
    const letta = {
      conversazione_id: 'conv-x',
      username: 'lead.x',
      utente_id: '123',
      nome: null,
      aggiornata_il: recente,
      messaggi: [msg('lead', vecchio, 'Ciao vecchio', { codici: ['VecchioCodice'] }), msg('lead', recente, 'Ciao di oggi', { codici: ['NuovoCodice'] })],
      messaggi_letti: 2,
      completa: true,
      ultimo_da: 'lead' as const,
      ultimo_il: recente,
      calendly_inviato_il: null,
      codici_condivisi: ['VecchioCodice', 'NuovoCodice'],
    }
    const riga = rigaDaSalvare({ canale: 'instagram', chat: letta, salvata: undefined, esecuzione: 'run-1', adesso: ADESSO })
    expect(riga.messaggi.map((m) => m.testo)).toEqual(['Ciao di oggi'])
    expect(riga.codici_condivisi).toEqual(['NuovoCodice'])
    expect(riga).toMatchObject({ non_lead: false, letta_da: 'run-1', ultimo_da: 'lead', completa: true })
    // Instagram's name comes from the profile, never from here
    expect(riga).not.toHaveProperty('nome')
    const minore = rigaDaSalvare({ canale: 'instagram', chat: letta, salvata: { aggiornata_il: null, non_lead: false, minore_14: true }, esecuzione: 'run-2', adesso: ADESSO })
    expect(minore).toMatchObject({ messaggi: [], codici_condivisi: [], ultimo_il: recente, ultimo_da: 'lead', letta_da: 'run-2' })
    const fb = rigaDaSalvare({ canale: 'messenger', chat: { ...letta, username: null, nome: 'Lead Messenger' }, salvata: undefined, esecuzione: 'run-3', adesso: ADESSO })
    expect(fb.nome).toBe('Lead Messenger')
  })
})
