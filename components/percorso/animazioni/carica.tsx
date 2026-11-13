'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, type ComponentProps } from 'react'

/*
 * The motion of the client's area arrives after the first paint (release B2): the page is
 * drawn still and complete, then, when the browser is free, this loads the module that
 * imports `motion` (./animazioni-percorso.tsx, its own chunk). Never in the team's shell:
 * only components/percorso/ mounts it.
 */
const Animazioni = dynamic(() => import('./animazioni-percorso').then((m) => m.AnimazioniPercorso), {
  ssr: false,
  loading: () => null,
})

type Props = ComponentProps<typeof Animazioni>

export function AnimazioniDopoIlDisegno(props: Props) {
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    const finestra = window as Window & {
      requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (finestra.requestIdleCallback) {
      const id = finestra.requestIdleCallback(() => setPronto(true), { timeout: 700 })
      return () => finestra.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setPronto(true), 120)
    return () => window.clearTimeout(t)
  }, [])
  return pronto ? <Animazioni {...props} /> : null
}
