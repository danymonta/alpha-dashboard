'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A row of tabs or filters that scrolls sideways on the phone, never the page.
 * The chosen item ([aria-current=page]) is brought into view when the page
 * opens, so a reload or a direct link never hides it past the right edge; the
 * right edge fades while more items wait there.
 */
export function StrisciaScorrevole({
  attivo,
  className,
  children,
}: {
  /** What is chosen now: when it changes, the row brings it into view. */
  attivo: string
  className?: string
  children: ReactNode
}) {
  const striscia = useRef<HTMLDivElement>(null)
  const [altroADestra, setAltroADestra] = useState(false)

  useEffect(() => {
    const el = striscia.current
    if (!el) return
    const misura = () => setAltroADestra(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    misura()
    el.addEventListener('scroll', misura, { passive: true })
    const osservatore = new ResizeObserver(misura)
    osservatore.observe(el)
    return () => {
      el.removeEventListener('scroll', misura)
      osservatore.disconnect()
    }
  }, [])

  useEffect(() => {
    const el = striscia.current
    const scelto = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !scelto) return
    // sideways only: scrollIntoView would also move the page
    const sinistra = scelto.offsetLeft - el.offsetLeft
    const destra = sinistra + scelto.offsetWidth
    if (sinistra < el.scrollLeft || destra > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = Math.max(0, sinistra - (el.clientWidth - scelto.offsetWidth) / 2)
    }
  }, [attivo])

  return (
    <div
      ref={striscia}
      className={cn(
        'overflow-x-auto',
        altroADestra && 'max-md:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
