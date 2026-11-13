'use client'

import { FileText, ImageIcon, LoaderCircle, Paperclip, TriangleAlert, X } from 'lucide-react'
import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { togliAllegato } from '@/app/(cliente)/percorso/actions'
import { dimensioneInParole, type AllegatoCliente } from '@/lib/percorso/allegati'
import type { AllegatoDomanda } from '@/lib/percorso/questionario'
import { TESTI_QUESTIONARIO } from '@/lib/percorso/testi'
import {
  ALLEGATI_PER_CAMPO,
  BYTE_ALLEGATO_MAX,
  nomeFilePulito,
  type CampoAllegato,
  type TipoAllegato,
} from '@/lib/validation/questionario'
import { cn } from '@/lib/utils'

const T = TESTI_QUESTIONARIO.allegati

/** A photo straight from the phone may be bigger: the browser shrinks it before it leaves. */
const FOTO_ORIGINALE_MAX = 30 * 1024 * 1024
/** The longest side of a photo after the browser shrinks it (as Alfire's attachments). */
const LATO_FOTO_MAX = 2000

class Rifiuto extends Error {}

async function decodifica(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // the phone's orientation, as the photo was taken
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Safari opens some formats (HEIC) only through an <img>
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * A photo leaves the phone smaller: JPEG, longest side 2,000 px. Drawing it again drops its
 * metadata too (the place where it was taken).
 */
async function riduciFoto(file: File): Promise<Blob> {
  const sorgente = await decodifica(file)
  const larghezza = 'naturalWidth' in sorgente ? sorgente.naturalWidth : sorgente.width
  const altezza = 'naturalHeight' in sorgente ? sorgente.naturalHeight : sorgente.height
  if (!larghezza || !altezza) throw new Rifiuto(T.nonValido)
  const scala = Math.min(1, LATO_FOTO_MAX / Math.max(larghezza, altezza))
  const tela = document.createElement('canvas')
  tela.width = Math.max(1, Math.round(larghezza * scala))
  tela.height = Math.max(1, Math.round(altezza * scala))
  const ctx = tela.getContext('2d')
  if (!ctx) throw new Rifiuto(T.nonValido)
  // pixel data, not UI: JPEG has no transparency, a transparent screenshot goes on a white page
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tela.width, tela.height)
  ctx.drawImage(sorgente, 0, 0, tela.width, tela.height)
  if ('close' in sorgente) sorgente.close()
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85))
  if (!blob) throw new Rifiuto(T.nonValido)
  return blob
}

function pdf(file: File): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name))
}

/** What leaves the phone: a PDF as it is, a photo made smaller as JPEG; the name kept for the list. */
async function preparaFile(file: File): Promise<{ corpo: Blob; nome: string; tipo: TipoAllegato }> {
  if (pdf(file)) {
    if (file.size > BYTE_ALLEGATO_MAX || file.size === 0) throw new Rifiuto(T.nonValido)
    return { corpo: new Blob([file], { type: 'application/pdf' }), nome: nomeFilePulito(file.name), tipo: 'application/pdf' }
  }
  if (!file.type.startsWith('image/') && file.type !== '') throw new Rifiuto(T.nonValido)
  if (file.size > FOTO_ORIGINALE_MAX || file.size === 0) throw new Rifiuto(T.nonValido)
  let corpo: Blob
  try {
    corpo = await riduciFoto(file)
  } catch {
    throw new Rifiuto(T.nonValido)
  }
  if (corpo.size > BYTE_ALLEGATO_MAX) throw new Rifiuto(T.nonValido)
  const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return { corpo, nome: nomeFilePulito(`${base}.jpg`), tipo: 'image/jpeg' }
}

async function json(risposta: Response): Promise<Record<string, unknown>> {
  return ((await risposta.json().catch(() => null)) as Record<string, unknown> | null) ?? {}
}

/**
 * One file all the way: the row (POST /api/percorso/allegati), the upload on the signed address
 * the server made for that path only, the confirmation (the server reads its first bytes).
 */
async function carica(campo: CampoAllegato, file: File): Promise<AllegatoCliente> {
  const { corpo, nome, tipo } = await preparaFile(file)

  let r: Response
  try {
    r = await fetch('/api/percorso/allegati', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campo, nome, tipo, byte: corpo.size }),
    })
  } catch {
    throw new Rifiuto(TESTI_QUESTIONARIO.nonSalvato)
  }
  const preparato = await json(r)
  if (!r.ok || typeof preparato.id !== 'string' || typeof preparato.url !== 'string') {
    throw new Rifiuto(typeof preparato.errore === 'string' ? preparato.errore : T.nonArrivato)
  }

  // the storage reads the type of the part: the one the row declared
  const dati = new FormData()
  dati.append('cacheControl', '3600')
  dati.append('', new File([corpo], nome, { type: tipo }))
  try {
    const su = await fetch(preparato.url, { method: 'PUT', body: dati })
    if (!su.ok) throw new Rifiuto(T.nonArrivato)
  } catch (e) {
    if (e instanceof Rifiuto) throw e
    throw new Rifiuto(T.nonArrivato)
  }

  let c: Response
  try {
    c = await fetch(`/api/percorso/allegati/${preparato.id}/conferma`, { method: 'POST' })
  } catch {
    throw new Rifiuto(T.nonArrivato)
  }
  const confermato = await json(c)
  const a = confermato.allegato as Record<string, unknown> | undefined
  if (!c.ok || !a || typeof a.id !== 'string') {
    throw new Rifiuto(typeof confermato.errore === 'string' ? confermato.errore : T.nonArrivato)
  }
  return a as unknown as AllegatoCliente
}

/**
 * The files of a question (release B1b): the list with the X, «Aggiungi una foto o un PDF»,
 * at most 3 per field. Each file goes as soon as it is chosen; an error says what to do, in
 * words, under the list.
 */
export function AllegatiDomanda({
  allegato,
  allegati,
  onCambia,
}: {
  allegato: AllegatoDomanda
  allegati: readonly AllegatoCliente[]
  onCambia: (aggiorna: (prima: readonly AllegatoCliente[]) => AllegatoCliente[]) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const [inCarico, setInCarico] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [togliendo, avviaTogli] = useTransition()
  const [daTogliere, setDaTogliere] = useState<string | null>(null)
  const pieno = allegati.length >= ALLEGATI_PER_CAMPO
  const occupato = inCarico !== null

  async function scegli(files: FileList | null) {
    if (!files || files.length === 0) return
    setErrore(null)
    let quanti = allegati.length
    for (const file of Array.from(files)) {
      if (quanti >= ALLEGATI_PER_CAMPO) {
        setErrore(T.pieno)
        break
      }
      setInCarico(nomeFilePulito(file.name))
      try {
        const nuovo = await carica(allegato.campo, file)
        quanti++
        onCambia((prima) => [...prima.filter((x) => x.id !== nuovo.id), nuovo])
        toast.success(T.caricato)
      } catch (e) {
        setErrore(e instanceof Rifiuto ? e.message : T.nonArrivato)
        break
      }
    }
    setInCarico(null)
    if (input.current) input.current.value = ''
  }

  function togli(a: AllegatoCliente) {
    setErrore(null)
    setDaTogliere(a.id)
    avviaTogli(async () => {
      try {
        const esito = await togliAllegato({ id: a.id })
        if (!esito.ok) {
          setErrore(esito.errore)
          return
        }
        onCambia(() => esito.allegati.filter((x) => x.campo === allegato.campo))
        toast.success(T.tolto)
      } catch {
        setErrore(TESTI_QUESTIONARIO.nonSalvato)
      } finally {
        setDaTogliere(null)
      }
    })
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3.5" data-allegati={allegato.campo}>
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-sm font-medium" id={`${id}-titolo`}>
          <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
          {allegato.etichetta}
        </p>
        <p className="text-sm text-muted-foreground">{allegato.aiuto}</p>
      </div>

      {allegati.length > 0 ? (
        <ul className="space-y-2" aria-labelledby={`${id}-titolo`}>
          {allegati.map((a) => {
            const Icona = a.tipo === 'application/pdf' ? FileText : ImageIcon
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-lg bg-background/70 py-1 pr-1 pl-3" data-allegato={a.id}>
                <Icona className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.nomeFile}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {a.tipo === 'application/pdf' ? T.pdf : T.foto} · {dimensioneInParole(a.byte)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={T.togli(a.nomeFile)}
                  aria-busy={daTogliere === a.id ? true : undefined}
                  onClick={() => (togliendo ? undefined : togli(a))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                >
                  {daTogliere === a.id ? (
                    <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <X className="size-4" aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div aria-live="polite" className="space-y-2">
        {inCarico ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {T.carico(inCarico)}
          </p>
        ) : null}
        {errore ? (
          <p className="flex items-start gap-1.5 text-sm font-medium text-status-critical" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errore}
          </p>
        ) : null}
      </div>

      {pieno ? (
        <p className="text-sm text-muted-foreground">{T.pieno}</p>
      ) : (
        <>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            className="sr-only"
            tabIndex={-1}
            disabled={occupato}
            onChange={(e) => void scegli(e.target.files)}
            data-testid={`file-${allegato.campo}`}
          />
          <button
            type="button"
            onClick={() => {
              if (!occupato) input.current?.click()
            }}
            aria-disabled={occupato ? true : undefined}
            aria-describedby={`${id}-ammessi`}
            className={cn(
              'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-4 text-sm font-medium transition-colors sm:w-auto',
              'hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none',
              occupato && 'cursor-progress opacity-70',
            )}
          >
            <Paperclip className="size-4" aria-hidden="true" />
            {T.aggiungi}
          </button>
          <p id={`${id}-ammessi`} className="text-xs text-muted-foreground">
            {T.ammessi}
          </p>
        </>
      )}
    </div>
  )
}
