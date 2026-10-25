'use client'

import { ChevronRight, Copy, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { salvaSezioneContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import type { ManigliaEditor } from '@/components/marketing/editor-sezione'
import { MarkdownContenuto } from '@/components/marketing/markdown-contenuto'
import { Button } from '@/components/ui/button'
import type { SezioneContenuto as Campo } from '@/lib/marketing/etichette'
import { ERRORE_SEZIONE_LUNGA, SEZIONE_MAX, lunghezza, normalizzaSezione } from '@/lib/validation/contenuto'

/** Rows for a textarea as tall as its text, where field-sizing is not there (older Safari). */
function righe(testo: string): number {
  return Math.min(40, Math.max(4, testo.split('\n').length + 1))
}

/** How long the field waits after the last key before it saves by itself. */
const ATTESA_SALVATAGGIO_MS = 1200

/** The text as the page renders it: what shows until the editor is ready, and without JavaScript. */
function Lettura({ testo }: { testo: string | null }) {
  return testo ? (
    <MarkdownContenuto testo={testo} />
  ) : (
    <p className="text-sm text-muted-foreground">Vuota.</p>
  )
}

// the editor (Tiptap) only where a section is on screen, never in the lists' bundle
const EditorSezione = dynamic(() => import('@/components/marketing/editor-sezione'), { ssr: false })

type Stato = { tipo: 'fermo' } | { tipo: 'salvo' } | { tipo: 'salvato' } | { tipo: 'errore'; messaggio: string }

/**
 * One section of a template (Topic / Main Message, Script (Rough Draft),
 * Comments, Script (Final); Idea/Message, Carousel, Caption; the YouTube
 * video's), a toggle like in Notion, **always editable** (Dany, 24/10/2026:
 * «mettilo già modificabile senza dover cliccare modifica… con ctrl + b mette
 * in automatico in grassetto»): no «Modifica», no «Salva». The text is written
 * like in Notion (Ctrl/⌘+B bold, Ctrl/⌘+I italic, «- » a list, «## » a title)
 * and saved by itself as Markdown, a moment after the last key and when the
 * field is left. A save goes only over the text this page last knew (its md5
 * fingerprint): when somebody else changed the section meanwhile, the saved
 * text comes back and what the person wrote stays below, read-only, to copy.
 * In the content panel Esc leaves the field and saves (the panel stays), and a
 * text not yet saved makes the panel ask before closing.
 */
export function SezioneContenuto({
  id,
  campo,
  titolo,
  testo,
  impronta,
  apertaDiBase,
}: {
  id: string
  campo: Campo
  titolo: string
  /** The saved text, null when empty. */
  testo: string | null
  /** md5 of the saved text ('' for null), computed on the server at render. */
  impronta: string
  apertaDiBase: boolean
}) {
  const pannello = usePannello()
  const opzioniToast = useOpzioniToast()
  const idTitolo = useId()
  const idAiuto = useId()
  const editor = useRef<ManigliaEditor>(null)
  const copia = useRef<HTMLTextAreaElement>(null)

  const [aperta, setAperta] = useState(apertaDiBase)
  /** The text the editor starts from (later texts reach it through its handle). */
  const [iniziale] = useState(testo)
  const [stato, setStato] = useState<Stato>({ tipo: 'fermo' })
  /** After a conflict: what the person had written, to copy. */
  const [ilMio, setIlMio] = useState<string | null>(null)
  /** A text written and not saved yet (the panel asks before closing). */
  const [sporca, setSporca] = useState(false)

  /**
   * What this page knows of the section: the last text saved (by this page or
   * read from the server) and its fingerprint, the base of the next save. In
   * refs: the saves run outside React's render, one after the other.
   */
  const salvato = useRef({ testo, impronta })
  /** The person's edits: a counter, and the one the last save sent. */
  const modifiche = useRef(0)
  const inviate = useRef(0)
  const bozza = useRef<string | null>(null)
  const inVolo = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  // a render from the server (another person's save, this page's own revalidation): taken when nothing is pending
  const [dalServer, setDalServer] = useState({ testo, impronta })
  if (dalServer.impronta !== impronta || dalServer.testo !== testo) setDalServer({ testo, impronta })
  useEffect(() => {
    if (salvato.current.impronta === dalServer.impronta) return
    if (modifiche.current !== inviate.current || inVolo.current) return
    salvato.current = { testo: dalServer.testo, impronta: dalServer.impronta }
    editor.current?.imposta(dalServer.testo)
  }, [dalServer])

  const inizioSalvataggio = pannello?.inizioSalvataggio
  const segnaBozza = pannello?.segnaBozza
  useEffect(() => {
    if (!segnaBozza) return
    segnaBozza(titolo, sporca)
    return () => segnaBozza(titolo, false)
  }, [segnaBozza, titolo, sporca])

  /** The latest salva, for what calls it later (the timer, the unmount, the save after a save). */
  const salvaUltima = useRef<() => Promise<void>>(async () => undefined)
  const salva = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (inVolo.current) return
    if (modifiche.current === inviate.current || bozza.current === null) return
    const numero = modifiche.current
    const testoInviato = bozza.current
    if (lunghezza(normalizzaSezione(testoInviato) ?? '') > SEZIONE_MAX) {
      setStato({ tipo: 'errore', messaggio: ERRORE_SEZIONE_LUNGA })
      return
    }
    inVolo.current = true
    inviate.current = numero
    setSporca(false)
    setStato({ tipo: 'salvo' })
    const fine = inizioSalvataggio?.()
    let esito: Awaited<ReturnType<typeof salvaSezioneContenuto>>
    try {
      esito = await salvaSezioneContenuto({ id, campo, testo: testoInviato, impronta: salvato.current.impronta })
    } catch {
      inviate.current = numero - 1
      inVolo.current = false
      fine?.()
      setSporca(true)
      setStato({ tipo: 'errore', messaggio: 'Connessione assente: il testo non è salvato.' })
      return
    }
    inVolo.current = false
    fine?.()
    if (esito.ok) {
      const normalizzato = normalizzaSezione(testoInviato)
      salvato.current = { testo: normalizzato, impronta: esito.impronta }
      pannello?.aggiornaSezione(id, campo, normalizzato, esito.impronta, esito.versione)
      setIlMio(null)
      setStato({ tipo: 'salvato' })
      // written meanwhile: the next save, at once
      if (modifiche.current !== inviate.current) {
        setSporca(true)
        timer.current = window.setTimeout(() => void salvaUltima.current(), 0)
      }
      return
    }
    if (esito.cambiata) {
      // somebody else saved this section: their text comes back, the person's stays below to copy
      const mio = editor.current?.testo() ?? testoInviato
      salvato.current = { testo: esito.cambiata.attuale, impronta: esito.cambiata.impronta }
      modifiche.current = inviate.current
      editor.current?.imposta(esito.cambiata.attuale)
      pannello?.aggiornaSezione(id, campo, esito.cambiata.attuale, esito.cambiata.impronta, esito.cambiata.versione)
      setIlMio(mio)
      setStato({ tipo: 'fermo' })
      toast.error(esito.errore, opzioniToast)
      return
    }
    if (esito.sparito) {
      pannello?.segnaSparito(id)
      toast.error(esito.errore, opzioniToast)
      return
    }
    inviate.current = numero - 1
    setSporca(true)
    setStato({ tipo: 'errore', messaggio: esito.errore })
  }, [id, campo, inizioSalvataggio, pannello, opzioniToast])

  // leaving the page or the panel with a save waiting: it goes now (the latest salva, once, at unmount)
  useEffect(() => {
    salvaUltima.current = salva
  })
  useEffect(() => () => void salvaUltima.current(), [])

  function cambia(markdown: string) {
    bozza.current = markdown
    modifiche.current += 1
    setSporca(true)
    if (stato.tipo !== 'fermo') setStato({ tipo: 'fermo' })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void salvaUltima.current(), ATTESA_SALVATAGGIO_MS)
  }

  async function copiaIlMio() {
    if (ilMio === null) return
    try {
      await navigator.clipboard.writeText(ilMio)
      toast.success('Testo copiato', opzioniToast)
    } catch {
      // no clipboard (permissions, an old browser): the text selected, ready for the system copy
      const el = copia.current
      if (el) {
        el.focus()
        el.select()
      }
      toast('Testo selezionato: copialo dal menu del telefono o con Ctrl+C.', opzioniToast)
    }
  }

  const errore = stato.tipo === 'errore' ? stato.messaggio : null

  return (
    <section aria-labelledby={idTitolo} data-bozza-sporca={sporca || undefined} className="relative rounded-xl bg-card">
      <details
        open={aperta}
        onToggle={(e) => {
          const ora = e.currentTarget.open
          if (ora !== aperta) setAperta(ora)
        }}
        className="group/sezione"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl py-2 pr-3 pl-3 select-none hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open/sezione:rotate-90"
            aria-hidden="true"
          />
          <h2 id={idTitolo} className="text-sm font-semibold">
            {titolo}
          </h2>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {stato.tipo === 'salvo' ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                Salvo…
              </span>
            ) : stato.tipo === 'salvato' ? (
              'Salvato'
            ) : null}
          </span>
        </summary>
        <div className="px-3 pb-3">
          <EditorSezione
            ref={editor}
            testo={iniziale}
            titolo={titolo}
            idDescrizione={errore ? `${idAiuto}-errore` : idAiuto}
            invalido={errore !== null}
            onCambia={cambia}
            onEsce={() => void salva()}
            onEsc={(evento) => {
              // React and Base UI both listen on the document: the panel recognises this event and stays
              pannello?.escGestito(evento)
            }}
            riserva={<Lettura testo={dalServer.testo} />}
          />
          {/* the shortcuts only while writing in this section: one line, not one under every toggle */}
          <p id={idAiuto} className="mt-1.5 hidden text-xs text-muted-foreground group-focus-within/sezione:block">
            Si salva da solo. Ctrl/⌘+B grassetto, Ctrl/⌘+I corsivo, «- » elenco, «## » titolo.
          </p>
          {errore ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p id={`${idAiuto}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {errore}
              </p>
              {errore !== ERRORE_SEZIONE_LUNGA ? (
                <Button type="button" variant="outline" className="h-11" onClick={() => void salva()}>
                  <RotateCw className="size-4" aria-hidden="true" />
                  Riprova
                </Button>
              ) : null}
            </div>
          ) : null}

          {ilMio !== null ? (
            <div className="mt-4 space-y-2 rounded-lg border border-status-warning/40 p-3">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
                <span>
                  <span className="font-medium">Il tuo testo</span>, non salvato: qui sopra c’è quello salvato da un’altra
                  parte.
                </span>
              </p>
              <label htmlFor={`${idTitolo}-mio`} className="sr-only">
                Il tuo testo, non salvato
              </label>
              <textarea
                id={`${idTitolo}-mio`}
                ref={copia}
                readOnly
                value={ilMio}
                rows={righe(ilMio)}
                className="w-full resize-none rounded-lg border border-input bg-input/30 px-2.5 py-2 text-sm leading-relaxed text-muted-foreground outline-none [field-sizing:content] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => void copiaIlMio()}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copia il mio testo
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setIlMio(null)}>
                  Chiudi
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  )
}
