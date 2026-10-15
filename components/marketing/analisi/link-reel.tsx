'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

import { usePannelloReel } from '@/components/marketing/analisi/contesto-reel'
import { unisci, useIntento } from '@/components/shell/intento'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { hrefAnalisiReel } from '@/lib/marketing/analisi/pannello'

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { id: string; riga?: RigaReel }

/**
 * A reel in the list, as the content's Name: a plain click opens the panel;
 * Cmd, Ctrl or Shift and the middle button open the page with the panel open
 * in another tab (the link is that address). Never prefetched; the detail
 * starts loading only with the intent to open (80 ms at rest, a press, a finger).
 */
export function LinkReel({
  id,
  riga,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  onTouchStart,
  ...props
}: Props) {
  const pannello = usePannelloReel()
  const intento = useIntento(() => pannello?.precarica(id))

  return (
    <Link
      {...props}
      href={hrefAnalisiReel(id)}
      prefetch={false}
      data-apri-reel=""
      onClick={(e) => {
        onClick?.(e)
        if (!pannello || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        intento.onBlur()
        pannello.apri(id, { da: e.currentTarget, riga })
      }}
      onPointerEnter={unisci(onPointerEnter, (e) => pannello && intento.onPointerEnter(e))}
      onPointerLeave={unisci(onPointerLeave, (e) => intento.onPointerLeave(e))}
      onPointerDown={unisci(onPointerDown, (e) => pannello && intento.onPointerDown(e))}
      onTouchStart={unisci(onTouchStart, () => pannello && intento.onTouchStart())}
      onFocus={unisci(onFocus, (e) => {
        if (!pannello || pannello.fuocoDiRitorno(e.currentTarget)) return
        intento.onFocus(e)
      })}
      onBlur={unisci(onBlur, () => intento.onBlur())}
    />
  )
}
