'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import type { StatusContenuto } from '@/lib/marketing/etichette'
import { statiFiltrati, type FiltriContenuti } from '@/lib/marketing/filtri'
import type { CampoInCella } from '@/lib/validation/contenuto'

export type MotivoUscita = 'filtri' | 'eliminato'

type Uscita = {
  /**
   * Whether this new value takes the content out of the list with its
   * filters (a Status, a Reel Type, a Name outside the search).
   */
  esce: (campo: CampoInCella | 'stato', valore: unknown) => boolean
  /**
   * Before a change that may take this row out of the list (or move it): if
   * the row leaves the page and the focus with it, the focus goes to the same
   * cell of the row after (`cella`, else the Status), never <body>.
   */
  ricorda: (id: string, nome: string, opzioni?: OpzioniRicorda) => void
  /** The change did not go through: the row stays, nothing to move. */
  dimentica: () => void
  /**
   * Where the focus goes when the content panel closes: the content's own
   * Name, else the Name of the row after it in `ordine`, then the one before,
   * then the list's heading; with a polite status when the row is gone.
   */
  destinazioneDopoPannello: (
    id: string,
    nome: string,
    ordine: readonly string[],
    motivo: MotivoUscita,
  ) => HTMLElement | null
  registraSezione: (sezione: HTMLElement | null, titolo: HTMLElement | null) => void
}

type OpzioniRicorda = {
  motivo?: MotivoUscita
  /** The cell that changed: the focus goes to the same cell of the row after. */
  cella?: string
  /** Or any element of the row (the panel: the Name, [data-apri-contenuto]). */
  selettore?: string
}

const Contesto = createContext<Uscita | null>(null)

/** How long after the tap a row that leaves the list still moves the focus. */
const ATTESA_FOCUS_MS = 15_000

/** The table rows and the cards are both in the page, one hidden by a container query. */
function visibile(el: Element): boolean {
  return el.getClientRects().length > 0
}

function righeVisibili(radice: ParentNode): HTMLElement[] {
  return [...radice.querySelectorAll<HTMLElement>('[data-riga-contenuto]')].filter(visibile)
}

function rigaVisibile(radice: ParentNode, id: string): HTMLElement | undefined {
  return righeVisibili(radice).find((r) => r.dataset.rigaContenuto === id)
}

type ParoleAnnunci = (typeof CONTENUTO)['it']['annunci']

/** «Reel Type di «…»», «lo Status di «…»», «…»: where the focus landed, in words. */
function doveSei(riga: HTMLElement, selettore: string, t: ParoleAnnunci): string {
  const nome = riga.dataset.nomeContenuto ?? t.altro
  if (selettore === '[data-menu-status]') return t.suStatus(nome)
  const cella = /data-cella="([^"]+)"/.exec(selettore)?.[1]
  const etichetta = cella ? riga.querySelector<HTMLElement>(selettore)?.dataset.etichetta : undefined
  if (etichetta) return t.suCampo(etichetta, nome)
  return t.suNome(nome)
}

function frase(nome: string, motivo: MotivoUscita, dove: string, t: ParoleAnnunci): string {
  return motivo === 'eliminato' ? t.eliminato(nome, dove) : t.fuori(nome, dove)
}

/**
 * The content list's focus keeper, at the root of the page (1.33.0): the
 * table, the cards, and the content panel above them all. A
 * change from a row (Status, Reel Type, a Name outside the search) or from the panel (a content
 * deleted, or out of the filters when it closes) can take the row out of the
 * page, and the focus would fall to <body>. From that tap the section is
 * watched, as "Non rinnovano" in Rinnovi: the focus goes to the same row in
 * its new place, else to the same cell of the row after, else the one
 * before, else to the list's heading «Piano editoriale», and a polite status says
 * where. A focus the person already moved elsewhere is never taken back.
 */
export function UscitaDallaLista({ filtri, children }: { filtri: FiltriContenuti; children: ReactNode }) {
  const sezione = useRef<HTMLElement | null>(null)
  const titolo = useRef<HTMLElement | null>(null)
  const osservatore = useRef<MutationObserver | null>(null)
  const scadenza = useRef<number | undefined>(undefined)
  const [annuncio, setAnnuncio] = useState('')
  const parole = CONTENUTO[useLingua()].annunci

  const annuncia = useCallback((testo: string) => {
    // emptied first, so the same words twice in a row are said again
    setAnnuncio('')
    window.setTimeout(() => setAnnuncio(testo), 50)
  }, [])

  const dimentica = useCallback(() => {
    osservatore.current?.disconnect()
    osservatore.current = null
    window.clearTimeout(scadenza.current)
  }, [])
  useEffect(() => dimentica, [dimentica])

  const registraSezione = useCallback((s: HTMLElement | null, t: HTMLElement | null) => {
    sezione.current = s
    titolo.current = t
  }, [])

  const { gruppo, stato, reel_type, formato, tipo, q, canale } = filtri
  const stati: readonly StatusContenuto[] | null = useMemo(() => statiFiltrati({ gruppo, stato }), [gruppo, stato])
  const esce = useCallback(
    (campo: CampoInCella | 'stato', valore: unknown) => {
      switch (campo) {
        case 'stato':
          return Boolean(stati && !stati.includes(valore as StatusContenuto))
        case 'reel_type':
          return Boolean(reel_type && valore !== reel_type)
        case 'formato':
          return Boolean(formato && valore !== formato)
        case 'tipo':
          // a Modello changed to or from YouTube Video moves the content to the other tab
          return Boolean(tipo && valore !== tipo) || (valore === 'youtube') !== (canale === 'youtube')
        case 'nome':
          return Boolean(q && typeof valore === 'string' && !valore.toLowerCase().includes(q.toLowerCase()))
        default:
          return false
      }
    },
    [stati, reel_type, formato, tipo, q, canale],
  )

  const ricorda = useCallback(
    (id: string, nome: string, opzioni: OpzioniRicorda = {}) => {
      dimentica()
      const radice = sezione.current
      if (!radice) return
      const righe = righeVisibili(radice)
      const i = righe.findIndex((r) => r.dataset.rigaContenuto === id)
      if (i < 0) return
      const riga = righe[i]
      const selettore = opzioni.selettore ?? (opzioni.cella ? `[data-cella="${opzioni.cella}"]` : '[data-menu-status]')
      // the row after first, then the one before, nearest first
      const candidati = [...righe.slice(i + 1), ...righe.slice(0, i).reverse()]
        .map((r) => r.dataset.rigaContenuto)
        .filter((x): x is string => Boolean(x) && x !== id)

      function sposta() {
        const attivo = document.activeElement
        if (attivo && attivo !== document.body) return
        const radiceOra = sezione.current
        if (!radiceOra) return
        // the same content in its new place: silently there
        const stessa = rigaVisibile(radiceOra, id)
        const nellaStessa =
          stessa?.querySelector<HTMLElement>(selettore) ?? stessa?.querySelector<HTMLElement>('[data-apri-contenuto]')
        if (nellaStessa) {
          nellaStessa.focus()
          return
        }
        for (const altro of candidati) {
          const r = rigaVisibile(radiceOra, altro)
          // the same cell, else the Status, else the Name
          const ripieghi = [selettore, '[data-menu-status]', '[data-apri-contenuto]']
          const trovato = ripieghi
            .map((sel) => ({ sel, el: r?.querySelector<HTMLElement>(sel) ?? null }))
            .find((x) => x.el !== null)
          if (r && trovato?.el) {
            trovato.el.focus()
            annuncia(frase(nome, opzioni.motivo ?? 'filtri', doveSei(r, trovato.sel, parole), parole))
            return
          }
        }
        const t = titolo.current
        if (!t) return
        t.focus()
        annuncia(frase(nome, opzioni.motivo ?? 'filtri', parole.sulTitolo, parole))
      }

      // the redrawn list replaces the rows: the tapped one gone, the focus with it
      const o = new MutationObserver(() => {
        if (riga.isConnected) return
        dimentica()
        sposta()
      })
      o.observe(radice, { childList: true, subtree: true })
      osservatore.current = o
      scadenza.current = window.setTimeout(dimentica, ATTESA_FOCUS_MS)
    },
    [dimentica, annuncia, parole],
  )

  const destinazioneDopoPannello = useCallback(
    (id: string, nome: string, ordine: readonly string[], motivo: MotivoUscita) => {
      const radice = sezione.current
      if (radice) {
        const propria = rigaVisibile(radice, id)?.querySelector<HTMLElement>('[data-apri-contenuto]')
        if (propria) return propria
        const i = ordine.indexOf(id)
        const candidati = i < 0 ? [] : [...ordine.slice(i + 1), ...ordine.slice(0, i).reverse()]
        for (const altro of candidati) {
          const r = rigaVisibile(radice, altro)
          const link = r?.querySelector<HTMLElement>('[data-apri-contenuto]')
          if (r && link) {
            annuncia(frase(nome, motivo, doveSei(r, '[data-apri-contenuto]', parole), parole))
            return link
          }
        }
      }
      if (titolo.current) {
        annuncia(frase(nome, motivo, parole.sulTitolo, parole))
        return titolo.current
      }
      return null
    },
    [annuncia, parole],
  )

  const valore = useMemo(
    () => ({ esce, ricorda, dimentica, destinazioneDopoPannello, registraSezione }),
    [esce, ricorda, dimentica, destinazioneDopoPannello, registraSezione],
  )

  return (
    <Contesto.Provider value={valore}>
      <p role="status" className="sr-only" data-testid="annuncio-contenuti">
        {annuncio}
      </p>
      {children}
    </Contesto.Provider>
  )
}

/**
 * The section of the content list (table and cards), the box the container
 * queries measure, with its own heading «Piano editoriale» for screen readers
 * (shown when the focus lands on it).
 */
export function SezioneContenuti({ children }: { children: ReactNode }) {
  const uscita = useContext(Contesto)
  const sezione = useRef<HTMLElement>(null)
  const titolo = useRef<HTMLHeadingElement>(null)
  const registra = uscita?.registraSezione
  const titoloSezione = CONTENUTO[useLingua()].annunci.titolo
  useEffect(() => {
    registra?.(sezione.current, titolo.current)
    return () => registra?.(null, null)
  }, [registra])

  return (
    <section ref={sezione} aria-labelledby="titolo-contenuti" data-tour="elenco-contenuti" className="@container">
      <h2
        ref={titolo}
        id="titolo-contenuti"
        tabIndex={-1}
        className="sr-only rounded-sm text-sm font-medium outline-none focus:not-sr-only focus:mb-2 focus:-ml-1 focus:inline-block focus:px-1 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {titoloSezione}
      </h2>
      {children}
    </section>
  )
}

/** Inside the content list page: what a change needs to keep the focus; elsewhere (a content's page) null. */
export function useUscitaDallaLista(): Uscita | null {
  return useContext(Contesto)
}
