import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'

/*
 * The login background (1.72.0, Dany: «utilizza threejs nella home page per fare login per lo sfondo»):
 * embers rising slowly in the brand's fire colours, a hint of parallax with the pointer.
 *
 * Built to stay light: one draw call, every ember moved by the GPU from a seed
 * (no per-frame work on the CPU), pixel ratio capped, fewer embers on small or
 * slow devices, the loop paused while the tab is hidden. Loaded only by the
 * login page, after the first paint (components/brand/sfondo-braci.tsx), never
 * with «Riduci movimento».
 */

const VERTEX = /* glsl */ `
  attribute vec4 aSeme;
  uniform float uTempo;
  uniform float uScala;
  uniform float uPuntatore;
  varying float vVita;
  varying float vCalore;
  void main() {
    float vita = fract(aSeme.w + uTempo * (0.035 + aSeme.z * 0.05));
    vec3 p;
    p.y = -6.5 + vita * 13.0;
    p.x = aSeme.x * 10.0 + sin(p.y * 0.45 + aSeme.w * 12.0) * 0.45 + uPuntatore * 0.8 * vita;
    p.z = aSeme.y * 5.0 - 2.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float nascita = smoothstep(0.0, 0.12, vita);
    float fine = 1.0 - smoothstep(0.65, 1.0, vita);
    gl_PointSize = mix(2.0, 6.5, aSeme.z) * nascita * fine * uScala * (10.0 / -mv.z);
    vVita = vita;
    vCalore = aSeme.z;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uNucleo;
  uniform vec3 uFiamma;
  uniform vec3 uBrace;
  uniform float uOpacita;
  varying float vVita;
  varying float vCalore;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 colore = mix(uBrace, uFiamma, vCalore);
    colore = mix(colore, uNucleo, smoothstep(0.22, 0.0, d) * 0.7);
    gl_FragColor = vec4(colore, a * uOpacita * (0.3 + 0.7 * (1.0 - vVita)));
  }
`

function tokenColore(nome: string, riserva: string): Color {
  const valore = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
  try {
    return new Color(valore || riserva)
  } catch {
    return new Color(riserva)
  }
}

/** Starts the embers on the canvas; returns the function that stops them and frees the GPU. */
export function avviaScena(canvas: HTMLCanvasElement, opzioni: { chiaro: boolean; onPronta?: () => void }): () => void {
  const piccolo = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4
  const quante = piccolo ? 480 : 1000

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, piccolo ? 1.25 : 1.5))
  renderer.setClearColor(0x000000, 0)

  const scena = new Scene()
  const camera = new PerspectiveCamera(55, 1, 0.1, 50)
  camera.position.set(0, 0, 8)

  const semi = new Float32Array(quante * 4)
  for (let i = 0; i < quante; i++) {
    semi[i * 4] = Math.random() * 2 - 1
    semi[i * 4 + 1] = Math.random() * 2 - 1
    semi[i * 4 + 2] = Math.pow(Math.random(), 1.6)
    semi[i * 4 + 3] = Math.random()
  }
  const geometria = new BufferGeometry()
  geometria.setAttribute('position', new BufferAttribute(new Float32Array(quante * 3), 3))
  geometria.setAttribute('aSeme', new BufferAttribute(semi, 4))

  const materiale = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: opzioni.chiaro ? NormalBlending : AdditiveBlending,
    uniforms: {
      uTempo: { value: 0 },
      uScala: { value: 1 },
      uPuntatore: { value: 0 },
      uOpacita: { value: opzioni.chiaro ? 0.55 : 0.9 },
      // on the cream page the bright core would vanish: darker embers there
      uNucleo: { value: tokenColore(opzioni.chiaro ? '--brand-fire-ember' : '--brand-fire-core', '#ffe2a3') },
      uFiamma: { value: tokenColore(opzioni.chiaro ? '--brand-fire-ember' : '--brand-fire-flame', '#ff9a2c') },
      uBrace: { value: tokenColore(opzioni.chiaro ? '--brand-fire-deep' : '--brand-fire-ember', '#f0521d') },
    },
  })
  const punti = new Points(geometria, materiale)
  punti.frustumCulled = false
  scena.add(punti)

  const ridimensiona = () => {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    materiale.uniforms.uScala.value = Math.min(1.6, Math.max(0.8, h / 700)) * renderer.getPixelRatio()
  }
  ridimensiona()

  let puntatore = 0
  const muovi = (e: PointerEvent) => {
    puntatore = (e.clientX / window.innerWidth) * 2 - 1
  }

  let frame = 0
  let inizio = performance.now()
  let prima = true
  const disegna = (ora: number) => {
    frame = requestAnimationFrame(disegna)
    const u = materiale.uniforms
    u.uTempo.value = (ora - inizio) / 1000
    u.uPuntatore.value += (puntatore - u.uPuntatore.value) * 0.03
    camera.position.x += (puntatore * 0.35 - camera.position.x) * 0.03
    camera.lookAt(0, 0, 0)
    renderer.render(scena, camera)
    if (prima) {
      prima = false
      opzioni.onPronta?.()
    }
  }
  const visibilita = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame)
    } else {
      inizio = performance.now() - materiale.uniforms.uTempo.value * 1000
      frame = requestAnimationFrame(disegna)
    }
  }

  window.addEventListener('resize', ridimensiona)
  window.addEventListener('pointermove', muovi, { passive: true })
  document.addEventListener('visibilitychange', visibilita)
  frame = requestAnimationFrame(disegna)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', ridimensiona)
    window.removeEventListener('pointermove', muovi)
    document.removeEventListener('visibilitychange', visibilita)
    geometria.dispose()
    materiale.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
