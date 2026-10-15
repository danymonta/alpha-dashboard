import { aggiungiGiorni } from '@/lib/date'
import { origineCerta, origineDaShortcode } from '@/lib/insight/origine'
import { formattaOraRecap, type PostRecap, type TargetLead } from '@/lib/insight/recap'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type {
  ChatEscluse,
  ChatSalvata,
  ContaPerPost,
  PostDelRecap,
  PostInsight,
  PostPerAnalisi,
  RigaContenutiDm,
  SchedaSalvata,
  StatoLeadApp,
  VerdettoPost,
} from '@/lib/insight/contratti'

/**
 * The content side of the Insight (1.35.0): Dany's posts as Claude sees them,
 * the leads each post brought (D26, D27), the recap's posts table and the
 * 14-day themes. Pure: the same counting serves instagram_contenuti_dm (the
 * counts per post and day, which outlive the recaps) and the recap's table
 * (the last 14 days), so the two never disagree.
 *
 * A lead chat counts for a post when its origin (insight_chat.origine_*)
 * names the post; never a non-lead, an under-14 chat or an excluded chat.
 */

/** The content section's window, in Rome days, today included. */
export const GIORNI_CONTENT = 14
/** contesto_giorno lists the posts of the last 30 days, at most 30. */
export const GIORNI_POST_CONTESTO = 30
export const POST_CONTESTO_MAX = 30
/** The hook of a post: the first sentence of its caption, up to 90 characters. */
export const HOOK_MAX = 90

// ---------------------------------------------------------------------------
// Dany's posts
// ---------------------------------------------------------------------------

/** The first sentence of a caption, up to 90 characters ('' without a caption). */
export function hookDaDidascalia(didascalia: string | null | undefined): string {
  const riga = (didascalia ?? '')
    .split(/\r?\n/u)
    .map((r) => r.trim())
    .find((r) => r !== '')
  if (!riga) return ''
  const fine = /[.!?…](?=\s|$)/u.exec(riga)
  const frase = (fine ? riga.slice(0, fine.index + fine[0].length) : riga).trim()
  if ([...frase].length <= HOOK_MAX) return frase
  const tagliata = [...frase].slice(0, HOOK_MAX - 1).join('')
  const spazio = tagliata.lastIndexOf(' ')
  return `${(spazio > HOOK_MAX / 2 ? tagliata.slice(0, spazio) : tagliata).trimEnd()}…`
}

/** reel, carosello or post: the kind the card's «Arriva da» line names. */
export function tipoPostOrigine(p: Pick<PostInsight, 'reel' | 'media_type'>): PostPerAnalisi['tipo'] {
  if (p.reel) return 'reel'
  return p.media_type === 'CAROUSEL_ALBUM' ? 'carosello' : 'post'
}

/** The artifact's type column: Reel, Carosello, Foto or Video. */
export function etichettaTipoPost(p: Pick<PostInsight, 'reel' | 'media_type'>): string {
  if (p.reel) return 'Reel'
  if (p.media_type === 'CAROUSEL_ALBUM') return 'Carosello'
  return p.media_type === 'IMAGE' ? 'Foto' : 'Video'
}

/** 'GG/MM' in Europe/Rome. */
export function dataBreve(iso: string): string {
  return formattaOraRecap(iso).slice(0, 5)
}

/** A permalink for a shortcode that is not among the posts passed (an older post). */
export function permalinkDi(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/`
}

function piuRecentePrima(a: PostInsight, b: PostInsight): number {
  return Date.parse(b.pubblicato_il) - Date.parse(a.pubblicato_il) || a.shortcode.localeCompare(b.shortcode)
}

/**
 * The posts Claude sees in contesto_giorno: published from `giorno` - 29 to
 * `giorno` (Rome), the most recent first, at most 30, numbered 1, 2, … in
 * that order. A card's post_ref is one of these numbers; the code turns it
 * into the shortcode when it stores the card, so the numbers matter only
 * inside one request.
 */
export function postPerAnalisi(media: readonly PostInsight[], giorno: string): PostPerAnalisi[] {
  const dal = aggiungiGiorni(giorno, -(GIORNI_POST_CONTESTO - 1))
  return media
    .filter((p) => {
      const g = giornoRoma(p.pubblicato_il)
      return g !== null && g >= dal && g <= giorno
    })
    .sort(piuRecentePrima)
    .slice(0, POST_CONTESTO_MAX)
    .map((p, i) => ({
      indice: i + 1,
      shortcode: p.shortcode,
      data: dataBreve(p.pubblicato_il),
      tipo: tipoPostOrigine(p),
      hook: hookDaDidascalia(p.didascalia),
    }))
}

// ---------------------------------------------------------------------------
// Leads and the app's state
// ---------------------------------------------------------------------------

/** Messenger names are matched like insight_stato_lead does: lower(btrim(nome)). */
export function nomeNormalizzato(nome: string | null | undefined): string | null {
  const n = (nome ?? '').trim().toLowerCase()
  return n === '' ? null : n
}

/** The row of insight_stato_lead for a chat: by handle on Instagram, by a unique name on Messenger. */
export function statoLeadDi(
  chat: Pick<ChatSalvata, 'canale' | 'username' | 'nome'>,
  statoLead: readonly StatoLeadApp[],
): StatoLeadApp | null {
  if (chat.canale === 'instagram') {
    if (!chat.username) return null
    return statoLead.find((s) => s.per === 'username' && s.chiave === chat.username) ?? null
  }
  const nome = nomeNormalizzato(chat.nome)
  if (!nome) return null
  return statoLead.find((s) => s.per === 'nome' && s.chiave === nome) ?? null
}

function esclusa(chat: Pick<ChatSalvata, 'canale' | 'username' | 'utente_id'>, esclusi: ChatEscluse): boolean {
  if (chat.canale === 'instagram') return chat.username !== null && esclusi.instagram.has(chat.username)
  return chat.utente_id !== null && esclusi.messenger.has(chat.utente_id)
}

/** A chat that counts for the content: a lead, never a non-lead, an under-14 chat or an excluded one. */
export function contaPerContenuti(chat: ChatSalvata, esclusi: ChatEscluse): boolean {
  return !chat.non_lead && !chat.minore_14 && !esclusa(chat, esclusi)
}

/** Whether the lead of a chat has a call in the app (D27): never its follow-up calls alone. */
export function haCallNellApp(chat: ChatSalvata, statoLead: readonly StatoLeadApp[]): boolean {
  return statoLeadDi(chat, statoLead)?.ha_call === true
}

// ---------------------------------------------------------------------------
// Counts per post and day (D27)
// ---------------------------------------------------------------------------

/** The rows of instagram_contenuti_dm from `dal` to `oggi`: one per shortcode and arrival day, dm > 0 only. */
export const contaPerPost: ContaPerPost = ({ chats, statoLead, esclusi, dal, oggi }) => {
  const righe = new Map<string, RigaContenutiDm>()
  for (const chat of chats) {
    if (!contaPerContenuti(chat, esclusi)) continue
    const shortcode = chat.origine_shortcode
    const giorno = chat.origine_giorno
    if (!chat.origine_tipo || !shortcode || !giorno || giorno < dal || giorno > oggi) continue
    const chiave = `${shortcode}|${giorno}`
    const riga = righe.get(chiave) ?? { shortcode, giorno, dm: 0, lead_in_target: 0, call_prenotate: 0, dm_certi: 0 }
    riga.dm += 1
    if (chat.ultimo_target === 'si') riga.lead_in_target += 1
    if (haCallNellApp(chat, statoLead)) riga.call_prenotate += 1
    if (origineCerta({ tipo: chat.origine_tipo, shortcode })) riga.dm_certi += 1
    righe.set(chiave, riga)
  }
  return [...righe.values()].sort((a, b) => a.shortcode.localeCompare(b.shortcode) || a.giorno.localeCompare(b.giorno))
}

/** Story replies of the 14 days that no post took (Meta did not say which post the story showed). */
export function contaStorie(op: { chats: readonly ChatSalvata[]; esclusi: ChatEscluse; dal: string; oggi: string }): {
  dm: number
  target: number
} {
  let dm = 0
  let target = 0
  for (const chat of op.chats) {
    if (!contaPerContenuti(chat, op.esclusi)) continue
    if (chat.origine_tipo !== 'storia' || chat.origine_shortcode !== null) continue
    if (!chat.origine_giorno || chat.origine_giorno < op.dal || chat.origine_giorno > op.oggi) continue
    dm += 1
    if (chat.ultimo_target === 'si') target += 1
  }
  return { dm, target }
}

// ---------------------------------------------------------------------------
// The recap's posts table
// ---------------------------------------------------------------------------

/**
 * The posts of the last 14 days, plus older posts with a lead arrived in those
 * days (they must be among `media`), with the counts of contaPerPost over the
 * same 14 days. Ordered by leads in target, then DMs, then views.
 */
export const postDelRecap: PostDelRecap = ({ media, chats, statoLead, esclusi, sintesi, oggi }) => {
  const dal = aggiungiGiorni(oggi, -(GIORNI_CONTENT - 1))
  const somme = new Map<string, { dm: number; target: number; call: number }>()
  for (const r of contaPerPost({ chats, statoLead, esclusi, dal, oggi })) {
    const s = somme.get(r.shortcode) ?? { dm: 0, target: 0, call: 0 }
    s.dm += r.dm
    s.target += r.lead_in_target
    s.call += r.call_prenotate
    somme.set(r.shortcode, s)
  }
  const verdetti = new Map(sintesi.map((v) => [v.shortcode, v]))
  const visti = new Set<string>()
  const scelti = media.filter((p) => {
    if (visti.has(p.shortcode)) return false
    const g = giornoRoma(p.pubblicato_il)
    const nelPeriodo = g !== null && g >= dal && g <= oggi
    const conLead = (somme.get(p.shortcode)?.dm ?? 0) > 0
    if (!nelPeriodo && !conLead) return false
    visti.add(p.shortcode)
    return true
  })
  return scelti
    .map((p) => {
      const s = somme.get(p.shortcode) ?? { dm: 0, target: 0, call: 0 }
      const v = verdetti.get(p.shortcode)
      const riga: PostRecap & { _pubblicato: number } = {
        permalink: p.permalink,
        date: dataBreve(p.pubblicato_il),
        type: etichettaTipoPost(p),
        hook: hookDaDidascalia(p.didascalia),
        views: p.views,
        saved: p.saved,
        shares: p.shares,
        dm: s.dm,
        target: s.target,
        verdict: v?.verdict ?? null,
        why: v?.why ?? '',
        shortcode: p.shortcode,
        call: s.call,
        _pubblicato: Date.parse(p.pubblicato_il),
      }
      return riga
    })
    .sort(
      (a, b) =>
        b.target - a.target ||
        b.dm - a.dm ||
        (b.views ?? -1) - (a.views ?? -1) ||
        b._pubblicato - a._pubblicato ||
        (a.shortcode ?? '').localeCompare(b.shortcode ?? ''),
    )
    .map((riga) => {
      const { _pubblicato, ...senza } = riga
      void _pubblicato
      return senza
    })
}

// ---------------------------------------------------------------------------
// The chats as the run leaves them, and the 14-day digest
// ---------------------------------------------------------------------------

type DatiSchedaLead = {
  tipo?: unknown
  target?: unknown
  stage?: unknown
  flow?: unknown
  topics?: unknown
  fascia_eta?: unknown
  age?: unknown
  post_shortcode?: unknown
  minore_14?: unknown
  analisi_mancante?: unknown
}

function datiDi(s: SchedaSalvata): DatiSchedaLead {
  return s.dati !== null && typeof s.dati === 'object' ? (s.dati as DatiSchedaLead) : {}
}

/** The kind of a stored card for a chat: a lead, a non-lead, or nothing (an agenda card). */
export function tipoDellaScheda(s: SchedaSalvata): 'lead' | 'non_lead' | null {
  if (s.tipo === 'lead' || s.tipo === 'non_lead') return s.tipo
  if (s.tipo === 'riattivazione') return datiDi(s).tipo === 'non_lead' ? 'non_lead' : 'lead'
  return null
}

/**
 * The latest card of each chat that says what the chat is (the last one in
 * the list wins): lead and non-lead cards. A placeholder (the analysis
 * failed) says nothing and never hides an earlier card; a reactivation card
 * that says «do not reactivate» (a client, a request not to be contacted)
 * does not make the chat a non-lead.
 */
export function ultimaSchedaPerChat(schede: readonly SchedaSalvata[]): Map<string, SchedaSalvata> {
  const ultime = new Map<string, SchedaSalvata>()
  for (const s of schede) {
    const tipo = tipoDellaScheda(s)
    if (tipo === null || datiDi(s).analisi_mancante === true) continue
    if (s.tipo === 'riattivazione' && tipo === 'non_lead') continue
    ultime.set(s.chiave, s)
  }
  return ultime
}

const TARGET: readonly TargetLead[] = ['si', 'no', 'da verificare']

/** The number in an age the model wrote («25», «25 anni»), or null. */
export function numeroEta(eta: unknown): number | null {
  if (typeof eta !== 'string') return null
  const m = /(?<!\d)(\d{1,2})(?!\d)/u.exec(eta)
  return m ? Number(m[1]) : null
}

/**
 * The age the model wrote, kept only when the lead wrote it: the number, or a
 * birth year giving that age within one year, in one of his messages.
 * Otherwise ''.
 */
export function etaVerificata(eta: unknown, testiDelLead: readonly string[], anno: number): string {
  const n = numeroEta(eta)
  if (n === null || typeof eta !== 'string') return ''
  const numeri = testiDelLead.flatMap((t) => [...t.matchAll(/(?<!\d)(\d{1,4})(?!\d)/gu)].map((m) => Number(m[1])))
  const detta = numeri.some((x) => x === n || (x >= 1900 && x <= anno && Math.abs(anno - x - n) <= 1))
  return detta ? eta.trim() : ''
}

/** Under 14: the model's band, or an age the code reads below 14 (D25). */
export function sottoI14(fascia: unknown, etaLetta: string): boolean {
  if (fascia === 'sotto_14') return true
  const n = numeroEta(etaLetta)
  return n !== null && n < 14
}

/**
 * The chats as the run leaves them (what the unione step writes back to
 * insight_chat, and what the counts read): from each chat's latest card the
 * target (ultimo_target), a non-lead (non_lead), under 14 (minore_14, D25),
 * and the origin the model found (post_shortcode, D26) on a complete chat
 * still without one. A chat without a card stays as it is.
 */
export function chatEffettive(
  chat: readonly ChatSalvata[],
  schede: readonly SchedaSalvata[],
  /** Dany's posts: the origin the model found cannot be a post published after the lead's first message */
  post?: readonly Pick<PostInsight, 'shortcode' | 'pubblicato_il'>[],
): ChatSalvata[] {
  const ultime = ultimaSchedaPerChat(schede)
  return chat.map((c) => {
    const scheda = ultime.get(c.conversazione_id)
    if (!scheda) return c
    const tipo = tipoDellaScheda(scheda)
    const dati = datiDi(scheda)
    if (tipo === 'non_lead') return { ...c, non_lead: true, messaggi: [], codici_condivisi: [] }
    // the age as the model wrote it, verified or not: under 14 the precaution wins (D25)
    const minore = c.minore_14 || dati.minore_14 === true || sottoI14(dati.fascia_eta, typeof dati.age === 'string' ? dati.age : '')
    const target = TARGET.includes(dati.target as TargetLead) ? (dati.target as TargetLead) : c.ultimo_target
    let origine = {
      origine_tipo: c.origine_tipo,
      origine_shortcode: c.origine_shortcode,
      origine_il: c.origine_il,
      origine_giorno: c.origine_giorno,
    }
    if (c.origine_tipo === null && typeof dati.post_shortcode === 'string') {
      const trovata = origineDaShortcode(c, dati.post_shortcode, post)
      if (trovata) {
        origine = {
          origine_tipo: trovata.tipo,
          origine_shortcode: trovata.shortcode,
          origine_il: trovata.il,
          origine_giorno: trovata.giorno,
        }
      }
    }
    return {
      ...c,
      ...origine,
      ultimo_target: target,
      minore_14: minore,
      ...(minore ? { messaggi: [], codici_condivisi: [] } : {}),
    }
  })
}

/** One lead of the 14-day digest: its latest state, never its words. */
export type LeadDelPeriodo = {
  conversazione_id: string
  /** the Rome day of its last message */
  giorno: string
  target: TargetLead
  stage: string
  flow: string
  topics: string[]
  call: boolean
  origine: string
  /** how many messages he wrote */
  risposte: number
}

/** A topic as the strict layer leaves it: trimmed, lower case. */
export function normalizzaTema(tema: unknown): string {
  return typeof tema === 'string' ? tema.trim().replace(/\s+/gu, ' ').toLowerCase() : ''
}

/**
 * The leads of the last 14 days (the Rome day of their last message), each
 * with its latest card: the base of the themes and of the sintesi's history.
 */
export function leadDelPeriodo(op: {
  chat: readonly ChatSalvata[]
  schede: readonly SchedaSalvata[]
  statoLead: readonly StatoLeadApp[]
  oggi: string
}): LeadDelPeriodo[] {
  const dal = aggiungiGiorni(op.oggi, -(GIORNI_CONTENT - 1))
  const ultime = ultimaSchedaPerChat(op.schede)
  const out: LeadDelPeriodo[] = []
  for (const c of op.chat) {
    if (c.non_lead || c.minore_14 || !c.ultimo_il) continue
    const giorno = giornoRoma(c.ultimo_il)
    if (!giorno || giorno < dal || giorno > op.oggi) continue
    const scheda = ultime.get(c.conversazione_id)
    if (!scheda || tipoDellaScheda(scheda) !== 'lead') continue
    const dati = datiDi(scheda)
    const topics = Array.isArray(dati.topics) ? [...new Set(dati.topics.map(normalizzaTema).filter(Boolean))].slice(0, 3) : []
    const stage = typeof dati.stage === 'string' ? dati.stage : ''
    out.push({
      conversazione_id: c.conversazione_id,
      giorno,
      target: TARGET.includes(dati.target as TargetLead) ? (dati.target as TargetLead) : 'da verificare',
      stage,
      flow: typeof dati.flow === 'string' ? dati.flow : '',
      topics,
      call: haCallNellApp(c, op.statoLead) || /call prenotata/iu.test(stage),
      origine: c.origine_tipo === null ? '' : c.origine_tipo === 'storia' && !c.origine_shortcode ? 'storia' : `${c.origine_tipo}`,
      risposte: c.messaggi.filter((m) => m.da === 'lead').length,
    })
  }
  return out.sort((a, b) => b.giorno.localeCompare(a.giorno) || a.conversazione_id.localeCompare(b.conversazione_id))
}

/** A topic of the 14 days, with its id for the sintesi (t01, t02, …) and how many leads named it. */
export type TemaDelPeriodo = { id: string; tema: string; chat: number }

/** The distinct topics of the period, the most named first, then alphabetical. */
export function temiDelPeriodo(lead: readonly LeadDelPeriodo[]): TemaDelPeriodo[] {
  const conteggi = new Map<string, number>()
  for (const l of lead) for (const t of l.topics) conteggi.set(t, (conteggi.get(t) ?? 0) + 1)
  return [...conteggi.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tema, chat], i) => ({ id: `t${String(i + 1).padStart(2, '0')}`, tema, chat }))
}

/** Last 7 days against the 7 before: +20% «in crescita», -20% «in calo», otherwise «stabile». */
export function tendenza(recenti: number, precedenti: number): string {
  if (precedenti === 0) return recenti > 0 ? 'in crescita' : 'stabile'
  const variazione = (recenti - precedenti) / precedenti
  if (variazione >= 0.2) return 'in crescita'
  if (variazione <= -0.2) return 'in calo'
  return 'stabile'
}

/** A theme's numbers, from the leads that named any of its topics (code, never the model). */
export function numeriDelTema(
  temi: readonly string[],
  lead: readonly LeadDelPeriodo[],
  oggi: string,
): { count: number; target_count: number; calls: number; trend: string } {
  const cercati = new Set(temi.map(normalizzaTema).filter(Boolean))
  const del = lead.filter((l) => l.topics.some((t) => cercati.has(t)))
  const confine = aggiungiGiorni(oggi, -6)
  const recenti = del.filter((l) => l.giorno >= confine).length
  return {
    count: del.length,
    target_count: del.filter((l) => l.target === 'si').length,
    calls: del.filter((l) => l.call).length,
    trend: tendenza(recenti, del.length - recenti),
  }
}

export type { VerdettoPost }
