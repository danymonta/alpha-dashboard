import type { AnalisiCallModello } from '@/lib/call/analisi/schema'
import { livelloPerformance, type LivelloPerformance } from '@/lib/call/analisi/performance'
import { pettoNeutro, pulisciElenco, pulisciTesto } from '@/lib/call/analisi/salute'
import { copiaDelleNote, paroleNormalizzate, ripulisciUscita, type ConteggiControllo } from '@/lib/marketing/analisi/oscura'

/**
 * Two layers between what Claude wrote about a call and what the database keeps (1.37.0,
 * CLAUDE.md section 31), pure.
 *
 * The strict layer: lengths and counts are TRUNCATED, never refused (the structured output
 * cannot carry maxLength); a minute outside the length of the recording goes; a reason
 * proposed for a call that closed goes; «what convinced him» without a close goes. Only an
 * analysis without a summary fails.
 *
 * The final check, on every string: the names and handles of the lead and the team become
 * «il lead» / «un account», amounts «il prezzo», links go, the dashes a comma; eight words
 * in a row copied from the notes of the closer or the setter take the entry out; the
 * lexicon of health (salute.ts) takes the entry out whole, and in the running texts the
 * sentence; the name of a body condition becomes «il petto». What reaches the setter (the
 * «Dalla call» table) has no figure at all and no summary for «condizioni personali».
 * The counts go to the log, never a text.
 */

export const LIMITI_CALL = {
  riassunto: 700, segnale: 140, segnali: 5, punto: 300, tre: 3, frase: 160, paroleFrase: 20,
  obiezioni: 5, sintesi: 200, domande: 5, domanda: 120, convinto: 3, motivo: 500, sapeva: 5, sorprese: 3, sorpresa: 160,
  spuntiSetter: 3, spuntoSetter: 200, passi: 4, passo: 160, quando: 60, momenti: 4, perche: 4, voce: 160, spuntiContenuto: 2,
} as const

export type ConteggiVerificaCall = ConteggiControllo & { salute: number; copie: number }

export type ContestoVerifica = {
  /** The outcome the closer recorded: it decides the reason and «convinced by». */
  esito: 'chiusa' | 'follow_up' | 'persa' | null
  /** Length of the recording in seconds: a minute beyond it goes (60 s of tolerance). */
  durataSecondi: number | null
  /** Names to blank (marketing_da_oscurare, normalized). */
  parole: ReadonlySet<string>
  /** Words of the notes of the closer and the setter, to catch a copy of eight in a row. */
  note: readonly (readonly string[])[]
  /** The share of speech of the closer, worked out from the transcript by the code. */
  quotaParlato: number | null
}

export type ObiezioneSalvata = {
  categoria: string
  sintesi: string
  gestita: 'si' | 'in_parte' | 'no'
  risposta: string | null
  minuto: string | null
  momento: 'subito' | 'durante' | 'chiusura'
}

export type AnalisiSalvabile = {
  riassunto: string
  esito_letto: AnalisiCallModello['esito_letto']
  in_target: AnalisiCallModello['lead']['in_target']
  lead: {
    in_target: string
    segnali: { testo: string; verso: string }[]
    punto_a: string
    punto_b: string
    pain: string[]
    desideri: string[]
    gia_provato: string[]
    frasi: string[]
    minorenne: boolean
  }
  obiezioni: ObiezioneSalvata[]
  categorie_obiezioni: string[]
  pain: string[]
  desideri: string[]
  domande: string[]
  convinto_da: string[]
  motivo_proposto: string | null
  prossimi_passi: { cosa: string; quando: string | null; chi: string }[]
  momenti: { minuto: string; etichetta: string }[]
  spunti_contenuto: { idea: string; perche: string }[]
  setter: {
    in_target: string
    segnali: { testo: string; verso: string }[]
    sapeva: string[]
    sorprese: string[]
    obiezioni: { categoria: string; sintesi: string | null }[]
  }
  spunti_setter: string[]
  valutazione: {
    criteri: AnalisiCallModello['performance']['criteri']
    livello_proposto: LivelloPerformance | null
    perche: string[]
    funzionato: string[]
    da_provare: string[]
    quota_parlato: number | null
  }
}

export type EsitoVerificaCall =
  | { ok: true; dati: AnalisiSalvabile; minorenne: boolean; conteggi: ConteggiVerificaCall }
  | { ok: false; motivo: 'senza_riassunto' }

const RE_MINUTO = /^\d{1,3}:[0-5]\d$/
const RE_CIFRA = /\d/

function secondiDi(minuto: string): number {
  const [m, s] = minuto.split(':').map(Number)
  return m * 60 + s
}

const taglia = (t: string, max: number) => (t.length > max ? t.slice(0, max).trimEnd() : t)
const unici = <T,>(a: readonly T[], max: number) => [...new Set(a)].slice(0, max)

export function verificaAnalisiCall(m: AnalisiCallModello, c: ContestoVerifica): EsitoVerificaCall {
  const conteggi: ConteggiVerificaCall = { nomi: 0, handle: 0, importi: 0, link: 0, trattini: 0, salute: 0, copie: 0 }

  /** One string through the final check: null when an entry has to go (copy, health); the cleaned text otherwise. */
  const pulisci = (t: string | null | undefined, max: number): string | null => {
    const grezzo = (t ?? '').trim()
    if (grezzo === '') return null
    const r = ripulisciUscita(taglia(grezzo, max), c.parole)
    for (const k of ['nomi', 'handle', 'importi', 'link', 'trattini'] as const) conteggi[k] += r.conteggi[k]
    if (c.note.length > 0 && copiaDelleNote(r.testo, c.note)) {
      conteggi.copie++
      return null
    }
    return r.testo === '' ? null : r.testo
  }
  /** An entry of a list: also out whole when it speaks of health; the name of a condition neutral. */
  const voce = (t: string | null | undefined, max: number): string | null => {
    const p = pulisci(t, max)
    if (p === null) return null
    const l = pulisciElenco([p])
    conteggi.salute += l.tolte
    return l.voci[0] ?? null
  }
  const voci = (a: readonly string[], max: number, quante: number): string[] =>
    a.map((t) => voce(t, max)).filter((t): t is string => t !== null).slice(0, quante)
  /** A running text: the sentences that speak of health go. */
  const testo = (t: string, max: number): string => {
    const p = pulisci(t, max)
    if (p === null) return ''
    const r = pulisciTesto(p)
    conteggi.salute += r.tolte
    return r.testo
  }
  const minuto = (v: string | null): string | null => {
    if (v === null || !RE_MINUTO.test(v)) return null
    if (c.durataSecondi !== null && secondiDi(v) > c.durataSecondi + 60) return null
    return v
  }
  const paroleMax = (t: string) => t.split(/\s+/).slice(0, LIMITI_CALL.paroleFrase).join(' ')

  const riassunto = testo(m.riassunto, LIMITI_CALL.riassunto)
  if (riassunto === '') return { ok: false, motivo: 'senza_riassunto' }

  const segnali = m.lead.segnali
    .slice(0, LIMITI_CALL.segnali)
    .map((s) => ({ testo: voce(s.testo, LIMITI_CALL.segnale), verso: s.verso }))
    .filter((s): s is { testo: string; verso: 'in_target' | 'non_in_target' } => s.testo !== null)

  const obiezioni: ObiezioneSalvata[] = m.obiezioni.slice(0, LIMITI_CALL.obiezioni).map((o) => ({
    categoria: o.categoria,
    sintesi: voce(o.sintesi, LIMITI_CALL.sintesi) ?? '',
    gestita: o.gestita,
    risposta: voce(o.risposta, LIMITI_CALL.sintesi),
    minuto: minuto(o.minuto),
    momento: o.momento,
  }))

  const chiusa = c.esito === 'chiusa'
  const nonChiusa = c.esito === 'follow_up' || c.esito === 'persa'
  const motivoGrezzo = nonChiusa ? m.motivo_proposto : null
  const motivoProposto = motivoGrezzo ? (testo(motivoGrezzo, LIMITI_CALL.motivo) || null) : null

  const lead = {
    in_target: m.lead.in_target,
    segnali,
    punto_a: testo(m.lead.punto_a, LIMITI_CALL.punto),
    punto_b: testo(m.lead.punto_b, LIMITI_CALL.punto),
    pain: unici(m.lead.pain, LIMITI_CALL.tre),
    desideri: unici(m.lead.desideri, LIMITI_CALL.tre),
    gia_provato: unici(m.lead.gia_provato, LIMITI_CALL.tre),
    frasi: voci(m.lead.frasi.map(paroleMax), LIMITI_CALL.frase, LIMITI_CALL.tre),
    minorenne: m.lead.minorenne,
  }

  // what the setter reads: the lead's side, no figure at all, «condizioni personali» without a summary
  const senzaCifre = (a: readonly string[]) => a.filter((t) => !RE_CIFRA.test(t))
  const setter = {
    in_target: m.lead.in_target,
    segnali: segnali.filter((s) => !RE_CIFRA.test(s.testo)),
    sapeva: unici(m.setting.sapeva, LIMITI_CALL.sapeva),
    sorprese: senzaCifre(voci(m.setting.sorprese, LIMITI_CALL.sorpresa, LIMITI_CALL.sorprese)),
    obiezioni: obiezioni.map((o) => ({
      categoria: o.categoria,
      sintesi: o.categoria === 'condizioni_personali' || o.sintesi === '' || RE_CIFRA.test(o.sintesi) ? null : o.sintesi,
    })),
  }

  const livello = livelloPerformance(m.performance.criteri)

  const dati: AnalisiSalvabile = {
    riassunto,
    esito_letto: m.esito_letto,
    in_target: m.lead.in_target,
    lead,
    obiezioni,
    categorie_obiezioni: unici(obiezioni.map((o) => o.categoria), LIMITI_CALL.obiezioni),
    pain: lead.pain,
    desideri: lead.desideri,
    domande: voci(m.domande, LIMITI_CALL.domanda, LIMITI_CALL.domande),
    convinto_da: chiusa ? voci(m.convinto_da, LIMITI_CALL.domanda, LIMITI_CALL.convinto) : [],
    motivo_proposto: motivoProposto,
    prossimi_passi: m.prossimi_passi
      .slice(0, LIMITI_CALL.passi)
      .map((p) => ({ cosa: voce(p.cosa, LIMITI_CALL.passo), quando: voce(p.quando, LIMITI_CALL.quando), chi: p.chi }))
      .filter((p): p is { cosa: string; quando: string | null; chi: 'closer' | 'lead' | 'setter' } => p.cosa !== null),
    momenti: m.momenti
      .slice(0, LIMITI_CALL.momenti)
      .map((x) => ({ minuto: minuto(x.minuto), etichetta: x.etichetta }))
      .filter((x): x is { minuto: string; etichetta: AnalisiCallModello['momenti'][number]['etichetta'] } => x.minuto !== null),
    spunti_contenuto: m.spunti_contenuto
      .slice(0, LIMITI_CALL.spuntiContenuto)
      .map((s) => ({ idea: voce(s.idea, LIMITI_CALL.voce), perche: voce(s.perche, LIMITI_CALL.voce) ?? '' }))
      .filter((s): s is { idea: string; perche: string } => s.idea !== null),
    setter,
    spunti_setter: voci(m.setting.spunti_setter, LIMITI_CALL.spuntoSetter, LIMITI_CALL.spuntiSetter),
    valutazione: {
      criteri: m.performance.criteri,
      livello_proposto: livello,
      perche: voci(m.performance.perche, LIMITI_CALL.voce, LIMITI_CALL.perche),
      funzionato: voci(m.performance.funzionato, LIMITI_CALL.voce, LIMITI_CALL.tre),
      da_provare: voci(m.performance.da_provare, LIMITI_CALL.voce, LIMITI_CALL.tre),
      quota_parlato: c.quotaParlato,
    },
  }
  // a name of a condition left anywhere in a text about the person: neutral (pettoNeutro is idempotent)
  dati.riassunto = pettoNeutro(dati.riassunto)
  return { ok: true, dati, minorenne: m.lead.minorenne, conteggi }
}

/** Words of a note for the copy check (the closer's reason and notes, the setter's note). */
export function paroleDiNote(note: readonly (string | null | undefined)[]): string[][] {
  return note.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => paroleNormalizzate(n))
}
