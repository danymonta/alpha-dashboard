'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

import { usePannello } from '@/components/marketing/contesto-pannello'
import { unisci, useIntento } from '@/components/shell/intento'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { hrefContenuto } from '@/lib/marketing/pannello'

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  id: string
  /** The row's properties: the panel opens at once with them. */
  riga?: ContenutoElenco
}

/**
 * A content's Name, as Notion's side peek (1.33.0, Dany: "se clicco su un
 * contenuto non mi apre una nuova pagina ma me la apre in sidebar"): a plain
 * click opens the panel; Cmd, Ctrl or Shift and the middle button open the
 * whole page in another tab, because the link is the page. Never prefetched:
 * a list of 300 rows made a request each. The sections start loading only
 * with the intent to open, the same as the menu's links (useIntento): 80 ms
 * of the mouse or of the keyboard focus at rest on it, a press, a finger; a
 * pointer that only passes by loads nothing. The focus the panel gives back
 * as it closes is not an intent: nobody asked to open that content again.
 */
export function LinkContenuto({
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
  const pannello = usePannello()
  const intento = useIntento(() => pannello?.precarica(id))

  return (
    <Link
      {...props}
      href={hrefContenuto(id)}
      prefetch={false}
      data-apri-contenuto=""
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
