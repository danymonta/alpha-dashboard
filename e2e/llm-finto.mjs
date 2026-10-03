// A tiny OpenAI-compatible model for e2e: it answers Alfire's route without
// Groq, so the whole flow (tool call, confirmation, write, answer) is testable
// offline. Start: node e2e/llm-finto.mjs (port 4010), then run the dev server
// with ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1.
// It also plays the vision model (a request with an image gets a fixed
// transcription) and remembers the last requests: GET /__ultime answers
// { chat, visione }, the bodies as received (e2e/alfire-allegati.spec.ts).
import { createServer } from 'node:http'

const PORTA = Number(process.env.PORTA_LLM_FINTO ?? 4010)

// every other request for the unstable tool is refused: the first try, then the retry works
let tentativiInstabili = 0

// like Groq: every reply says the plan's tokens per minute (8K free, 250K Developer)
const TOKEN_AL_MINUTO = process.env.TOKEN_AL_MINUTO_FINTO ?? '8000'

function sse(res, chunks) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'x-ratelimit-limit-tokens': TOKEN_AL_MINUTO,
  })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

function base(delta, finish = null) {
  return {
    id: 'finto',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'finto',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
}

function testo(res, parole) {
  sse(res, [
    base({ role: 'assistant', content: '' }),
    base({ reasoning: 'Rispondo in breve.' }),
    ...parole.split(' ').map((p, i) => base({ content: (i ? ' ' : '') + p })),
    { ...base({}, 'stop'), usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
  ])
}

function rifiuto(res, messaggio, codice) {
  res.writeHead(400, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message: messaggio, type: 'invalid_request_error', code: codice } }))
}

// like Groq: a call to a tool the request did not carry is refused
let strumentiDellaRichiesta = []

// a tool call, after a few words when given (Alfire asks the question, then shows the buttons)
function chiamata(res, nome, argomenti, parole = '') {
  if (!strumentiDellaRichiesta.includes(nome)) {
    return rifiuto(
      res,
      `Tool call validation failed: tool call validation failed: attempted to call tool '${nome}' which was not in request.tools`,
      'tool_use_failed',
    )
  }
  sse(res, [
    base({ role: 'assistant', reasoning: 'Mi serve uno strumento.' }),
    ...(parole ? parole.split(' ').map((p, i) => base({ content: (i ? ' ' : '') + p })) : []),
    base({
      role: 'assistant',
      tool_calls: [{ index: 0, id: `call_${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }],
    }),
    { ...base({}, 'tool_calls'), usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
  ])
}

// e2e/alfire-bottoni.spec.ts: the closed questions and the answer each one expects
const DOMANDE = [
  {
    // the question in the text and on the buttons
    chiesta: 'quale cliente intendi',
    risposta: (scelta) => `Ecco le rate di ${scelta}: nessuna in ritardo.`,
  },
  {
    // the question only above the buttons: the route gives it back to the model as text
    chiesta: 'di quale mese vuoi i numeri',
    risposta: (scelta) => `Numeri di ${scelta}: 6.950,00 € incassati.`,
  },
]

// the text grows with the audio: a partial (the audio so far) reads fewer words than
// the whole recording, and 4 KB read exactly the question
const DETTATO = (
  'Quanto ho incassato questo mese? Dimmi anche quanto di questo viene dai rinnovi, quanto dai nuovi clienti, ' +
  'quanto devo a Loris di provvigioni, quanto mi resta di margine operativo a fine mese e quali rate mancano ' +
  'ancora da incassare entro la fine di ottobre, cliente per cliente, con le date e gli importi di ognuna, ' +
  'così domani mattina scrivo a chi deve ancora pagare e chiudo il mese con i conti in ordine'
).split(' ')
const BYTE_PER_PAROLA = 800

async function trascrizione(req, corpo) {
  const dati = await new Response(corpo, { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData()
  const audio = dati.get('file')
  const byte = typeof audio === 'object' && audio ? audio.size : 0
  return DETTATO.slice(0, Math.min(DETTATO.length, Math.max(1, Math.ceil(byte / BYTE_PER_PAROLA)))).join(' ')
}

// e2e/alfire-tempo-team.spec.ts: "quanto tempo ha tracciato Loris?", the name asked about
function personaChiesta(domanda) {
  return /ha tracciato ([a-zà-ù]+)/i.exec(domanda)?.[1] ?? ''
}

// the answer about someone's time, from what the tool read: tempo_team names each
// person; mio_tempo says whose data it is, and it is never someone else's
function rispostaTempo(strumento, esito, domanda) {
  const dati = JSON.parse(esito)
  if (strumento === 'tempo_team') {
    const [p] = dati.persone ?? []
    if (!p) return dati.nota ?? 'Nessun tempo registrato nel periodo.'
    const task = p.progetti.flatMap((g) => g.task.map((t) => t.task))
    return `${p.persona} ha registrato ${p.durata} dal ${dati.periodo.da} al ${dati.periodo.a}, su: ${task.join(', ')}.`
  }
  const chiesta = personaChiesta(domanda)
  if (chiesta && !String(dati.persona ?? '').toLowerCase().includes(chiesta.toLowerCase())) {
    const nome = chiesta[0].toUpperCase() + chiesta.slice(1)
    return `Non posso leggere il tempo di ${nome}: questi sono i dati di ${dati.persona}, cioè di chi sta chattando.`
  }
  return `Hai registrato ${dati.voci?.length ?? 0} voci.`
}

/** Yesterday in Europe/Rome, as the tools want it: AAAA-MM-GG. */
function ieriRoma() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() - 86_400_000))
}

function contenuto(m) {
  return typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(' ')
}

// e2e/alfire-allegati.spec.ts: what a photo or a scanned page "says"
const TRASCRIZIONE_FINTA = 'Ricevuta Canva E2EVISIONE: 12,99 € del 30/09/2026'

// the last requests, for the specs to check what reached the model
const ultime = { chat: null, visione: null }

function conImmagine(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'))
}

// like Groq without streaming: one JSON answer
function completamento(res, testo) {
  res.writeHead(200, { 'content-type': 'application/json', 'x-ratelimit-limit-tokens': '30000' })
  res.end(
    JSON.stringify({
      id: 'finto-visione',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'finto-visione',
      choices: [{ index: 0, message: { role: 'assistant', content: testo }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2048, completion_tokens: 20, total_tokens: 2068 },
    }),
  )
}

// the text of the attachments in the user's message, between the markers of the route
function allegatiDi(testo) {
  return [...testo.matchAll(/\[Allegato «([^»]+)»[^\n]*\]\n(?:Contenuto del file[^\n]*\n)?([\s\S]*?)\n\[Fine allegato rif\. [0-9a-f]{8}\]/g)].map(
    (m) => ({ nome: m[1], testo: m[2] }),
  )
}

createServer(async (req, res) => {
  const pezzi = []
  for await (const pezzo of req) pezzi.push(pezzo)
  const grezzo = Buffer.concat(pezzi)
  const corpo = grezzo.toString()

  if (req.method === 'GET' && req.url === '/__ultime') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(ultime))
    return
  }
  if (req.url?.endsWith('/audio/transcriptions')) {
    const text = await trascrizione(req, grezzo)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ text }))
    return
  }
  if (!req.url?.endsWith('/chat/completions')) {
    res.writeHead(404).end()
    return
  }

  const richiesta = JSON.parse(corpo || '{}')
  const { messages = [], tools = [] } = richiesta
  // the vision model: an image in, a transcription out (no streaming)
  if (conImmagine(messages)) {
    ultime.visione = richiesta
    return completamento(res, TRASCRIZIONE_FINTA)
  }
  ultime.chat = richiesta
  strumentiDellaRichiesta = tools.map((t) => t.function?.name)
  // like Groq: reasoning sent back on an assistant message is refused
  const conRagionamento = messages.findIndex((m) => m.role === 'assistant' && 'reasoning_content' in m)
  if (conRagionamento >= 0) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        error: {
          message: `'messages.${conRagionamento}' : property 'reasoning_content' is unsupported`,
          type: 'invalid_request_error',
        },
      }),
    )
    return
  }
  const ultimo = messages.at(-1) ?? {}
  const ultimaDomanda = contenuto(messages.filter((m) => m.role === 'user').at(-1) ?? {}).toLowerCase()
  if (ultimo.role === 'tool') {
    // the model reads and then stops without a word (Dany's chat of 29/09/2026)
    if (messages.some((m) => m.role === 'user' && contenuto(m).toLowerCase().includes('leggi e taci'))) return testo(res, '')
    // follow-up buttons and not a word of answer: the chat must still offer "Riprova"
    if (ultimaDomanda.includes('solo bottoni')) {
      return chiamata(res, 'proponi_risposte', {
        tipo: 'seguito',
        opzioni: ['Chi è in ritardo con i pagamenti?', 'Quanto devo in provvigioni?'],
      })
    }
    // an answer, then a few follow-up questions as buttons
    if (ultimaDomanda.includes('andato il mese')) {
      return chiamata(
        res,
        'proponi_risposte',
        { tipo: 'seguito', opzioni: ['Chi è in ritardo con i pagamenti?', 'Quanto devo in provvigioni?'] },
        'Il mese va bene: 6.950,00 € incassati.',
      )
    }
    const esito = contenuto(ultimo)
    const strumento = String(ultimo.tool_call_id ?? '').replace('call_', '')
    if (esito.includes('"errore"')) return testo(res, `Errore: ${esito}`)
    // the card sent back a target that is not unique (anteprimaAlfire): ask which one
    if (esito.startsWith('Più ')) return testo(res, `Quale intendi? ${esito}`)
    if (strumento === 'tempo_team' || strumento === 'mio_tempo') return testo(res, rispostaTempo(strumento, esito, ultimaDomanda))
    return testo(res, esito.includes('"fatto":true') ? `Fatto: ${strumento}.` : 'Questo mese hai incassato 6.950,00 €.')
  }
  const domanda = contenuto(ultimo).toLowerCase()
  // e2e/alfire-allegati.spec.ts: files attached to the question, read back from the request
  const allegati = ultimo.role === 'user' ? allegatiDi(contenuto(ultimo)) : []
  if (allegati.length > 0) {
    const tutto = allegati.map((a) => a.testo).join('\n')
    // the user's own words: after the last file
    const parole = domanda.split(/\[fine allegato rif\. [0-9a-f]{8}\]/).at(-1)
    // a naive model obeys what a file says: the route must not give it the means (free plan: no write tools)
    if (/ignora le regole/i.test(tutto)) return chiamata(res, 'cliente', { azione: 'elimina', cliente: 'E2EAllegati Vittima' })
    if (parole.includes('seconda rata')) {
      const riga = tutto.split('\n').find((r) => /seconda rata/i.test(r))
      return testo(res, riga ? `Dal file: ${riga}` : 'Nel file non trovo la seconda rata.')
    }
    if (parole.includes('foto')) return testo(res, `Nella foto: ${tutto.split('\n')[0]}`)
    return testo(res, `Ho letto ${allegati.map((a) => a.nome).join(', ')}.`)
  }
  // the user answered a closed question (a tap or typed): the model knows what it asked
  const precedente = contenuto(messages.at(-2) ?? {}).toLowerCase()
  if (ultimo.role === 'user' && messages.at(-2)?.role === 'assistant') {
    const chiusa = DOMANDE.find((d) => precedente.includes(d.chiesta))
    if (chiusa) return testo(res, chiusa.risposta(contenuto(ultimo).trim()))
    // the category of a cost, then the write with its card
    if (precedente.includes('di che categoria')) {
      return chiamata(res, 'costo', {
        azione: 'registra',
        descrizione: 'E2EAlfire Figma',
        importo: 15,
        categoria: domanda.trim(),
        ricorrente: false,
      })
    }
  }
  // e2e/alfire-bottoni.spec.ts: closed questions with buttons, and follow-ups
  if (domanda.includes('rate di rossi')) {
    return chiamata(
      res,
      'proponi_risposte',
      { tipo: 'scelta', domanda: 'Quale cliente intendi?', opzioni: ['Mario Rossi', 'Luca Rossi'] },
      'Ho trovato due clienti Rossi: quale cliente intendi?',
    )
  }
  if (domanda.includes('numeri di un mese')) {
    return chiamata(res, 'proponi_risposte', {
      tipo: 'scelta',
      domanda: 'Di quale mese vuoi i numeri?',
      opzioni: ['Settembre 2026', 'Agosto 2026'],
    })
  }
  if (domanda.includes('spesa di figma')) {
    return chiamata(
      res,
      'proponi_risposte',
      { tipo: 'scelta', domanda: 'Di che categoria è la spesa?', opzioni: ['Software', 'Formazione'] },
      'Di che categoria è la spesa?',
    )
  }
  // e2e/alfire-tempo-team.spec.ts: someone else's time. The admin has tempo_team; anyone
  // else only his own mio_tempo, as the model did on 30/09/2026 (the answer must see whose it is)
  if (domanda.includes('ha tracciato')) {
    if (strumentiDellaRichiesta.includes('tempo_team')) {
      return chiamata(res, 'tempo_team', { persona: personaChiesta(domanda), ultimi_giorni: 7 })
    }
    return chiamata(res, 'mio_tempo', { ultimi_giorni: 7 })
  }
  // e2e/alfire-tempo-coach.spec.ts: a coach tracks his time on a client's project, the
  // project said by the client's name and the task in his own words
  const timer = /^avvia il timer su (.+?), (.+)$/.exec(domanda.trim())
  if (timer) return chiamata(res, 'tempo', { azione: 'avvia', progetto: timer[1], task: timer[2] })
  const ferma = /^ferma il timer: (.+)$/.exec(domanda.trim())
  if (ferma) return chiamata(res, 'tempo', { azione: 'ferma', nota: ferma[1] })
  const fascia = /^registra ieri dalle 9 alle 10:30 su (.+?), (.+)$/.exec(domanda.trim())
  if (fascia) {
    return chiamata(res, 'tempo', { azione: 'registra', progetto: fascia[1], task: fascia[2], data: ieriRoma(), dalle: '09:00', alle: '10:30' })
  }
  if (domanda.includes('andato il mese')) return chiamata(res, 'numeri_periodo', {})
  if (domanda.includes('chi è in ritardo')) return testo(res, 'Nessuno è in ritardo con i pagamenti.')
  // a tool call Groq refuses once ("failed_generation"): asked again, it comes out right
  if (domanda.includes('strumento instabile') && tentativiInstabili++ % 2 === 0) {
    return rifiuto(res, "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.", 'tool_use_failed')
  }
  // e2e/alfire-agente.spec.ts: one entity tool, one action each
  if (domanda.includes('elimina il cliente e2ealfire doppio')) {
    return chiamata(res, 'cliente', { azione: 'elimina', cliente: 'E2EAlfire Doppio' })
  }
  if (domanda.includes('elimina il cliente')) {
    return chiamata(res, 'cliente', { azione: 'elimina', cliente: 'E2EAlfire Cancellabile' })
  }
  if (domanda.includes('aggiungi una rata')) {
    const scadenza = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    return chiamata(res, 'rata', { azione: 'aggiungi', cliente: 'E2EAlfire Rata Incassi', scadenza, importo: 300 })
  }
  if (domanda.includes('sposta il lead')) {
    return chiamata(res, 'lead', { azione: 'stato', lead: 'E2EAlfire Neri', stato: 'follow_up' })
  }
  if (domanda.includes('costo') || domanda.includes('canva') || domanda.includes('strumento instabile')) {
    return chiamata(res, 'costo', {
      azione: 'registra',
      descrizione: 'E2EAlfire Canva',
      importo: 12.99,
      categoria: 'software',
      ricorrente: false,
    })
  }
  if (domanda.includes('vendita')) {
    const oggi = new Date().toISOString().slice(0, 10)
    return chiamata(res, 'registra_vendita', {
      cliente: 'E2EAlfire Loris Presti',
      tipo: 'nuovo',
      prodotto: 'Annuale E2E',
      valore: 2500,
      data_vendita: oggi,
      data_inizio: oggi,
      durata_mesi: 12,
      rate: [{ scadenza: oggi, importo: 2500, incassata_il: oggi, metodo: 'contanti' }],
      setter: 'io',
      closer: 'io',
      fonte: 'referral',
      instagram_handle: 'loris_e2e',
    })
  }
  if (domanda.includes('telefono')) {
    return chiamata(res, 'cliente', { azione: 'modifica', cliente: 'E2EAlfire Loris Presti', telefono: '+39 333 000 0000' })
  }
  if (domanda.includes('incassato') || domanda.includes('leggi e taci')) return chiamata(res, 'numeri_periodo', {})
  return testo(res, 'Ciao, sono Alfire.')
}).listen(PORTA, '127.0.0.1', () => console.log(`llm finto su ${PORTA}`))
