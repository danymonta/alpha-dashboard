import { aggiungiGiorni } from '@/lib/date'
import {
  chatEffettive,
  contaStorie,
  dataBreve,
  etaVerificata,
  GIORNI_CONTENT,
  hookDaDidascalia,
  leadDelPeriodo,
  nomeNormalizzato,
  numeriDelTema,
  permalinkDi,
  postDelRecap,
  statoLeadDi,
  tipoPostOrigine,
} from '@/lib/insight/contenuti'
import type {
  CandidatoRiattivazione,
  ChatEscluse,
  ChatSalvata,
  PostInsight,
  SchedaSalvata,
  UniscRecap,
  VoceAgendaApp,
} from '@/lib/insight/contratti'
import { controllaMessaggio, messaggioNonMostrato, oscuraNomi, type ContestoMessaggio } from '@/lib/insight/controllo-finale'
import { attendeRisposta, FILTRI } from '@/lib/insight/filtri'
import { haParolaChiave, paroleChiave, PRIMI_MESSAGGI_LEAD } from '@/lib/insight/origine'
import { chatDellaCall, esitoShowUp, oraRoma } from '@/lib/insight/prompt/dati'
import {
  formattaOraRecap,
  RECAP_MAX_BYTE,
  type AgendaRecap,
  type DaChi,
  type LeadRecap,
  type MessaggioRecap,
  type NonLeadRecap,
  type ObiezioneRecap,
  type OrigineRecap,
  type PrioritaLead,
  type RecapCanale,
  type RiattivazioneRecap,
  type ShowUpRecap,
  type TemaRecap,
} from '@/lib/insight/recap'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type { DatiAgenda, DatiSchedaLead, DatiShowUp, SintesiVerificata } from '@/lib/insight/verifica'

/**
 * The recap document of one Rome day and channel (1.35.0, CLAUDE.md section
 * 29), the artifact "Recap DM Alpha"'s keys plus the additive ones. Identity,
 * messages (each with `at`), times, the summary, the counts, the trend,
 * origins and `source`, the posts table, the placeholders, the minors (D25),
 * the status prefix (D8) and the lost count with «uscita» (D9) come only from
 * code; Claude's cards give the rest, after the final check
 * (controllo-finale.ts).
 *
 * The chats of a run's document:
 * - leads and non_leads: the chats of the channel with a card of this run
 *   (`schede`, types lead and non_lead: Claude's, a copy by impronta, a
 *   placeholder of a failed analysis, or the card of an under-14 chat);
 * - reactivate: the candidates with a riattivazione card;
 * - agenda and show_up (Instagram document only): the app's calls
 *   (contesto.agenda), with the agenda block's cards.
 *
 * `chat` may hold both channels, and for the Instagram document it should:
 * the leads are the channel's, while the posts table counts both (as
 * instagram_contenuti_dm does) and an agenda call finds its lead's chat in
 * either (by handle, or by the one Messenger chat with that name; without
 * one its status stays «da verificare»).
 * Pure: no I/O, no clock.
 */

export const SITUAZIONE_MINORE = 'Minore sotto i 14 anni.'
export const SERVE_DANY_MINORE = 'Minore sotto i 14 anni: chiusura calorosa e flag a Dany, come da istruzioni setter.'
export const AZIONE_MINORE = 'Chiusura calorosa verso i contenuti gratuiti, nessun altro contatto.'
export const MOTIVO_MINORE_CHIUSO = 'Minore sotto i 14 anni: chiusa verso i contenuti gratuiti'
export const STATO_MINORE = 'minore sotto i 14 anni'
export const STATO_SEGNAPOSTO = 'analisi non disponibile'
export const AZIONE_SEGNAPOSTO = 'Apri la chat: questa conversazione non è stata analizzata.'
export const PREFISSO_ATTESA = 'attende risposta · '
/** Low-priority and reactivation leads keep their last 8 messages when a document is too large. */
export const MESSAGGI_RIDOTTI = 8

export const AVVISI_UNIONE = {
  parziale: (n: number) => `Recap parziale: ${n} ${n === 1 ? 'chat non analizzata' : 'chat non analizzate'}. Le trovi con "analisi non disponibile".`,
  sintesi: 'Content non generato: la sintesi non è riuscita. Riprova con "Aggiorna dati".',
  agenda: 'Agenda senza promemoria: le call ci sono, i messaggi suggeriti no.',
  riattivazione: 'Lead da riattivare non analizzati: riprova con "Aggiorna dati".',
  ridotto: `Recap ridotto: per stare nei 400 KB le chat a priorità bassa e da riattivare mostrano solo gli ultimi ${MESSAGGI_RIDOTTI} messaggi.`,
} as const

/** uniscRecap's options beyond the contract: both optional. */
export type OpUnione = Parameters<UniscRecap>[0] & {
  /** the latest card of each chat from earlier runs of the last 14 days, oldest first: the digest of the themes */
  schedeStoriche?: readonly SchedaSalvata[]
  /** the chats the settings leave out: never counted in the posts table (they are not stored anyway) */
  esclusi?: ChatEscluse
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

type DatiCard = Record<string, unknown>

function datiCard(s: SchedaSalvata | undefined): DatiCard {
  return s && s.dati !== null && typeof s.dati === 'object' ? (s.dati as DatiCard) : {}
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function leadDaCard(d: DatiCard): DatiSchedaLead {
  const ob = (d.objection ?? {}) as DatiCard
  return {
    tipo: 'lead',
    nome_dal_lead: str(d.nome_dal_lead),
    age: str(d.age),
    fascia_eta: (['sotto_14', '14_17', 'maggiorenne', 'ignota'] as const).find((f) => f === d.fascia_eta) ?? 'ignota',
    flow: d.flow === 'outbound' ? 'outbound' : 'inbound',
    priority: (['alta', 'media', 'bassa'] as const).find((p) => p === d.priority) ?? 'bassa',
    target: (['si', 'no', 'da verificare'] as const).find((t) => t === d.target) ?? 'da verificare',
    stage: str(d.stage),
    status: str(d.status),
    situation: str(d.situation),
    pain: str(d.pain),
    next_action: str(d.next_action),
    suggested_message: str(d.suggested_message),
    suggested_message_alt: str(d.suggested_message_alt),
    alt_condition: str(d.alt_condition),
    needs_dany: str(d.needs_dany),
    topics: Array.isArray(d.topics) ? d.topics.filter((t): t is string => typeof t === 'string') : [],
    post_shortcode: typeof d.post_shortcode === 'string' ? d.post_shortcode : null,
    no_contatto: d.no_contatto === true,
    objection: { text: str(ob.text), suggested_reply: str(ob.suggested_reply) },
  }
}

/** The sintesi as stored (insight_blocchi.risultato): read defensively, null when it is not one. */
export function leggiSintesi(x: unknown): SintesiVerificata | null {
  if (!x || typeof x !== 'object') return null
  const s = x as Partial<Record<keyof SintesiVerificata, unknown>>
  if (typeof s.headline !== 'string') return null
  const testi = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [])
  const oggetti = (v: unknown) => (Array.isArray(v) ? v.filter((o): o is DatiCard => o !== null && typeof o === 'object') : [])
  return {
    headline: s.headline,
    themes: oggetti(s.themes).map((t) => ({ theme: str(t.theme), insight: str(t.insight), temi: testi(t.temi) })),
    posts: oggetti(s.posts)
      .filter((p) => typeof p.shortcode === 'string')
      .map((p) => ({ shortcode: str(p.shortcode), verdict: typeof p.verdict === 'string' ? p.verdict : null, why: str(p.why) })),
    keep: testi(s.keep),
    change: testi(s.change),
    boost: testi(s.boost),
    setting_tips: testi(s.setting_tips).slice(0, 4),
    ideas: oggetti(s.ideas).map((i) => ({ hook: str(i.hook), format: str(i.format), why: str(i.why) })).filter((i) => i.hook),
    note: typeof s.note === 'string' ? s.note : '',
  }
}

/** ISO UTC, or '' when it is not an instant (the nightly cleanup drops a message without `at`). */
function isoOVuoto(valore: string | null | undefined): string {
  const d = new Date(valore ?? '')
  return valore && !Number.isNaN(d.getTime()) ? d.toISOString() : ''
}

function messaggiRecap(chat: ChatSalvata): MessaggioRecap[] {
  return chat.messaggi.map((m) => ({ from: m.da, time: formattaOraRecap(m.il), text: m.testo, at: isoOVuoto(m.il) }))
}

function ultimoDa(chat: ChatSalvata): DaChi {
  return chat.ultimo_da ?? chat.messaggi.at(-1)?.da ?? 'alpha'
}

function ultimoIl(chat: ChatSalvata): string {
  return isoOVuoto(chat.ultimo_il ?? chat.messaggi.at(-1)?.il)
}

function identita(chat: ChatSalvata): { username?: string; user_id?: string } {
  if (chat.canale === 'instagram') {
    if (chat.username) return { username: chat.username }
    return chat.utente_id ? { user_id: chat.utente_id } : {}
  }
  return chat.utente_id ? { user_id: chat.utente_id } : {}
}

/** The name: the profile's, else the one the lead wrote (only when it is in one of his messages). */
function nomeLead(chat: ChatSalvata, dalLead: string): string {
  const profilo = (chat.nome ?? '').trim()
  if (profilo) return profilo
  const scritto = dalLead.trim()
  if (scritto && chat.messaggi.some((m) => m.da === 'lead' && m.testo.includes(scritto))) return scritto
  return ''
}

/** «attende risposta · » when the lead has the last word and the model left it out (D8). */
export function conPrefissoAttesa(status: string, stage: string, last_from: DaChi): string {
  if (!attendeRisposta({ stage, last_from })) return status
  if (/attende/iu.test(status)) return status
  return status ? `${PREFISSO_ATTESA}${status}` : PREFISSO_ATTESA.replace(/ · $/u, '')
}

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

const ARTICOLO_TIPO: Record<NonNullable<OrigineRecap['tipo_post']>, string> = { reel: 'reel', post: 'post', carosello: 'carosello' }

function descrizionePost(o: OrigineRecap): string {
  const tipo = o.tipo_post ? ARTICOLO_TIPO[o.tipo_post] : 'post'
  return o.data ? `${tipo} del ${o.data}` : tipo
}

/** The recap's `origine` of a chat, from the frozen origin and Dany's posts. */
export function origineDellaChat(chat: ChatSalvata, media: ReadonlyMap<string, PostInsight>): OrigineRecap | undefined {
  if (!chat.origine_tipo) return undefined
  const o: OrigineRecap = { tipo: chat.origine_tipo }
  const shortcode = chat.origine_shortcode
  if (shortcode) {
    const post = media.get(shortcode)
    o.shortcode = shortcode
    o.permalink = post?.permalink ?? permalinkDi(shortcode)
    if (post) {
      o.data = dataBreve(post.pubblicato_il)
      o.tipo_post = tipoPostOrigine(post)
      const hook = hookDaDidascalia(post.didascalia)
      if (hook) o.hook = hook
      if (chat.origine_tipo === 'parola_chiave') {
        const parole = paroleChiave(post.didascalia)
        const primi = chat.messaggi.filter((m) => m.da === 'lead').slice(0, PRIMI_MESSAGGI_LEAD)
        const parola = parole.find((p) => primi.some((m) => haParolaChiave(m.testo, p))) ?? parole[0]
        if (parola) o.parola = parola
      }
    }
  }
  return o
}

/** `source`, the artifact's key, written by code from the origin. */
export function sorgente(o: OrigineRecap | undefined): string {
  if (!o) return ''
  if (o.tipo === 'condivisione') return `${descrizionePost(o)} condiviso in DM`
  if (o.tipo === 'parola_chiave') return o.parola ? `parola chiave «${o.parola}» (${descrizionePost(o)})` : `parola chiave (${descrizionePost(o)})`
  if (o.tipo === 'storia') return o.shortcode ? `risposta a una storia (${descrizionePost(o)})` : 'risposta a una storia'
  return `dal testo: ${descrizionePost(o)}`
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

/**
 * The skeletons of the agenda from the app's calls (D3): today's and
 * tomorrow's calls (never the ones waiting for a confirmed date), yesterday's
 * with the outcome the closer registered. Never notes, amounts, contacts or
 * the closer. lib/insight/agenda.ts uses the same words.
 */
export function scheletriAgenda(voci: readonly VoceAgendaApp[]): { agenda: AgendaRecap[]; show_up: ShowUpRecap[] } {
  const ordine = (a: VoceAgendaApp, b: VoceAgendaApp) => a.programmata_il.localeCompare(b.programmata_il) || a.call_id.localeCompare(b.call_id)
  const agenda = voci
    .filter((v) => (v.giorno === 'oggi' || v.giorno === 'domani') && v.stato !== 'riprogrammata' && v.stato !== 'cancellata')
    .sort(ordine)
    .map(
      (v): AgendaRecap => ({
        call_id: v.call_id,
        day: v.giorno as 'oggi' | 'domani',
        time: oraRoma(v.programmata_il),
        name: v.nome ?? '',
        username: v.username ?? '',
        meet_link: '',
        status: 'da verificare',
        note: '',
        suggested_message: '',
      }),
    )
  const show_up = voci
    .filter((v) => v.giorno === 'ieri' && v.stato !== 'cancellata')
    .sort(ordine)
    .map(
      (v): ShowUpRecap => ({
        call_id: v.call_id,
        day: 'ieri',
        time: oraRoma(v.programmata_il),
        name: v.nome ?? '',
        username: v.username ?? '',
        outcome: esitoShowUp(v),
        note: v.stato === 'programmata' ? 'Esito non ancora registrato dal closer.' : v.stato === 'riprogrammata' ? 'In attesa di conferma.' : '',
        suggested_message: '',
      }),
    )
  return { agenda, show_up }
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const ORDINE: Record<PrioritaLead, number> = { alta: 0, media: 1, bassa: 2 }

function perPriorita<T extends LeadRecap>(a: T, b: T): number {
  return ORDINE[a.priority] - ORDINE[b.priority] || b.last_message_at.localeCompare(a.last_message_at)
}

function byte(doc: unknown): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length
}

function ggmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Builds one channel's document. */
export const uniscRecap = ((op: OpUnione): RecapCanale => {
  const oggi = op.giorno
  const anno = Number(oggi.slice(0, 4))
  const esclusi = op.esclusi ?? { instagram: new Set<string>(), messenger: new Set<string>() }
  const statoLead = op.contesto?.stato_lead ?? []
  const agendaApp = op.contesto?.agenda ?? []
  const media = new Map(op.contenuti.map((p) => [p.shortcode, p]))
  const tutteLeSchede = [...(op.schedeStoriche ?? []), ...op.schede]
  const effettive = chatEffettive(op.chat, tutteLeSchede)
  const perId = new Map(effettive.filter((c) => c.canale === op.canale).map((c) => [c.conversazione_id, c]))
  const originali = new Map(op.chat.filter((c) => c.canale === op.canale).map((c) => [c.conversazione_id, c]))

  const schedeChat = new Map<string, SchedaSalvata>()
  for (const s of op.schede) if (s.tipo === 'lead' || s.tipo === 'non_lead') schedeChat.set(s.chiave, s)
  const schedeRiattivazione = new Map(op.schede.filter((s) => s.tipo === 'riattivazione').map((s) => [s.chiave, s]))

  const usernameInAgenda = new Set(
    agendaApp.filter((v) => (v.giorno === 'oggi' || v.giorno === 'domani') && v.username && v.stato !== 'cancellata').map((v) => v.username as string),
  )
  const nomiInAgenda = new Set(
    agendaApp.filter((v) => v.giorno === 'oggi' || v.giorno === 'domani').map((v) => nomeNormalizzato(v.nome)).filter(Boolean),
  )
  const haCallInAgenda = (c: ChatSalvata) =>
    c.canale === 'instagram' ? c.username !== null && usernameInAgenda.has(c.username) : nomiInAgenda.has(nomeNormalizzato(c.nome))
  const conCall = (c: ChatSalvata, stage: string) =>
    /call prenotata|nurture/iu.test(stage) || haCallInAgenda(c) || Boolean(statoLeadDi(c, statoLead)?.prossima_call_il)

  const avvisi = [...op.avvisi]
  let segnaposti = 0
  let parziale = false

  /** The final check on a lead's messages: an unsafe one is removed, a style violation flagged. */
  function controllaLead(l: LeadRecap, d: DatiSchedaLead, chat: ChatSalvata): LeadRecap {
    const contesto: ContestoMessaggio = { dove: 'lead', fascia_eta: d.fascia_eta, conCall: conCall(chat, l.stage) }
    const daRicontrollare = new Set<string>()
    const principale = controllaMessaggio(l.suggested_message, contesto)
    const alternativa = controllaMessaggio(l.suggested_message_alt, contesto)
    const out = { ...l }
    if (principale.sicurezza) {
      out.suggested_message = ''
      out.next_action = messaggioNonMostrato(principale.sicurezza)
    } else {
      out.suggested_message = principale.testo
      principale.stile.forEach((v) => daRicontrollare.add(v))
    }
    if (alternativa.sicurezza || !alternativa.testo) {
      out.suggested_message_alt = ''
      out.alt_condition = ''
    } else {
      out.suggested_message_alt = alternativa.testo
      alternativa.stile.forEach((v) => daRicontrollare.add(v))
    }
    if (daRicontrollare.size > 0) out.da_ricontrollare = [...daRicontrollare].join(', ')
    return out
  }

  // ----- leads and non-leads of the day -----
  const leads: LeadRecap[] = []
  const nonLeads: NonLeadRecap[] = []
  const obiezioni: ObiezioneRecap[] = []
  const chatDelGiorno = [...schedeChat.keys()]
    .map((id) => ({ c: perId.get(id), originale: originali.get(id) }))
    .filter((x): x is { c: ChatSalvata; originale: ChatSalvata } => x.c !== undefined && x.originale !== undefined)
    .sort((a, b) => ultimoIl(b.originale).localeCompare(ultimoIl(a.originale)))

  for (const { c, originale } of chatDelGiorno) {
    const scheda = schedeChat.get(c.conversazione_id)
    const d = datiCard(scheda)
    const chi = identita(originale)
    const lastFrom = ultimoDa(originale)
    const lastAt = ultimoIl(originale)
    if (d.tipo === 'non_lead') {
      nonLeads.push({ ...chi, ...(originale.nome ? { name: originale.nome } : {}), reason: str(d.reason) })
      continue
    }
    const origine = c.minore_14 ? undefined : origineDellaChat(c, media)

    // under 14 (D25): no messages, no quotes; a card while he has the last word, then out of the leads
    if (c.minore_14 || d.minore_14 === true) {
      const lead = d.minore_14 === true ? null : leadDaCard(d)
      if (lastFrom !== 'lead') {
        nonLeads.push({ ...chi, ...(originale.nome ? { name: originale.nome } : {}), reason: MOTIVO_MINORE_CHIUSO })
        continue
      }
      const chiusura = lead ? lead.suggested_message : str(d.ultima_chiusura)
      const controllo = controllaMessaggio(chiusura, { dove: 'lead', fascia_eta: 'sotto_14' })
      leads.push({
        ...chi,
        conversation_id: c.conversazione_id,
        name: (originale.nome ?? '').trim(),
        age: lead ? etaVerificata(lead.age, originale.messaggi.filter((m) => m.da === 'lead').map((m) => m.testo), anno) : '',
        priority: 'alta',
        target: 'no',
        stage: 'uscita',
        status: STATO_MINORE,
        situation: SITUAZIONE_MINORE,
        pain: '',
        next_action: controllo.sicurezza ? messaggioNonMostrato(controllo.sicurezza) : AZIONE_MINORE,
        suggested_message: controllo.sicurezza ? '' : controllo.testo,
        suggested_message_alt: '',
        alt_condition: '',
        needs_dany: SERVE_DANY_MINORE,
        flow: lead?.flow ?? '',
        source: '',
        topics: [],
        last_from: lastFrom,
        last_message_at: lastAt,
        messages: [],
        minore_14: true,
      })
      continue
    }

    if (d.analisi_mancante === true) {
      segnaposti++
      const priorita: PrioritaLead =
        haCallInAgenda(originale) || origine?.tipo === 'parola_chiave' ? 'alta' : lastFrom === 'lead' ? 'media' : 'bassa'
      leads.push({
        ...chi,
        conversation_id: c.conversazione_id,
        name: (originale.nome ?? '').trim(),
        age: '',
        priority: priorita,
        target: 'da verificare',
        stage: '',
        status: conPrefissoAttesa(STATO_SEGNAPOSTO, '', lastFrom),
        situation: '',
        pain: '',
        next_action: AZIONE_SEGNAPOSTO,
        suggested_message: '',
        suggested_message_alt: '',
        alt_condition: '',
        needs_dany: '',
        flow: '',
        source: sorgente(origine),
        topics: [],
        last_from: lastFrom,
        last_message_at: lastAt,
        messages: messaggiRecap(originale),
        analisi_mancante: true,
        ...(origine ? { origine } : {}),
      })
      continue
    }

    const lead = leadDaCard(d)
    const testiLead = originale.messaggi.filter((m) => m.da === 'lead').map((m) => m.testo)
    const bozza: LeadRecap = {
      ...chi,
      conversation_id: c.conversazione_id,
      name: nomeLead(originale, lead.nome_dal_lead),
      age: etaVerificata(lead.age, testiLead, anno),
      priority: lead.priority,
      target: lead.target,
      stage: lead.stage,
      status: conPrefissoAttesa(lead.status, lead.stage, lastFrom),
      situation: lead.situation,
      pain: lead.pain,
      next_action: lead.next_action,
      suggested_message: lead.suggested_message,
      suggested_message_alt: lead.suggested_message_alt,
      alt_condition: lead.alt_condition,
      needs_dany: lead.needs_dany,
      flow: lead.flow,
      source: sorgente(origine),
      topics: lead.topics,
      last_from: lastFrom,
      last_message_at: lastAt,
      messages: messaggiRecap(originale),
      ...(origine ? { origine } : {}),
    }
    leads.push(controllaLead(bozza, lead, originale))
    if (lead.objection.text) {
      const risposta = controllaMessaggio(lead.objection.suggested_reply, {
        dove: 'obiezione',
        fascia_eta: lead.fascia_eta,
        conCall: conCall(originale, lead.stage),
      })
      obiezioni.push({
        ...chi,
        ...(bozza.name ? { name: bozza.name } : {}),
        text: lead.objection.text,
        suggested_reply: risposta.sicurezza ? '' : risposta.testo,
      })
    }
  }
  leads.sort(perPriorita)

  // ----- reactivation -----
  const reactivate: RiattivazioneRecap[] = []
  let riattivazioneMancante = false
  const delGiorno = new Set(schedeChat.keys())
  for (const cand of op.candidati as readonly CandidatoRiattivazione[]) {
    const c = perId.get(cand.conversazione_id)
    const originale = originali.get(cand.conversazione_id)
    const scheda = schedeRiattivazione.get(cand.conversazione_id)
    if (!c || !originale || !scheda || delGiorno.has(cand.conversazione_id) || c.minore_14 || c.non_lead) continue
    const d = datiCard(scheda)
    if (d.tipo === 'non_lead') continue
    const chi = identita(originale)
    const lastFrom = ultimoDa(originale)
    const origine = origineDellaChat(c, media)
    const comune = {
      ...chi,
      conversation_id: c.conversazione_id,
      last_from: lastFrom,
      last_message_at: ultimoIl(originale),
      messages: messaggiRecap(originale),
      source: sorgente(origine),
      ...(origine ? { origine } : {}),
      days_silent: cand.giorni_silenzio,
      step: cand.passo,
    }
    if (d.analisi_mancante === true) {
      riattivazioneMancante = true
      reactivate.push({
        ...comune,
        name: (originale.nome ?? '').trim(),
        age: '',
        priority: 'bassa',
        target: 'da verificare',
        stage: '',
        status: STATO_SEGNAPOSTO,
        situation: '',
        pain: '',
        next_action: AZIONE_SEGNAPOSTO,
        suggested_message: '',
        suggested_message_alt: '',
        alt_condition: '',
        needs_dany: '',
        flow: '',
        topics: [],
        analisi_mancante: true,
      })
      continue
    }
    const lead = leadDaCard(d)
    const testiLead = originale.messaggi.filter((m) => m.da === 'lead').map((m) => m.testo)
    const bozza: RiattivazioneRecap = {
      ...comune,
      name: nomeLead(originale, lead.nome_dal_lead),
      age: etaVerificata(lead.age, testiLead, anno),
      priority: lead.priority,
      target: lead.target,
      stage: lead.stage,
      status: conPrefissoAttesa(lead.status, lead.stage, lastFrom),
      situation: lead.situation,
      pain: lead.pain,
      next_action: lead.next_action,
      suggested_message: lead.suggested_message,
      suggested_message_alt: lead.suggested_message_alt,
      alt_condition: lead.alt_condition,
      needs_dany: lead.needs_dany,
      flow: lead.flow,
      topics: lead.topics,
    }
    reactivate.push({ ...controllaLead(bozza, lead, originale), days_silent: cand.giorni_silenzio, step: cand.passo })
  }

  // ----- agenda (Instagram document only) -----
  let agenda: AgendaRecap[] | undefined
  let showUp: ShowUpRecap[] | undefined
  let agendaSenzaMessaggi = false
  if (op.canale === 'instagram') {
    const scheletri = scheletriAgenda(agendaApp)
    const carte = new Map(op.schede.filter((s) => s.tipo === 'agenda').map((s) => [s.chiave, s.dati as Partial<DatiAgenda>]))
    const carteIeri = new Map(op.schede.filter((s) => s.tipo === 'show_up').map((s) => [s.chiave, s.dati as Partial<DatiShowUp>]))
    const perCall = new Map(agendaApp.map((v) => [v.call_id, v]))
    agenda = scheletri.agenda.map((a) => {
      const carta = carte.get(a.call_id)
      const voce = perCall.get(a.call_id)
      if (!carta) {
        agendaSenzaMessaggi = true
        return a
      }
      // without the lead's chat (no handle in the chats, no single Messenger name) the status stays to check
      const conChat = Boolean(carta.user_id) || (voce ? chatDellaCall(voce, op.chat) !== null : false)
      let status = conChat ? str(carta.status) || a.status : 'da verificare'
      if (conChat && (voce?.no_show_precedenti ?? 0) > 0 && status !== 'a rischio') status = 'a rischio'
      const messaggio = controllaMessaggio(str(carta.suggested_message), { dove: 'agenda' })
      return {
        ...a,
        status,
        note: messaggio.sicurezza ? messaggioNonMostrato(messaggio.sicurezza) : str(carta.note),
        suggested_message: messaggio.sicurezza ? '' : messaggio.testo,
        ...(carta.user_id ? { channel: 'Messenger' as const, user_id: carta.user_id } : {}),
      }
    })
    showUp = scheletri.show_up.map((s) => {
      const carta = carteIeri.get(s.call_id)
      if (!carta) {
        agendaSenzaMessaggi = true
        return s
      }
      const messaggio = controllaMessaggio(str(carta.suggested_message), { dove: 'show_up' })
      const note = [s.note, messaggio.sicurezza ? messaggioNonMostrato(messaggio.sicurezza) : str(carta.note)].filter(Boolean).join(' ')
      return { ...s, note, suggested_message: messaggio.sicurezza ? '' : messaggio.testo }
    })
  }

  // ----- content -----
  const sintesi = leggiSintesi(op.sintesi)
  const nomi = [
    ...op.chat.flatMap((c) => [c.username, c.nome]),
    ...op.schede.map((s) => str(datiCard(s).nome_dal_lead)),
    ...agendaApp.flatMap((v) => [v.nome, v.username]),
  ]
  const oscura = (t: string) => oscuraNomi(t, nomi)
  const dal = aggiungiGiorni(oggi, -(GIORNI_CONTENT - 1))
  const delPeriodo = leadDelPeriodo({ chat: [...perId.values()], schede: tutteLeSchede, statoLead, oggi })
  const themes: TemaRecap[] = (sintesi?.themes ?? [])
    .map((t) => ({ theme: oscura(t.theme), insight: oscura(t.insight), ...numeriDelTema(t.temi, delPeriodo, oggi) }))
    .filter((t) => t.count > 0)
  const posts =
    op.canale === 'instagram'
      ? postDelRecap({ media: op.contenuti, chats: effettive, statoLead, esclusi, sintesi: sintesi?.posts ?? [], oggi }).map((p) => ({
          ...p,
          why: oscura(p.why),
        }))
      : []
  const giorniStorico = (() => {
    const giorni = [...perId.values()].map((c) => (c.ultimo_il ? giornoRoma(c.ultimo_il) : null)).filter((g): g is string => g !== null)
    if (giorni.length === 0) return 0
    const primo = giorni.reduce((a, b) => (a < b ? a : b))
    const diff = Math.round((Date.parse(`${oggi}T12:00:00Z`) - Date.parse(`${primo}T12:00:00Z`)) / 86_400_000) + 1
    return Math.min(GIORNI_CONTENT, Math.max(1, diff))
  })()
  const note = [
    op.canale === 'instagram' && posts.length > 0 && posts.every((p) => p.views === null)
      ? 'Statistiche dei post non disponibili con il token attuale.'
      : '',
    giorniStorico > 0 && giorniStorico < GIORNI_CONTENT ? `Storico di ${giorniStorico} ${giorniStorico === 1 ? 'giorno' : 'giorni'}.` : '',
    sintesi ? oscura(sintesi.note) : '',
  ]
    .filter(Boolean)
    .join(' ')

  // ----- summary -----
  const summary = {
    conversations: leads.length + nonLeads.length,
    leads_in_target: leads.filter((l) => l.target === 'si').length,
    awaiting_reply: leads.filter((l) => attendeRisposta(l)).length,
    calls_booked: leads.filter((l) => /call prenotata/iu.test(l.stage) || (l.username !== undefined && usernameInAgenda.has(l.username))).length,
    lost: leads.filter((l) => FILTRI.persi.test(l)).length,
  }
  const headline = sintesi?.headline
    ? oscura(sintesi.headline)
    : `Verdetto non disponibile: la sintesi non è riuscita. ${summary.conversations} chat, ${summary.leads_in_target} in target, ${summary.awaiting_reply} attendono risposta.`

  if (segnaposti > 0) {
    parziale = true
    avvisi.push(AVVISI_UNIONE.parziale(segnaposti))
  }
  if (!sintesi) {
    parziale = true
    avvisi.push(AVVISI_UNIONE.sintesi)
  }
  if (agendaSenzaMessaggi) {
    parziale = true
    avvisi.push(AVVISI_UNIONE.agenda)
  }
  if (riattivazioneMancante) {
    parziale = true
    avvisi.push(AVVISI_UNIONE.riattivazione)
  }

  const doc: RecapCanale = {
    date: oggi,
    generated_at: isoOVuoto(op.generatoIl) || op.generatoIl,
    window_hours: 24,
    headline,
    summary,
    leads,
    reactivate,
    objections: obiezioni,
    content: {
      period: `Ultimi ${GIORNI_CONTENT} giorni (dal ${ggmm(dal)} al ${ggmm(oggi)})`,
      based_on: delPeriodo.length,
      note,
      themes,
      posts,
      keep: (sintesi?.keep ?? []).map(oscura),
      change: (sintesi?.change ?? []).map(oscura),
      boost: (sintesi?.boost ?? []).map(oscura),
      setting_tips: (sintesi?.setting_tips ?? []).map(oscura),
      ideas: (sintesi?.ideas ?? []).map((i) => ({ hook: oscura(i.hook), format: oscura(i.format), why: oscura(i.why) })),
      ...(op.canale === 'instagram' ? { storie: contaStorie({ chats: effettive, esclusi, dal, oggi }) } : {}),
    },
    non_leads: nonLeads,
    ...(op.canale === 'instagram' ? { agenda: agenda ?? [], show_up: showUp ?? [] } : {}),
    escluse: op.escluse,
    stato: parziale ? 'parziale' : 'completo',
    avvisi: [...new Set(avvisi)],
    generato_con: op.generatoCon,
  }

  // ----- size: under 400 KB -----
  if (byte(doc) > RECAP_MAX_BYTE) {
    for (const l of doc.leads) if (l.priority === 'bassa') l.messages = l.messages.slice(-MESSAGGI_RIDOTTI)
    for (const r of doc.reactivate) r.messages = r.messages.slice(-MESSAGGI_RIDOTTI)
    doc.avvisi = [...new Set([...doc.avvisi, AVVISI_UNIONE.ridotto])]
  }
  return doc
}) satisfies UniscRecap
