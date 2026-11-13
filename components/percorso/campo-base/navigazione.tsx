'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { schedaDa, type SchedaCampo } from '@/lib/percorso/campo-base'

/**
 * Where the client is in his home base (1.83.0): the tab, the module and the lesson of the Aula.
 * In the client's area (and in the admin's test) they are in the address (`?scheda=`, `&modulo=`,
 * `&lezione=`), so a link, the back button and a reload keep them; in a preview (the coach's «Come
 * lo vede il cliente», the admin's CMS) they live in the component, never touching the page's address.
 */

export type Posizione = { scheda: SchedaCampo; modulo: string | null; lezione: string | null }

type Contesto = {
  posizione: Posizione
  /** The address of a place (null in a preview: a button moves there). */
  href: (p: Partial<Posizione>) => string | null
  vai: (p: Partial<Posizione>) => void
}

const Ctx = createContext<Contesto | null>(null)

export function usePosizione(): Contesto {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePosizione fuori dal campo base')
  return c
}

function completa(attuale: Posizione, p: Partial<Posizione>): Posizione {
  const scheda = p.scheda ?? attuale.scheda
  // a new tab starts from its top; a new module from its next lesson
  const modulo = p.modulo !== undefined ? p.modulo : scheda === attuale.scheda ? attuale.modulo : null
  const lezione = p.lezione !== undefined ? p.lezione : p.modulo !== undefined ? null : scheda === attuale.scheda ? attuale.lezione : null
  return { scheda, modulo: scheda === 'aula' ? modulo : null, lezione: scheda === 'aula' ? lezione : null }
}

function query(p: Posizione): string {
  const q = new URLSearchParams()
  q.set('scheda', p.scheda)
  if (p.modulo) q.set('modulo', p.modulo)
  if (p.lezione) q.set('lezione', p.lezione)
  return q.toString()
}

export function PosizioneDaIndirizzo({ lanciato, children }: { lanciato: boolean; children: ReactNode }) {
  const parametri = useSearchParams()
  const percorso = usePathname()
  const router = useRouter()
  // the default tab follows the launch as it was when the page opened: a client who launches
  // right now stays on the path and sees the rocket; Home is his landing from the next visit
  const [lanciatoAllApertura] = useState(lanciato)
  const posizione = useMemo<Posizione>(
    () => ({
      scheda: schedaDa(parametri.get('scheda'), lanciatoAllApertura),
      modulo: parametri.get('modulo'),
      lezione: parametri.get('lezione'),
    }),
    [parametri, lanciatoAllApertura],
  )
  const href = useCallback((p: Partial<Posizione>) => `${percorso}?${query(completa(posizione, p))}`, [percorso, posizione])
  const vai = useCallback((p: Partial<Posizione>) => router.push(href(p) ?? percorso, { scroll: false }), [router, href, percorso])
  return <Ctx.Provider value={{ posizione, href, vai }}>{children}</Ctx.Provider>
}

export function PosizioneLocale({ iniziale, children }: { iniziale: SchedaCampo; children: ReactNode }) {
  const [posizione, setPosizione] = useState<Posizione>({ scheda: iniziale, modulo: null, lezione: null })
  const vai = useCallback((p: Partial<Posizione>) => setPosizione((a) => completa(a, p)), [])
  const href = useCallback(() => null, [])
  return <Ctx.Provider value={{ posizione, href, vai }}>{children}</Ctx.Provider>
}

/** A link to a place of the home base, or a button in a preview. Same look either way. */
export function VaiA({
  a,
  className,
  children,
  corrente,
  etichetta,
  testId,
}: {
  a: Partial<Posizione>
  className?: string
  children: ReactNode
  corrente?: boolean
  etichetta?: string
  testId?: string
}) {
  const { href, vai } = usePosizione()
  const indirizzo = href(a)
  if (indirizzo) {
    return (
      <Link
        href={indirizzo}
        scroll={false}
        className={className}
        aria-current={corrente ? 'page' : undefined}
        aria-label={etichetta}
        data-testid={testId}
      >
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => vai(a)}
      className={className}
      aria-current={corrente ? 'page' : undefined}
      aria-label={etichetta}
      data-testid={testId}
    >
      {children}
    </button>
  )
}
