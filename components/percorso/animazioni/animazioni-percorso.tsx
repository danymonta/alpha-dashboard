'use client'

import { animate, useInView, usePageInView, useReducedMotion, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import {
  CHIAVE_VISTO,
  SCALA_POP,
  TEMPI,
  leggiVisto,
  pianoAnimazioni,
  scriviVisto,
  type Visto,
} from '@/lib/percorso/animazioni'
import type { NodoPercorso } from '@/lib/percorso/letture'

/*
 * The motion of the client's path (release B2, docs/onboarding/rilascio-b.md, «Timeline»;
 * specification 4.4), with `motion`. This module is the only one that imports it, and the
 * page loads it after its first paint (./carica.tsx): it draws nothing, it moves what the
 * page already drew, through the hooks `data-anim`. So the still page is complete without
 * it, and nothing ever jumps when it arrives. What moves:
 * - the glow of the current stage breathing (2.4 s) and the waiting rocket floating: loops,
 *   stopped out of view and with the tab hidden;
 * - a stage completed: a pop (1 → 1.15 → 1, spring), a flash of light, the check drawing,
 *   the line running to the next stage (spring), whose lock opens;
 * - an action done inside the current stage: its line moves on with a spring;
 * - the counter of the days rolling to its new value;
 * - the panel passing to its new content with a fade and a slide;
 * - the launch: the rocket goes up with its trail and sparks (./razzo-lancio.ts, a canvas
 *   loaded only then, once), then the page «Il tuo percorso è iniziato» comes in.
 * Transform and opacity only, never a blur in motion. With «Riduci movimento» the plan is
 * empty (lib/percorso/animazioni.ts, pianoAnimazioni): nothing moves at all.
 */

type Props = {
  /** The root of the page: the timeline, the counter and the panel are inside. */
  radice: RefObject<HTMLElement | null>
  nodi: readonly NodoPercorso[]
  frazioni: readonly number[]
  giorni: number | null
  chiaveVista: string
  lanciato: boolean
}

function memoria(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function leggiMemoria(): Visto | null {
  try {
    return leggiVisto(memoria()?.getItem(CHIAVE_VISTO) ?? null)
  } catch {
    return null
  }
}

function scriviMemoria(valore: string) {
  try {
    memoria()?.setItem(CHIAVE_VISTO, valore)
  } catch {
    // a private window or blocked site data: the page simply does not remember
  }
}

function dentro<T extends Element>(radice: Element | null | undefined, selettore: string): T | null {
  return (radice?.querySelector(selettore) as T | null) ?? null
}

/** Rolls a number (the text node React owns keeps its identity: only its value changes). */
function scorriNumero(el: HTMLElement, da: number, a: number): AnimationPlaybackControls | null {
  const testo = el.firstChild
  if (!testo || testo.nodeType !== Node.TEXT_NODE) return null
  const cifre = Math.max(String(da).length, String(a).length)
  el.style.display = 'inline-block'
  el.style.minWidth = `${cifre}ch`
  el.style.textAlign = 'right'
  testo.nodeValue = String(da)
  return animate(da, a, {
    duration: TEMPI.contatore / 1000,
    ease: [0.22, 1, 0.36, 1],
    onUpdate: (v) => {
      testo.nodeValue = String(Math.round(v))
    },
    onComplete: () => {
      testo.nodeValue = String(a)
      el.style.minWidth = ''
    },
  })
}

export function AnimazioniPercorso({ radice, nodi, frazioni, giorni, chiaveVista, lanciato }: Props) {
  // motion's hook, and the media query read now: the very first plan is already the right one
  const ridotto =
    useReducedMotion() === true ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const timeline = useRef<Element | null>(null)
  // the hooks need the element before their effects: a layout effect runs first
  useLayoutEffect(() => {
    timeline.current = dentro(radice.current, '[data-testid="timeline"]')
  })
  const inVista = useInView(timeline, { amount: 0.2 })
  const paginaVisibile = usePageInView()
  const attivo = inVista && paginaVisibile && !ridotto

  const prima = useRef<Visto | null | undefined>(undefined)
  const frazioniPrima = useRef<readonly number[] | null>(null)
  const vistaPrima = useRef<string | null>(null)
  const annullato = useRef<{
    chiave: string
    primaVolta: boolean
    visto: Visto | null
    frazioni: readonly number[] | null
    vista: string | null
  } | null>(null)

  const chiaveAttuale = nodi.find((n) => n.stato === 'attuale')?.chiave ?? null
  const firma = nodi.map((n) => `${n.chiave}:${n.stato}`).join('|')
  const firmaFrazioni = frazioni.join(',')

  // the loops: the breathing glow of the current stage, the floating rocket
  useEffect(() => {
    if (!attivo || !chiaveAttuale) return
    const respiro = dentro<HTMLElement>(radice.current, `[data-nodo="${chiaveAttuale}"] [data-anim="respiro"]`)
    if (!respiro) return
    const c = animate(
      respiro,
      { opacity: [0.5, 1, 0.5], transform: ['scale(1)', 'scale(1.16)', 'scale(1)'] },
      { duration: TEMPI.respiro / 1000, ease: 'easeInOut', repeat: Infinity },
    )
    return () => c.cancel()
  }, [attivo, chiaveAttuale, radice])

  useEffect(() => {
    if (!attivo || lanciato) return
    const razzo = dentro<HTMLElement>(radice.current, '[data-anim="razzo"]')
    if (!razzo) return
    const c = animate(
      razzo,
      { transform: ['translateY(0px) rotate(0deg)', 'translateY(-3px) rotate(-4deg)', 'translateY(0px) rotate(0deg)'] },
      { duration: TEMPI.fluttua / 1000, ease: 'easeInOut', repeat: Infinity },
    )
    return () => c.cancel()
  }, [attivo, lanciato, radice])

  // everything that changes: before the paint, so the new state never shows up and jumps
  useLayoutEffect(() => {
    const radiceEl = radice.current
    const chiaveRun = [firma, firmaFrazioni, giorni, lanciato, chiaveVista, ridotto].join('#')
    // a run undone and run again with the same state (React's strict mode, a remount) replays from where it started
    const ripresa = annullato.current?.chiave === chiaveRun ? annullato.current : null
    annullato.current = null
    const primaVolta = ripresa ? ripresa.primaVolta : prima.current === undefined
    const visto = ripresa ? ripresa.visto : primaVolta ? leggiMemoria() : (prima.current ?? null)
    const frazioniDa = ripresa ? ripresa.frazioni : frazioniPrima.current
    const vistaDa = ripresa ? ripresa.vista : vistaPrima.current

    const piano = pianoAnimazioni({ ridotto, prima: visto, nodi, giorni, lanciato })
    const mie: AnimationPlaybackControls[] = []
    const attese: number[] = []
    // how each element ends if this run is cut short: never left half hidden
    const finali: (() => void)[] = []
    let chiuso = false
    const corre = (c: AnimationPlaybackControls | null) => {
      if (c) mie.push(c)
    }
    const dopo = (ms: number, f: () => void) => {
      attese.push(window.setTimeout(f, ms))
    }
    // the panel's content comes in, then gives its style back: a transform left on it would trap the fixed layers inside
    const entra = (el: HTMLElement, da: number, durata: number) => {
      const c = animate(
        el,
        { opacity: [0, 1], transform: [`translateY(${da}px)`, 'translateY(0px)'] },
        { duration: durata, ease: [0.22, 1, 0.36, 1] },
      )
      corre(c)
      void c.then(() => {
        el.style.opacity = ''
        el.style.transform = ''
      })
    }
    // after a visit, the changes wait for the opening of the timeline to end
    const attesa = primaVolta ? TEMPI.linea + 120 : 0
    const nodoEl = (chiave: string) => dentro<HTMLElement>(radiceEl, `[data-nodo="${chiave}"]`)
    const contenuto = dentro<HTMLElement>(radiceEl, '[data-anim="contenuto-pannello"]')

    // a stage completed: pop, flash, the check drawn, the line running on
    for (const chiave of piano.pop) {
      const li = nodoEl(chiave)
      if (!li || (piano.lancio && li.nextElementSibling === null)) continue
      const bottone = dentro<HTMLElement>(li, '[data-anim="nodo"]')
      const lampo = dentro<HTMLElement>(li, '[data-anim="lampo"]')
      const spunta = dentro<SVGPathElement>(li, '[data-anim="spunta"]')
      const linea = dentro<HTMLElement>(li, '[data-anim="riempimento"]')
      const indice = nodi.findIndex((n) => n.chiave === chiave)
      const daLinea = primaVolta ? null : (frazioniDa?.[indice] ?? 0)
      if (spunta) {
        spunta.style.strokeDasharray = '1'
        if (!primaVolta) spunta.style.strokeDashoffset = '1'
        finali.push(() => {
          spunta.style.strokeDashoffset = '0'
        })
      }
      if (linea && daLinea !== null) {
        linea.style.transform = `scaleX(${daLinea})`
        finali.push(() => {
          linea.style.transform = `scaleX(${frazioni[indice] ?? 1})`
        })
      }
      dopo(attesa, () => {
        if (bottone) {
          const su = animate(bottone, { transform: `scale(${SCALA_POP[1]})` }, { duration: 0.14, ease: 'easeOut' })
          corre(su)
          void su.then(() => {
            if (!chiuso) corre(animate(bottone, { transform: 'scale(1)' }, { type: 'spring', stiffness: 420, damping: 11 }))
          })
          finali.push(() => {
            bottone.style.transform = ''
          })
        }
        if (lampo) {
          corre(
            animate(
              lampo,
              { opacity: [0, 0.95, 0], transform: ['scale(0.5)', 'scale(1.5)', 'scale(2)'] },
              { duration: 0.7, ease: 'easeOut' },
            ),
          )
        }
        if (spunta && !primaVolta) {
          corre(animate(spunta, { strokeDashoffset: [1, 0] }, { duration: 0.38, delay: 0.1, ease: 'easeOut' }))
        }
        if (linea && daLinea !== null) {
          corre(
            animate(
              linea,
              { transform: [`scaleX(${daLinea})`, 'scaleX(1)'] },
              { type: 'spring', stiffness: 170, damping: 22, delay: 0.25 },
            ),
          )
        }
      })
    }

    // a stage unlocked: the lock opens over the ring, then the ring breathes
    for (const chiave of piano.sblocca) {
      const li = nodoEl(chiave)
      const lucchetto = dentro<HTMLElement>(li, '[data-anim="lucchetto"]')
      const chiusoIcona = dentro<SVGElement>(li, '[data-anim="lucchetto-chiuso"]')
      const aperto = dentro<SVGElement>(li, '[data-anim="lucchetto-aperto"]')
      const anello = dentro<HTMLElement>(li, '[data-anim="anello"]')
      if (!lucchetto || !chiusoIcona || !aperto) continue
      if (!primaVolta) lucchetto.style.opacity = '1'
      finali.push(() => {
        lucchetto.style.opacity = '0'
        if (anello) anello.style.transform = ''
      })
      const inizio = attesa + (piano.pop.length > 0 ? 650 : 0)
      dopo(inizio, () => {
        corre(animate(lucchetto, { opacity: 1 }, { duration: 0.12 }))
        corre(
          animate(
            chiusoIcona,
            { transform: ['rotate(0deg)', 'rotate(-12deg)', 'rotate(8deg)', 'rotate(0deg)'] },
            { duration: 0.32 },
          ),
        )
        dopo(300, () => {
          corre(animate(chiusoIcona, { opacity: 0 }, { duration: 0.15 }))
          corre(
            animate(
              aperto,
              { opacity: [0, 1], transform: ['translateY(1px) rotate(0deg)', 'translateY(-2px) rotate(-10deg)'] },
              { duration: 0.25, ease: 'easeOut' },
            ),
          )
          dopo(380, () => {
            corre(
              animate(lucchetto, { opacity: 0, transform: ['scale(1)', 'scale(0.6)'] }, { duration: 0.3, ease: 'easeIn' }),
            )
            if (anello) {
              corre(animate(anello, { transform: ['scale(0)', 'scale(1)'] }, { type: 'spring', stiffness: 360, damping: 14 }))
            }
          })
        })
      })
    }

    // an action done inside the current stage (no stage changed): its line moves on
    if (!primaVolta && !ridotto && piano.pop.length === 0 && frazioniDa) {
      frazioni.forEach((f, i) => {
        const da = frazioniDa[i]
        if (da === undefined || da === f) return
        const linea = dentro<HTMLElement>(nodoEl(nodi[i]?.chiave ?? ''), '[data-anim="riempimento"]')
        if (!linea) return
        linea.style.transform = `scaleX(${da})`
        finali.push(() => {
          linea.style.transform = `scaleX(${f})`
        })
        corre(animate(linea, { transform: [`scaleX(${da})`, `scaleX(${f})`] }, { type: 'spring', stiffness: 170, damping: 22 }))
      })
    }

    // the days: the number rolls
    if (piano.contatore) {
      const numero = dentro<HTMLElement>(radiceEl, '[data-anim="giorni"]')
      const { da, a } = piano.contatore
      if (numero?.firstChild) {
        const testo = numero.firstChild
        if (!primaVolta) testo.nodeValue = String(da)
        finali.push(() => {
          testo.nodeValue = String(a)
          numero.style.minWidth = ''
        })
        dopo(primaVolta ? 200 : 0, () => corre(scorriNumero(numero, da, a)))
      }
    }

    // the launch: the panel waits, the rocket goes up, then the page of the started path comes in
    if (piano.lancio && contenuto) {
      const li = nodi.length > 0 ? nodoEl(nodi[nodi.length - 1]!.chiave) : null
      const razzo = dentro<HTMLElement>(li, '[data-anim="razzo"]')
      const bottone = dentro<HTMLElement>(li, '[data-anim="nodo"]')
      const lampo = dentro<HTMLElement>(li, '[data-anim="lampo"]')
      // the content of the panel waits, the glass stays: the page never looks empty while the rocket goes up
      const pannello = contenuto
      pannello.style.opacity = '0'
      if (razzo) razzo.style.opacity = '0'
      finali.push(() => {
        pannello.style.opacity = ''
        pannello.style.transform = ''
        if (razzo) {
          razzo.style.opacity = ''
          razzo.style.transform = ''
        }
      })
      dopo(attesa, () => {
        // the client tapped «Ho visto tutto» at the bottom: the rocket's stage comes into view first, so the
        // trail and the sparks start where he can see them (smooth, then the time of the scroll)
        const bersaglio = bottone ?? li
        bersaglio?.scrollIntoView({ block: 'center', inline: 'center', behavior: ridotto ? 'auto' : 'smooth' })
        dopo(ridotto ? 0 : 450, () => {
          const r = bersaglio?.getBoundingClientRect()
          const limita = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
          const origine = r
            ? {
                x: limita(r.left + r.width / 2, 24, window.innerWidth - 24),
                y: limita(r.top + r.height / 2, 96, window.innerHeight * 0.55),
              }
            : { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
          void import('./razzo-lancio')
            .then((m) => m.lanciaRazzo(origine))
            .catch(() => undefined)
            .then(() => {
              if (chiuso) return
              if (razzo) {
                corre(
                  animate(razzo, { opacity: [0, 1], transform: ['scale(0.4)', 'scale(1)'] }, { type: 'spring', stiffness: 300, damping: 13 }),
                )
              }
              if (lampo) {
                corre(
                  animate(
                    lampo,
                    { opacity: [0, 1, 0], transform: ['scale(0.5)', 'scale(1.7)', 'scale(2.3)'] },
                    { duration: 0.8, ease: 'easeOut' },
                  ),
                )
              }
              entra(pannello, 24, 0.6)
            })
        })
      })
    } else if (!primaVolta && !ridotto && vistaDa !== null && vistaDa !== chiaveVista && contenuto) {
      // the panel passes to its new content: a fade and a slide
      contenuto.style.opacity = '0'
      finali.push(() => {
        contenuto.style.opacity = ''
        contenuto.style.transform = ''
      })
      entra(contenuto, 14, TEMPI.pannello / 1000)
    }

    const lancioVisto = lanciato || (visto?.lancio ?? false)
    prima.current = { nodi: Object.fromEntries(nodi.map((n) => [n.chiave, n.stato])), giorni, lancio: lancioVisto }
    frazioniPrima.current = frazioni
    vistaPrima.current = chiaveVista
    scriviMemoria(scriviVisto(nodi, giorni, lancioVisto))

    return () => {
      chiuso = true
      for (const t of attese) window.clearTimeout(t)
      for (const c of mie) c.stop()
      for (const f of finali) f()
      annullato.current = { chiave: chiaveRun, primaVolta, visto, frazioni: frazioniDa, vista: vistaDa }
    }
    // the dependencies are the signatures of what is drawn, not the arrays (new on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, firmaFrazioni, giorni, lanciato, chiaveVista, ridotto])

  return null
}
