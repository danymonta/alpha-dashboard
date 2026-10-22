'use client'

import { RotateCw, SearchX } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { toast } from 'sonner'

import {
  ContestoAzioniPannello,
  ContestoContenutoAperto,
  type AzioniPannello,
} from '@/components/marketing/contesto-pannello'
import { SchedaContenuto, type StatoSezioni } from '@/components/marketing/scheda-contenuto'
import { useUscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { DettaglioContenuto } from '@/lib/marketing/dettaglio'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { PARAMETRO_CONTENUTO, piuRecente, urlCon, urlSenza, vicini } from '@/lib/marketing/pannello'
import { isUuid } from '@/lib/progetti'

export { LinkContenuto } from '@/components/marketing/link-contenuto'

/** A preload (or the server's render) stays good this long; every save of that content drops it. */
const VALIDITA_PRECARICO_MS = 20_000

/** What the page read for ?contenuto with this render: the detail, gone (null), or a read that failed. */
export type DettaglioIniziale = { id: string; dettaglio: DettaglioContenuto | null } | { id: string; errore: true } | null

type Risultato = { esito: 'pronto'; dettaglio: DettaglioContenuto } | { esito: 'sparito' } | { esito: 'errore' } | { esito: 'annullato' }

type Voce = { dettaglio?: DettaglioContenuto; stato: 'pronto' | 'sparito' | 'errore' }

type Lettura = { promessa: Promise<Risultato>; quando: number; controllo: AbortController; conclusa: boolean }

function aggiornato(d: DettaglioContenuto): string {
  return d.contenuto.updated_at
}

/** The detail with the more recent updated_at; a tie keeps the new one (the server's word). */
function tieni(vecchio: DettaglioContenuto | undefined, nuovo: DettaglioContenuto): DettaglioContenuto {
  if (!vecchio) return nuovo
  return piuRecente(aggiornato(vecchio), aggiornato(nuovo)) === aggiornato(vecchio) &&
    aggiornato(vecchio) !== aggiornato(nuovo)
    ? vecchio
    : nuovo
}

async function leggi(id: string, controllo: AbortController): Promise<Risultato> {
  try {
    const risposta = await fetch(`/api/marketing/contenuti/${id}`, {
      signal: controllo.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (risposta.status === 404) return { esito: 'sparito' }
    // a session gone sends the login page: never a detail
    if (!risposta.ok || risposta.redirected || !risposta.headers.get('content-type')?.includes('application/json')) {
      return { esito: 'errore' }
    }
    return { esito: 'pronto', dettaglio: (await risposta.json()) as DettaglioContenuto }
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? { esito: 'annullato' } : { esito: 'errore' }
  }
}

/** The page's render for ?contenuto: the detail wins when more recent than the one known here. */
function unisciIniziale(prima: Record<string, Voce>, i: NonNullable<DettaglioIniziale>): Record<string, Voce> {
  if ('errore' in i) return prima[i.id]?.dettaglio ? prima : { ...prima, [i.id]: { stato: 'errore' } }
  if (i.dettaglio === null) return { ...prima, [i.id]: { ...prima[i.id], stato: 'sparito' } }
  return { ...prima, [i.id]: { stato: 'pronto', dettaglio: tieni(prima[i.id]?.dettaglio, i.dettaglio) } }
}

function visibile(el: Element): boolean {
  return el.isConnected && el.getClientRects().length > 0
}

/**
 * The content panel (1.33.0, Dany: "se clicco su un contenuto non mi apre una
 * nuova pagina ma me la apre in sidebar da modificare"): a sheet on the right,
 * the whole screen on a phone, with everything editable and saved by itself.
 * The state lives in the address (?contenuto=<id>, pushState): the link is
 * shared, Back closes it, Forward opens it again, a reload keeps it. Never an
 * intercepting route: the page is already driven by its search params.
 *
 * The properties show at once from the row of the list; the sections come
 * from a GET (preloaded with the intent to open), or from the page's own
 * render when the address has ?contenuto (a direct link, a reload, and the
 * redraw every action brings back): the more recent detail always wins.
 * Two contexts: the actions (stable) and the open id, so opening the panel
 * never redraws the rows.
 */
export function PannelloContenuti({
  righe,
  ordine,
  iniziale,
  puoEliminare,
  children,
}: {
  /** The rows on the page: the panel opens at once with their properties. */
  righe: readonly ContenutoElenco[]
  /** The list's order, for «precedente» and «successivo»; without it (another page), neither. */
  ordine?: readonly string[]
  iniziale: DettaglioIniziale
  puoEliminare: boolean
  children: ReactNode
}) {
  const uscita = useUscitaDallaLista()
  const richiesto = useSearchParams().get(PARAMETRO_CONTENUTO)
  const daIndirizzo = isUuid(richiesto) ? richiesto : null

  // opening and closing answer in the same event; the address (Next syncs it in a transition) catches up
  const [locale, setLocale] = useState<{ id: string | null } | null>(null)
  if (locale && locale.id === daIndirizzo) setLocale(null)
  const idAperto = locale ? locale.id : daIndirizzo

  // the last content shown, kept while the sheet slides out
  const [mostrato, setMostrato] = useState<string | null>(idAperto)
  if (idAperto !== null && idAperto !== mostrato) setMostrato(idAperto)
  const idMostrato = idAperto ?? mostrato

  const [voci, setVoci] = useState<Record<string, Voce>>(() => (iniziale ? unisciIniziale({}, iniziale) : {}))
  const [inizialeVisto, setInizialeVisto] = useState(iniziale)
  if (inizialeVisto !== iniziale) {
    // a new render from the server: adjust while rendering, never in an effect
    setInizialeVisto(iniziale)
    if (iniziale) setVoci((prima) => unisciIniziale(prima, iniziale))
  }
  // the panel's own copy of the properties: a save shows at once, also when the row left the list
  const [copie, setCopie] = useState<Record<string, ContenutoElenco>>({})
  const [tentativo, setTentativo] = useState(0)
  const [domanda, setDomanda] = useState<{ titolo: string; poi: () => void } | null>(null)
  const [annuncio, setAnnuncio] = useState('')
  /** Deleted from this panel: it slides out as it was, never as "not there any more". */
  const [eliminato, setEliminato] = useState<string | null>(null)

  const perId = useMemo(() => new Map(righe.map((r) => [r.id, r])), [righe])
  const letture = useRef(new Map<string, Lettura>())
  /** The detail the page read when it was loaded (a direct link, a reload): the first opening needs no GET. */
  const lettoDallaPagina = useRef(iniziale)
  const spinto = useRef(false)
  const sporco = useRef(false)
  const apertoDa = useRef<{ id: string; elemento: HTMLElement } | null>(null)
  /** Where the panel is giving the focus back as it closes: that focus is not an intent to open. */
  const ritornoSu = useRef<HTMLElement | null>(null)
  const ultimoEsc = useRef<Event | null>(null)
  const bozze = useRef(new Map<string, boolean>())
  const eliminati = useRef(new Set<string>())
  const sceltaDomanda = useRef<'continua' | 'chiudi'>('continua')
  /** Saves in flight (their redraw not yet committed), and a Back waiting for them. */
  const salvataggi = useRef(0)
  const indietroInAttesa = useRef(false)
  const titolo = useRef<HTMLHeadingElement>(null)
  const scheda = useRef<HTMLDivElement>(null)
  const ordineNoto = useRef<readonly string[]>(ordine ?? [])
  const righeRef = useRef(perId)
  const copieRef = useRef(copie)
  const vociRef = useRef(voci)
  useEffect(() => {
    righeRef.current = perId
    copieRef.current = copie
    vociRef.current = voci
  })

  const carica = useCallback((id: string): Lettura => {
    const nota = letture.current.get(id)
    if (nota && Date.now() - nota.quando < VALIDITA_PRECARICO_MS) return nota
    const controllo = new AbortController()
    const lettura: Lettura = { promessa: leggi(id, controllo), quando: Date.now(), controllo, conclusa: false }
    letture.current.set(id, lettura)
    void lettura.promessa.then((r) => {
      lettura.conclusa = true
      // a failed or cancelled read is never kept for the next opening
      if (r.esito !== 'pronto' && letture.current.get(id) === lettura) letture.current.delete(id)
    })
    return lettura
  }, [])

  // the open content's sections: from a preload, the server's render, or a GET now
  useEffect(() => {
    if (!idAperto) return
    const id = idAperto
    const inCorso = letture.current
    const dallaPagina = lettoDallaPagina.current
    lettoDallaPagina.current = null
    if (dallaPagina && dallaPagina.id === id && 'dettaglio' in dallaPagina && vociRef.current[id]?.stato === 'pronto') return
    const lettura = carica(id)
    let vivo = true
    void lettura.promessa.then((r) => {
      if (!vivo || r.esito === 'annullato') return
      setVoci((prima) => {
        const voce = prima[id]
        if (r.esito === 'pronto') return { ...prima, [id]: { stato: 'pronto', dettaglio: tieni(voce?.dettaglio, r.dettaglio) } }
        if (r.esito === 'sparito') return eliminati.current.has(id) ? prima : { ...prima, [id]: { ...voce, stato: 'sparito' } }
        return { ...prima, [id]: { ...voce, stato: voce?.stato === 'pronto' ? 'pronto' : 'errore' } }
      })
    })
    return () => {
      vivo = false
      // another content, or closed: a read still on its way for this one stops
      if (!lettura.conclusa && inCorso.get(id) === lettura) {
        lettura.controllo.abort()
        inCorso.delete(id)
      }
    }
  }, [idAperto, tentativo, carica])

  /**
   * Closed. No router.refresh(): every action of the panel called
   * revalidatePath, which empties the browser's cache, so Back (and the
   * panel's own close, which is a Back) reads the list again by itself (spec
   * B4, verified in e2e: the Status changed in the panel is on the row after
   * Back). A refresh here would also race a quick Forward. A content changed
   * or deleted may then leave the list: the focus follows it to the row after.
   */
  const precedente = useRef(idAperto)
  useEffect(() => {
    const prima = precedente.current
    precedente.current = idAperto
    if (prima === null || idAperto !== null) return
    spinto.current = false
    bozze.current.clear()
    if (!sporco.current) return
    sporco.current = false
    const nome = copieRef.current[prima]?.nome ?? righeRef.current.get(prima)?.nome ?? vociRef.current[prima]?.dettaglio?.contenuto.nome
    uscita?.ricorda(prima, nome ?? '', {
      motivo: eliminati.current.has(prima) ? 'eliminato' : 'filtri',
      selettore: '[data-apri-contenuto]',
    })
  }, [idAperto, uscita])

  const apri = useCallback<AzioniPannello['apri']>((id, opzioni = {}) => {
    if (opzioni.da) apertoDa.current = { id, elemento: opzioni.da }
    if (opzioni.riga) {
      const riga = opzioni.riga
      setCopie((prima) => (prima[id] ? prima : { ...prima, [id]: riga }))
    }
    // the list's confirmations are at the top of the screen, where the panel's header comes: they go away with it
    toast.dismiss()
    setLocale({ id })
    const { pathname, search } = window.location
    if (indietroInAttesa.current) {
      // closed a moment ago, its Back still waiting for a save: this entry is the panel's already
      indietroInAttesa.current = false
      window.history.replaceState(null, '', urlCon(pathname, search, id))
    } else {
      window.history.pushState(null, '', urlCon(pathname, search, id))
    }
    spinto.current = true
  }, [])

  const chiudiSubito = useCallback(() => {
    setLocale({ id: null })
    if (spinto.current) {
      spinto.current = false
      // a save still on its way would push its address again after Back: Back when it is done
      if (salvataggi.current > 0) indietroInAttesa.current = true
      else window.history.back()
    } else {
      const { pathname, search } = window.location
      window.history.replaceState(null, '', urlSenza(pathname, search))
    }
  }, [])

  /** X, Esc, a tap outside: with a text not saved, the question first. */
  const chiudi = useCallback(
    (poi: () => void = chiudiSubito) => {
      const titoli = [...bozze.current].filter(([, sporca]) => sporca).map(([t]) => t)
      if (titoli.length > 0) {
        setDomanda({ titolo: titoli[0], poi })
        return
      }
      poi()
    },
    [chiudiSubito],
  )

  const precarica = useCallback((id: string) => void carica(id), [carica])

  const fuocoDiRitorno = useCallback((elemento: HTMLElement) => {
    if (ritornoSu.current !== elemento) return false
    ritornoSu.current = null
    return true
  }, [])

  const segnaModifica = useCallback((id: string) => {
    sporco.current = true
    letture.current.delete(id)
  }, [])

  const aggiornaCampo = useCallback<AzioniPannello['aggiornaCampo']>(
    (id, campo, valore, versione) => {
      segnaModifica(id)
      setVoci((prima) => {
        const voce = prima[id]
        const d = voce?.dettaglio
        if (!d || piuRecente(d.contenuto.updated_at, versione) !== versione) return prima
        return { ...prima, [id]: { ...voce, dettaglio: { ...d, contenuto: { ...d.contenuto, [campo]: valore, updated_at: versione } } } }
      })
      setCopie((prima) => {
        const base = prima[id] ?? righeRef.current.get(id)
        if (!base || piuRecente(base.updated_at, versione) !== versione) return prima
        return { ...prima, [id]: { ...base, [campo]: valore, updated_at: versione } }
      })
    },
    [segnaModifica],
  )

  const aggiornaSezione = useCallback<AzioniPannello['aggiornaSezione']>(
    (id, campo, testo, impronta, versione) => {
      segnaModifica(id)
      setVoci((prima) => {
        const voce = prima[id]
        const d = voce?.dettaglio
        if (!d || piuRecente(d.contenuto.updated_at, versione) !== versione) return prima
        return {
          ...prima,
          [id]: {
            ...voce,
            dettaglio: {
              ...d,
              contenuto: { ...d.contenuto, updated_at: versione },
              testi: { ...d.testi, [campo]: testo },
              impronte: { ...d.impronte, [campo]: impronta },
            },
          },
        }
      })
    },
    [segnaModifica],
  )

  const segnaSparito = useCallback((id: string) => {
    sporco.current = true
    letture.current.delete(id)
    setVoci((prima) => ({ ...prima, [id]: { ...prima[id], stato: 'sparito' } }))
  }, [])

  const inizioSalvataggio = useCallback(() => {
    salvataggi.current += 1
    let finito = false
    return () => {
      if (finito) return
      finito = true
      salvataggi.current -= 1
      if (salvataggi.current === 0 && indietroInAttesa.current) {
        indietroInAttesa.current = false
        window.history.back()
      }
    }
  }, [])

  const escGestito = useCallback((evento: Event) => {
    ultimoEsc.current = evento
  }, [])

  const segnaBozza = useCallback((titoloSezione: string, sporca: boolean) => {
    if (sporca) bozze.current.set(titoloSezione, true)
    else bozze.current.delete(titoloSezione)
  }, [])

  const azioni = useMemo<AzioniPannello>(
    () => ({
      apri,
      precarica,
      fuocoDiRitorno,
      chiudi: () => chiudi(),
      escGestito,
      aggiornaCampo,
      aggiornaSezione,
      segnaSparito,
      segnaBozza,
      inizioSalvataggio,
    }),
    [apri, precarica, fuocoDiRitorno, chiudi, escGestito, aggiornaCampo, aggiornaSezione, segnaSparito, segnaBozza, inizioSalvataggio],
  )

  function cambiaAperto(aperto: boolean, dettagli: DialogPrimitive.Root.ChangeEventDetails) {
    if (aperto) return
    // Esc taken by a field of the panel (a section being written, a property): the field cancels, the panel stays
    if (dettagli.reason === 'escape-key' && dettagli.event === ultimoEsc.current) {
      dettagli.cancel()
      return
    }
    const titoli = [...bozze.current].filter(([, s]) => s)
    if (titoli.length > 0) {
      dettagli.cancel()
      chiudi()
      return
    }
    chiudiSubito()
  }

  /** «Contenuto precedente» and «successivo»: no new history entry, one Back still closes. */
  function vai(id: string) {
    chiudi(() => {
      setLocale({ id })
      const { pathname, search } = window.location
      window.history.replaceState(null, '', urlCon(pathname, search, id))
      const nav = ordine ? vicini(ordine, id) : null
      const nome = copieRef.current[id]?.nome ?? righeRef.current.get(id)?.nome ?? voci[id]?.dettaglio?.contenuto.nome
      if (nome && nav?.posizione) {
        setAnnuncio('')
        window.setTimeout(() => setAnnuncio(`«${nome}», ${nav.posizione} di ${nav.totale}`), 50)
      }
    })
  }

  // where the order still holds the content shown: the focus follows it if it leaves the list
  useEffect(() => {
    if (ordine && idMostrato && ordine.includes(idMostrato)) ordineNoto.current = ordine
  }, [ordine, idMostrato])

  function fuocoFinale(): HTMLElement | boolean {
    const destinazione = destinazioneFuoco()
    // the Name the focus goes back to must not read the content it just closed again (or the next one)
    ritornoSu.current = destinazione instanceof HTMLElement ? destinazione : null
    return destinazione
  }

  function destinazioneFuoco(): HTMLElement | boolean {
    const id = idMostrato
    if (!id) return true
    const da = apertoDa.current
    if (da && da.id === id && visibile(da.elemento)) return da.elemento
    const nome = contenutoDi(id)?.nome ?? ''
    return uscita?.destinazioneDopoPannello(id, nome, ordineNoto.current, eliminati.current.has(id) ? 'eliminato' : 'filtri') ?? true
  }

  function contenutoDi(id: string): ContenutoElenco | null {
    const candidati = [voci[id]?.dettaglio?.contenuto, copie[id], perId.get(id)].filter((c): c is ContenutoElenco => !!c)
    if (candidati.length === 0) return null
    // the most recent of the three: the panel's copy after a save, the server's after a redraw
    return candidati.reduce((a, b) => (piuRecente(a.updated_at, b.updated_at) === a.updated_at && a.updated_at !== b.updated_at ? a : b))
  }

  const voce = idMostrato ? voci[idMostrato] : undefined
  const contenuto = idMostrato ? contenutoDi(idMostrato) : null
  const sparito = voce?.stato === 'sparito'
  const notion = voce?.dettaglio?.contenuto.notion_page_id ?? null
  /** «Riprova»: the content read again with the GET. */
  function rileggi() {
    if (!idMostrato) return
    letture.current.delete(idMostrato)
    setVoci((prima) => {
      const voceOra = prima[idMostrato]
      // a detail already shown stays while the new one comes
      if (voceOra?.dettaglio) return { ...prima, [idMostrato]: { ...voceOra, stato: 'pronto' } }
      const { [idMostrato]: _tolta, ...resto } = prima
      void _tolta
      return resto
    })
    setTentativo((n) => n + 1)
  }
  const sezioni: StatoSezioni = voce?.dettaglio
    ? { stato: 'pronto', testi: voce.dettaglio.testi, impronte: voce.dettaglio.impronte }
    : voce?.stato === 'errore'
      ? { stato: 'errore', riprova: rileggi }
      : { stato: 'caricamento' }
  const navigazione = ordine && idMostrato ? { ...vicini(ordine, idMostrato), vai } : null

  return (
    <ContestoAzioniPannello.Provider value={azioni}>
      <ContestoContenutoAperto.Provider value={idAperto}>
        {children}
        <Sheet open={idAperto !== null} onOpenChange={cambiaAperto}>
          <SheetContent
            side="right"
            showCloseButton={false}
            initialFocus={titolo}
            finalFocus={fuocoFinale}
            className="gap-0 overflow-y-auto overscroll-contain p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl data-[side=right]:md:max-w-2xl"
          >
            {/* shrink-0: the sheet is a flex column, and a shrunk box would end the sticky header after one screen */}
            <div ref={scheda} className="min-h-full shrink-0">
              <p role="status" className="sr-only" data-testid="annuncio-pannello">
                {annuncio}
              </p>
              {sparito && idMostrato !== eliminato ? (
                <>
                  <SheetHeader>
                    <SheetTitle ref={titolo} tabIndex={-1} className="outline-none">
                      Questo contenuto non c’è più
                    </SheetTitle>
                    <SheetDescription>Forse l’ha eliminato qualcuno del team.</SheetDescription>
                  </SheetHeader>
                  <div className="flex flex-col items-start gap-3 px-4 pb-6">
                    <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
                    <Button type="button" variant="outline" className="h-11" onClick={() => chiudi()}>
                      Chiudi
                    </Button>
                  </div>
                </>
              ) : contenuto ? (
                <SchedaContenuto
                  dove="pannello"
                  contenuto={{ ...contenuto, notion_page_id: notion }}
                  sezioni={sezioni}
                  instagram={voce?.dettaglio?.instagram ?? null}
                  idea={voce?.dettaglio?.idea ?? null}
                  onRileggi={rileggi}
                  puoEliminare={puoEliminare}
                  titoloRef={titolo}
                  navigazione={navigazione}
                  onChiudi={() => chiudi()}
                  onEliminato={() => {
                    if (!idMostrato) return
                    eliminati.current.add(idMostrato)
                    setEliminato(idMostrato)
                    sporco.current = true
                    chiudiSubito()
                  }}
                />
              ) : (
                // opened from a link without the row (another page): the properties come with the GET
                <>
                  <SheetHeader>
                    <SheetTitle ref={titolo} tabIndex={-1} className="outline-none">
                      Contenuto
                    </SheetTitle>
                    <SheetDescription>
                      {voce?.stato === 'errore' ? 'Il contenuto non si è caricato.' : 'Caricamento del contenuto…'}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-3 px-4 pb-6">
                    {voce?.stato === 'errore' ? (
                      <Button type="button" variant="outline" className="h-11" onClick={rileggi}>
                        <RotateCw className="size-4" aria-hidden="true" />
                        Riprova
                      </Button>
                    ) : (
                      <div className="space-y-3" aria-busy="true">
                        <Skeleton className="h-11 w-48 rounded-lg" />
                        <Skeleton className="h-64 rounded-xl" />
                        <Skeleton className="h-28 rounded-xl" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Dialog
          open={domanda !== null}
          onOpenChange={(aperto) => {
            if (aperto) return
            sceltaDomanda.current = 'continua'
            setDomanda(null)
          }}
        >
          <DialogContent
            role="alertdialog"
            showCloseButton={false}
            // «Continua a scrivere» goes back to the text; «Chiudi senza salvare» leaves it to the panel's own focus
            finalFocus={() =>
              sceltaDomanda.current === 'chiudi'
                ? false
                : (scheda.current?.querySelector<HTMLElement>('[data-bozza-sporca] textarea') ?? true)
            }
          >
            <DialogHeader>
              <DialogTitle>Hai un testo non salvato in «{domanda?.titolo}»: chiudere lo stesso?</DialogTitle>
              <DialogDescription>Il testo che hai scritto non è ancora salvato.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  sceltaDomanda.current = 'continua'
                  setDomanda(null)
                }}
              >
                Continua a scrivere
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11"
                onClick={() => {
                  const poi = domanda?.poi
                  sceltaDomanda.current = 'chiudi'
                  bozze.current.clear()
                  setDomanda(null)
                  poi?.()
                }}
              >
                Chiudi senza salvare
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ContestoContenutoAperto.Provider>
    </ContestoAzioniPannello.Provider>
  )
}
