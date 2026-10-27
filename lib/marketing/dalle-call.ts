import type { Lingua } from '@/lib/i18n/lingua'
import { CATEGORIE_OBIEZIONI } from '@/lib/call/analisi/icp-call'

/**
 * Topics from the sales calls (Dany, 27/10/2026: «una sezione che analizzi in
 * automatico le call di vendita e mi dia delle idee di topic anche solo
 * rispetto alle obiezioni»). The calls are already analysed by Claude on their
 * own (CLAUDE.md section 31): this reads those analyses, never asks Claude
 * again, and turns the objections into topics. How many calls raised each
 * objection comes from SQL (call_numeri_periodo, the calls not closed, as the
 * Closer page); here only the grouping of the texts and the words.
 *
 * Every text is the analysis' own, already cleaned of names, amounts and links
 * by the final check of the call analysis. Only the admin reads it (RLS of
 * call_analisi: the admin and the call's closer; this page is the admin's).
 */

export type CategoriaObiezione = keyof typeof CATEGORIE_OBIEZIONI

/** One analysis as the page reads it: its objections and its content ideas. */
export type AnalisiPerTopic = {
  obiezioni: { categoria: string; sintesi: string | null; gestita?: string | null; risposta?: string | null }[] | null
  spunti_contenuto: { idea: string; perche: string }[] | null
}

export type TopicObiezione = {
  categoria: string
  /** calls that raised it (from SQL); null when the count did not arrive */
  quante: number | null
  /** what the leads said, distinct, the first 3 */
  esempi: string[]
  /** how it was answered in a call where it was handled well, if any */
  risposta: string | null
  /** Claude's content ideas from calls with this objection, distinct, the first 3 */
  idee: { idea: string; perche: string }[]
}

/** A topic angle for the stories, per objection: written here, never by Claude. No prices, no promises. */
const ANGOLI_IT: Record<CategoriaObiezione, string> = {
  prezzo_cassa: 'Perché un percorso guidato costa meno degli anni persi da solo: cosa paghi davvero.',
  valore: 'Cosa cambia tra allenarsi da solo e avere un coach: un esempio concreto della settimana.',
  tempo: 'Quanto tempo serve davvero: la tua settimana tipo con 3 allenamenti a casa.',
  decisione_condivisa: 'Come parlarne con la compagna o la famiglia: perché è una scelta anche per loro.',
  eta: 'Dopo i 30 non è tardi: cosa cambia nel corpo e come si allena chi ha la tua età.',
  tempi_risultati: 'Cosa aspettarsi davvero nelle prime 4, 8 e 12 settimane, senza promesse.',
  fiducia_metodo: 'Perché funziona anche a corpo libero: il metodo spiegato in 60 secondi.',
  alimentazione: 'Mangiare senza diete impossibili: un piatto tipo della giornata.',
  rimandare: 'Il costo di aspettare «il momento giusto»: perché non arriva da solo.',
  condizioni_personali: 'Allenarsi con i propri limiti: si adatta il percorso, non si rinuncia.',
  altro: 'Rispondi alla domanda che ti fanno più spesso in call.',
}

const ANGOLI_EN: Record<CategoriaObiezione, string> = {
  prezzo_cassa: 'Why a guided path costs less than the years lost alone: what you really pay for.',
  valore: 'Training alone vs having a coach: a concrete example from the week.',
  tempo: 'How much time it really takes: your typical week with 3 home workouts.',
  decisione_condivisa: 'How to talk about it with your partner or family: it is a choice for them too.',
  eta: 'After 30 it is not too late: what changes in the body and how people your age train.',
  tempi_risultati: 'What to really expect in the first 4, 8 and 12 weeks, no promises.',
  fiducia_metodo: 'Why it works with bodyweight too: the method explained in 60 seconds.',
  alimentazione: 'Eating without impossible diets: a typical plate of the day.',
  rimandare: 'The cost of waiting for «the right moment»: why it never comes by itself.',
  condizioni_personali: 'Training with your own limits: the path adapts, you do not give up.',
  altro: 'Answer the question you get asked most in calls.',
}

const NOMI_EN: Record<CategoriaObiezione, string> = {
  prezzo_cassa: 'Price and cash flow right now',
  valore: 'Value',
  tempo: 'Time',
  decisione_condivisa: 'A decision to share',
  eta: 'Age',
  tempi_risultati: 'How long results take',
  fiducia_metodo: 'Trust in the method',
  alimentazione: 'Nutrition',
  rimandare: 'Putting it off',
  condizioni_personali: 'Personal conditions',
  altro: 'Other',
}

const nota = (c: string): c is CategoriaObiezione => c in CATEGORIE_OBIEZIONI

export function nomeCategoria(categoria: string, lingua: Lingua): string {
  if (!nota(categoria)) return categoria
  return lingua === 'en' ? NOMI_EN[categoria] : CATEGORIE_OBIEZIONI[categoria]
}

export function angoloCategoria(categoria: string, lingua: Lingua): string {
  const chiave: CategoriaObiezione = nota(categoria) ? categoria : 'altro'
  return (lingua === 'en' ? ANGOLI_EN : ANGOLI_IT)[chiave]
}

const pulito = (t: string | null | undefined) => (t ?? '').trim()
const chiaveTesto = (t: string) => t.toLowerCase().replace(/\s+/g, ' ')

function aggiungiDistinto<T>(lista: T[], voce: T, chiave: string, viste: Set<string>, max: number) {
  if (lista.length >= max || !chiave || viste.has(chiave)) return
  viste.add(chiave)
  lista.push(voce)
}

/**
 * The topics, one per objection category: the order and the numbers of the
 * SQL count (`conteggi`, most frequent first), then any category the
 * analyses have and the count does not (at the end, without a number). The
 * personal conditions never get examples: the analysis writes no summary for
 * them (CLAUDE.md section 31).
 */
export function topicDalleCall(
  analisi: readonly AnalisiPerTopic[],
  conteggi: readonly { categoria: string; quante: number }[],
  max = 3,
): TopicObiezione[] {
  const per = new Map<string, TopicObiezione & { viste: Set<string>; visteIdee: Set<string> }>()
  const prendi = (categoria: string) => {
    let t = per.get(categoria)
    if (!t) {
      t = { categoria, quante: null, esempi: [], risposta: null, idee: [], viste: new Set(), visteIdee: new Set() }
      per.set(categoria, t)
    }
    return t
  }
  for (const { categoria, quante } of conteggi) prendi(categoria).quante = quante

  for (const a of analisi) {
    const categorie = new Set<string>()
    for (const o of a.obiezioni ?? []) {
      if (!o?.categoria) continue
      categorie.add(o.categoria)
      const t = prendi(o.categoria)
      const sintesi = pulito(o.sintesi)
      if (sintesi && o.categoria !== 'condizioni_personali') aggiungiDistinto(t.esempi, sintesi, chiaveTesto(sintesi), t.viste, max)
      const risposta = pulito(o.risposta)
      if (!t.risposta && risposta && o.gestita === 'si') t.risposta = risposta
    }
    for (const c of categorie) {
      const t = prendi(c)
      for (const s of a.spunti_contenuto ?? []) {
        const idea = pulito(s?.idea)
        if (idea) aggiungiDistinto(t.idee, { idea, perche: pulito(s.perche) }, chiaveTesto(idea), t.visteIdee, max)
      }
    }
  }

  const ordine = new Map(conteggi.map((c, i) => [c.categoria, i]))
  return [...per.values()]
    .sort((a, b) => (ordine.get(a.categoria) ?? Infinity) - (ordine.get(b.categoria) ?? Infinity) || (b.esempi.length - a.esempi.length))
    .map((t) => ({ categoria: t.categoria, quante: t.quante, esempi: t.esempi, risposta: t.risposta, idee: t.idee }))
}

/** The objection counts of call_numeri_periodo ('totale'), read safely from its jsonb. */
export function conteggiObiezioni(obiezioni: unknown): { categoria: string; quante: number }[] {
  if (!Array.isArray(obiezioni)) return []
  return obiezioni.flatMap((o) => {
    const categoria = typeof o?.categoria === 'string' ? o.categoria : null
    const quante = Number(o?.quante)
    return categoria && Number.isFinite(quante) ? [{ categoria, quante }] : []
  })
}
