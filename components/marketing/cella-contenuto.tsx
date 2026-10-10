'use client'

import { ChevronDown, ExternalLink, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { classeNome } from '@/components/marketing/badge-status'
import { useCampoContenuto, type ValoreCampo } from '@/components/marketing/campo-contenuto'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { MenuStatus } from '@/components/marketing/menu-status'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { formatData, formatNumero } from '@/lib/format'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { CAMPI, ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, ORDINE_COLONNE } from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'
import { AUDIO_MAX, LINK_MAX, NOME_MAX } from '@/lib/validation/contenuto'

/** What a list reads (COLONNE_ELENCO): the properties, never the four sections. */
type Riga = ContenutoElenco

/** The fields a small editor (a popover with one input) changes. */
export type CampoEditor = 'nome' | 'post_date' | 'audio' | 'inspiration' | 'url' | 'view_count'

/**
 * - "cella": a table cell (the value as text, "+" when empty);
 * - "chip": a card's chip on the phone (44 px, "+ Post Date" when empty);
 * - "matita": the pencil «Rinomina» next to a Name.
 */
export type AspettoEditor = 'cella' | 'chip' | 'matita'

/** The cell's button: 44 px tall inside the cell's padding, so the table keeps its 960 px. */
const CLASSE_BOTTONE_CELLA =
  'relative z-10 -mx-1.5 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-transparent px-1.5 text-left transition-colors hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent aria-busy:opacity-70'

const CLASSE_CHIP =
  'relative z-10 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-transparent px-2 text-left text-sm transition-colors hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-input data-popup-open:bg-accent aria-busy:opacity-70'

/** The "+" of an empty cell: at rest nothing, on the row's hover or focus a muted "+", always with a finger. */
function PiuVuoto() {
  return (
    <Plus
      className="size-4 text-muted-foreground/60 opacity-0 transition-opacity group-hover/riga:opacity-100 group-focus-within/riga:opacity-100 pointer-coarse:opacity-100"
      aria-hidden="true"
    />
  )
}

function etichettaCampo(campo: CampoEditor | 'reel_type' | 'formato'): string {
  return CAMPI[campo]
}

/** The text an editor starts from: the saved value as a person types it. */
function testoDi(campo: CampoEditor, valore: unknown): string {
  if (valore === null || valore === undefined) return ''
  if (campo === 'view_count') return formatNumero(Number(valore))
  return String(valore)
}

/** The value as the cell shows it. */
function testoMostrato(campo: CampoEditor, valore: unknown): string {
  if (valore === null || valore === undefined || valore === '') return ''
  if (campo === 'post_date') return formatData(String(valore))
  if (campo === 'view_count') return formatNumero(Number(valore))
  return String(valore)
}

/** The accessible name starts with the words on screen (WCAG 2.5.3): «12/10/2026: cambia Post Date di «…»». */
function nomeAccessibile(campo: CampoEditor, mostrato: string, nome: string, aspetto: AspettoEditor): string {
  if (aspetto === 'matita') return `Modifica il Name di «${nome}»`
  const etichetta = etichettaCampo(campo)
  if (campo === 'inspiration' || campo === 'url') {
    return mostrato ? `${etichetta}: apri o cambia il link di «${nome}»` : `Vuoto: aggiungi ${etichetta} di «${nome}»`
  }
  if (!mostrato) return `Vuoto: ${campo === 'post_date' ? 'scegli' : 'scrivi'} ${etichetta} di «${nome}»`
  return `${mostrato}: cambia ${etichetta} di «${nome}»`
}

const TIPO_INPUT: Record<CampoEditor, { type?: string; inputMode?: 'numeric' | 'url'; maxLength?: number; placeholder?: string }> = {
  nome: { maxLength: NOME_MAX },
  post_date: { type: 'date' },
  audio: { maxLength: AUDIO_MAX },
  inspiration: { type: 'url', inputMode: 'url', maxLength: LINK_MAX, placeholder: 'https://' },
  url: { type: 'url', inputMode: 'url', maxLength: LINK_MAX, placeholder: 'https://www.instagram.com/reel/…' },
  view_count: { inputMode: 'numeric' },
}

const TOGLI: Partial<Record<CampoEditor, string>> = {
  post_date: 'Togli la data',
  inspiration: 'Togli il link',
  url: 'Togli il link',
}

const APRI_LINK: Partial<Record<CampoEditor, string>> = {
  inspiration: 'Apri l’ispirazione',
  url: 'Apri il post',
}

/**
 * One property in a small popover (1.33.0): Name, Post Date, Audio, View
 * Count, Inspiration and URL, from a table cell, a card's chip or the pencil
 * next to a title. The popover is mounted at the first tap only: a plain
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
  className,
}: {
  id: string
  nome: string
  campo: C
  valore: ValoreCampo<C>
  aspetto?: AspettoEditor
  allineaDestra?: boolean
  className?: string
}) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id, nome, campo, valore })
  const [montato, setMontato] = useState(false)
  const [aperto, setAperto] = useState(false)
  const [bozza, setBozza] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const idCampo = useId()
  const etichetta = etichettaCampo(campo)
  const visibile = testoMostrato(campo, mostrato)

  function apri() {
    // a save in flight: the field waits for it (spec R13), the new value stays shown
    if (inCorso) return
    setBozza(testoDi(campo, mostrato))
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

  const contenuto: ReactNode =
    aspetto === 'matita' ? (
      <Pencil className="size-4" aria-hidden="true" />
    ) : campo === 'inspiration' || campo === 'url' ? (
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
      <span
        className={cn(
          campo === 'post_date' || campo === 'view_count' ? 'num whitespace-nowrap' : 'block max-w-24 truncate',
          aspetto === 'chip' && campo === 'audio' && 'max-w-40',
        )}
        title={campo === 'audio' ? visibile : undefined}
      >
        {visibile}
      </span>
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
    'data-etichetta': aspetto === 'matita' ? 'Name' : etichetta,
    'aria-label': nomeAccessibile(campo, visibile, nome, aspetto),
    'aria-busy': inCorso || undefined,
    title: aspetto === 'matita' ? 'Rinomina' : undefined,
    className: cn(
      aspetto === 'chip'
        ? CLASSE_CHIP
        : aspetto === 'matita'
          ? 'relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-accent aria-busy:opacity-70'
          : CLASSE_BOTTONE_CELLA,
      (campo === 'inspiration' || campo === 'url') && aspetto === 'cella' && 'size-11 justify-center text-muted-foreground hover:text-foreground',
      allineaDestra && 'ml-auto justify-end',
      className,
    ),
  }

  // until the first tap, a plain button: nothing of the popover is mounted
  if (!montato) {
    return (
      <button {...propsBottone} onClick={apri}>
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
            {aspetto === 'matita' ? 'Name' : etichetta}
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
            className={cn('h-11', campo === 'view_count' && 'num')}
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

type CampoScelta = 'reel_type' | 'formato'

const OPZIONI: Record<CampoScelta, Record<string, string>> = {
  reel_type: ETICHETTA_REEL_TYPE,
  formato: ETICHETTA_FORMAT,
}

/**
 * Reel Type or Format with one tap (1.33.0): a menu with «Vuoto» and Notion's
 * options in Notion's order, as the Status. Mounted at the first tap, like
 * the popovers.
 */
export function MenuScelta<C extends CampoScelta>({
  id,
  nome,
  campo,
  valore,
  aspetto = 'cella',
  className,
}: {
  id: string
  nome: string
  campo: C
  valore: ValoreCampo<C>
  aspetto?: 'cella' | 'chip'
  className?: string
}) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id, nome, campo, valore })
  const [montato, setMontato] = useState(false)
  const [aperto, setAperto] = useState(false)
  const etichetta = CAMPI[campo]
  const opzioni = OPZIONI[campo]
  const visibile = mostrato ? opzioni[mostrato] : ''

  const propsBottone = {
    type: 'button' as const,
    'data-cella': campo,
    'data-etichetta': etichetta,
    'aria-label': visibile ? `${visibile}: cambia ${etichetta} di «${nome}»` : `Vuoto: scegli ${etichetta} di «${nome}»`,
    'aria-busy': inCorso || undefined,
    'aria-haspopup': 'menu' as const,
    className: cn(aspetto === 'chip' ? CLASSE_CHIP : CLASSE_BOTTONE_CELLA, className),
  }
  const contenuto = visibile ? (
    <>
      <span className={aspetto === 'cella' ? 'whitespace-nowrap' : undefined}>{visibile}</span>
      {aspetto === 'chip' ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </>
  ) : aspetto === 'chip' ? (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Plus className="size-4" aria-hidden="true" />
      {etichetta}
    </span>
  ) : (
    <PiuVuoto />
  )

  if (!montato) {
    return (
      <button
        {...propsBottone}
        aria-expanded={false}
        onClick={() => {
          if (inCorso) return
          setMontato(true)
          setAperto(true)
        }}
      >
        {contenuto}
      </button>
    )
  }

  return (
    <DropdownMenu
      open={aperto}
      onOpenChange={(ora, dettagli) => {
        if (ora && inCorso) {
          dettagli.cancel()
          return
        }
        setAperto(ora)
      }}
    >
      <DropdownMenuTrigger render={<button {...propsBottone} />}>{contenuto}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup
          value={mostrato ?? ''}
          aria-label={etichetta}
          onValueChange={(v) => {
            setAperto(false)
            salva(typeof v === 'string' && v ? v : null)
          }}
        >
          <DropdownMenuRadioItem value="" closeOnClick className="min-h-11 px-3 text-muted-foreground">
            Vuoto
          </DropdownMenuRadioItem>
          {Object.entries(opzioni).map(([valoreOpzione, testo]) => (
            <DropdownMenuRadioItem key={valoreOpzione} value={valoreOpzione} closeOnClick className="min-h-11 px-3">
              {testo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
        className="opacity-0 group-hover/riga:opacity-100 group-focus-within/riga:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-fine:absolute pointer-fine:top-1/2 pointer-fine:right-0 pointer-fine:-translate-y-1/2 pointer-fine:bg-card pointer-fine:hover:bg-accent pointer-fine:shadow-sm pointer-fine:ring-1 pointer-fine:ring-border pointer-coarse:opacity-100"
      />
    </div>
  )
}

/** One cell of the table, by column (Notion's order). Every property changes from its own cell. */
export function CellaContenuto({ riga, colonna }: { riga: Riga; colonna: (typeof ORDINE_COLONNE)[number] }) {
  switch (colonna) {
    case 'nome':
      return <CellaNome riga={riga} />
    case 'reel_type':
      return <MenuScelta id={riga.id} nome={riga.nome} campo="reel_type" valore={riga.reel_type} />
    case 'formato':
      return <MenuScelta id={riga.id} nome={riga.nome} campo="formato" valore={riga.formato} />
    case 'inspiration':
      return <EditorCella id={riga.id} nome={riga.nome} campo="inspiration" valore={riga.inspiration} />
    case 'stato':
      return <MenuStatus id={riga.id} nome={riga.nome} stato={riga.stato} className="-ml-2" />
    case 'post_date':
      return <EditorCella id={riga.id} nome={riga.nome} campo="post_date" valore={riga.post_date} />
    case 'audio':
      return <EditorCella id={riga.id} nome={riga.nome} campo="audio" valore={riga.audio} />
    case 'url':
      return <EditorCella id={riga.id} nome={riga.nome} campo="url" valore={riga.url} />
    case 'view_count':
      return <EditorCella id={riga.id} nome={riga.nome} campo="view_count" valore={riga.view_count} allineaDestra />
  }
}
