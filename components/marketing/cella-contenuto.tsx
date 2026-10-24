'use client'

import { ExternalLink, Pencil, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { classeNome } from '@/components/marketing/badge-status'
import { useCampoContenuto, type ValoreCampo } from '@/components/marketing/campo-contenuto'
import { CLASSE_BOTTONE_CELLA, CLASSE_CHIP, PiuVuoto } from '@/components/marketing/classi-cella'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { MenuStatus } from '@/components/marketing/menu-status'
import { consumaDaAprire } from '@/components/marketing/nuova-riga'
import { SelectOpzioni } from '@/components/marketing/select-opzioni'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato, formatData, formatNumero } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { CAMPI, COLONNE_PIANO } from '@/lib/marketing/etichette'
import { VIEW_COUNT_DA_INSTAGRAM } from '@/lib/marketing/pubblicati/parole'
import { cn } from '@/lib/utils'
import { LINK_MAX, NOME_MAX } from '@/lib/validation/contenuto'

/** What a list reads (COLONNE_ELENCO): the properties, never the four sections. */
type Riga = ContenutoElenco

/** The fields a small editor (a popover with one input) changes in the table and the cards. */
export type CampoEditor = 'nome' | 'post_date' | 'url' | 'inspiration'

/**
 * - "cella": a table cell (the value as text, "+" when empty);
 * - "chip": a card's chip on the phone (44 px, "+ Post Date" when empty);
 * - "matita": the pencil «Rinomina» next to a Name.
 */
export type AspettoEditor = 'cella' | 'chip' | 'matita'

function etichettaCampo(campo: CampoEditor): string {
  return CAMPI[campo]
}

/** The text an editor starts from: the saved value as a person types it. */
function testoDi(valore: unknown): string {
  if (valore === null || valore === undefined) return ''
  return String(valore)
}

/** The value as the cell shows it. */
function testoMostrato(campo: CampoEditor, valore: unknown, lingua: Lingua = 'it'): string {
  if (valore === null || valore === undefined || valore === '') return ''
  if (campo === 'post_date') return lingua === 'it' ? formatData(String(valore)) : formato(lingua).formatData(String(valore))
  return String(valore)
}

/** The accessible name starts with the words on screen (WCAG 2.5.3): «12/10/2026: cambia Post Date di «…»». */
function nomeAccessibile(campo: CampoEditor, mostrato: string, nome: string, aspetto: AspettoEditor): string {
  if (aspetto === 'matita') return campo === 'nome' ? `Modifica il Name di «${nome}»` : `Cambia ${etichettaCampo(campo)} di «${nome}»`
  const etichetta = etichettaCampo(campo)
  if (campo === 'inspiration') {
    return mostrato ? `${etichetta}: cambia il link di «${nome}»` : `Vuoto: aggiungi ${etichetta} di «${nome}»`
  }
  if (campo === 'url') {
    return mostrato ? `${etichetta}: apri o cambia il link di «${nome}»` : `Vuoto: aggiungi ${etichetta} di «${nome}»`
  }
  if (!mostrato) return `Vuoto: ${campo === 'post_date' ? 'scegli' : 'scrivi'} ${etichetta} di «${nome}»`
  return `${mostrato}: cambia ${etichetta} di «${nome}»`
}

const TIPO_INPUT: Record<CampoEditor, { type?: string; inputMode?: 'numeric' | 'url'; maxLength?: number; placeholder?: string }> = {
  nome: { maxLength: NOME_MAX },
  post_date: { type: 'date' },
  url: { type: 'url', inputMode: 'url', maxLength: LINK_MAX, placeholder: 'https://www.instagram.com/reel/…' },
  inspiration: { type: 'url', inputMode: 'url', maxLength: LINK_MAX, placeholder: 'https://' },
}

const TOGLI: Partial<Record<CampoEditor, string>> = {
  post_date: 'Togli la data',
  url: 'Togli il link',
  inspiration: 'Togli il link',
}

const APRI_LINK: Partial<Record<CampoEditor, string>> = {
  url: 'Apri il post',
  inspiration: 'Apri l’ispirazione',
}

/**
 * One property in a small popover (1.33.0): Name, Post Date and URL, from a
 * table cell, a card's chip or the pencil next to a title (Audio, Inspiration
 * and View Count are in the content's panel since the Piano editoriale,
 * 21/10/2026). The popover is mounted at the first tap only: a plain
 * button until then, so 300 rows of editors cost nothing to hydrate. Enter
 * or «Salva» saves; a tap or Tab outside saves when the value is valid and
 * different, and keeps the popover open with the error when it is not; Esc
 * cancels (inside the content panel too: Base UI closes only the popover).
 * The save is optimistic: the popover closes at once, the value shows, and
 * comes back by itself if the server refuses.
 */
export function EditorCella<C extends CampoEditor>({
  id,
  nome,
  campo,
  valore,
  aspetto = 'cella',
  allineaDestra = false,
  apriPerNuova = false,
  className,
}: {
  id: string
  nome: string
  campo: C
  valore: ValoreCampo<C>
  aspetto?: AspettoEditor
  allineaDestra?: boolean
  /** The Name of the row «Nuovo» just created: the editor opens by itself, once, in the copy of the row that is on screen. */
  apriPerNuova?: boolean
  className?: string
}) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id, nome, campo, valore })
  const [montato, setMontato] = useState(false)
  const [aperto, setAperto] = useState(false)
  const [bozza, setBozza] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const bottone = useRef<HTMLButtonElement>(null)
  const idCampo = useId()
  const etichetta = etichettaCampo(campo)
  const visibile = testoMostrato(campo, mostrato)

  function apri() {
    // a save in flight: the field waits for it (spec R13), the new value stays shown
    if (inCorso) return
    setBozza(testoDi(mostrato))
    setErrore(null)
    setMontato(true)
    setAperto(true)
  }

  /** Saves the draft; true when the popover may close. */
  function prova(testo: string | null): boolean {
    const messaggio = salva(testo)
    if (messaggio) {
      setErrore(messaggio)
      requestAnimationFrame(() => input.current?.focus())
      return false
    }
    return true
  }

  function cambiaAperto(ora: boolean, dettagli: PopoverPrimitive.Root.ChangeEventDetails) {
    if (ora) {
      if (inCorso) {
        dettagli.cancel()
        return
      }
      apri()
      return
    }
    // Esc cancels; a tap or Tab outside saves what is valid
    if (dettagli.reason === 'escape-key') {
      setAperto(false)
      return
    }
    if (!prova(bozza)) {
      dettagli.cancel()
      return
    }
    setAperto(false)
  }

  function invia(e: FormEvent) {
    e.preventDefault()
    if (prova(bozza)) setAperto(false)
  }

  // «Nuovo»: the Name of the new row opens with the cursor in it. The table and the cards are both in the
  // page, one hidden by a container query: only the copy that is on screen takes the signal.
  useEffect(() => {
    if (!apriPerNuova || !bottone.current || bottone.current.getClientRects().length === 0) return
    // after the paint, in a callback (not in the effect's body); no cleanup, or React's double run in
    // development would cancel the only opening the signal allows
    if (consumaDaAprire(id)) window.setTimeout(apri, 0)
    // once, at the mount of the row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const contenuto: ReactNode =
    aspetto === 'matita' ? (
      <Pencil className="size-4" aria-hidden="true" />
    ) : campo === 'url' || campo === 'inspiration' ? (
      mostrato ? (
        <ExternalLink className="size-4" aria-hidden="true" />
      ) : aspetto === 'chip' ? (
        <>
          <Plus className="size-4" aria-hidden="true" />
          {etichetta}
        </>
      ) : (
        <PiuVuoto />
      )
    ) : visibile ? (
      <span className={cn(campo === 'post_date' ? 'num whitespace-nowrap' : 'block max-w-24 truncate')}>{visibile}</span>
    ) : aspetto === 'chip' ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Plus className="size-4" aria-hidden="true" />
        {etichetta}
      </span>
    ) : (
      <PiuVuoto />
    )

  const propsBottone = {
    type: 'button' as const,
    'data-cella': campo,
    'data-etichetta': etichetta,
    'aria-label': nomeAccessibile(campo, visibile, nome, aspetto),
    'aria-busy': inCorso || undefined,
    title: aspetto === 'matita' ? (campo === 'nome' ? 'Rinomina' : `Cambia ${etichetta}`) : undefined,
    className: cn(
      aspetto === 'chip'
        ? CLASSE_CHIP
        : aspetto === 'matita'
          ? 'relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-accent aria-busy:opacity-70'
          : CLASSE_BOTTONE_CELLA,
      (campo === 'url' || campo === 'inspiration') && aspetto === 'cella' && 'size-11 justify-center text-muted-foreground hover:text-foreground',
      allineaDestra && 'ml-auto justify-end',
      className,
    ),
  }

  // until the first tap, a plain button: nothing of the popover is mounted
  if (!montato) {
    return (
      <button {...propsBottone} ref={bottone} onClick={apri}>
        {contenuto}
      </button>
    )
  }

  const togli = TOGLI[campo]
  const apriLink = APRI_LINK[campo]
  return (
    <Popover open={aperto} onOpenChange={cambiaAperto}>
      <PopoverTrigger render={<button {...propsBottone} />}>{contenuto}</PopoverTrigger>
      <PopoverContent align={allineaDestra ? 'end' : 'start'} initialFocus={input} className="w-72 max-w-[calc(100vw-2rem)]">
        <form onSubmit={invia} noValidate className="space-y-2">
          <PopoverTitle render={<label htmlFor={idCampo} />} className="block text-sm font-medium">
            {etichetta}
          </PopoverTitle>
          {apriLink && typeof mostrato === 'string' && mostrato ? (
            <a
              href={mostrato}
              target="_blank"
              rel="noopener noreferrer"
              className="-ml-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              {apriLink}
              <span className="sr-only">(si apre in una nuova scheda)</span>
            </a>
          ) : null}
          <Input
            ref={input}
            id={idCampo}
            value={bozza}
            onChange={(e) => {
              setBozza(e.currentTarget.value)
              if (errore) setErrore(null)
            }}
            onFocus={(e) => {
              if (campo !== 'post_date') e.currentTarget.select()
            }}
            autoComplete="off"
            autoCapitalize={campo === 'url' || campo === 'inspiration' ? 'none' : undefined}
            className="h-11"
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? `${idCampo}-errore` : undefined}
            {...TIPO_INPUT[campo]}
          />
          {errore ? (
            <p id={`${idCampo}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-11 flex-1">
              Salva
            </Button>
            {togli && mostrato !== null && mostrato !== '' ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={() => {
                  if (prova(null)) setAperto(false)
                }}
              >
                {togli}
              </Button>
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The Name in the table: the link that opens the panel, and the pencil
 * «Rinomina». With a mouse the pencil floats over the end of the Name on the
 * row's hover or focus (as Notion's "Open"), so the Name keeps the whole
 * column; with a finger it sits next to it, always there.
 */
export function CellaNome({ riga }: { riga: Riga }) {
  return (
    <div className="relative flex min-w-0 items-center gap-0.5">
      <LinkContenuto
        id={riga.id}
        riga={riga}
        className={cn(
          // wrap-anywhere: a long word (a pasted link) never sets the column's minimum width, so the table keeps its 960px
          'line-clamp-2 min-w-0 font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          classeNome(riga.stato),
        )}
      >
        {riga.nome}
      </LinkContenuto>
      <EditorCella
        id={riga.id}
        nome={riga.nome}
        campo="nome"
        valore={riga.nome}
        aspetto="matita"
        apriPerNuova
        className="opacity-0 group-hover/riga:opacity-100 group-focus-within/riga:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-fine:absolute pointer-fine:top-1/2 pointer-fine:right-0 pointer-fine:-translate-y-1/2 pointer-fine:bg-card pointer-fine:hover:bg-accent pointer-fine:shadow-sm pointer-fine:ring-1 pointer-fine:ring-border pointer-coarse:opacity-100"
      />
    </div>
  )
}

/**
 * Inspiration (Dany, 24/10/2026: «il link della reference deve apparire già in
 * tabella cliccabile, basta anche un bottone senza mostrare il link»): with a
 * link, one tap opens it in a new tab, and the pencil next to it changes it;
 * empty, the «+» adds it. In a card (aspetto "chip") only the link, when there
 * is one: the panel changes it.
 */
export function CellaIspirazione({ riga, aspetto = 'cella' }: { riga: Riga; aspetto?: 'cella' | 'chip' }) {
  const link = riga.inspiration
  if (!link) {
    return aspetto === 'chip' ? null : <EditorCella id={riga.id} nome={riga.nome} campo="inspiration" valore={riga.inspiration} />
  }
  const apri = (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      data-ispirazione=""
      aria-label={`Apri l’ispirazione di «${riga.nome}» (si apre in una nuova scheda)`}
      title={link}
      className={cn(
        'relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        aspetto === 'cella' && '-ml-2',
      )}
    >
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      Apri
    </a>
  )
  if (aspetto === 'chip') return apri
  return (
    <div className="flex items-center">
      {apri}
      <EditorCella
        id={riga.id}
        nome={riga.nome}
        campo="inspiration"
        valore={riga.inspiration}
        aspetto="matita"
        className="opacity-0 group-hover/riga:opacity-100 group-focus-within/riga:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
      />
    </div>
  )
}

/**
 * The View Count as a number. When it comes from Instagram (the content is linked to a post whose views were read) a
 * small Instagram mark says so, with a title and a text for screen readers: «Da Instagram: si aggiorna da solo».
 */
export function ViewCount({ riga, className }: { riga: Riga; className?: string }) {
  const lingua = useLingua()
  if (riga.view_count === null) return null
  const daInstagram = riga.view_count_da_instagram === true
  const daInstagramTesto = lingua === 'it' ? VIEW_COUNT_DA_INSTAGRAM : MARKETING[lingua].piano.daInstagram
  return (
    <span className={cn('num inline-flex items-center justify-end gap-1', className)} title={daInstagram ? daInstagramTesto : undefined} data-view-count={daInstagram ? 'da-instagram' : 'a-mano'}>
      {daInstagram ? <RefreshCw className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      {lingua === 'it' ? formatNumero(riga.view_count) : formato(lingua).formatNumero(riga.view_count)}
      {daInstagram ? <span className="sr-only">{daInstagramTesto}</span> : null}
    </span>
  )
}

/** One cell of the table, by column (the Piano editoriale's). Every property but Views changes from its own cell. */
export function CellaContenuto({ riga, colonna }: { riga: Riga; colonna: (typeof COLONNE_PIANO)[number] }) {
  switch (colonna) {
    case 'nome':
      return <CellaNome riga={riga} />
    case 'reel_type':
      return <SelectOpzioni id={riga.id} nome={riga.nome} campo="reel_type" valore={riga.reel_type} />
    case 'formato':
      return <SelectOpzioni id={riga.id} nome={riga.nome} campo="formato" valore={riga.formato} />
    case 'inspiration':
      return <CellaIspirazione riga={riga} />
    case 'stato':
      return <MenuStatus id={riga.id} nome={riga.nome} stato={riga.stato} className="-ml-2" />
    case 'post_date':
      return <EditorCella id={riga.id} nome={riga.nome} campo="post_date" valore={riga.post_date} />
    case 'url':
      return <EditorCella id={riga.id} nome={riga.nome} campo="url" valore={riga.url} />
    case 'view_count':
      // read only here: the number is written in the panel, and comes from Instagram by itself when the content is linked to a post
      return riga.view_count === null ? null : <ViewCount riga={riga} className="block text-right" />
  }
}
