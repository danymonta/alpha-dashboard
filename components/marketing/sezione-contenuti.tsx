'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { StatusContenuto } from '@/lib/marketing/etichette'

type Uscita = {
  /** The statuses the list shows with its filters; null when no Status filter is set. */
  stati: readonly StatusContenuto[] | null
  /** Before a Status tap that takes this content out of the list: remember where the focus goes. */
  ricorda: (id: string, nome: string) => void
  /** The tap did not go through: the row stays, nothing to move. */
  dimentica: () => void
}

const Contesto = createContext<Uscita | null>(null)

/** How long after the tap a row that leaves the list still moves the focus. */
const ATTESA_FOCUS_MS = 15_000

/** The table rows and the cards are both in the page, one hidden by a container query. */
function visibile(el: Element): boolean {
  return el.getClientRects().length > 0
}

function righeVisibili(radice: HTMLElement): HTMLElement[] {
  return [...radice.querySelectorAll<HTMLElement>('[data-riga-contenuto]')].filter(visibile)
}

/**
 * The section of the content list (table, cards, the calendar's agenda and
 * "Senza data"), the box the container queries measure. A Status changed from
 * a row can take the content out of the list (a Status filter or a group
 * chip): the refreshed list drops the row and its button, and the focus would
 * fall to the page. From that tap the section is watched, as "Non rinnovano"
 * in Rinnovi (SezioneArchiviabile): when the row leaves the page and the
 * focus with it, the focus goes to the Status of the row after, else the one
 * before, else to the section's heading «Contenuti», and a polite status
 * says where. A focus the person already moved elsewhere is never taken back.
 */
export function SezioneContenuti({
  stati,
  children,
}: {
  stati: readonly StatusContenuto[] | null
  children: ReactNode
}) {
  const sezione = useRef<HTMLElement>(null)
  const titolo = useRef<HTMLHeadingElement>(null)
  const osservatore = useRef<MutationObserver | null>(null)
  const scadenza = useRef<number | undefined>(undefined)
  const [annuncio, setAnnuncio] = useState('')

  const dimentica = useCallback(() => {
    osservatore.current?.disconnect()
    osservatore.current = null
    window.clearTimeout(scadenza.current)
  }, [])
  useEffect(() => dimentica, [dimentica])

  const sposta = useCallback((candidati: readonly string[], nome: string) => {
    const attivo = document.activeElement
    if (attivo && attivo !== document.body) return
    const radice = sezione.current
    if (!radice) return
    let dove = 'ora sei sul titolo «Contenuti»'
    let destinazione: HTMLElement | null = titolo.current
    for (const id of candidati) {
      const riga = righeVisibili(radice).find((r) => r.dataset.rigaContenuto === id)
      const bottone = riga?.querySelector<HTMLElement>('[data-menu-status]')
      if (bottone) {
        destinazione = bottone
        dove = `ora sei sullo Status di «${riga?.dataset.nomeContenuto ?? 'un altro contenuto'}»`
        break
      }
    }
    if (!destinazione) return
    destinazione.focus()
    const testo = `«${nome}» non è più nella lista con questi filtri: ${dove}.`
    // emptied first, so the same words twice in a row are said again
    setAnnuncio('')
    window.setTimeout(() => setAnnuncio(testo), 50)
  }, [])

  const ricorda = useCallback(
    (id: string, nome: string) => {
      dimentica()
      const radice = sezione.current
      if (!radice) return
      const righe = righeVisibili(radice)
      const i = righe.findIndex((r) => r.dataset.rigaContenuto === id)
      if (i < 0) return
      const riga = righe[i]
      // the row after first, then the one before, nearest first
      const candidati = [...righe.slice(i + 1), ...righe.slice(0, i).reverse()]
        .map((r) => r.dataset.rigaContenuto)
        .filter((x): x is string => Boolean(x) && x !== id)
      // the refreshed list replaces the rows: the tapped one gone, the focus with it
      const o = new MutationObserver(() => {
        if (riga.isConnected) return
        dimentica()
        sposta(candidati, nome)
      })
      o.observe(radice, { childList: true, subtree: true })
      osservatore.current = o
      scadenza.current = window.setTimeout(dimentica, ATTESA_FOCUS_MS)
    },
    [dimentica, sposta],
  )

  const valore = useMemo(() => ({ stati, ricorda, dimentica }), [stati, ricorda, dimentica])

  return (
    <section ref={sezione} aria-labelledby="titolo-contenuti" data-tour="elenco-contenuti" className="@container">
      {/* the list's own heading, for screen readers; shown when the focus lands on it */}
      <h2
        ref={titolo}
        id="titolo-contenuti"
        tabIndex={-1}
        className="sr-only rounded-sm text-sm font-medium outline-none focus:not-sr-only focus:mb-2 focus:-ml-1 focus:inline-block focus:px-1 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Contenuti
      </h2>
      <p role="status" className="sr-only" data-testid="annuncio-contenuti">
        {annuncio}
      </p>
      <Contesto.Provider value={valore}>{children}</Contesto.Provider>
    </section>
  )
}

/** Inside the content list: what a Status tap needs to keep the focus; elsewhere (a content's page) null. */
export function useUscitaDallaLista(): Uscita | null {
  return useContext(Contesto)
}
