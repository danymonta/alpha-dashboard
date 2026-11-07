/*
 * Liquid glass maps (1.72.0): the refraction and the specular rim of a rounded
 * rectangle of glass, as two images an SVG filter reads (feImage +
 * feDisplacementMap). A React port of the technique of vue-web-liquid-glass
 * (MIT, mkj0kjay) and of kube.io/blog/liquid-glass-css-svg: the surface profile
 * is a convex squircle, the displacement comes from Snell's law on a vertical
 * ray, the rim from the angle between the edge normal and a fixed light.
 *
 * Pure maths on ImageData-shaped arrays: the canvas lives in the component.
 * Only the bezel is computed; the rest of the map stays neutral (128, 128).
 */

export type OpzioniVetro = {
  /** Size of the glass, in CSS pixels. */
  larghezza: number
  altezza: number
  /** Corner radius, in CSS pixels. */
  raggio: number
  /** Width of the curved edge where the light bends. */
  bordo?: number
  /** Thickness of the glass: more bends further. */
  spessore?: number
  /** Refractive index (glass 1.5). */
  indice?: number
  /** Width of the bright rim, in pixels. */
  orlo?: number
  /** Angle of the light, radians (PI / 3: from the top left). */
  luce?: number
}

/** Convex squircle: steep at the outer edge, flat towards the middle. */
function profilo(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return Math.pow(1 - Math.pow(1 - t, 4), 1 / 4)
}

/**
 * The sideways shift of a vertical ray through the bezel, sampled from the
 * outer edge (0) to the flat part (1). Total internal reflection gives 0.
 */
export function spostamentiBordo(bordo: number, spessore: number, indice: number, campioni = 128): number[] {
  const eta = 1 / indice
  const h = 1e-4
  const valori: number[] = []
  for (let i = 0; i <= campioni; i++) {
    const x = i / campioni
    const y = profilo(x)
    const a = profilo(Math.max(0, x - h))
    const b = profilo(Math.min(1, x + h))
    const pendenza = (b - a) / (Math.min(1, x + h) - Math.max(0, x - h))
    // the surface normal, pointing up out of the glass
    const lung = Math.hypot(pendenza, 1)
    const nx = -pendenza / lung
    const ny = 1 / lung
    const k = 1 - eta * eta * (1 - ny * ny)
    if (k < 0) {
      valori.push(0)
      continue
    }
    const rx = -(eta * ny + Math.sqrt(k)) * nx
    const ry = eta - (eta * ny + Math.sqrt(k)) * ny
    const altezza = y * bordo + spessore
    valori.push(Number.isFinite(rx * (altezza / ry)) ? rx * (altezza / ry) : 0)
  }
  return valori
}

/**
 * Distance from the edge of the rounded rectangle (positive inside) and the
 * outward normal at that point.
 */
function bordoRettangolo(px: number, py: number, w: number, h: number, r: number) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r)
  const qy = Math.abs(py - h / 2) - (h / 2 - r)
  const sx = px < w / 2 ? -1 : 1
  const sy = py < h / 2 ? -1 : 1
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy) || 1
    return { distanza: r - l, nx: (qx / l) * sx, ny: (qy / l) * sy }
  }
  if (qx > qy) return { distanza: r - qx, nx: sx, ny: 0 }
  return { distanza: r - qy, nx: 0, ny: sy }
}

export type MappeVetro = {
  /** RGBA, R and G = sideways shift (128 = none). */
  spostamento: Uint8ClampedArray
  /** RGBA, the bright rim. */
  riflesso: Uint8ClampedArray
  larghezza: number
  altezza: number
  /** The largest shift in pixels: the scale of feDisplacementMap. */
  massimo: number
}

export function calcolaMappe(o: OpzioniVetro): MappeVetro {
  const w = Math.max(1, Math.round(o.larghezza))
  const h = Math.max(1, Math.round(o.altezza))
  const r = Math.max(0, Math.min(o.raggio, w / 2, h / 2))
  const bordo = Math.max(1, Math.min(o.bordo ?? 24, w / 2, h / 2))
  const spessore = o.spessore ?? 60
  const orlo = o.orlo ?? 1.5
  const luce = o.luce ?? Math.PI / 3
  const lx = Math.cos(luce)
  const ly = Math.sin(luce)

  const tabella = spostamentiBordo(bordo, spessore, o.indice ?? 1.5)
  const massimo = tabella.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  const ultimo = tabella.length - 1

  const spostamento = new Uint8ClampedArray(w * h * 4)
  const riflesso = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < spostamento.length; i += 4) {
    spostamento[i] = 128
    spostamento[i + 1] = 128
    spostamento[i + 3] = 255
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { distanza, nx, ny } = bordoRettangolo(x + 0.5, y + 0.5, w, h, r)
      if (distanza < 0 || distanza >= bordo) continue
      const i = (y * w + x) * 4
      const valore = Math.abs(tabella[Math.min(ultimo, Math.round((distanza / bordo) * ultimo))]) / massimo
      // the light from the edge samples the glass further in: a lens rim
      spostamento[i] = 128 - nx * valore * 127
      spostamento[i + 1] = 128 - ny * valore * 127
      if (distanza < orlo) {
        const t = distanza / orlo
        const coeff = Math.abs(nx * lx + ny * ly) * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2))
        const c = 255 * coeff
        riflesso[i] = c
        riflesso[i + 1] = c
        riflesso[i + 2] = c
        riflesso[i + 3] = c * coeff
      }
    }
  }
  return { spostamento, riflesso, larghezza: w, altezza: h, massimo }
}
