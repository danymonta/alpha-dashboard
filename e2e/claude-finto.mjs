// A fake Anthropic Messages API for the Insight (1.35.0): the streaming
// answers of Claude Sonnet 5.5 for every step of a run (schede,
// riattivazione, agenda, sintesi, correzione), deterministic from the data
// the app sends, so the whole pipeline is testable without api.anthropic.com.
//
// Start: PORTA_CLAUDE_FINTO=6011 node e2e/claude-finto.mjs (default 4011),
// then the dev server with ANTHROPIC_API_KEY=finta
// ANTHROPIC_BASE_URL=http://127.0.0.1:6011. In Vitest: creaClaudeFinto()
// listens on a free port (tests/insight-esegui.test.ts).
//
// Scenario markers, inside the invented message texts of a chat:
//   [[rifiuto]]        stop_reason refusal (general_harms) for any request carrying it
//   [[tronca]]         a cut JSON and stop_reason max_tokens
//   [[json-rotto]]     a broken JSON with end_turn
//   [[salta]]          the chat's ref is left out of the answer
//   [[link-estraneo]]  a suggested message with https://esempio.test/offerta
//   [[429]]            the first request carrying it answers 429 (retry-after: 0)
//   [[lento]]          the answer comes after 90 s (lentoMs)
//   [[non-lead]]       the chat is not a lead
//   [[post-ref:N]]     the card cites post N of <contesto_giorno>
//   [[eta:13]] [[eta:16]]  the card's age and age band
//   [[obiezione]]      an open objection with its reply
//   [[fallback]]       a declined partial, then Claude Sonnet 5's answer (server-side fallback)
// The reel analysis (1.36.0) adds two steps, read from the same blocks: visione_reel
// (the visual card: it counts the image blocks and cites the first label) and
// analisi_reel (the analysis: the verdict it was given, the ideas asked for, the
// first candidate as the link). Markers inside the reel's caption, a transcript
// or a note:
//   [[nome]]           the answer names a person of the seed, which the final check takes out
//   [[prezzo]]         the answer quotes a price, which the final check takes out
//   [[copia-setter]]   a bullet copies the first answer of the setter from <contesto_periodo>
//   [[ref-falso]]      the link names a candidate that was never sent
//   [[etichetta-falsa]] the first idea has a Format that is not Notion's
// The key «sbagliata» answers 401.
// GET /__ultime: the last request bodies with their anthropic-beta header
// (never x-api-key). GET /__azzera empties it and the scenario state.
// Every chat is invented: never a real DM here.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const ULTIME_MAX = 50

const token = (testo) => Math.max(1, Math.ceil(String(testo).length / 4))

/** The size of a JPEG from its header (SOF), or null. */
function misureJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const m = buffer[i + 1]
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { altezza: buffer.readUInt16BE(i + 5), larghezza: buffer.readUInt16BE(i + 7) }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2
      continue
    }
    i += 2 + buffer.readUInt16BE(i + 2)
  }
  return null
}

/** A request body as /__ultime keeps it: an image block becomes its size and weight, never its bytes. */
function senzaImmagini(corpo) {
  const copia = structuredClone(corpo)
  for (const m of copia.messages ?? []) {
    if (!Array.isArray(m.content)) continue
    m.content = m.content.map((b) => {
      if (b?.type !== 'image') return b
      const dati = Buffer.from(String(b.source?.data ?? ''), 'base64')
      return { type: 'image', media_type: b.source?.media_type ?? null, byte: dati.length, ...(misureJpeg(dati) ?? {}) }
    })
  }
  return copia
}
const hash = (testo) => createHash('sha256').update(String(testo)).digest('hex').slice(0, 16)

/** The step and its data from the request: <passo>, then the JSON inside the step's tag. */
function leggiRichiesta(corpo) {
  const blocchi = (corpo.messages?.[0]?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text)
  const contesto = blocchi.find((t) => t.startsWith('<contesto_giorno>')) ?? ''
  const passo = blocchi.map((t) => /^<passo>([a-z_]+)<\/passo>/.exec(t)).find(Boolean)
  const testoDati = blocchi.find((t) => t.startsWith('<passo>')) ?? ''
  const json = /^<passo>[a-z_]+<\/passo>\n<[a-z_]+>\n([\s\S]*)\n<\/[a-z_]+>$/.exec(testoDati)?.[1] ?? '{}'
  let dati = {}
  try {
    dati = JSON.parse(json)
  } catch {
    dati = {}
  }
  let datiContesto = {}
  try {
    datiContesto = JSON.parse(/^<contesto_giorno>\n([\s\S]*)\n<\/contesto_giorno>$/.exec(contesto)?.[1] ?? '{}')
  } catch {
    datiContesto = {}
  }
  // the reel analysis's own context (1.36.0)
  const periodo = blocchi.find((t) => t.startsWith('<contesto_periodo>')) ?? ''
  let datiPeriodo = {}
  try {
    datiPeriodo = JSON.parse(/^<contesto_periodo>\n([\s\S]*)\n<\/contesto_periodo>$/.exec(periodo)?.[1] ?? '{}')
  } catch {
    datiPeriodo = {}
  }
  return { passo: passo?.[1] ?? '', dati, contesto: datiContesto, contestoPeriodo: datiPeriodo, testoContesto: contesto || periodo, testoDati }
}

const testiDi = (voce) => (voce?.messaggi ?? voce?.chat?.messaggi ?? []).map((m) => String(m.testo ?? ''))
const ha = (voce, marcatore) => testiDi(voce).some((t) => t.includes(marcatore))

/** The age a lead wrote («ho 31 anni»), or null. */
function etaScritta(voce) {
  for (const t of testiDi(voce)) {
    const m = /(\d{1,2})\s*anni/.exec(t)
    if (m) return Number(m[1])
  }
  return null
}

function scheda(voce, passo) {
  if (ha(voce, '[[non-lead]]')) return { ref: voce.ref, tipo: 'non_lead', reason: 'Account di un brand, non un lead.' }
  const leadUltimo = voce.fatti?.ultimo_da === 'lead'
  const eta13 = ha(voce, '[[eta:13]]')
  const eta16 = ha(voce, '[[eta:16]]')
  const eta = eta13 ? 13 : eta16 ? 16 : etaScritta(voce)
  const postRef = testiDi(voce)
    .map((t) => /\[\[post-ref:(\d+)\]\]/.exec(t))
    .find(Boolean)
  const target = eta === null ? 'da verificare' : eta >= 25 ? 'si' : 'no'
  let suggerito = ''
  let azione = 'Non scrivere, aspetta la sua risposta.'
  if (passo === 'riattivazione') {
    const step = voce.fatti?.step ?? 1
    suggerito =
      step === 3
        ? 'Ciao!\nTi lascio i miei contenuti gratuiti, se ti servono sono qui 🤝'
        : step === 2
          ? 'Ciao!\nTi lascio un consiglio sulla tua situazione: parti da 2 allenamenti a settimana.'
          : 'Ciao!\nSei riuscito a pensare a quello che ci siamo detti?'
    azione = 'Scrivi oggi.'
  } else if (eta13) {
    suggerito = 'Grazie davvero per avermi scritto!\nTi lascio i miei contenuti gratuiti sul profilo, lì trovi tanti spunti 💪'
    azione = 'Chiusura calorosa.'
  } else if (leadUltimo) {
    suggerito = ha(voce, '[[link-estraneo]]')
      ? 'Grazie per avermi scritto.\nGuarda qui: https://esempio.test/offerta'
      : 'Grazie per avermi scritto.\nChe obiettivo specifico stai cercando di raggiungere?'
    azione = 'Rispondi oggi.'
  }
  return {
    ref: voce.ref,
    tipo: 'lead',
    nome_dal_lead: '',
    age: eta === null ? '' : String(eta),
    fascia_eta: eta13 ? 'sotto_14' : eta16 ? '14_17' : eta === null ? 'ignota' : 'maggiorenne',
    flow: 'inbound',
    priority: leadUltimo ? 'alta' : 'media',
    target,
    stage: leadUltimo ? 'obiettivi' : 'messaggio 2',
    status: leadUltimo ? 'attende risposta' : 'in conversazione',
    situation: 'Lavora tanto e si allena poco.',
    pain: 'Non si riconosce più allo specchio.',
    next_action: azione,
    suggested_message: suggerito,
    suggested_message_alt: '',
    alt_condition: '',
    needs_dany: eta13 ? 'MINORE: chiusura verso i contenuti gratuiti.' : '',
    topics: ['poco tempo', 'pancia'],
    post_ref: postRef ? Number(postRef[1]) : null,
    no_contatto: false,
    objection: ha(voce, '[[obiezione]]')
      ? { text: 'Non ho tempo per allenarmi.', suggested_reply: 'Capisco che il tempo sia poco.\nBastano circa 2 ore a settimana.' }
      : { text: '', suggested_reply: '' },
  }
}

function rispostaSchede(dati, passo) {
  const voci = dati.chat ?? dati.candidati ?? []
  return { chat: voci.filter((v) => !ha(v, '[[salta]]')).map((v) => scheda(v, passo)) }
}

function rispostaAgenda(dati) {
  return {
    call: (dati.call ?? []).map((c) => ({
      ref: c.ref,
      status: c.no_show_precedenti > 0 ? 'a rischio' : 'promemoria da inviare',
      note: 'Promemoria del giorno.',
      suggested_message: `Ciao ${c.nome || ''}, ti scrivo al volo prima della nostra call.\nCi vediamo alle ${c.ora} 💪`,
    })),
    show_up: (dati.show_up ?? []).map((s) => ({
      ref: s.ref,
      note: s.esito === 'no-show' ? 'Non si è presentato.' : 'Call fatta.',
      suggested_message: s.esito === 'no-show' ? `Ciao ${s.nome || ''}, ieri non ci siamo visti.\nTi va di fissare un altro momento?` : '',
    })),
  }
}

function rispostaSintesi(dati) {
  const temi = dati.temi ?? []
  const meta = Math.ceil(temi.length / 2)
  const themes = [
    temi.length ? { theme: 'Tempo e costanza', insight: 'Chi scrive ha poco tempo.', topic_ids: temi.slice(0, meta).map((t) => t.id) } : null,
    temi.length > 1 ? { theme: 'Corpo allo specchio', insight: 'Il disagio viene prima dei numeri.', topic_ids: temi.slice(meta).map((t) => t.id) } : null,
  ].filter(Boolean)
  return {
    headline: `Giornata con ${dati.sommario?.conversazioni ?? 0} chat: ${dati.sommario?.lead_in_target ?? 0} lead in target.`,
    themes,
    posts: (dati.contenuti ?? []).map((p) => ({
      post_ref: p.n,
      verdict: p.in_target > 0 ? 'spingere' : 'mantenere',
      why: p.in_target > 0 ? 'Porta lead in target nei DM.' : 'Nessun lead per ora.',
    })),
    keep: ['Reel sul poco tempo: portano conversazioni.'],
    change: ['Caroselli troppo tecnici: semplificare l’hook.'],
    boost: ['Parola chiave in caption: porta DM caldi.'],
    setting_tips: ['Le domande sull’obiettivo aprono la conversazione.', 'Il vocale arriva dopo età e obiettivo.'],
    ideas: [1, 2, 3, 4, 5].map((n) => ({ hook: `Idea ${n}: 2 ore a settimana bastano`, format: 'Reel', why: 'Parole dei lead in target.' })),
    note: '',
  }
}


// ---------- the reel analysis (1.36.0) ----------

const ETICHETTE_REEL_TYPE = ['Attraction', 'Education', 'Converting', 'RADIO', 'Workshop']
const ETICHETTE_FORMAT = ['Text opinion', 'Check Caption', 'Split', 'Reaction', 'B roll', 'Green Screen', 'Raw Talking Head', 'Storytelling', 'Transformation', 'Show&Tell']

function rispostaVisione(corpo, dati) {
  const blocchi = corpo.messages?.[0]?.content ?? []
  const immagini = blocchi.filter((b) => b?.type === 'image').length
  const prima = blocchi.find((b) => b?.type === 'text' && /^(Copertina|F\d+ ·)/.test(b.text))?.text ?? ''
  const calendario = dati.calendario
  return {
    sintesi_visiva: `Il modello finto ha visto ${immagini} immagini, la prima: ${prima.replace(/:$/, '')}.`,
    gancio: {
      livello: 'medio',
      cosa_si_vede: 'Una persona a mezzo busto in casa.',
      parole: 'Niente sbarra? Nessun problema.',
      testo_a_schermo: null,
      perche: 'Promette una cosa concreta nei primi secondi.',
      alternativa: 'Ti basta un tavolo per allenare la schiena.',
    },
    sequenza: [
      { da: 0, a: 3, cosa_si_vede: 'Il gancio.', testo_a_schermo: null },
      { da: 3, a: Math.max(4, Math.min(5, dati.durata_secondi ?? 5)), cosa_si_vede: 'Il corpo.', testo_a_schermo: null },
      { da: 90, a: 95, cosa_si_vede: 'Un tratto fuori dal reel: il controllo lo scarta.', testo_a_schermo: null },
    ],
    ritmo: { livello: 'medio', osservazione: 'Scorre bene.', calo: null },
    testo_a_schermo: { leggibile: 'si', sopra_il_volto: false, osservazione: 'Si legge sul telefono.' },
    cta: { presente: true, testo: 'Salva il video.', secondo: 4, osservazione: 'Arriva presto.', proposta: 'Salvalo: stasera lo provi.' },
    produzione: { luce: 'buona', audio: 'chiaro', inquadratura: 'Fissa, mezzo busto.', osservazione: 'Pulita.' },
    ambiente: ['casa'],
    icp: { aderenza: 'media', leve_usate: ['poco tempo'], leve_mancanti: ['la schiena da scrivania'], frase_del_cliente: null, rischio: null },
    script: calendario ? { segue: 'in_parte', differenze: 'Il finale cambia.' } : null,
    classificazione: { reel_type: 'Education', format: 'Raw Talking Head' },
  }
}

function rispostaAnalisiReel(dati, testoDati, contesto) {
  const quante = dati.idee_da_proporre?.quante ?? 2
  const tipo = dati.idee_da_proporre?.tipo === 'rifacimento_o_nuovo' ? 'nuovo' : (dati.idee_da_proporre?.tipo ?? 'nuovo')
  const idee = Array.from({ length: quante }, (_, i) => ({
    tipo,
    name: `Idea finta ${i + 1} · ${hash(testoDati).slice(0, 6)}`,
    reel_type: ETICHETTE_REEL_TYPE[(i + 1) % ETICHETTE_REEL_TYPE.length],
    format: ETICHETTE_FORMAT[(i + 6) % ETICHETTE_FORMAT.length],
    gancio: `Gancio ${i + 1}: due ore a settimana bastano`,
    messaggio: `Messaggio dell'idea ${i + 1}.`,
    script: { hook: `Hook ${i + 1}: due ore a settimana bastano`, righe: ['Prima riga.', 'Seconda riga.'], cta: 'Salvalo e provalo.' },
    perche: 'Perché i numeri e i lead lo chiedono.',
  }))
  if (testoDati.includes('[[etichetta-falsa]]') && idee[0]) idee[0].format = 'Formato Inventato'
  let sintesi = `Il modello finto spiega il verdetto: ${dati.verdetto ?? 'senza verdetto'}.`
  if (testoDati.includes('[[nome]]')) sintesi += ' Come ha detto Loris Setter, funziona.'
  if (testoDati.includes('[[prezzo]]')) sintesi += ' Il percorso costa 1.500 € al mese.'
  const funzionato = ['Il gancio dice subito cosa si ottiene.']
  if (testoDati.includes('[[copia-setter]]')) {
    const testo = contesto?.commenti_setter?.testi?.[0]?.testo
    if (testo) funzionato.push(testo)
  }
  const candidato = dati.candidati?.[0]
  return {
    perche_verdetto: `Views ×${dati.numeri?.views_rapporto ?? 'n/d'} della mediana, verdetto ${dati.verdetto ?? 'assente'}.`,
    sintesi,
    cosa_ha_funzionato: funzionato,
    da_migliorare: [
      { cosa: 'La CTA arriva tardi.', come: 'Portarla prima.', priorita: 'media' },
      { cosa: 'Il testo a schermo è piccolo.', come: 'Ingrandirlo.', priorita: 'alta' },
    ],
    dai_lead: dati.lead?.contati === 'si' ? `Dai DM arrivano ${dati.lead.dm} contatti, ${dati.lead.in_target} in target.` : null,
    collegamento: testoDati.includes('[[ref-falso]]')
      ? { ref: 'C9', sicurezza: 'alta', perche: 'Un ref che non è stato mandato.' }
      : candidato
        ? { ref: candidato.ref, sicurezza: 'media', perche: 'Lo script corrisponde a quello che si vede e si dice.' }
        : null,
    idee,
  }
}

function rispostaCorrezione(dati) {
  return {
    correzioni: (dati.testi ?? []).map((t) => {
      let testo = String(t.testo ?? '')
      const primo = testo.indexOf('?')
      if (primo >= 0 && testo.indexOf('?', primo + 1) >= 0) testo = testo.slice(0, primo + 1)
      testo = testo.replace(/\bDany\b/g, 'io')
      return { ref: t.ref, campo: t.campo, testo }
    }),
  }
}

/**
 * The fake server.
 * @param {{ porta?: number, lentoMs?: number }} [opzioni]
 * @returns {Promise<{ url: string, porta: number, chiudi: () => Promise<void>, ultime: () => unknown[], azzera: () => void }>}
 */
export function creaClaudeFinto(opzioni = {}) {
  const lentoMs = opzioni.lentoMs ?? 90_000
  const ultime = []
  const cache = new Set()
  const giaLimitati = new Set()

  function scrivi(res, eventi) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': `req_finto_${hash(Math.random())}` })
    for (const [nome, dato] of eventi) res.write(`event: ${nome}\ndata: ${JSON.stringify(dato)}\n\n`)
    res.end()
  }

  function rispondi(res, corpo, { testo, stop, dettagli = null, fallback = false }) {
    const sistema = (corpo.system ?? []).map((b) => b.text).join('')
    const { testoContesto, testoDati } = leggiRichiesta(corpo)
    const chiaveSistema = hash(`${corpo.model}|${sistema}`)
    const chiaveContesto = hash(`${chiaveSistema}|${testoContesto}`)
    let scritti = 0
    let letti = 0
    for (const [chiave, n] of [
      [chiaveSistema, token(sistema)],
      [chiaveContesto, token(testoContesto)],
    ]) {
      if (cache.has(chiave)) letti += n
      else {
        cache.add(chiave)
        scritti += n
      }
    }
    const usage = { input_tokens: token(testoDati), cache_creation_input_tokens: scritti, cache_read_input_tokens: letti, output_tokens: 1 }
    const id = `msg_finto_${hash(testoDati + Math.random())}`
    const eventi = [
      ['message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: corpo.model, content: [], stop_reason: null, stop_sequence: null, usage } }],
    ]
    let indice = 0
    const blocco = (contenuto) => {
      eventi.push(['content_block_start', { type: 'content_block_start', index: indice, content_block: { type: 'text', text: '', citations: null } }])
      for (let i = 0; i < contenuto.length; i += 400) {
        eventi.push(['content_block_delta', { type: 'content_block_delta', index: indice, delta: { type: 'text_delta', text: contenuto.slice(i, i + 400) } }])
      }
      eventi.push(['content_block_stop', { type: 'content_block_stop', index: indice }])
      indice++
    }
    if (fallback) {
      // the requested model declines mid-stream: its partial stays, then the switch point
      blocco('{"chat": [{"ref"')
      eventi.push(['content_block_start', { type: 'content_block_start', index: indice, content_block: { type: 'fallback', from: { model: corpo.model }, to: { model: 'claude-sonnet-5' } } }])
      eventi.push(['content_block_stop', { type: 'content_block_stop', index: indice }])
      indice++
    }
    if (testo !== null) blocco(testo)
    const uscita = token(testo ?? '')
    const iterazioni = fallback
      ? [
          { type: 'message', input_tokens: usage.input_tokens, output_tokens: 5, cache_creation_input_tokens: scritti, cache_read_input_tokens: letti, cache_creation: null },
          { type: 'fallback_message', model: 'claude-sonnet-5', input_tokens: usage.input_tokens, output_tokens: uscita, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
        ]
      : null
    eventi.push([
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stop, stop_sequence: null, stop_details: dettagli },
        usage: { output_tokens: uscita, ...(iterazioni ? { iterations: iterazioni } : {}) },
      },
    ])
    eventi.push(['message_stop', { type: 'message_stop' }])
    scrivi(res, eventi)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/__ultime') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(ultime))
    }
    if (req.method === 'GET' && url.pathname === '/__azzera') {
      ultime.length = 0
      cache.clear()
      giaLimitati.clear()
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end('{"ok":true}')
    }
    if (req.method !== 'POST' || !url.pathname.startsWith('/v1/messages')) {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'Non trovato' } }))
    }
    let grezzo = ''
    for await (const pezzo of req) grezzo += pezzo
    let corpo
    try {
      corpo = JSON.parse(grezzo)
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'JSON non valido' } }))
    }
    ultime.push({ corpo: senzaImmagini(corpo), beta: req.headers['anthropic-beta'] ?? null, versione: req.headers['anthropic-version'] ?? null })
    if (ultime.length > ULTIME_MAX) ultime.shift()

    if (!req.headers['x-api-key'] || req.headers['x-api-key'] === 'sbagliata') {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Chiave mancante' } }))
    }

    const { passo, dati, testoDati, contestoPeriodo } = leggiRichiesta(corpo)
    if (testoDati.includes('[[429]]')) {
      const chiave = hash(testoDati)
      if (!giaLimitati.has(chiave)) {
        giaLimitati.add(chiave)
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' })
        return res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Troppe richieste' } }))
      }
    }
    if (testoDati.includes('[[lento]]')) {
      // the client may give up first (its deadline): then nothing is written
      let abbandonata = false
      await new Promise((r) => {
        const timer = setTimeout(fine, lentoMs)
        function fine() {
          clearTimeout(timer)
          res.off('close', chiusa)
          r()
        }
        function chiusa() {
          abbandonata = true
          fine()
        }
        res.on('close', chiusa)
      })
      if (abbandonata) return
    }
    if (testoDati.includes('[[rifiuto]]')) {
      return rispondi(res, corpo, { testo: null, stop: 'refusal', dettagli: { type: 'refusal', category: 'general_harms', explanation: null } })
    }
    let risposta
    if (passo === 'schede' || passo === 'riattivazione') risposta = rispostaSchede(dati, passo)
    else if (passo === 'agenda') risposta = rispostaAgenda(dati)
    else if (passo === 'sintesi') risposta = rispostaSintesi(dati)
    else if (passo === 'correzione') risposta = rispostaCorrezione(dati)
    else if (passo === 'visione_reel') risposta = rispostaVisione(corpo, dati)
    else if (passo === 'analisi_reel') risposta = rispostaAnalisiReel(dati, testoDati, contestoPeriodo)
    else risposta = {}
    const json = JSON.stringify(risposta)
    if (testoDati.includes('[[tronca]]')) return rispondi(res, corpo, { testo: json.slice(0, Math.floor(json.length / 2)), stop: 'max_tokens' })
    if (testoDati.includes('[[json-rotto]]')) return rispondi(res, corpo, { testo: `${json.slice(0, -2)},,}`, stop: 'end_turn' })
    return rispondi(res, corpo, { testo: json, stop: 'end_turn', fallback: testoDati.includes('[[fallback]]') })
  })

  return new Promise((risolvi) => {
    server.listen(opzioni.porta ?? 0, '127.0.0.1', () => {
      const indirizzo = server.address()
      const porta = typeof indirizzo === 'object' && indirizzo ? indirizzo.port : 0
      risolvi({
        url: `http://127.0.0.1:${porta}`,
        porta,
        ultime: () => ultime.map((u) => structuredClone(u)),
        azzera: () => {
          ultime.length = 0
          cache.clear()
          giaLimitati.clear()
        },
        chiudi: () =>
          new Promise((fine) => {
            server.closeAllConnections?.()
            server.close(() => fine())
          }),
      })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(process.env.PORTA_CLAUDE_FINTO ?? 4011)
  creaClaudeFinto({ porta }).then(({ url }) => console.log(`claude finto su ${url}`))
}
