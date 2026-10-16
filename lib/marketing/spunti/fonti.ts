import {
  CATEGORIE_OBIEZIONI,
  DESIDERI,
  GIA_PROVATO,
  PAIN,
  SAPEVA,
  etichetta,
} from '@/lib/call/analisi/icp-call'
import { parlaDiSalute, pettoNeutro, pulisciTesto } from '@/lib/call/analisi/salute'
import { ICP } from '@/lib/marketing/icp'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, ETICHETTA_STATUS } from '@/lib/marketing/etichette'
import { oscura, paroleDaOscurare, paroleNormalizzate } from '@/lib/marketing/analisi/oscura'
import type { FontiSpunti } from '@/lib/marketing/spunti/tipi'

/**
 * What the database gave for the weekly brief (marketing_fonti_spunti), made ready to send to
 * Claude (1.37.0, CLAUDE.md section 31). Pure. Every text is cleaned of the names, the handles,
 * the amounts and the links (oscura); the notes of the team, the reasons of the closer and
 * what comes out of the calls also lose the sentences that speak of health, and an entry that
 * is left empty goes. The labels are Italian, never the values of an enum. The hidden keys
 * `k` (one per source, to count a call or a day once) become the weights and are NOT sent.
 *
 * Nothing here knows a name: `da_oscurare` stays on the server.
 */
type Riga = Record<string, unknown>

export type Peso = { n: number; k: string | null }

export type FontiPreparate = {
  /** the JSON that goes in <settimana> */
  perClaude: Record<string, unknown>
  /** the weight of each reference (a DM theme weighs its chats; a day, a call weighs one, once) */
  pesi: ReadonlyMap<string, Peso>
  /** every reference that was sent */
  rifInviati: ReadonlySet<string>
  /** the sentence of each fact (F#) and a plain sentence for the other sources, to show under the brief */
  fatti: ReadonlyMap<string, string>
  parole: ReadonlySet<string>
  /** the words of the texts that came from the team, to catch a copy of eight in a row */
  note: readonly (readonly string[])[]
  /** the Names already in the calendar, normalized */
  nomiInCalendario: ReadonlySet<string>
  /** every number a brief may write: those in the facts and in the ICP */
  numeriAmmessi: ReadonlySet<string>
  riepilogo: FontiSpunti
  /** nothing to write a brief from: no reel analysed, no theme, few notes and calls */
  insufficienti: boolean
}

const arr = (v: unknown): Riga[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Riga[]) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export const RE_NUMERO = /\d+(?:[.,]\d+)?/g
export function numeriDi(testo: string): string[] {
  return testo.match(RE_NUMERO) ?? []
}

const NUMERI_ICP = new Set(numeriDi(ICP))

const FRASE_FONTE: Record<string, string> = {
  D: 'Nei DM',
  S: 'Da chi risponde ai DM',
  K: 'Dai motivi di chi fa le call',
  C: 'Dalle call registrate',
}

export function preparaFonti(raw: unknown, chiaveNome: (nome: string) => string): FontiPreparate {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Riga
  const parole = paroleDaOscurare(Array.isArray(r.da_oscurare) ? (r.da_oscurare as string[]) : [])
  const noteTeam = r.note_team === true
  const note: string[][] = []
  const pesi = new Map<string, Peso>()
  const rifInviati = new Set<string>()
  const fatti = new Map<string, string>()

  const pulito = (v: unknown, max = 400) => oscura(str(v), parole).slice(0, max)
  /** a text from the team: also without the sentences of health; '' when nothing is left */
  const dalTeam = (v: unknown, max = 300) => {
    const o = pulito(v, max)
    const p = pulisciTesto(o)
    return p.testo
  }
  const voceTeam = (v: unknown, max = 200): string => {
    const o = pulito(v, max)
    return parlaDiSalute(o) ? '' : pettoNeutro(o)
  }
  const ricorda = (t: string) => {
    if (t) note.push(paroleNormalizzate(t))
  }

  // reels
  const reel = arr(r.reel).map((x) => {
    const ref = str(x.ref)
    rifInviati.add(ref)
    pesi.set(ref, { n: 0, k: null })
    fatti.set(ref, `Reel del ${str(x.pubblicato)}${x.name ? `: ${pulito(x.name, 120)}` : ''}`)
    return {
      ref,
      name: pulito(x.name, 120) || null,
      reel_type: typeof x.reel_type === 'string' ? ETICHETTA_REEL_TYPE[x.reel_type as keyof typeof ETICHETTA_REEL_TYPE] ?? null : null,
      format: typeof x.format === 'string' ? ETICHETTA_FORMAT[x.format as keyof typeof ETICHETTA_FORMAT] ?? null : null,
      pubblicato: str(x.pubblicato),
      gancio: pulito(x.gancio, 160) || null,
      verdetto: x.verdetto ?? null,
      sintesi: pulito(x.sintesi, 400),
      cosa_ha_funzionato: (Array.isArray(x.cosa_ha_funzionato) ? (x.cosa_ha_funzionato as unknown[]) : []).map((t) => pulito(t, 200)).filter(Boolean),
      aderenza_icp: x.aderenza_icp ?? null,
    }
  })

  const fattiLista = arr(r.fatti).map((f) => {
    const ref = str(f.ref)
    rifInviati.add(ref)
    pesi.set(ref, { n: 0, k: null })
    fatti.set(ref, str(f.testo))
    return { ref, testo: str(f.testo) }
  })

  // the DM themes
  const temi = arr((r.dm as Riga | undefined)?.temi).map((t) => {
    const ref = str(t.ref)
    const tema = voceTeam(t.tema, 80)
    // a theme that speaks of health is not sent at all, and its reference does not exist
    if (!tema) return null
    rifInviati.add(ref)
    pesi.set(ref, { n: Math.max(0, Number(t.quanti) || 0), k: null })
    fatti.set(ref, FRASE_FONTE.D)
    return {
      ref,
      tema,
      frequenza: banda(Number(t.quanti) || 0, [6, 3], ['spesso', 'a_volte', 'raramente']),
      in_target: bandaTarget(Number(t.in_target) || 0, Number(t.quanti) || 0),
      con_call: banda(Number(t.con_call) || 0, [6, 3], ['spesso', 'a_volte', 'raramente']),
      tendenza: t.tendenza ?? null,
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // the setter's answers
  const setterRaw = (r.setter ?? {}) as Riga
  const noteSetter = arr(setterRaw.note).map((n) => {
    const ref = str(n.ref)
    const testo = dalTeam(n.testo, 300)
    if (!testo) return null
    rifInviati.add(ref)
    pesi.set(ref, { n: 1, k: str(n.k) || ref })
    fatti.set(ref, FRASE_FONTE.S)
    ricorda(testo)
    return { ref, quando: n.quando, domanda: n.domanda, testo }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // the closer's reasons
  const motivi = arr((r.closer as Riga | undefined)?.motivi).map((m) => {
    const ref = str(m.ref)
    const motivo = dalTeam(m.motivo, 300)
    const nota = dalTeam(m.note, 300)
    if (!motivo && !nota) return null
    rifInviati.add(ref)
    pesi.set(ref, { n: 1, k: str(m.k) || ref })
    fatti.set(ref, FRASE_FONTE.K)
    ricorda(motivo)
    ricorda(nota)
    return { ref, quando: m.quando, esito: m.esito, qualificata: m.qualificata, motivo, note: nota }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // the analysed calls: the lead's side only
  const analisi = arr((r.call as Riga | undefined)?.analisi).map((c) => {
    const ref = str(c.ref)
    rifInviati.add(ref)
    pesi.set(ref, { n: 1, k: str(c.k) || ref })
    fatti.set(ref, FRASE_FONTE.C)
    const lista = (v: unknown, mappa: Record<string, string>) =>
      (Array.isArray(v) ? (v as string[]) : []).map((x) => etichetta(mappa, x)).filter(Boolean)
    const testi = (v: unknown, max: number) =>
      (Array.isArray(v) ? (v as unknown[]) : []).map((x) => voceTeam(x, max)).filter(Boolean)
    const sorprese = testi(c.sorprese, 160)
    const domande = testi(c.domande, 120)
    const spunti = arr(c.spunti_contenuto)
      .map((s) => ({ idea: voceTeam(s.idea, 160), perche: voceTeam(s.perche, 160) }))
      .filter((s) => s.idea)
    const obiezioni = arr(c.obiezioni)
      .map((o) => ({
        categoria: etichetta(CATEGORIE_OBIEZIONI, str(o.categoria)),
        // «condizioni personali» arrives as a category only, whatever the row holds
        sintesi: o.categoria === 'condizioni_personali' ? null : voceTeam(o.sintesi, 200) || null,
      }))
    for (const t of [...sorprese, ...domande, ...spunti.map((s) => s.idea), ...obiezioni.map((o) => o.sintesi ?? '')]) ricorda(t)
    return {
      ref,
      quando: c.quando,
      chiusa: c.chiusa === true,
      in_target: c.in_target ?? null,
      arriva_da: typeof c.arriva_da === 'string' ? c.arriva_da : null,
      obiezioni,
      pain: lista(c.pain, PAIN),
      desideri: lista(c.desideri, DESIDERI),
      gia_provato: lista(c.gia_provato, GIA_PROVATO),
      domande,
      sapeva: lista(c.sapeva, SAPEVA),
      sorprese,
      spunti_contenuto: spunti,
    }
  })

  const calendario = arr(r.in_calendario).map((c) => ({
    name: pulito(c.name, 120),
    modello: c.modello === 'carousel' ? 'Carousel Topic' : 'Reel Topic',
    reel_type: typeof c.reel_type === 'string' ? ETICHETTA_REEL_TYPE[c.reel_type as keyof typeof ETICHETTA_REEL_TYPE] ?? null : null,
    format: typeof c.format === 'string' ? ETICHETTA_FORMAT[c.format as keyof typeof ETICHETTA_FORMAT] ?? null : null,
    status: typeof c.status === 'string' ? ETICHETTA_STATUS[c.status as keyof typeof ETICHETTA_STATUS] ?? null : null,
  }))
  const nomiInCalendario = new Set(calendario.map((c) => chiaveNome(c.name)).filter(Boolean))

  const perClaude: Record<string, unknown> = {
    periodo: r.periodo,
    settimana: r.settimana,
    note_team: noteTeam,
    contenuti: { reel },
    dm: { temi },
    setter: { scale: noteTeam ? (setterRaw.scale ?? null) : null, note: noteSetter },
    closer: { motivi },
    call: { analisi },
    in_calendario: calendario,
    fatti: fattiLista,
  }

  const numeriAmmessi = new Set<string>(NUMERI_ICP)
  for (const f of fattiLista) for (const n of numeriDi(f.testo)) numeriAmmessi.add(n)

  const insufficienti = reel.length === 0 && temi.length === 0 && noteSetter.length < 3 && motivi.length + analisi.length < 3

  return {
    perClaude,
    pesi,
    rifInviati,
    fatti,
    parole,
    note,
    nomiInCalendario,
    numeriAmmessi,
    riepilogo: {
      reel_analizzati: reel.length,
      dm: temi.length > 0,
      setting: noteSetter.length > 0,
      call: analisi.length > 0 || motivi.length > 0,
      note_team: noteTeam,
    },
    insufficienti,
  }
}

function banda(n: number, soglie: [number, number], etichette: [string, string, string]): string {
  return n >= soglie[0] ? etichette[0] : n >= soglie[1] ? etichette[1] : etichette[2]
}

/** quasi_tutti from 75%, circa_meta from 35%, pochi below: the words of the setter's scale. */
function bandaTarget(target: number, totale: number): string | null {
  if (totale <= 0) return null
  const q = target / totale
  return q >= 0.75 ? 'quasi_tutti' : q >= 0.35 ? 'circa_meta' : 'pochi'
}
