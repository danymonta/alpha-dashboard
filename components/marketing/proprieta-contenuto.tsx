'use client'

import { ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { useCampoContenuto } from '@/components/marketing/campo-contenuto'
import { usePannello } from '@/components/marketing/contesto-pannello'
import { SelectOpzioni } from '@/components/marketing/select-opzioni'
import { formatNumero } from '@/lib/format'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { CAMPI, CAMPO_MODELLO, ETICHETTA_MODELLO } from '@/lib/marketing/etichette'
import { VIEW_COUNT_A_MANO, VIEW_COUNT_DA_INSTAGRAM } from '@/lib/marketing/pubblicati/parole'
import { cn } from '@/lib/utils'
import { AUDIO_MAX, LINK_MAX } from '@/lib/validation/contenuto'

type Riga = ContenutoElenco

/**
 * Notion's look: no border at rest, visible on hover and with the focus,
 * still 44 px tall. The same class for the inputs and the native selects.
 */
const CLASSE_CONTROLLO =
  'h-11 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2.5 text-base outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm'

/** A whole day as the date field gives it, in a plausible year: "0002-10-12" while typing the year is not one. */
function dataCompleta(valore: string): boolean {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(valore)
  return m !== null && Number(m[1]) >= 1900 && Number(m[1]) <= 2100
}

/** After the last change of a date field, the save waits this long (the person may still be typing). */
const ATTESA_DATA_MS = 700

function RigaProprieta({ etichetta, idCampo, children }: { etichetta: string; idCampo?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-11 min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2 py-0.5">
      <dt className="pt-3 text-xs text-muted-foreground">
        {idCampo ? <label htmlFor={idCampo}>{etichetta}</label> : etichetta}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function Errore({ id, testo }: { id: string; testo: string | null }) {
  if (!testo) return null
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-2 px-2.5 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

function Rotella({ inCorso }: { inCorso: boolean }) {
  if (!inCorso) return null
  return (
    <LoaderCircle
      className="pointer-events-none absolute top-3.5 right-2.5 size-4 animate-spin text-muted-foreground"
      aria-hidden="true"
    />
  )
}

/** Modello: a native select (on a phone the system's picker), saved at the change. */
function SelectModello({ riga }: { riga: Riga }) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id: riga.id, nome: riga.nome, campo: 'tipo', valore: riga.tipo })
  const idCampo = useId()
  const [errore, setErrore] = useState<string | null>(null)
  return (
    <RigaProprieta etichetta={CAMPO_MODELLO} idCampo={idCampo}>
      <div className="relative">
        <select
          id={idCampo}
          value={mostrato}
          aria-busy={inCorso || undefined}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? `${idCampo}-errore` : undefined}
          data-cella="tipo"
          onChange={(e) => setErrore(salva(e.currentTarget.value || null))}
          className={cn(CLASSE_CONTROLLO, 'pr-8')}
        >
          {Object.entries(ETICHETTA_MODELLO).map(([valore, testo]) => (
            <option key={valore} value={valore}>
              {testo}
            </option>
          ))}
        </select>
        <Rotella inCorso={inCorso} />
      </div>
      <Errore id={`${idCampo}-errore`} testo={errore} />
    </RigaProprieta>
  )
}

/** Reel Type and Format: the label's pill, a tap opens the menu (create, rename, colour, delete). */
function CampoEtichetta({ riga, campo }: { riga: Riga; campo: 'reel_type' | 'formato' }) {
  return (
    <RigaProprieta etichetta={CAMPI[campo]}>
      <SelectOpzioni id={riga.id} nome={riga.nome} campo={campo} valore={riga[campo]} aspetto="campo" />
    </RigaProprieta>
  )
}

type CampoInput = 'post_date' | 'audio' | 'inspiration' | 'url' | 'view_count'

function testoDi(campo: CampoInput, valore: unknown): string {
  if (valore === null || valore === undefined) return ''
  if (campo === 'view_count') return formatNumero(Number(valore))
  return String(valore)
}

/**
 * Post Date, Audio, Inspiration, URL, View Count: an input saved at Enter
 * and when the focus leaves (a date also a moment after a whole day is
 * chosen). Esc puts the saved value back and the panel stays open; with
 * nothing changed, Esc closes the panel as usual.
 */
function InputCampo<C extends CampoInput>({
  riga,
  campo,
  aiuto,
}: {
  riga: Riga
  campo: C
  aiuto?: string
}) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id: riga.id, nome: riga.nome, campo, valore: riga[campo] })
  const pannello = usePannello()
  const idCampo = useId()
  const salvato = testoDi(campo, mostrato)
  const [bozza, setBozza] = useState(salvato)
  const [visto, setVisto] = useState(salvato)
  const [aFuoco, setAFuoco] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null)
  // a new saved value (one's own save, somebody else's): the field shows it, unless the person is typing over it
  if (visto !== salvato) {
    setVisto(salvato)
    if (!aFuoco || bozza === visto) {
      setBozza(salvato)
      setErrore(null)
    }
  }
  useEffect(
    () => () => {
      if (attesa.current) clearTimeout(attesa.current)
    },
    [],
  )

  function annullaAttesa() {
    if (attesa.current) clearTimeout(attesa.current)
    attesa.current = null
  }

  function prova(testo: string) {
    annullaAttesa()
    if (testo === salvato) {
      setErrore(null)
      return
    }
    setErrore(salva(testo))
  }

  function tasti(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      prova(bozza)
    } else if (e.key === 'Escape' && (bozza !== salvato || errore)) {
      // the field cancels itself: the panel recognises this event and stays open (spec R1)
      e.preventDefault()
      pannello?.escGestito(e.nativeEvent)
      annullaAttesa()
      setBozza(salvato)
      setErrore(null)
    }
  }

  const collegamento = (campo === 'inspiration' || campo === 'url') && typeof mostrato === 'string' && mostrato ? mostrato : null
  const idAiuto = `${idCampo}-aiuto`
  const descrizione = errore ? `${idCampo}-errore` : aiuto ? idAiuto : undefined

  return (
    <RigaProprieta etichetta={CAMPI[campo]} idCampo={idCampo}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <input
            id={idCampo}
            value={bozza}
            data-cella={campo}
            autoComplete="off"
            autoCapitalize={campo === 'url' || campo === 'inspiration' ? 'none' : undefined}
            type={campo === 'post_date' ? 'date' : campo === 'url' || campo === 'inspiration' ? 'url' : 'text'}
            inputMode={campo === 'view_count' ? 'numeric' : campo === 'url' || campo === 'inspiration' ? 'url' : undefined}
            maxLength={campo === 'audio' ? AUDIO_MAX : campo === 'url' || campo === 'inspiration' ? LINK_MAX : undefined}
            placeholder={campo === 'url' ? 'https://www.instagram.com/reel/…' : campo === 'inspiration' ? 'https://' : 'Vuoto'}
            aria-busy={inCorso || undefined}
            aria-invalid={errore ? true : undefined}
            aria-describedby={descrizione}
            onFocus={() => setAFuoco(true)}
            onBlur={() => {
              setAFuoco(false)
              prova(bozza)
            }}
            onKeyDown={tasti}
            onChange={(e) => {
              const testo = e.currentTarget.value
              setBozza(testo)
              if (errore) setErrore(null)
              // a date picked (or typed whole) saves by itself a moment later
              if (campo === 'post_date') {
                annullaAttesa()
                if (testo === '' || dataCompleta(testo)) attesa.current = setTimeout(() => prova(testo), ATTESA_DATA_MS)
              }
            }}
            className={cn(CLASSE_CONTROLLO, campo === 'view_count' && 'num', inCorso && 'pr-8')}
          />
          <Rotella inCorso={inCorso} />
        </div>
        {collegamento ? (
          <a
            href={collegamento}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={campo === 'url' ? 'Apri il post' : 'Apri l’ispirazione'}
            title={campo === 'url' ? 'Apri il post' : 'Apri l’ispirazione'}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <Errore id={`${idCampo}-errore`} testo={errore} />
      {aiuto && !errore ? (
        <p id={idAiuto} className="mt-1 px-2.5 text-xs text-muted-foreground">
          {aiuto}
        </p>
      ) : null}
    </RigaProprieta>
  )
}

/**
 * The View Count (25/10/2026): when the content is linked to a post of Instagram whose views were read, it is the post's
 * views, it updates itself every morning and it is read only here («Da Instagram: si aggiorna da solo»); otherwise it is
 * written by hand, as before, and the help line says when it will start to fill itself. The database refuses a hand
 * write on a number that comes from Instagram, so this is the screen saying it, not the only guard.
 */
function CampoViewCount({ riga }: { riga: Riga }) {
  if (riga.view_count_da_instagram !== true || riga.view_count === null) {
    return <InputCampo riga={riga} campo="view_count" aiuto={VIEW_COUNT_A_MANO} />
  }
  return (
    <RigaProprieta etichetta={CAMPI.view_count}>
      <p className="flex min-h-11 items-center gap-2 px-2.5 text-base md:text-sm" title={VIEW_COUNT_DA_INSTAGRAM} data-cella="view_count" data-sola-lettura="" data-testid="view-count-da-instagram">
        <span className="num">{formatNumero(riga.view_count)}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
          {VIEW_COUNT_DA_INSTAGRAM}
        </span>
      </p>
    </RigaProprieta>
  )
}

/**
 * The properties of a content in the panel and on its page (1.33.0): every
 * one saves by itself, over the value it showed, with the same schema and
 * action as the table's cells. Native controls: on a phone the system's
 * pickers, never a popover above the keyboard.
 */
export function ProprietaContenuto({ riga }: { riga: Riga }) {
  return (
    <section aria-label="Proprietà" className="rounded-xl bg-card px-2 py-2">
      <dl className="grid gap-x-6">
        <SelectModello riga={riga} />
        <CampoEtichetta riga={riga} campo="reel_type" />
        <CampoEtichetta riga={riga} campo="formato" />
        <InputCampo riga={riga} campo="post_date" />
        <InputCampo riga={riga} campo="audio" />
        <InputCampo riga={riga} campo="inspiration" />
        <InputCampo riga={riga} campo="url" aiuto="Il link del post pubblicato, copiato dal browser." />
        <CampoViewCount riga={riga} />
      </dl>
    </section>
  )
}
