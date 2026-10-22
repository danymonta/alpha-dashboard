'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { cookieTema, ePaginaChiara, type Tema } from '@/lib/tema/tema'

const MEDIA_CHIARO = '(prefers-color-scheme: light)'

type Contesto = {
  tema: Tema
  /** The page is light right now (the chosen theme, or the device's when it is «sistema»). */
  chiara: boolean
  imposta: (tema: Tema) => void
}

const ContestoTema = createContext<Contesto>({ tema: 'scuro', chiara: false, imposta: () => {} })

export function useTema(): Contesto {
  return useContext(ContestoTema)
}

/**
 * The class of the theme on <html>: «light» for the light page, none for the dark one,
 * «sistema» (plus «light» when the device is light) for «Sistema». The server writes it
 * from the cookie in the first byte; this keeps it right when the person changes theme
 * or the device flips, and never touches anything else of the class list.
 */
function applicaClasse(tema: Tema) {
  const radice = document.documentElement
  // the device's scheme is read live, never from a state that may not have caught up yet
  const voluta = ePaginaChiara(tema, window.matchMedia(MEDIA_CHIARO).matches)
  radice.classList.toggle('sistema', tema === 'sistema')
  radice.classList.toggle('light', voluta)
}

/**
 * Keeps the theme of the page: the person's choice (kept in a cookie, per device), the
 * device's colour scheme for «Sistema», and the class on <html>. First paint without a
 * flash is the server's job (app/layout.tsx: cookie, class and a tiny script for
 * «Sistema»); this is what runs after.
 */
export function TemaProvider({ iniziale, children }: { iniziale: Tema; children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(iniziale)
  const [sistemaChiaro, setSistemaChiaro] = useState(false)

  // the device's scheme, and its changes (only «Sistema» looks at it)
  useEffect(() => {
    const media = window.matchMedia(MEDIA_CHIARO)
    const leggi = () => setSistemaChiaro(media.matches)
    leggi()
    media.addEventListener('change', leggi)
    return () => media.removeEventListener('change', leggi)
  }, [])

  useEffect(() => {
    applicaClasse(tema)
    // a server render with a new cookie rewrites the class of <html>: put the theme back if it lost it
    const radice = document.documentElement
    const osservatore = new MutationObserver(() => {
      const voluta = ePaginaChiara(tema, window.matchMedia(MEDIA_CHIARO).matches)
      if (radice.classList.contains('light') !== voluta || radice.classList.contains('sistema') !== (tema === 'sistema')) {
        applicaClasse(tema)
      }
    })
    osservatore.observe(radice, { attributes: true, attributeFilter: ['class'] })
    return () => osservatore.disconnect()
  }, [tema, sistemaChiaro])

  const imposta = useCallback((prossimo: Tema) => {
    setTema(prossimo)
    try {
      document.cookie = cookieTema(prossimo)
    } catch {
      // cookies blocked: the theme holds until the page is closed
    }
  }, [])

  const valore = useMemo(
    () => ({ tema, chiara: ePaginaChiara(tema, sistemaChiaro), imposta }),
    [tema, sistemaChiaro, imposta],
  )

  return <ContestoTema.Provider value={valore}>{children}</ContestoTema.Provider>
}
