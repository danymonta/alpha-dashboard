// A tiny Instagram Graph API for e2e: the listing of the posts of the content
// calendar (1.33.0) without Meta. Start: node e2e/graph-finto.mjs (port 4012),
// then run the dev server with E2E_GRAPH_FINTO=http://127.0.0.1:4012 (taken
// only with ENABLE_DEV_LOGIN=true, outside production, on a loopback host:
// lib/instagram/richieste.ts, baseGraph).
//
// It answers /v26.0/me and /v26.0/me/media in two pages with the cursor (and
// a next URL, as Meta writes it, never to be followed), a pinned post on top
// older than the others, and only the token the tests put in the local Vault
// (one with "e2eFinto" in it). GET /__modo?campi=senza_didascalia makes the
// complete fields answer code 100, as Meta may do with caption and
// media_product_type on the Instagram Login; GET /__modo resets it.
// GET /__richieste says how many requests arrived and on which paths (never a
// token); GET /__azzera empties the count.
//
// The Insight (1.35.0) reads more from the same server, by version:
// - Instagram (v26.0): /me/conversations (participants and updated_time,
//   three per page with the cursor), the nested messages with the complete
//   fields, /{id} for a message, a conversation's ids or a lead's profile, and
//   /{media}/insights with the reel and feed metrics;
// - Messenger (v23.0, graph.facebook.com in production): /me (the Page),
//   /me/conversations?platform=messenger and the nested messages, with the
//   email Meta adds to every person (the reader drops it).
// The chats, all invented: one shares the reel GraphFinto02, one writes
// «ALPHA», one answers a story, one is with an excluded account
// (coachplus.app, among the four of the migration), one answers code 100 to
// the complete fields (the oldest of the day: read last), one is a friend
// ([[non-lead]]), one declares 13 years ([[eta:13]]), one 16 ([[eta:16]]), and
// one older, silent for six days (a reactivation). Their times are fixed when
// the server starts, so a chat read twice is unchanged.
// GET /__modo?scenario=insight adds «Scrivimi "ALPHA" in DM» to the caption of
// GraphFinto04; GET /__modo?insights=senza_permesso makes every insights call
// answer code 10; the parameters combine, and GET /__modo resets everything.
//
// 1.36.0 (statistics and reel analysis) adds, without changing any answer the
// others use:
// - /{media}/insights also knows the metrics of the complete step (reels:
//   ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate,
//   reposts; feed: follows, profile_visits), and answers code 100 for one
//   asked of the wrong kind of post, as Meta does;
// - GET /__modo?insights=vuoti (data: []), insights=metrica_100 (the complete
//   step answers code 100), insights=pochi_spettatori (code 10, «Not enough
//   viewers»), together with the existing insights=senza_permesso;
// - /{media}?fields=media_type,media_url,thumbnail_url,media_audio_type, with
//   the video and the cover served from this same server (/__video/<id>.mp4,
//   /__copertina/<id>.jpg, made by e2e/genera-reel-finto.mjs with ffmpeg);
//   GET /__modo?video=assente leaves media_url out, as Meta does for licensed music;
// - followers_count and media_count on /me when asked.
//
// Every post, caption, chat, name and shortcode is invented; no cover in the
// listing (the page shows the icon), so the browser never asks Instagram's CDN for one.
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'

import { generaReelFinti } from './genera-reel-finto.mjs'

const PORTA = Number(process.env.PORTA_GRAPH_FINTO ?? 4012)
const SEGNO_TOKEN_FINTO = 'e2eFinto'
const PER_PAGINA = 2
const CHAT_PER_PAGINA = 3

let modo = { campi: 'completi' }
let richieste = []

const giorno = 86_400_000
const ora = 3_600_000
/** The chats' clock: fixed at start, to the minute. */
const AVVIO = Math.floor(Date.now() / 60_000) * 60_000

/** The posts, most recent first as Meta gives them: a pinned old one on top. */
function media() {
  const adesso = Date.now()
  const post = (n, giorniFa, tipo, caption) => {
    const codice = `GraphFinto${String(n).padStart(2, '0')}`
    const reel = tipo === 'REELS'
    return {
      id: `1799000000000${String(n).padStart(4, '0')}`,
      shortcode: codice,
      permalink: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${codice}/`,
      timestamp: new Date(adesso - giorniFa * giorno).toISOString().replace('.000Z', '+0000'),
      media_type: reel ? 'VIDEO' : tipo === 'CAROUSEL' ? 'CAROUSEL_ALBUM' : 'IMAGE',
      media_product_type: reel ? 'REELS' : 'FEED',
      caption,
      like_count: 10 * n,
      comments_count: n,
      ...(reel && modo.video !== 'assente' ? { media_url: `http://127.0.0.1:${PORTA}/__video/${`1799000000000${String(n).padStart(4, '0')}`}.mp4` } : {}),
      ...(reel ? { thumbnail_url: `http://127.0.0.1:${PORTA}/__copertina/${`1799000000000${String(n).padStart(4, '0')}`}.jpg` } : {}),
    }
  }
  const tutti = [
    // pinned on top, older than the rest
    post(1, 40, 'REELS', 'Il reel fissato in cima al profilo: da dove sono partito.'),
    post(2, 1, 'REELS', 'Un reel finto di ieri per i test del calendario.'),
    post(3, 2, 'CAROUSEL', 'Un carosello finto di due giorni fa.'),
    post(4, 3, 'REELS', 'Un altro reel finto, di tre giorni fa.'),
    post(5, 4, 'IMAGE', 'Una foto finta di quattro giorni fa.'),
  ]
  if (modo.scenario === 'insight') tutti[3].caption += ' Scrivimi "ALPHA" in DM.'
  return tutti
}

const COMPLETI = new Set(['media_product_type', 'caption'])

// ---------- Instagram: the account and the chats ----------

const ACCOUNT = { username: 'alpha_finto', id: '17841400000000042' }
const istante = (ms) => new Date(ms).toISOString().replace('.000Z', '+0000')

/** The Instagram chats, each with its messages oldest first (Meta gives them newest first). */
function chatInstagram() {
  let n = 0
  const chat = (id, lead, leadId, profilo, messaggi, opzioni = {}) => ({
    id,
    lead: { username: lead, id: leadId },
    profilo,
    rifiutaCompleti: opzioni.rifiutaCompleti === true,
    messaggi: messaggi.map(([chi, oreFa, campi]) => {
      const nostro = chi === 'noi'
      const io = { username: ACCOUNT.username, id: ACCOUNT.id }
      const lui = { username: lead, id: leadId }
      return {
        id: `igm_finto_${String(++n).padStart(3, '0')}`,
        created_time: istante(AVVIO - oreFa * ora),
        from: nostro ? io : lui,
        to: { data: [nostro ? lui : io] },
        ...campi,
      }
    }),
  })
  const profilo = (name, username, follower, segue) => ({
    name,
    username,
    follower_count: follower,
    is_verified_user: false,
    is_user_follow_business: segue,
    is_business_follow_user: false,
  })
  const calendly = 'https://calendly.com/danielemontagnolo/coaching-call'
  return [
    chat('igc_finto_condivide', 'marco.finto', '17841499000000001', profilo('Marco Finto', 'marco.finto', 312, true), [
      ['lead', 5, { shares: { data: [{ link: 'https://www.instagram.com/reel/GraphFinto02/?igsh=finto' }] } }],
      ['lead', 5, { message: 'Ciao! Ho visto questo reel, come funziona il percorso?' }],
      ['noi', 4, { message: 'Ciao Marco! Grazie per avermi scritto.\nQual è il tuo obiettivo principale in questo momento?' }],
      ['lead', 3, { message: 'Vorrei perdere la pancia, ho 34 anni e lavoro tutto il giorno in ufficio.' }],
    ]),
    chat('igc_finto_sedici', 'ragazzo.finto', '17841499000000008', profilo('Ragazzo Finto', 'ragazzo.finto', 150, true), [
      ['lead', 4, { message: 'Ciao, ho 16 anni e vorrei migliorare il fisico per l’estate [[eta:16]]' }],
      ['lead', 3.5, { attachments: { data: [{ audio_data: { url: 'https://cdn.finto.invalid/vocale.mp4' } }] } }],
    ]),
    chat('igc_finto_tredici', 'giovane.finto', '17841499000000007', profilo('Giovane Finto', 'giovane.finto', 80, true), [
      ['lead', 7, { message: 'Ciao, ho 13 anni e voglio mettere su muscoli [[eta:13]]' }],
      ['noi', 6.5, { message: 'Ciao! Grazie del messaggio.' }],
      ['lead', 6, { message: 'Quanto costa?' }],
    ]),
    chat('igc_finto_parola', 'luca.finto', '17841499000000002', profilo('Luca Finto', 'luca.finto', 540, false), [
      ['lead', 8, { message: 'ALPHA' }],
      ['noi', 7.5, { message: 'Eccomi! Intanto dimmi: che obiettivo hai?' }],
      ['lead', 7.2, { message: 'Rimettermi in forma, ho 41 anni e due figli, poco tempo.' }],
      ['noi', 7, { message: `Ti capisco benissimo.\nSe ti va fissiamo una call: ${calendly}` }],
    ]),
    chat('igc_finto_amico', 'amico.finto', '17841499000000006', profilo('Amico Finto', 'amico.finto', 900, true), [
      ['lead', 9, { message: 'Fratello stasera calcetto alle 21? [[non-lead]]' }],
      ['noi', 8.8, { message: 'Ci sono!' }],
    ]),
    chat('igc_finto_storia', 'andrea.finto', '17841499000000003', profilo('Andrea Finto', 'andrea.finto', 1200, true), [
      [
        'lead',
        10,
        {
          message: 'Che bella questa routine!',
          story: { reply_to: { link: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=17900000000000001&signature=finta', id: '17900000000000001' } },
        },
      ],
      ['noi', 9.5, { message: 'Grazie Andrea! Ti alleni già a casa?' }],
      ['lead', 9.2, { is_unsupported: true }],
    ]),
    chat('igc_finto_escluso', 'coachplus.app', '17841499000000004', profilo('Coach Plus', 'coachplus.app', 5000, false), [
      ['lead', 11, { message: 'Il tuo abbonamento è stato rinnovato.' }],
    ]),
    chat(
      'igc_finto_ricchi',
      'paolo.finto',
      '17841499000000005',
      profilo('Paolo Finto', 'paolo.finto', 45, false),
      [
        ['lead', 20, { message: 'Ciao, posso avere informazioni sul percorso?' }],
        ['noi', 19, { message: 'Ciao Paolo! Certo. Quanti anni hai e che obiettivo hai?' }],
      ],
      { rifiutaCompleti: true },
    ),
    // silent for six days: a reactivation of the history
    chat('igc_finto_silenzio', 'davide.finto', '17841499000000009', profilo('Davide Finto', 'davide.finto', 230, true), [
      ['lead', 7 * 24, { message: 'Ciao, mi interessa il percorso ma ho poco tempo.' }],
      ['noi', 6 * 24 + 22, { message: 'Ciao Davide! Quanto tempo hai al giorno, più o meno?' }],
      ['noi', 6 * 24, { message: 'Hai visto il video che ti ho mandato?' }],
    ]),
  ]
    .map((c) => ({ ...c, updated_time: c.messaggi.at(-1).created_time }))
    // the inbox, most recently updated first
    .sort((a, b) => Date.parse(b.updated_time) - Date.parse(a.updated_time))
}

/** The `messages.limit(n){a,b,c}` of a request: how many, and which fields (null: not nested). */
function annidati(campi) {
  const m = /^messages\.limit\((\d+)\)\{([^}]*)\}$/.exec(campi)
  return m ? { n: Number(m[1]), campi: m[2].split(',') } : null
}

/** A message with only the fields asked for. */
function soloCampi(oggetto, campi) {
  return Object.fromEntries(Object.entries(oggetto).filter(([chiave]) => campi.includes(chiave)))
}

const INSIGHTS = new Set(['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'])
/** Only for a reel (Meta: the watch metrics are of reels) */
const INSIGHTS_REEL = new Set(['reposts', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate'])
/** Only for the feed (Meta: follows and profile_visits are of FEED and STORY) */
const INSIGHTS_FEED = new Set(['follows', 'profile_visits'])

// ---------- Messenger: the Page and its chats ----------

const PAGINA = { id: '100000000000042', name: 'Percorso Alpha (finta)' }

/** The Messenger chats: Meta adds the email of every person, the reader never keeps it. */
function chatMessenger() {
  let n = 0
  const persona = (p) => ({ name: p.name, email: `${p.id}@facebook.com`, id: p.id })
  const chat = (id, lead, messaggi) => ({
    id,
    participants: { data: [persona(lead), persona(PAGINA)] },
    messaggi: messaggi.map(([chi, oreFa, campi]) => {
      const nostro = chi === 'noi'
      return {
        id: `m_finto_${String(++n).padStart(3, '0')}`,
        created_time: istante(AVVIO - oreFa * ora),
        from: persona(nostro ? PAGINA : lead),
        to: { data: [persona(nostro ? lead : PAGINA)] },
        ...campi,
      }
    }),
  })
  return [
    chat('t_finto_01', { name: 'Giulio Finto', id: '24680135790001' }, [
      ['lead', 3, { message: 'Buongiorno, vorrei informazioni sul percorso di allenamento a casa' }],
      ['noi', 2, { message: 'Ciao Giulio! Certo.\nChe obiettivo hai?' }],
      ['lead', 1, { message: 'Perdere 10 kg, ho 38 anni' }],
    ]),
    chat('t_finto_02', { name: 'Stefano Prova', id: '24680135790002' }, [
      ['lead', 6, { attachments: { data: [{ mime_type: 'image/jpeg', image_data: { url: 'https://cdn.finto.invalid/foto.jpg' } }] } }],
      ['lead', 6, { message: 'Questa è la mia situazione adesso' }],
      ['noi', 5, { message: 'Grazie Stefano! Da quanto tempo non ti alleni?' }],
    ]),
  ]
    .map((c) => ({ ...c, updated_time: c.messaggi.at(-1).created_time }))
    .sort((a, b) => Date.parse(b.updated_time) - Date.parse(a.updated_time))
}

// ---------- the server ----------

function manda(res, corpo, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

function errore(res, code, message, status = 400) {
  manda(res, { error: { message, type: 'OAuthException', code } }, status)
}

/** A page of conversations with the cursor, and a next URL as Meta writes it (never followed). */
function paginaConversazioni(res, u, tutte, token, conPartecipanti) {
  const limite = Math.min(CHAT_PER_PAGINA, Number(u.searchParams.get('limit') ?? 50) || 50)
  const campi = (u.searchParams.get('fields') ?? '').split(',')
  const dopo = Number(u.searchParams.get('after') ?? 0)
  const pagina = tutte.slice(dopo, dopo + limite).map((c) => ({
    id: c.id,
    ...(campi.includes('updated_time') ? { updated_time: c.updated_time } : {}),
    ...(campi.includes('participants') ? { participants: conPartecipanti(c) } : {}),
  }))
  const altre = dopo + limite < tutte.length
  return manda(res, {
    data: pagina,
    paging: {
      cursors: { before: String(dopo), after: String(dopo + limite) },
      ...(altre ? { next: `http://127.0.0.1:${PORTA}/SEGUITO-NEXT?access_token=${token}` } : {}),
    },
  })
}

/** /{id} of a chat: the nested messages, or their ids. */
function messaggiDellaChat(res, chat, campi, rifiuta) {
  const nuoviPrima = [...chat.messaggi].reverse()
  const nidificati = annidati(campi)
  if (nidificati) {
    if (rifiuta(nidificati.campi)) return errore(res, 100, 'Tried accessing nonexisting field (attachments) on node type (Message)')
    return manda(res, { id: chat.id, messages: { data: nuoviPrima.slice(0, nidificati.n).map((m) => soloCampi(m, nidificati.campi)) } })
  }
  if (campi === 'messages') {
    return manda(res, { id: chat.id, messages: { data: nuoviPrima.slice(0, 20).map((m) => ({ id: m.id, created_time: m.created_time })) } })
  }
  return manda(res, { id: chat.id })
}

function instagram(res, u, percorso, token) {
  const campi = u.searchParams.get('fields') ?? ''
  if (percorso === '/me/conversations') {
    if (u.searchParams.get('platform') !== 'instagram') return errore(res, 100, 'Invalid platform')
    return paginaConversazioni(res, u, chatInstagram(), token, (c) => ({
      data: [{ username: ACCOUNT.username, id: ACCOUNT.id }, { username: c.lead.username, id: c.lead.id }],
    }))
  }

  const insights = /^\/(\d+)\/insights$/.exec(percorso)
  if (insights) {
    const post = media().find((m) => m.id === insights[1])
    if (!post) return errore(res, 100, 'Unsupported get request. Object does not exist', 404)
    if (modo.insights === 'senza_permesso') return errore(res, 10, '(#10) Application does not have permission for this action', 403)
    if (modo.insights === 'pochi_spettatori') return errore(res, 10, '(#10) Not enough viewers for the media to show insights', 400)
    const metriche = (u.searchParams.get('metric') ?? '').split(',')
    const reel = post.media_type === 'VIDEO'
    const completo = metriche.some((m) => INSIGHTS_REEL.has(m) && m !== 'reposts') || metriche.some((m) => INSIGHTS_FEED.has(m))
    if (modo.insights === 'metrica_100' && completo) {
      return errore(res, 100, '(#100) The Media Insights API does not support one of the metrics for this media')
    }
    const conosciute = new Set([...INSIGHTS, ...(reel ? INSIGHTS_REEL : INSIGHTS_FEED)])
    const sconosciuta = metriche.find((m) => !conosciute.has(m))
    if (sconosciuta) return errore(res, 100, `(#100) metric[0] must be one of the following values: ${[...conosciute].join(', ')}`)
    if (modo.insights === 'vuoti') return manda(res, { data: [] })
    const n = Number(insights[1].slice(-2))
    const valore = {
      views: 1000 * n,
      reach: 800 * n,
      saved: 10 * n,
      shares: 5 * n,
      likes: 10 * n,
      comments: n,
      total_interactions: 16 * n,
      reposts: 2 * n,
      ig_reels_avg_watch_time: 9000 + 100 * n,
      ig_reels_video_view_total_time: 3_000_000 * n,
      reels_skip_rate: 0.35,
      follows: n,
      profile_visits: 4 * n,
    }
    return manda(res, {
      data: metriche.map((nome) => ({ name: nome, period: 'lifetime', values: [{ value: valore[nome] }], title: nome, id: `${insights[1]}/insights/${nome}/lifetime` })),
    })
  }

  // one media: the video and the cover of a reel (1.36.0)
  const unMedia = /^\/(\d+)$/.exec(percorso)
  if (unMedia) {
    const post = media().find((m) => m.id === unMedia[1])
    if (post) {
      const chiesti = campi.split(',')
      return manda(res, {
        id: post.id,
        ...soloCampi(post, chiesti),
        ...(chiesti.includes('media_audio_type') && post.media_type === 'VIDEO' ? { media_audio_type: 'ORIGINAL_SOUND' } : {}),
      })
    }
  }

  const id = percorso.slice(1)
  const tutte = chatInstagram()
  const chat = tutte.find((c) => c.id === id)
  if (chat) return messaggiDellaChat(res, chat, campi, (chiesti) => chat.rifiutaCompleti && chiesti.includes('attachments'))
  for (const c of tutte) {
    const messaggio = c.messaggi.find((m) => m.id === id)
    if (!messaggio) continue
    const chiesti = campi.split(',')
    if (c.rifiutaCompleti && chiesti.includes('attachments')) return errore(res, 100, 'Tried accessing nonexisting field (attachments) on node type (Message)')
    return manda(res, soloCampi(messaggio, chiesti))
  }
  const lead = tutte.find((c) => c.lead.id === id)
  if (lead) return manda(res, { ...soloCampi(lead.profilo, campi.split(',')), id })
  return errore(res, 100, 'Unsupported get request. Object does not exist', 404)
}

function messenger(res, u, percorso, token) {
  const campi = u.searchParams.get('fields') ?? ''
  if (percorso === '/me') return manda(res, soloCampi(PAGINA, campi.split(',')))
  if (percorso === '/me/conversations') {
    if (u.searchParams.get('platform') !== 'messenger') return errore(res, 100, 'Invalid platform')
    return paginaConversazioni(res, u, chatMessenger(), token, (c) => c.participants)
  }
  const id = percorso.slice(1)
  const tutte = chatMessenger()
  const chat = tutte.find((c) => c.id === id)
  if (chat) return messaggiDellaChat(res, chat, campi, () => false)
  const messaggio = tutte.flatMap((c) => c.messaggi).find((m) => m.id === id)
  if (messaggio) return manda(res, soloCampi(messaggio, campi.split(',')))
  return errore(res, 100, 'Unsupported get request. Object does not exist', 404)
}

createServer((req, res) => {
  const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORTA}`)

  if (u.pathname === '/__richieste') return manda(res, { totale: richieste.length, percorsi: richieste })
  if (u.pathname === '/__azzera') {
    richieste = []
    return manda(res, { ok: true })
  }
  if (u.pathname === '/__modo') {
    modo = { campi: u.searchParams.get('campi') === 'senza_didascalia' ? 'senza_didascalia' : 'completi' }
    if (u.searchParams.get('scenario') === 'insight') modo.scenario = 'insight'
    const insightsModo = u.searchParams.get('insights')
    if (['senza_permesso', 'vuoti', 'metrica_100', 'pochi_spettatori'].includes(insightsModo ?? '')) modo.insights = insightsModo
    const videoModo = u.searchParams.get('video')
    if (videoModo === 'assente' || videoModo === 'non_scaricabile') modo.video = videoModo
    return manda(res, modo)
  }

  // the video and the cover of the reels (1.36.0): no token, as a CDN's signed URL has none of ours
  const file = /^\/__(video|copertina)\/(\d+)\.(mp4|jpg)$/.exec(u.pathname)
  if (file) {
    richieste.push(u.pathname)
    if (modo.video === 'non_scaricabile') {
      res.writeHead(403)
      return res.end()
    }
    const files = generaReelFinti()
    const nome = file[1] === 'copertina' ? files.copertina : Number(file[2].slice(-2)) === 4 ? files.senzaAudio : files.reel
    if (!existsSync(nome)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': file[1] === 'copertina' ? 'image/jpeg' : 'video/mp4' })
    return createReadStream(nome).pipe(res)
  }

  // the path only: never the token in what this server remembers
  richieste.push(u.pathname)
  const token = u.searchParams.get('access_token') ?? ''
  if (!token.includes(SEGNO_TOKEN_FINTO)) return errore(res, 190, 'Invalid OAuth access token')

  // Messenger's version (graph.facebook.com in production): the Page and its chats
  if (u.pathname.startsWith('/v23.0/')) return messenger(res, u, u.pathname.slice('/v23.0'.length), token)

  const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
  if (percorso === '/me') {
    const chiesti = (u.searchParams.get('fields') ?? '').split(',')
    return manda(res, {
      user_id: '17841400000000042',
      username: 'alpha_finto',
      id: 'app1',
      ...(chiesti.includes('followers_count') ? { followers_count: 12345, media_count: 214 } : {}),
    })
  }

  if (percorso === '/me/media') {
    const campi = (u.searchParams.get('fields') ?? '').split(',')
    if (modo.campi === 'senza_didascalia' && campi.some((c) => COMPLETI.has(c))) {
      return errore(res, 100, 'Tried accessing nonexisting field (caption) on node type (Media)')
    }
    const tutti = media()
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = tutti
      .slice(dopo, dopo + PER_PAGINA)
      .map((m) => Object.fromEntries(Object.entries(m).filter(([chiave]) => campi.includes(chiave))))
    const altre = dopo + PER_PAGINA < tutti.length
    return manda(res, {
      data: pagina,
      paging: {
        cursors: { before: String(dopo), after: String(dopo + PER_PAGINA) },
        ...(altre ? { next: `http://127.0.0.1:${PORTA}/SEGUITO-NEXT?access_token=${token}` } : {}),
      },
    })
  }

  return instagram(res, u, percorso, token)
}).listen(PORTA, '127.0.0.1', () => console.log(`graph finto su ${PORTA}`))
