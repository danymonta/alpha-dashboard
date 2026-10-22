'use client'

import { ChevronRight, Copy, LoaderCircle, Pencil, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { toast } from 'sonner'

import { salvaSezioneContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import { MarkdownContenuto } from '@/components/marketing/markdown-contenuto'
import { useSolaLettura } from '@/components/shell/sola-lettura'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { SezioneContenuto as Campo } from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'
import { ERRORE_SEZIONE_LUNGA, SEZIONE_MAX, lunghezza, normalizzaSezione } from '@/lib/validation/contenuto'

/** Rows for a textarea as tall as its text, where field-sizing is not there (older Safari). */
function righe(testo: string): number {
  return Math.min(40, Math.max(4, testo.split('\n').length + 1))
}

/**
 * One section of a Notion template (Topic / Main Message, Script (Rough
 * Draft), Comments, Script (Final); Idea/Message, Carousel, Caption), a toggle
 * like in Notion, written in place. "Modifica" sits outside the <summary>
 * (interactive content inside it is invalid and swallows the tap). A save
 * goes only over the text the page showed (its md5 fingerprint): when
 * somebody else changed this section meanwhile, the saved text comes back and
 * what the person wrote stays below, read-only, to copy. In the content panel
 * (1.33.0) Esc cancels the edit and the panel stays, and a text not saved
 * makes the panel ask before closing.
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
  // the business coach reads the sections and writes none (22/10/2026)
  const solaLettura = useSolaLettura()
  const idTitolo = useId()
  const idAiuto = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const copia = useRef<HTMLTextAreaElement>(null)
  const bottoneModifica = useRef<HTMLButtonElement>(null)
  /**
   * Where the focus goes once the field (or the button) is on screen: moved in
   * the same commit that swaps them, so the content panel's focus trap never
   * sees it fall to <body> (it would take it back to the panel's title).
   */
  const fuocoRichiesto = useRef<'testo' | 'modifica' | null>(null)
  useLayoutEffect(() => {
    const dove = fuocoRichiesto.current
    if (!dove) return
    if (dove === 'testo' && area.current) {
      fuocoRichiesto.current = null
      const el = area.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    } else if (dove === 'modifica' && bottoneModifica.current) {
      fuocoRichiesto.current = null
      bottoneModifica.current.focus()
    }
  })

  // what this page knows of the section: the server's render, or the person's own save after it
  const [dalServer, setDalServer] = useState({ testo, impronta })
  const [salvato, setSalvato] = useState({ testo, impronta })
  if (dalServer.impronta !== impronta || dalServer.testo !== testo) {
    setDalServer({ testo, impronta })
    setSalvato({ testo, impronta })
  }

  const [aperta, setAperta] = useState(apertaDiBase)
  const [inModifica, setInModifica] = useState(false)
  const [bozza, setBozza] = useState('')
  // a transition: the save is in flight until the redraw it brings is committed
  const [inCorso, avviaSalvataggio] = useTransition()
  const [errore, setErrore] = useState<string | null>(null)
  /** After a conflict: what the person had written, to copy. */
  const [ilMio, setIlMio] = useState<string | null>(null)
  /**
   * The fingerprint of the text the edit started from. A render from the
   * server while editing (somebody else's save) never moves it: the save then
   * finds the section changed, and the person sees it, instead of writing
   * over a text he has not read.
   */
  const [partenza, setPartenza] = useState(impronta)
  // while the save (and the redraw it brings) is in flight, the panel knows
  const inizioSalvataggio = pannello?.inizioSalvataggio
  useEffect(() => (inCorso && inizioSalvataggio ? inizioSalvataggio() : undefined), [inCorso, inizioSalvataggio])

  // a text different from the saved one: the panel asks before closing
  const sporca = inModifica && bozza !== (salvato.testo ?? '')
  const segnaBozza = pannello?.segnaBozza
  useEffect(() => {
    if (!segnaBozza) return
    segnaBozza(titolo, sporca)
    return () => segnaBozza(titolo, false)
  }, [segnaBozza, titolo, sporca])

  function modifica() {
    setBozza(salvato.testo ?? '')
    setPartenza(salvato.impronta)
    setErrore(null)
    setAperta(true)
    setInModifica(true)
    // in the commit that shows the field
    fuocoRichiesto.current = 'testo'
  }

  function annulla() {
    setInModifica(false)
    setErrore(null)
    fuocoRichiesto.current = 'modifica'
  }

  function salva() {
    if (lunghezza(normalizzaSezione(bozza) ?? '') > SEZIONE_MAX) {
      setErrore(ERRORE_SEZIONE_LUNGA)
      return
    }
    setErrore(null)
    avviaSalvataggio(async () => {
      let esito: Awaited<ReturnType<typeof salvaSezioneContenuto>>
      try {
        esito = await salvaSezioneContenuto({ id, campo, testo: bozza, impronta: partenza })
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (esito.ok) {
        // the text as the database stored it; no router.refresh(): the action's revalidatePath redrew the page (1.33.0)
        setSalvato({ testo: normalizzaSezione(bozza), impronta: esito.impronta })
        pannello?.aggiornaSezione(id, campo, normalizzaSezione(bozza), esito.impronta, esito.versione)
        setInModifica(false)
        setIlMio(null)
        toast.success('Salvato', opzioniToast)
        fuocoRichiesto.current = 'modifica'
        return
      }
      if (esito.cambiata) {
        // somebody else saved this section: their text comes back, the person's stays below to copy
        setIlMio(bozza)
        setSalvato({ testo: esito.cambiata.attuale, impronta: esito.cambiata.impronta })
        pannello?.aggiornaSezione(id, campo, esito.cambiata.attuale, esito.cambiata.impronta, esito.cambiata.versione)
        setInModifica(false)
        toast.error(esito.errore, opzioniToast)
        fuocoRichiesto.current = 'modifica'
        return
      }
      if (esito.sparito) {
        pannello?.segnaSparito(id)
        toast.error(esito.errore, opzioniToast)
        return
      }
      setErrore(esito.errore)
    })
  }

  function tasti(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      // React and Base UI both listen on the document: the panel recognises this event and stays (spec R1)
      pannello?.escGestito(e.nativeEvent)
      annulla()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      salva()
    }
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
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl py-2 pr-32 pl-3 select-none hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open/sezione:rotate-90"
            aria-hidden="true"
          />
          <h2 id={idTitolo} className="text-sm font-semibold">
            {titolo}
          </h2>
        </summary>
        <div className="px-3 pb-3">
          {inModifica ? (
            <div className="space-y-2">
              <label htmlFor={`${idTitolo}-testo`} className="sr-only">
                {titolo}
              </label>
              <Textarea
                id={`${idTitolo}-testo`}
                ref={area}
                value={bozza}
                rows={righe(bozza)}
                onChange={(e) => setBozza(e.currentTarget.value)}
                onKeyDown={tasti}
                aria-describedby={errore ? `${idAiuto}-errore` : idAiuto}
                aria-invalid={errore ? true : undefined}
                className="min-h-28 text-sm leading-relaxed"
              />
              <p id={idAiuto} className="text-xs text-muted-foreground">
                Markdown come in Notion: **grassetto**, elenchi con «-», un a capo resta un a capo. Esc annulla.
              </p>
              {errore ? (
                <p id={`${idAiuto}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {errore}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" className="h-11 flex-1 sm:flex-none" disabled={inCorso} onClick={salva}>
                  {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {inCorso ? 'Salvo…' : 'Salva'}
                </Button>
                <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" disabled={inCorso} onClick={annulla}>
                  Annulla
                </Button>
              </div>
            </div>
          ) : salvato.testo ? (
            <MarkdownContenuto testo={salvato.testo} />
          ) : (
            <p className="text-sm text-muted-foreground">{solaLettura ? 'Vuota.' : 'Vuota: tocca Modifica per scriverla.'}</p>
          )}

          {ilMio !== null && !inModifica ? (
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
      {inModifica || solaLettura ? null : (
        <Button
          ref={bottoneModifica}
          type="button"
          variant="ghost"
          className={cn('absolute top-0.5 right-1 h-11')}
          aria-label={`Modifica ${titolo}`}
          onClick={modifica}
        >
          <Pencil className="size-4" aria-hidden="true" />
          Modifica
        </Button>
      )}
    </section>
  )
}
