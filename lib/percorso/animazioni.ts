import type { NodoPercorso, PassoPercorso } from '@/lib/percorso/letture'
import type { StatoNodo } from '@/lib/percorso/nodi'

/*
 * The motion of the client's area (release B2, docs/onboarding/rilascio-b.md, «Timeline»;
 * specification 4.4): what moves, when and for how long. Pure functions only: the
 * components (components/percorso/animazioni/) read the plan and play it with `motion`,
 * the tests check it. With «Riduci movimento» the plan is empty: every state is drawn
 * still, no loop, no sequence, no rocket.
 */

/** Durations of the specification 4.4, in milliseconds. */
export const TEMPI = {
  /** the line drawing from the left up to the current stage (700-900 ms, ease-out) */
  linea: 820,
  /** the stages appearing one after the other */
  passoNodi: 60,
  entrataNodo: 320,
  /** the glow of the current stage breathing in a loop */
  respiro: 2400,
  /** the rocket floating while it waits */
  fluttua: 3200,
  /** the counter of the days rolling to its new value */
  contatore: 900,
  /** the panel passing to its new content (fade and slide) */
  pannello: 360,
  /** the rocket going up with its trail, then the page «Il tuo percorso è iniziato» */
  lancio: 2300,
} as const

/** A light «pop» of a completed stage: 1 → 1.15 → 1. */
export const SCALA_POP = [1, 1.15, 1] as const

/**
 * How full the line out of a stage is: 1 after a completed stage, 0 after a future one;
 * after the current stage it fills by the actions done in it (2 of 4 = 50%). A step done
 * counts 1; a checklist (the test week) counts the items ticked.
 */
export function frazioneNodo(nodo: Pick<NodoPercorso, 'chiave' | 'stato'>, passi: readonly PassoPercorso[]): number {
  if (nodo.stato === 'completato') return 1
  if (nodo.stato === 'futuro') return 0
  const suoi = passi.filter((p) => p.nodo === nodo.chiave)
  if (suoi.length === 0) return 0
  let fatto = 0
  for (const p of suoi) {
    if (p.stato === 'fatto') {
      fatto += 1
      continue
    }
    const voci = (p.blocchi ?? []).filter((b) => b.tipo === 'voce')
    if (voci.length > 0) fatto += voci.filter((v) => v.tipo === 'voce' && v.spuntata).length / voci.length
  }
  // never the whole segment before the stage is completed: the last stretch is its completion
  return Math.max(0, Math.min(0.92, fatto / suoi.length))
}

/**
 * When each segment of the line starts and how long it draws, so the line goes from the
 * left to the current stage in TEMPI.linea, one segment after the other, the last one
 * slowing down (ease-out). Segments after the current stage do not draw.
 */
export function tempiLinea(
  nodi: readonly Pick<NodoPercorso, 'stato'>[],
): { ritardo: number; durata: number; curva: 'linear' | 'ease-out' }[] {
  const disegnati = nodi.slice(0, -1).filter((n) => n.stato !== 'futuro').length
  const passo = disegnati > 0 ? TEMPI.linea / disegnati : 0
  let i = 0
  return nodi.map((n, indice) => {
    if (indice === nodi.length - 1 || n.stato === 'futuro') return { ritardo: 0, durata: 0, curva: 'linear' as const }
    const t = {
      ritardo: Math.round(i * passo),
      durata: Math.round(passo),
      // one line, not seven: straight through the segments, slowing down on the last one
      curva: i === disegnati - 1 ? ('ease-out' as const) : ('linear' as const),
    }
    i += 1
    return t
  })
}

/** The delay of a stage in the opening sequence (stagger of 60 ms). */
export function ritardoNodo(indice: number): number {
  return Math.max(0, indice) * TEMPI.passoNodi
}

/** What the page remembers between two visits, per browser: a convenience, never a datum. */
export type Visto = {
  nodi: Record<string, StatoNodo>
  giorni: number | null
  lancio: boolean
}

export const CHIAVE_VISTO = 'alpha_percorso_visto'

/** The memory of the last visit, read without trusting it: anything odd is «nothing seen». */
export function leggiVisto(grezzo: string | null): Visto | null {
  if (!grezzo) return null
  let v: unknown
  try {
    v = JSON.parse(grezzo)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const nodi: Record<string, StatoNodo> = {}
  if (o.nodi && typeof o.nodi === 'object' && !Array.isArray(o.nodi)) {
    for (const [k, s] of Object.entries(o.nodi as Record<string, unknown>)) {
      if (s === 'completato' || s === 'attuale' || s === 'futuro') nodi[k] = s
    }
  }
  const giorni = typeof o.giorni === 'number' && Number.isFinite(o.giorni) && o.giorni >= 0 ? Math.round(o.giorni) : null
  return { nodi, giorni, lancio: o.lancio === true }
}

export function scriviVisto(nodi: readonly NodoPercorso[], giorni: number | null, lancio: boolean): string {
  return JSON.stringify({ nodi: Object.fromEntries(nodi.map((n) => [n.chiave, n.stato])), giorni, lancio } satisfies Visto)
}

/** The stages that changed since the last state seen: completed now, and unlocked now. */
export function transizioniNodi(
  prima: Record<string, StatoNodo> | null,
  dopo: readonly Pick<NodoPercorso, 'chiave' | 'stato'>[],
): { completati: string[]; sbloccati: string[] } {
  if (!prima || Object.keys(prima).length === 0) return { completati: [], sbloccati: [] }
  const completati: string[] = []
  const sbloccati: string[] = []
  for (const n of dopo) {
    const p = prima[n.chiave]
    if (!p) continue
    if (n.stato === 'completato' && p !== 'completato') completati.push(n.chiave)
    if (n.stato === 'attuale' && p === 'futuro') sbloccati.push(n.chiave)
  }
  return { completati, sbloccati }
}

export type PianoAnimazioni = {
  /** the glow of the current stage breathing, and the rocket floating: loops, paused out of view */
  respiro: boolean
  fluttua: boolean
  /** a stage just completed: pop, a flash of light, the check drawing */
  pop: string[]
  /** a stage just unlocked: the lock opening */
  sblocca: string[]
  /** the counter of the days rolling from one value to the other */
  contatore: { da: number; a: number } | null
  /** the rocket going up, once */
  lancio: boolean
}

export const PIANO_FERMO: PianoAnimazioni = {
  respiro: false,
  fluttua: false,
  pop: [],
  sblocca: [],
  contatore: null,
  lancio: false,
}

/**
 * What to play now. `prima` is the state the page last showed (this visit, or the last
 * visit from the memory of the browser); null the first time ever, when nothing moves but
 * the loops. With «Riduci movimento» nothing at all.
 */
export function pianoAnimazioni({
  ridotto,
  prima,
  nodi,
  giorni,
  lanciato,
}: {
  ridotto: boolean
  prima: Visto | null
  nodi: readonly Pick<NodoPercorso, 'chiave' | 'stato'>[]
  giorni: number | null
  lanciato: boolean
}): PianoAnimazioni {
  if (ridotto) return PIANO_FERMO
  const attuale = nodi.some((n) => n.stato === 'attuale')
  const t = transizioniNodi(prima?.nodi ?? null, nodi)
  const contatore =
    prima && prima.giorni !== null && giorni !== null && prima.giorni !== giorni ? { da: prima.giorni, a: giorni } : null
  return {
    respiro: attuale,
    fluttua: !lanciato,
    pop: t.completati,
    sblocca: t.sbloccati,
    contatore,
    // the launch only once, and only when the page saw the path before it started (never on a first visit after it)
    lancio: lanciato && prima !== null && !prima.lancio,
  }
}

/* The rocket ----------------------------------------------------------------------------- */

/** Ease-in for the rocket: slow from the pad, then fast up. */
export function accelera(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * x
}

/**
 * Where the rocket is at `t` (0-1) of its flight: from the stage on the timeline up and
 * out of the top of the window, drifting a little to the right.
 */
export function traiettoriaRazzo(
  t: number,
  origine: { x: number; y: number },
  altezza: number,
): { x: number; y: number; scala: number } {
  const k = accelera(t)
  const salita = origine.y + altezza * 0.25
  return {
    x: origine.x + Math.sin(k * Math.PI * 0.5) * Math.min(80, altezza * 0.08),
    y: origine.y - k * salita,
    scala: 1 + k * 0.6,
  }
}
