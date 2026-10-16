/**
 * The health of a person stays out of the app (1.37.0, CLAUDE.md sections 15 and 31, Dany
 * 16/10/2026). A call talks about the body: a diagnosis, a cure, an injury, a medical check,
 * the mind, the numbers of the body. Claude is told not to write them; this closed lexicon
 * is the net under that instruction: an entry of a list that speaks of them is taken out
 * whole, and in the sentences of a summary the sentence goes.
 *
 * Pure, no I/O, and it grows without a migration: a word the first analyses show is one
 * line here and one in tests/call-analisi-salute.test.ts.
 *
 * What does NOT count: the aesthetic wishes of the ICP («petto più pieno», «fit, non
 * grosso», «spalle e braccia»), the weight of the work («stress», «stanco»). The NAME of a
 * physical condition does count when it is said of a person (pectus, «petto incavato»,
 * «petto carenato»): in a text about a lead they become «il petto». The same words stay
 * possible in the weekly themes for the Marketing area, which speak of no one.
 */

const senzaAccenti = (t: string) => t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

// whole words or stems (a word that starts with them), accents and case ignored
const RADICI = [
  // conditions and diagnoses
  'diagnos', 'patolog', 'malattia', 'malato', 'malati', 'sindrome', 'ernia', 'ernie', 'protrusion', 'scoliosi', 'cifosi',
  'lordosi', 'artrosi', 'artrite', 'tendinit', 'infiammazion', 'cervicalgia', 'sciatalgia', 'lombalgia', 'osteopor',
  'fibromialgia', 'celiachia', 'diabete', 'diabetic', 'ipertensi', 'ipotensi', 'colesterol', 'tiroide', 'tiroid',
  'cardiopat', 'aritmi', 'infarto', 'ictus', 'tumor', 'cancro', 'asma', 'allergi', 'intolleranz', 'emicrania',
  'insonnia', 'apnee',
  // injuries and operations
  'infortun', 'frattur', 'distors', 'strappo', 'lesion', 'operazion', 'operato', 'intervento chirurgico', 'chirurg',
  'protesi', 'cicatrice', 'postoperator',
  // doctors, exams, therapies
  'medico', 'medici', 'dottor', 'ortoped', 'fisioterap', 'osteopata', 'cardiolog', 'endocrinolog', 'neurolog', 'psicolog',
  'psichiatr', 'psicoterap', 'terapia', 'terapie', 'farmac', 'medicin', 'pillol', 'antibiotic', 'cortison', 'integratori medic',
  'controlli medici', 'controllo medico', 'bmi', 'esame del sangue', 'esami medici', 'esame medico', 'visita medica', 'visite mediche', 'esami del sangue', 'analisi del sangue',
  'risonanza', 'radiograf', 'ecograf', 'elettrocardiogramma', 'ricover', 'ospedal', 'pronto soccorso', 'certificato medico',
  // the mind
  'depressione', 'depresso', 'ansia', 'ansios', 'panico', 'attacchi di panico', 'burnout', 'disturbo', 'disturbi', 'anoressi',
  'bulimi', 'binge', 'autolesion', 'ossessiv', 'bipolar',
  // pain and symptoms
  'dolori', 'dolore', 'mal di schiena', 'mal di testa', 'nausea', 'vertigin', 'svenimenti', 'palpitazioni', 'gravidanza',
  'menopausa', 'andropausa', 'testosterone basso', 'ormon',
]

// the numbers of the body: a figure near kilos, centimetres, BMI, fat mass, a percentage of fat
const RE_NUMERI_DEL_CORPO = new RegExp(
  [
    String.raw`\d+(?:[.,]\d+)?\s*(?:kg|kili|chili|chilogramm\w*|cm|centimetr\w*|bmi)\b`,
    String.raw`\b(?:bmi|massa grassa|peso|pesavo|peso di|pesa)\b[^.!?]{0,20}\d+(?:[.,]\d+)?`,
    String.raw`\d+(?:[.,]\d+)?\s*%\s*(?:di\s+)?(?:massa grassa|grasso)`,
  ].join('|'),
  'iu',
)

const RE_RADICI = new RegExp(`(?<![\\p{L}\\p{N}])(?:${RADICI.map((r) => senzaAccenti(r).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'u')

/** Whether the text speaks of the health of someone (the lexicon above). */
export function parlaDiSalute(testo: string): boolean {
  const t = senzaAccenti(testo)
  return RE_RADICI.test(t) || RE_NUMERI_DEL_CORPO.test(t)
}

/** The name of a physical condition said of a person becomes «il petto». */
const RE_NOME_CONDIZIONE =
  /\b(?:(il|lo|un|uno|del|dello|dal|nel|sul|al)\s+)?(?:pectus(?:\s+(?:excavatum|carenatum))?|petto\s+(?:incavato|carenato|escavato|a\s+imbuto)|imbuto\s+toracico)\b/giu

export function pettoNeutro(testo: string): string {
  return testo.replace(RE_NOME_CONDIZIONE, (trovato: string, articolo: string | undefined) => {
    const a = articolo?.toLowerCase()
    const neutro = !a || a === 'un' || a === 'uno' || a === 'lo' || a === 'il' ? 'il petto' : `${a} petto`
    // at the start of a sentence it keeps its capital
    return /^\p{Lu}/u.test(trovato) ? neutro[0].toUpperCase() + neutro.slice(1) : neutro
  })
}

/** Whether the text still holds the name of a physical condition (after pettoNeutro it does not). */
export function nominaUnaCondizione(testo: string): boolean {
  return new RegExp(RE_NOME_CONDIZIONE.source, 'iu').test(testo)
}

/** The entries of a list that do not speak of health, the others out whole; the name of a condition neutral. */
export function pulisciElenco(voci: readonly string[]): { voci: string[]; tolte: number } {
  const uscita: string[] = []
  let tolte = 0
  for (const v of voci) {
    if (parlaDiSalute(v)) {
      tolte++
      continue
    }
    uscita.push(pettoNeutro(v))
  }
  return { voci: uscita, tolte }
}

/**
 * A running text (a summary, a point A): the sentences that speak of health go. Sentences end
 * at . ! ? or a line break. Returns the text and how many sentences were taken out.
 */
export function pulisciTesto(testo: string): { testo: string; tolte: number } {
  const frasi = testo.match(/[^.!?\n]+[.!?]*\s*/gu) ?? [testo]
  let tolte = 0
  const tenute = frasi.filter((f) => {
    if (parlaDiSalute(f)) {
      tolte++
      return false
    }
    return true
  })
  return { testo: pettoNeutro(tenute.join('').trim()), tolte }
}
