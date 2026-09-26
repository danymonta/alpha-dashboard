/**
 * Rising embers on a 2D canvas, for the brand moment only (login and intro).
 *
 * Cost model: a fixed pool (at most `massimo` particles, never more than 60),
 * one pre-rendered glow sprite per fire colour, one drawImage per live ember
 * per frame. No shadowBlur, no per-frame gradients, no allocations in the loop.
 * The loop stops when the tab is hidden, when the canvas leaves the viewport
 * and under prefers-reduced-motion. The returned function undoes everything.
 */

export type Margini = {
  /** Canvas overflow around the logo box: fractions of the logo width... */
  sinistra: number
  destra: number
  /** ...and of the logo height. */
  sopra: number
  sotto: number
}

export type OpzioniBraci = {
  /** Pool size: hard cap on live embers. */
  massimo: number
  /** Steady emission, embers per second. 0 = only the burst. */
  perSecondo: number
  /** Logo height / logo width. */
  rapporto: number
  margini: Margini
  /** One-shot burst from the centre of the logo, for the intro. */
  esplosione?: { ritardo: number; quante: number }
}

type Brace = {
  viva: boolean
  // Position and speed in logo widths (and logo widths per second), origin at
  // the top-left of the logo box: the canvas can resize without losing state.
  x: number
  y: number
  vx: number
  vy: number
  eta: number
  vita: number
  raggio: number
  fase: number
  freq: number
  deriva: number
  attrito: number
  calda: boolean
}

const LIMITE_ASSOLUTO = 60
const DPR_MASSIMO = 2
const DT_MASSIMO = 0.05
const PRERISCALDO_S = 2.4
const LATO_SPRITE = 64
const TOKEN_COLORI = ['--brand-fire-core', '--brand-fire-flame', '--brand-fire-ember'] as const

function casuale(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/** Parses the fire tokens, which are hex by convention; rgb() is tolerated. */
function componentiRgb(valore: string): [number, number, number] | null {
  const v = valore.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

/** One soft glow per colour, rendered once: drawing it is a plain blit. */
function creaSprite(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const stile = getComputedStyle(canvas)
  const sprite: HTMLCanvasElement[] = []
  for (const token of TOKEN_COLORI) {
    const rgb = componentiRgb(stile.getPropertyValue(token))
    if (!rgb) continue
    const s = document.createElement('canvas')
    s.width = LATO_SPRITE
    s.height = LATO_SPRITE
    const c = s.getContext('2d')
    if (!c) continue
    const [r, g, b] = rgb
    const meta = LATO_SPRITE / 2
    const grad = c.createRadialGradient(meta, meta, 0, meta, meta, meta)
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`)
    grad.addColorStop(0.16, `rgba(${r},${g},${b},0.9)`)
    grad.addColorStop(0.38, `rgba(${r},${g},${b},0.28)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    c.fillStyle = grad
    c.fillRect(0, 0, LATO_SPRITE, LATO_SPRITE)
    sprite.push(s)
  }
  return sprite
}

export function avviaBraci(canvas: HTMLCanvasElement, opzioni: OpzioniBraci): () => void {
  const ctx = canvas.getContext('2d')
  const sprite = ctx ? creaSprite(canvas) : []
  if (!ctx || sprite.length === 0) return () => {}

  const { rapporto, margini } = opzioni
  const massimo = Math.min(opzioni.massimo, LIMITE_ASSOLUTO)
  const pool: Brace[] = Array.from({ length: massimo }, () => ({
    viva: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    eta: 0,
    vita: 1,
    raggio: 0,
    fase: 0,
    freq: 0,
    deriva: 0,
    attrito: 0,
    calda: false,
  }))

  const movimentoRidotto = window.matchMedia('(prefers-reduced-motion: reduce)')
  let larghezzaLogo = 0
  let origineX = 0
  let origineY = 0
  let raf = 0
  let ultimo = 0
  let accumulo = 0
  let tabVisibile = !document.hidden
  let inVista = true
  let timerEsplosione: ReturnType<typeof setTimeout> | undefined

  function ridimensiona() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MASSIMO)
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    larghezzaLogo = width / (1 + margini.sinistra + margini.destra)
    origineX = margini.sinistra * larghezzaLogo
    origineY = margini.sopra * larghezzaLogo * rapporto
  }

  function slotLibero() {
    for (const b of pool) if (!b.viva) return b
    return null
  }

  function emetti() {
    const b = slotLibero()
    if (!b) return
    const zona = Math.random()
    if (zona < 0.6) {
      // Behind and below the lettering
      b.x = casuale(0.12, 0.88)
      b.y = rapporto * casuale(0.86, 1)
    } else if (zona < 0.85) {
      // Along the outer flanks
      b.x = Math.random() < 0.5 ? casuale(-0.02, 0.1) : casuale(0.9, 1.02)
      b.y = rapporto * casuale(0.45, 0.92)
    } else {
      // A few sparks drifting over the shoulders
      b.x = casuale(0.2, 0.8)
      b.y = rapporto * casuale(0.55, 0.75)
    }
    b.vx = casuale(-0.02, 0.02)
    b.vy = -casuale(0.1, 0.28)
    b.eta = 0
    b.vita = casuale(1.8, 3.6)
    b.raggio = casuale(0.004, 0.012)
    b.fase = casuale(0, Math.PI * 2)
    b.freq = casuale(1.2, 3.2)
    b.deriva = casuale(0.015, 0.05)
    b.attrito = 0.35
    b.calda = Math.random() < 0.3
    b.viva = true
  }

  function esplodi(quante: number) {
    for (let i = 0; i < quante; i++) {
      const b = slotLibero()
      if (!b) return
      // Mostly upwards and sideways, a few downwards
      const angolo = -Math.PI / 2 + casuale(-1, 1) * Math.PI * 0.8
      const velocita = casuale(0.45, 1.25)
      b.x = 0.5 + casuale(-0.06, 0.06)
      b.y = rapporto * casuale(0.5, 0.6)
      b.vx = Math.cos(angolo) * velocita
      b.vy = Math.sin(angolo) * velocita
      b.eta = 0
      b.vita = casuale(0.9, 1.9)
      b.raggio = casuale(0.006, 0.014)
      b.fase = casuale(0, Math.PI * 2)
      b.freq = casuale(2, 4)
      b.deriva = casuale(0.02, 0.06)
      b.attrito = 2.6
      b.calda = Math.random() < 0.6
      b.viva = true
    }
  }

  function aggiorna(dt: number) {
    accumulo += opzioni.perSecondo * dt
    while (accumulo >= 1) {
      emetti()
      accumulo -= 1
    }
    const smorzamento = (attrito: number) => Math.exp(-attrito * dt)
    for (const b of pool) {
      if (!b.viva) continue
      b.eta += dt
      if (b.eta >= b.vita) {
        b.viva = false
        continue
      }
      const s = smorzamento(b.attrito)
      // Drag, a little lift, and a lateral wobble the ember eases towards
      b.vy = b.vy * s - 0.05 * dt
      const obiettivoVx = Math.sin(b.fase + b.eta * b.freq) * b.deriva
      b.vx = b.vx * s + (obiettivoVx - b.vx) * Math.min(1, 1.5 * dt)
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
  }

  function disegna() {
    const c = ctx!
    c.clearRect(0, 0, canvas.width, canvas.height)
    c.globalCompositeOperation = 'lighter'
    for (const b of pool) {
      if (!b.viva) continue
      const k = b.eta / b.vita
      const entrata = Math.min(1, k / 0.12)
      const uscita = Math.min(1, (1 - k) / 0.45)
      const tremolio = 0.72 + 0.28 * Math.sin(b.fase * 3 + b.eta * b.freq * 4)
      const alfa = entrata * uscita * tremolio
      if (alfa <= 0.01) continue
      // Embers cool down: core -> flame -> ember
      const indice = k < 0.25 && b.calda ? 0 : k < 0.6 ? 1 : 2
      const img = sprite[Math.min(indice, sprite.length - 1)]
      const r = b.raggio * larghezzaLogo * 3.2 * (1 - 0.35 * k)
      c.globalAlpha = alfa
      c.drawImage(
        img,
        origineX + b.x * larghezzaLogo - r,
        origineY + b.y * larghezzaLogo - r,
        r * 2,
        r * 2,
      )
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
  }

  function fotogramma(t: number) {
    raf = requestAnimationFrame(fotogramma)
    const dt = Math.min(DT_MASSIMO, Math.max(0, (t - ultimo) / 1000))
    ultimo = t
    aggiorna(dt)
    disegna()
  }

  function sincronizza() {
    const deveAnimare = tabVisibile && inVista && !movimentoRidotto.matches
    if (deveAnimare && raf === 0) {
      ultimo = performance.now()
      raf = requestAnimationFrame(fotogramma)
    } else if (!deveAnimare && raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    if (movimentoRidotto.matches) {
      for (const b of pool) b.viva = false
      ctx!.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const alCambioVisibilita = () => {
    tabVisibile = !document.hidden
    sincronizza()
  }
  const osservatoreVista = new IntersectionObserver(([voce]) => {
    inVista = voce?.isIntersecting ?? true
    sincronizza()
  })
  const osservatoreMisure = new ResizeObserver(() => {
    ridimensiona()
    if (raf === 0) disegna()
  })

  ridimensiona()
  if (!movimentoRidotto.matches) {
    // Start with a lived-in fire instead of an empty canvas.
    if (opzioni.perSecondo > 0) {
      for (let t = 0; t < PRERISCALDO_S; t += 1 / 30) aggiorna(1 / 30)
    }
    if (opzioni.esplosione) {
      const { ritardo, quante } = opzioni.esplosione
      timerEsplosione = setTimeout(() => {
        if (!movimentoRidotto.matches) esplodi(quante)
      }, ritardo)
    }
  }

  document.addEventListener('visibilitychange', alCambioVisibilita)
  movimentoRidotto.addEventListener('change', sincronizza)
  osservatoreVista.observe(canvas)
  osservatoreMisure.observe(canvas)
  sincronizza()

  return () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    raf = 0
    clearTimeout(timerEsplosione)
    document.removeEventListener('visibilitychange', alCambioVisibilita)
    movimentoRidotto.removeEventListener('change', sincronizza)
    osservatoreVista.disconnect()
    osservatoreMisure.disconnect()
    // Release the backing store right away instead of waiting for GC.
    canvas.width = 0
    canvas.height = 0
  }
}
