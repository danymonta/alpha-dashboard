'use client'

import { ArrowLeft, ArrowRight, Pointer, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { segnaTutorialVisto } from '@/app/actions/tutorial'
import { EVENTO_INTRO_FINITA } from '@/components/brand/intro-ingresso'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import type { AppRole } from '@/lib/auth/roles'
import { TUTORIAL } from '@/lib/i18n/testi/tutorial'
import { ATTESA_LETTURA_MS, FUNZIONE, percorsoPer, suPagina, type PassoTutorial } from '@/lib/tutorial/percorsi'
import { cn } from '@/lib/utils'

type ContestoTutorial = {
  /** Starts the tour: your own, or another role's as a preview (admin). */
  avvia: (ruolo?: AppRole) => void
}

const Contesto = createContext<ContestoTutorial | null>(null)

export function useTutorial(): ContestoTutorial {
  const c = useContext(Contesto)
  if (!c) throw new Error('useTutorial fuori da TutorialProvider')
  return c
}

/**
 * The guided tour of the first sign-in (CLAUDE.md section 21). It starts by
 * itself once, after the brand intro, for whoever has not seen it; the
 * profile page and the admin's "Testa il tutorial" start it again.
 */
export function TutorialProvider({
  ruolo,
  primoAccesso,
  children,
}: {
  ruolo: AppRole
  primoAccesso: boolean
  children: ReactNode
}) {
  const [attivo, setAttivo] = useState<{ ruolo: AppRole; anteprima: boolean } | null>(null)
  const valore = useMemo<ContestoTutorial>(
    () => ({ avvia: (r?: AppRole) => setAttivo({ ruolo: r ?? ruolo, anteprima: Boolean(r && r !== ruolo) }) }),
    [ruolo],
  )

  // first sign-in: after the intro, if it is playing
  useEffect(() => {
    if (!primoAccesso) return
    let partito = false
    const parti = () => {
      if (partito) return
      partito = true
      setAttivo({ ruolo, anteprima: false })
    }
    const inAttesa = setTimeout(() => {
      if (document.documentElement.dataset.intro) window.addEventListener(EVENTO_INTRO_FINITA, parti, { once: true })
      else parti()
    }, 400)
    return () => {
      clearTimeout(inAttesa)
      window.removeEventListener(EVENTO_INTRO_FINITA, parti)
    }
  }, [primoAccesso, ruolo])

  const chiudi = useCallback(() => {
    // a preview (admin) marks nothing: only your own tour counts as seen
    if (attivo && !attivo.anteprima) void segnaTutorialVisto()
    setAttivo(null)
  }, [attivo])

  return (
    <Contesto.Provider value={valore}>
      {children}
      {attivo ? (
        <Tour key={`${attivo.ruolo}-${attivo.anteprima}`} ruolo={attivo.ruolo} anteprima={attivo.anteprima} chiudi={chiudi} />
      ) : null}
    </Contesto.Provider>
  )
}

/** The first matching element that is actually on screen. */
function elementoVisibile(ids: string[] | undefined): HTMLElement | null {
  for (const id of ids ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

type Riquadro = { top: number; left: number; width: number; height: number }

const MARGINE = 16
const LARGHEZZA_SCHEDA = 340
const ALONE = 6

function riquadroDi(el: HTMLElement | null): Riquadro | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top - ALONE, left: r.left - ALONE, width: r.width + ALONE * 2, height: r.height + ALONE * 2 }
}

/** Where the card goes: beside the highlight on desktop, above or below it on the phone. */
function posizioneScheda(r: Riquadro | null, altezzaScheda: number): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!r) {
    return vw < 640
      ? { top: '50%', left: MARGINE, right: MARGINE, transform: 'translateY(-50%)' }
      : { top: '50%', left: '50%', width: LARGHEZZA_SCHEDA, transform: 'translate(-50%, -50%)' }
  }

  if (vw < 640) {
    // phone: full width, on the side of the screen the highlight is not
    const inBasso = r.top + r.height / 2 > vh / 2
    return inBasso
      ? { top: `calc(env(safe-area-inset-top) + ${MARGINE}px)`, left: MARGINE, right: MARGINE }
      : { bottom: `calc(env(safe-area-inset-bottom) + ${MARGINE}px)`, left: MARGINE, right: MARGINE }
  }

  const limitaTop = (t: number) => Math.min(Math.max(MARGINE, t), vh - altezzaScheda - MARGINE)
  const limitaLeft = (l: number) => Math.min(Math.max(MARGINE, l), vw - LARGHEZZA_SCHEDA - MARGINE)
  // right of it (sidebar items), else below, else above, else left
  if (r.left + r.width + MARGINE + LARGHEZZA_SCHEDA < vw) {
    return { top: limitaTop(r.top), left: r.left + r.width + MARGINE, width: LARGHEZZA_SCHEDA }
  }
  if (r.top + r.height + MARGINE + altezzaScheda < vh) {
    return { top: r.top + r.height + MARGINE, left: limitaLeft(r.left + r.width - LARGHEZZA_SCHEDA), width: LARGHEZZA_SCHEDA }
  }
  if (r.top - MARGINE - altezzaScheda > 0) {
    return { top: r.top - MARGINE - altezzaScheda, left: limitaLeft(r.left + r.width - LARGHEZZA_SCHEDA), width: LARGHEZZA_SCHEDA }
  }
  return { top: limitaTop(r.top), left: limitaLeft(r.left - MARGINE - LARGHEZZA_SCHEDA), width: LARGHEZZA_SCHEDA }
}

function Tour({ ruolo, anteprima, chiudi }: { ruolo: AppRole; anteprima: boolean; chiudi: () => void }) {
  const lingua = useLingua()
  const testi = TUTORIAL[lingua]
  const passi = useMemo(() => percorsoPer(ruolo, lingua), [ruolo, lingua])
  const [indice, setIndice] = useState(0)
  const passo: PassoTutorial = passi[indice]
  const [riquadro, setRiquadro] = useState<Riquadro | null>(null)
  // the step whose reading time is over: "pronto" means the current one
  const [lettoFinoA, setLettoFinoA] = useState(-1)
  const pronto = lettoFinoA >= indice
  const [altezza, setAltezza] = useState(220)
  const scheda = useRef<HTMLDivElement>(null)
  const ultimo = indice === passi.length - 1
  const pathname = usePathname()
  const router = useRouter()

  // a step lives on its page: open it (not in the admin's preview, where
  // another role's pages are not reachable)
  const naviga = !anteprima && passo.pagina && !suPagina(pathname, passo.pagina)
  useEffect(() => {
    if (naviga && passo.pagina) router.push(passo.pagina)
  }, [naviga, passo.pagina, router])

  // "tocca qui": the highlighted link itself moves the tour on
  const interattivo = Boolean(passo.clic) && !anteprima
  const [elemento, setElemento] = useState<HTMLElement | null>(null)

  // find the highlighted element (a new page may still be arriving: try for a
  // few seconds) and follow it while the page moves
  useLayoutEffect(() => {
    let frame = 0
    let tentativo: ReturnType<typeof setTimeout> | undefined
    let tentativi = 0
    let trovato = false
    const misura = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = elementoVisibile(passo.target)
        setElemento(el)
        setRiquadro(riquadroDi(el))
        if (scheda.current) setAltezza(scheda.current.offsetHeight)
      })
    }
    const cerca = () => {
      const el = elementoVisibile(passo.target)
      if (el && !trovato) {
        trovato = true
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
      misura()
      if (!el && passo.target?.length && tentativi++ < 25) tentativo = setTimeout(cerca, 150)
    }
    cerca()
    window.addEventListener('resize', misura)
    window.addEventListener('scroll', misura, true)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(tentativo)
      window.removeEventListener('resize', misura)
      window.removeEventListener('scroll', misura, true)
    }
  }, [passo, pathname])

  useEffect(() => {
    if (!interattivo || !elemento) return
    const tocco = () => setIndice((i) => Math.min(i + 1, passi.length - 1))
    elemento.addEventListener('click', tocco, { once: true })
    return () => elemento.removeEventListener('click', tocco)
  }, [elemento, interattivo, passi.length])

  // time to read: the bar fills, then the step can be closed or skipped
  useEffect(() => {
    const t = setTimeout(() => setLettoFinoA((letto) => Math.max(letto, indice)), ATTESA_LETTURA_MS)
    scheda.current?.focus()
    return () => clearTimeout(t)
  }, [indice])

  const avanti = useCallback(() => {
    if (!pronto) return
    if (ultimo) chiudi()
    else setIndice((i) => i + 1)
  }, [chiudi, pronto, ultimo])

  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pronto) chiudi()
      if (e.key === 'ArrowRight') avanti()
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
  }, [avanti, chiudi, pronto])

  const idTitolo = `tutorial-titolo-${passo.id}`
  const mancaElemento = Boolean(passo.target?.length) && !riquadro
  // a tap step whose link is not on screen (e.g. inside "Altro"): "Avanti" opens the page instead
  const toccaQui = interattivo && Boolean(riquadro)

  return (
    // the layer lets taps through; blockers and card take them back
    <div className="pointer-events-none fixed inset-0 z-[60]" data-testid="tutorial">
      {/* the dimmed page; clicks on it do nothing, the tour is steered from the card */}
      {riquadro ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary-light motion-safe:transition-all motion-safe:duration-300"
          style={{ ...riquadro, boxShadow: '0 0 0 9999px color-mix(in oklab, var(--background) 80%, transparent)' }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-auto fixed inset-0 bg-background/80" />
      )}
      {toccaQui && riquadro ? (
        // four blockers around the highlight: only the highlighted element takes the tap
        <>
          <div aria-hidden="true" className="pointer-events-auto fixed inset-x-0 top-0" style={{ height: Math.max(0, riquadro.top) }} />
          <div aria-hidden="true" className="pointer-events-auto fixed inset-x-0 bottom-0" style={{ top: riquadro.top + riquadro.height }} />
          <div
            aria-hidden="true"
            className="pointer-events-auto fixed left-0"
            style={{ top: riquadro.top, height: riquadro.height, width: Math.max(0, riquadro.left) }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-auto fixed right-0"
            style={{ top: riquadro.top, height: riquadro.height, left: riquadro.left + riquadro.width }}
          />
        </>
      ) : (
        <div aria-hidden="true" className="pointer-events-auto fixed inset-0" />
      )}

      <div
        ref={scheda}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        tabIndex={-1}
        className="pointer-events-auto fixed w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none sm:w-[340px] motion-safe:transition-[top,left] motion-safe:duration-300"
        style={posizioneScheda(riquadro, altezza)}
      >
        {/* reading bar: when full, X and "Avanti" wake up */}
        <div className="h-1 w-full bg-muted" aria-hidden="true">
          <div
            key={indice}
            className="h-full bg-primary-light motion-safe:animate-[tutorial-lettura_var(--durata)_linear_forwards] motion-reduce:w-full"
            style={{ '--durata': `${ATTESA_LETTURA_MS}ms` } as CSSProperties}
          />
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="num text-xs font-medium text-muted-foreground">
              {anteprima ? `${FUNZIONE[ruolo]} · ` : ''}
              {indice + 1}/{passi.length}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 size-11 text-muted-foreground"
              aria-label={testi.chiudi}
              disabled={!pronto}
              onClick={chiudi}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <h2 id={idTitolo} className="font-heading text-base font-semibold">
              {passo.titolo}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{passo.testo}</p>
            {anteprima && mancaElemento ? (
              <p className="text-xs text-muted-foreground">
                {testi.anteprima}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {indice > 0 ? (
              <Button type="button" variant="ghost" className="h-11" onClick={() => setIndice((i) => i - 1)}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {testi.indietro}
              </Button>
            ) : (
              <span />
            )}
            {toccaQui ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-primary-light" data-testid="tutorial-tocca">
                <Pointer className="size-4" aria-hidden="true" />
                {testi.tocca}
              </p>
            ) : (
              <Button
                type="button"
                // while reading it looks like it is loading, not broken: a pale primary
                // that fills from the left in the reading time, then the full button
                className={cn('relative h-11 overflow-hidden', !pronto && 'bg-primary/35 disabled:opacity-100')}
                disabled={!pronto}
                onClick={avanti}
              >
                {pronto ? null : (
                  <span
                    key={indice}
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-0 bg-primary motion-safe:animate-[tutorial-lettura_var(--durata)_linear_forwards]"
                    style={{ '--durata': `${ATTESA_LETTURA_MS}ms` } as CSSProperties}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {ultimo ? testi.fine : testi.avanti}
                  {ultimo ? null : <ArrowRight className="size-4" aria-hidden="true" />}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
