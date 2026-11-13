import { TEMPI, accelera, traiettoriaRazzo } from '@/lib/percorso/animazioni'

/*
 * The launch of the rocket (release B2, specification 4.4): a light canvas over the page,
 * loaded only at the moment of the launch and played once. The rocket leaves the last
 * stage of the timeline, goes up with a luminous trail and a few light sparks, out of the
 * top of the window; then the canvas fades and goes away. Colours from the brand tokens
 * (--brand-fire-*), read once; the glow is pre-drawn on a sprite, never a shadowBlur per
 * frame. Pixel ratio at most 1.5, at most 70 sparks. A hidden tab ends it at once: the
 * page «Il tuo percorso è iniziato» never waits for an animation nobody sees.
 */

/** The four strokes of the Lucide rocket (24 x 24, nose to the top right). */
const TRATTI_RAZZO = [
  'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09',
  'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z',
  'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05',
]

const SCINTILLE_MAX = 70
const SCIA_PUNTI = 26

type Colori = { core: string; flame: string; ember: string; deep: string }

type Scintilla = { x: number; y: number; vx: number; vy: number; vita: number; durata: number; r: number }

function token(nome: string, ripiego: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
  return v || ripiego
}

function coloriFuoco(): Colori {
  // the fallbacks are never used: the four tokens are defined in globals.css for both themes
  return {
    core: token('--brand-fire-core', 'currentColor'),
    flame: token('--brand-fire-flame', 'currentColor'),
    ember: token('--brand-fire-ember', 'currentColor'),
    deep: token('--brand-fire-deep', 'currentColor'),
  }
}

/** A soft round glow drawn once, stamped where light is needed (cheaper than a blur per frame). */
function sprite(colore: string, centro: string, lato: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = lato
  c.height = lato
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const g = ctx.createRadialGradient(lato / 2, lato / 2, 0, lato / 2, lato / 2, lato / 2)
  g.addColorStop(0, centro)
  g.addColorStop(0.35, colore)
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, lato, lato)
  return c
}

/**
 * Plays the launch from `origine` (the centre of the rocket stage, in window pixels) and
 * resolves when the rocket is out of the window (its last sparks fade on their own). Never
 * throws: without a canvas it resolves at once.
 */
export function lanciaRazzo(origine: { x: number; y: number }): Promise<void> {
  return new Promise((risolvi) => {
    if (typeof document === 'undefined' || document.hidden) return risolvi()
    const tela = document.createElement('canvas')
    const ctx = tela.getContext('2d')
    if (!ctx) return risolvi()

    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    const w = window.innerWidth
    const h = window.innerHeight
    tela.width = Math.round(w * dpr)
    tela.height = Math.round(h * dpr)
    tela.setAttribute('aria-hidden', 'true')
    tela.dataset.testid = 'lancio-razzo'
    Object.assign(tela.style, {
      position: 'fixed',
      inset: '0',
      width: `${w}px`,
      height: `${h}px`,
      pointerEvents: 'none',
      zIndex: '60',
      opacity: '1',
      transition: 'opacity 380ms ease-out',
    } satisfies Partial<CSSStyleDeclaration>)
    document.body.appendChild(tela)

    const fuoco = coloriFuoco()
    // on the cream of the light theme light adds to nothing: darker fire, painted over
    const chiaro = document.documentElement.classList.contains('light')
    const colori: Colori = chiaro
      ? { core: fuoco.ember, flame: fuoco.flame, ember: fuoco.deep, deep: fuoco.ember }
      : fuoco
    const luce: GlobalCompositeOperation = chiaro ? 'source-over' : 'lighter'
    const alone = sprite(colori.flame, colori.core, 64)
    const brace = sprite(colori.ember, colori.flame, 24)
    const tratti = TRATTI_RAZZO.map((d) => new Path2D(d))
    const scia: { x: number; y: number }[] = []
    const scintille: Scintilla[] = []
    const volo = TEMPI.lancio - 500
    let inizio = 0
    let ultimo = 0
    let frame = 0
    let finito = false
    let risolto = false
    // the page comes in as soon as the rocket is out of the window; the last sparks fade over it
    const avvisa = () => {
      if (risolto) return
      risolto = true
      risolvi()
    }

    const fine = () => {
      if (finito) return
      finito = true
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', nascosta)
      avvisa()
      tela.style.opacity = '0'
      window.setTimeout(() => tela.remove(), 400)
    }
    const nascosta = () => {
      if (document.hidden) fine()
    }
    document.addEventListener('visibilitychange', nascosta)

    // the tail of the rocket, in the rocket's own 24 x 24 space (the exhaust, bottom left)
    const coda = { x: 3.4, y: 20.6 }

    const disegna = (ora: number) => {
      if (!inizio) {
        inizio = ora
        ultimo = ora
      }
      const dt = Math.min(0.05, (ora - ultimo) / 1000)
      ultimo = ora
      const t = (ora - inizio) / volo
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const p = traiettoriaRazzo(Math.min(1, t), origine, h)
      const s = 1.5 * p.scala
      // the tail in window pixels: rotate the local point by -45° and scale
      const cx = coda.x - 12
      const cy = coda.y - 12
      const cos = Math.SQRT1_2
      const sin = -Math.SQRT1_2
      const tx = p.x + (cx * cos - cy * sin) * s
      const ty = p.y + (cx * sin + cy * cos) * s

      if (t > 1) avvisa()
      if (t <= 1) {
        scia.push({ x: tx, y: ty })
        if (scia.length > SCIA_PUNTI) scia.shift()
        // a few sparks, more as it speeds up
        const nuove = 1 + Math.round(accelera(t) * 2)
        for (let i = 0; i < nuove && scintille.length < SCINTILLE_MAX; i++) {
          scintille.push({
            x: tx,
            y: ty,
            vx: (Math.random() - 0.5) * 70,
            vy: 40 + Math.random() * 90,
            vita: 0,
            durata: 0.45 + Math.random() * 0.4,
            r: 1 + Math.random() * 1.6,
          })
        }
      } else if (scia.length > 0) {
        scia.shift()
      }

      ctx.globalCompositeOperation = luce
      // the trail: a tapering line, the newest part brightest
      for (let i = 1; i < scia.length; i++) {
        const a = scia[i - 1]!
        const b = scia[i]!
        const k = i / scia.length
        ctx.strokeStyle = k > 0.6 ? colori.core : k > 0.3 ? colori.flame : colori.ember
        ctx.globalAlpha = 0.15 + k * 0.75
        ctx.lineWidth = 1 + k * 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      // the sparks: they fall, slow down and fade
      for (let i = scintille.length - 1; i >= 0; i--) {
        const sc = scintille[i]!
        sc.vita += dt
        if (sc.vita >= sc.durata) {
          scintille.splice(i, 1)
          continue
        }
        sc.x += sc.vx * dt
        sc.y += sc.vy * dt
        sc.vx *= 0.96
        const k = 1 - sc.vita / sc.durata
        ctx.globalAlpha = k
        const lato = sc.r * 8
        ctx.drawImage(brace, sc.x - lato / 2, sc.y - lato / 2, lato, lato)
      }

      if (t <= 1) {
        // the glow behind the rocket, then the rocket itself
        ctx.globalAlpha = chiaro ? 0.45 : 0.9
        ctx.drawImage(alone, tx - 36, ty - 36, 72, 72)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(-Math.PI / 4)
        ctx.scale(s, s)
        ctx.translate(-12, -12)
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.fillStyle = chiaro ? fuoco.core : colori.deep
        ctx.fill(tratti[2]!)
        ctx.strokeStyle = chiaro ? fuoco.deep : colori.core
        for (const tr of tratti) ctx.stroke(tr)
        ctx.restore()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1

      if (t > 1 && scintille.length === 0 && scia.length === 0) return fine()
      if (ora - inizio > TEMPI.lancio + 800) return fine()
      frame = requestAnimationFrame(disegna)
    }
    frame = requestAnimationFrame(disegna)
  })
}
