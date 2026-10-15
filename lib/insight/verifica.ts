import { normalizzaTema } from '@/lib/insight/contenuti'
import type { FasciaEta, VerdettoPost } from '@/lib/insight/contratti'
import type { CampoCorrezione, DatiBlocco, ListaVoci } from '@/lib/insight/prompt/dati'
import type { TargetLead } from '@/lib/insight/recap'
import type { RisultatoAgenda, RisultatoCorrezioni, RisultatoSchede, RisultatoSintesi, SchedaLeadModello } from '@/lib/insight/schema'

/**
 * The strict layer of the Insight (1.35.0): what structured outputs cannot
 * say, checked on an answer that already passed its schema. Every element
 * must carry a ref the block issued, once; the rest is sliced and cleaned:
 * an alternative message without its condition is dropped, at most 3 topics
 * (trimmed, lower case), a post_ref that is not a post of the context (or on
 * a chat whose origin code already knows) becomes null, at most 4 setting
 * tips, a theme without a known topic goes. The refs the answer forgot come
 * back as `mancanti`: they run again once, then get a placeholder card.
 *
 * Also the shapes of insight_schede.dati, the cards as they are stored:
 * Claude's fields, with post_ref already turned into the post's shortcode.
 */

// ---------------------------------------------------------------------------
// The stored cards (insight_schede.dati)
// ---------------------------------------------------------------------------

export type DatiSchedaLead = {
  tipo: 'lead'
  nome_dal_lead: string
  age: string
  fascia_eta: FasciaEta
  flow: 'inbound' | 'outbound'
  priority: 'alta' | 'media' | 'bassa'
  target: TargetLead
  stage: string
  status: string
  situation: string
  pain: string
  next_action: string
  suggested_message: string
  suggested_message_alt: string
  alt_condition: string
  needs_dany: string
  topics: string[]
  /** the post Claude says the lead cites (D26), from its post_ref; null otherwise */
  post_shortcode: string | null
  no_contatto: boolean
  objection: { text: string; suggested_reply: string }
}

export type DatiSchedaNonLead = { tipo: 'non_lead'; reason: string }

/**
 * A chat whose analysis failed (refusal, broken answer, block given up): a
 * placeholder card, never invented content (unione.ts shows «analisi non
 * disponibile»). `motivo` is an error code, never a model's text.
 */
export type DatiSchedaMancante = { tipo: 'lead'; analisi_mancante: true; motivo: string }

/**
 * An under-14 chat after the run that classified it (D25 step 4): Claude
 * never receives it again, its card is built by code with the last warm
 * closure the model suggested for that chat, if any.
 */
export type DatiSchedaMinore = { tipo: 'lead'; minore_14: true; ultima_chiusura: string }

export type DatiScheda = DatiSchedaLead | DatiSchedaNonLead | DatiSchedaMancante | DatiSchedaMinore

export type DatiAgenda = {
  status: RisultatoAgenda['call'][number]['status']
  note: string
  suggested_message: string
  /** code: the lead's chat is a Messenger chat (its PSID) */
  user_id: string | null
}

export type DatiShowUp = { note: string; suggested_message: string }

/** An element of an answer, back on its code key. */
export type VoceVerificata<T> = { ref: string; chiave: string; dati: T }

export type EsitoVerifica<T> = {
  voci: VoceVerificata<T>[]
  /** refs of the block the answer did not give */
  mancanti: string[]
  /** elements dropped: an unknown ref, or a ref given twice */
  scartati: number
}

// ---------------------------------------------------------------------------

const pulito = (s: string) => s.trim()

function vociDi(dati: Pick<DatiBlocco, 'voci'>, liste: readonly ListaVoci[]) {
  return new Map(dati.voci.filter((v) => liste.includes(v.lista)).map((v) => [v.ref, v]))
}

/** Topics as the counts want them: trimmed, lower case, distinct, at most 3. */
export function pulisciTemi(temi: readonly string[]): string[] {
  return [...new Set(temi.map(normalizzaTema).filter(Boolean))].slice(0, 3)
}

function schedaLead(s: SchedaLeadModello, post: Record<string, string>, origineNota: boolean): DatiSchedaLead {
  const alt = pulito(s.suggested_message_alt)
  const condizione = pulito(s.alt_condition)
  const conAlt = alt !== '' && condizione !== ''
  const testoObiezione = pulito(s.objection.text)
  const postRef = s.post_ref
  const shortcode =
    !origineNota && postRef !== null && Number.isInteger(postRef) ? (post[String(postRef)] ?? null) : null
  return {
    tipo: 'lead',
    nome_dal_lead: pulito(s.nome_dal_lead),
    age: pulito(s.age),
    fascia_eta: s.fascia_eta,
    flow: s.flow,
    priority: s.priority,
    target: s.target,
    stage: s.stage,
    status: pulito(s.status),
    situation: pulito(s.situation),
    pain: pulito(s.pain),
    next_action: pulito(s.next_action),
    suggested_message: pulito(s.suggested_message),
    suggested_message_alt: conAlt ? alt : '',
    alt_condition: conAlt ? condizione : '',
    needs_dany: pulito(s.needs_dany),
    topics: pulisciTemi(s.topics),
    post_shortcode: shortcode,
    no_contatto: s.no_contatto,
    objection: testoObiezione
      ? { text: testoObiezione, suggested_reply: pulito(s.objection.suggested_reply) }
      : { text: '', suggested_reply: '' },
  }
}

/** schede and riattivazione: one card per chat of the block. */
export function verificaSchede(
  r: RisultatoSchede,
  dati: Pick<DatiBlocco, 'voci' | 'post'>,
): EsitoVerifica<DatiSchedaLead | DatiSchedaNonLead> {
  const attese = vociDi(dati, ['chat', 'candidati'])
  const visti = new Set<string>()
  const voci: VoceVerificata<DatiSchedaLead | DatiSchedaNonLead>[] = []
  let scartati = 0
  for (const s of r.chat) {
    const voce = attese.get(s.ref)
    if (!voce || visti.has(s.ref)) {
      scartati++
      continue
    }
    visti.add(s.ref)
    const scheda =
      s.tipo === 'non_lead'
        ? ({ tipo: 'non_lead', reason: pulito(s.reason) } satisfies DatiSchedaNonLead)
        : schedaLead(s, dati.post ?? {}, voce.meta?.origine_nota === true)
    voci.push({ ref: s.ref, chiave: voce.chiave, dati: scheda })
  }
  return { voci, mancanti: [...attese.keys()].filter((ref) => !visti.has(ref)), scartati }
}

/** agenda: the calls of today and tomorrow (a01…) and yesterday's (s01…). */
export function verificaAgenda(
  r: RisultatoAgenda,
  dati: Pick<DatiBlocco, 'voci'>,
): { call: EsitoVerifica<DatiAgenda>; show_up: EsitoVerifica<DatiShowUp> } {
  const call = vociDi(dati, ['call'])
  const ieri = vociDi(dati, ['show_up'])
  const vistiCall = new Set<string>()
  const vistiIeri = new Set<string>()
  const esitoCall: EsitoVerifica<DatiAgenda> = { voci: [], mancanti: [], scartati: 0 }
  const esitoIeri: EsitoVerifica<DatiShowUp> = { voci: [], mancanti: [], scartati: 0 }
  for (const c of r.call) {
    const voce = call.get(c.ref)
    if (!voce || vistiCall.has(c.ref)) {
      esitoCall.scartati++
      continue
    }
    vistiCall.add(c.ref)
    esitoCall.voci.push({
      ref: c.ref,
      chiave: voce.chiave,
      dati: {
        status: c.status,
        note: pulito(c.note),
        suggested_message: pulito(c.suggested_message),
        user_id: voce.meta?.messenger_user_id ?? null,
      },
    })
  }
  for (const s of r.show_up) {
    const voce = ieri.get(s.ref)
    if (!voce || vistiIeri.has(s.ref)) {
      esitoIeri.scartati++
      continue
    }
    vistiIeri.add(s.ref)
    esitoIeri.voci.push({ ref: s.ref, chiave: voce.chiave, dati: { note: pulito(s.note), suggested_message: pulito(s.suggested_message) } })
  }
  esitoCall.mancanti = [...call.keys()].filter((ref) => !vistiCall.has(ref))
  esitoIeri.mancanti = [...ieri.keys()].filter((ref) => !vistiIeri.has(ref))
  return { call: esitoCall, show_up: esitoIeri }
}

/** The sintesi as unione.ts reads it: topic ids turned into topics, post refs into shortcodes. */
export type SintesiVerificata = {
  headline: string
  themes: { theme: string; insight: string; temi: string[] }[]
  posts: VerdettoPost[]
  keep: string[]
  change: string[]
  boost: string[]
  setting_tips: string[]
  ideas: { hook: string; format: string; why: string }[]
  note: string
}

export const IDEE_MINIME = 5
export const CONSIGLI_SETTING_MAX = 4

const elencoPulito = (v: readonly string[]) => v.map(pulito).filter(Boolean)

export function verificaSintesi(
  r: RisultatoSintesi,
  dati: Pick<DatiBlocco, 'temi' | 'post'>,
): { sintesi: SintesiVerificata; pocheIdee: boolean } {
  const temi = dati.temi ?? {}
  const post = dati.post ?? {}
  const themes = r.themes.flatMap((t) => {
    const ids = [...new Set(t.topic_ids.map(pulito))].filter((id) => temi[id] !== undefined)
    const theme = pulito(t.theme)
    return theme && ids.length ? [{ theme, insight: pulito(t.insight), temi: ids.map((id) => temi[id]) }] : []
  })
  const visti = new Set<string>()
  const posts = r.posts.flatMap((p) => {
    const shortcode = Number.isInteger(p.post_ref) ? post[String(p.post_ref)] : undefined
    if (!shortcode || visti.has(shortcode)) return []
    visti.add(shortcode)
    return [{ shortcode, verdict: p.verdict, why: pulito(p.why) }]
  })
  const ideas = r.ideas
    .map((i) => ({ hook: pulito(i.hook), format: pulito(i.format), why: pulito(i.why) }))
    .filter((i) => i.hook !== '')
  return {
    sintesi: {
      headline: pulito(r.headline),
      themes,
      posts,
      keep: elencoPulito(r.keep),
      change: elencoPulito(r.change),
      boost: elencoPulito(r.boost),
      setting_tips: elencoPulito(r.setting_tips).slice(0, CONSIGLI_SETTING_MAX),
      ideas,
      note: pulito(r.note),
    },
    pocheIdee: ideas.length < IDEE_MINIME,
  }
}

/** A corrected text, back on the card it belongs to. */
export type Correzione = { tipo: 'lead' | 'riattivazione' | 'agenda' | 'show_up' | 'non_lead'; chiave: string; campo: CampoCorrezione; testo: string }

export function verificaCorrezioni(r: RisultatoCorrezioni, dati: Pick<DatiBlocco, 'voci'>): EsitoVerifica<Correzione> {
  const attese = vociDi(dati, ['testi'])
  const visti = new Set<string>()
  const voci: VoceVerificata<Correzione>[] = []
  let scartati = 0
  for (const c of r.correzioni) {
    const voce = attese.get(c.ref)
    const dove = voce?.meta?.correzione
    if (!voce || !dove || visti.has(c.ref) || dove.campo !== c.campo) {
      scartati++
      continue
    }
    visti.add(c.ref)
    voci.push({ ref: c.ref, chiave: voce.chiave, dati: { tipo: dove.tipo, chiave: dove.chiave, campo: dove.campo, testo: pulito(c.testo) } })
  }
  return { voci, mancanti: [...attese.keys()].filter((ref) => !visti.has(ref)), scartati }
}
