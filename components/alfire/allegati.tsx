'use client'

import { FileImage, FileSpreadsheet, FileText, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ALLEGATI_MAX,
  DIMENSIONE_MAX,
  ERRORI_ALLEGATO,
  IMMAGINE_ORIGINALE_MAX,
  LATO_IMMAGINE_MAX,
  dimensioneLeggibile,
  nomePulito,
  schemaAllegato,
  tipoDichiarato,
  type Allegato,
  type TipoAllegato,
} from '@/lib/alfire/allegati'
import { cn } from '@/lib/utils'

/** A file on its way into the next message. */
export type InAttesa = {
  id: string
  nome: string
  dimensione: number
  tipo: TipoAllegato
  stato: 'legge' | 'pronto'
  allegato?: Allegato
}

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
 * A photo leaves the phone smaller: JPEG, longest side 2,000 px, which reads
 * a receipt just as well and stays under the vision model's limits. Drawing
 * it again also drops its metadata (the place where it was taken).
 */
async function riduciImmagine(file: File): Promise<Blob> {
  const sorgente = await decodifica(file)
  const larghezza = 'naturalWidth' in sorgente ? sorgente.naturalWidth : sorgente.width
  const altezza = 'naturalHeight' in sorgente ? sorgente.naturalHeight : sorgente.height
  if (!larghezza || !altezza) throw new Error('immagine vuota')
  const scala = Math.min(1, LATO_IMMAGINE_MAX / Math.max(larghezza, altezza))
  const tela = document.createElement('canvas')
  tela.width = Math.max(1, Math.round(larghezza * scala))
  tela.height = Math.max(1, Math.round(altezza * scala))
  const ctx = tela.getContext('2d')
  if (!ctx) throw new Error('canvas non disponibile')
  // pixel data, not UI: JPEG has no transparency, a transparent screenshot goes on a white page
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tela.width, tela.height)
  ctx.drawImage(sorgente, 0, 0, tela.width, tela.height)
  if ('close' in sorgente) sorgente.close()
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85))
  if (!blob) throw new Error('conversione non riuscita')
  return blob
}

class Rifiuto extends Error {}

/** The words of the route, or ours when the answer is not ours (a proxy's 413, the network). */
async function leggiSulServer(corpo: Blob, nome: string, signal: AbortSignal): Promise<Allegato> {
  const dati = new FormData()
  dati.append('file', corpo, nome)
  let risposta: Response
  try {
    risposta = await fetch('/api/alfire/allegato', { method: 'POST', body: dati, signal })
  } catch (e) {
    if (signal.aborted) throw e
    throw new Rifiuto(ERRORI_ALLEGATO.rete(nome))
  }
  const json = (await risposta.json().catch(() => null)) as { errore?: string } | null
  if (!risposta.ok) {
    if (json?.errore) throw new Rifiuto(json.errore)
    throw new Rifiuto(risposta.status === 413 ? ERRORI_ALLEGATO.troppoGrande(nome) : ERRORI_ALLEGATO.illeggibile(nome))
  }
  const letto = schemaAllegato.safeParse(json)
  if (!letto.success) throw new Rifiuto(ERRORI_ALLEGATO.illeggibile(nome))
  return letto.data
}

/**
 * The files of the next message: each one is read as soon as it is picked
 * (the chip says "Leggo…"), so the question goes as soon as it is written.
 * Removing a chip, or a new chat, stops its reading. Nothing is kept once
 * the message is sent: the text lives in the message, in the open chat.
 */
export function useAllegati({
  onErrore,
}: {
  /** `sostituisci`: a new pick clears the old warnings; a reading that fails later adds its own. */
  onErrore: (messaggi: string[], sostituisci: boolean) => void
}) {
  const [file, setFile] = useState<InAttesa[]>([])
  const letture = useRef(new Map<string, AbortController>())
  // how many chips there are, known at once: two quick picks never pass the limit
  const quanti = useRef(0)

  const aggiorna = useCallback((id: string, cambio: Partial<InAttesa> | null) => {
    setFile((attuali) =>
      cambio === null ? attuali.filter((f) => f.id !== id) : attuali.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
    )
  }, [])

  const leggi = useCallback(
    async (voce: InAttesa, originale: File, dichiarato: TipoAllegato | 'heic') => {
      const controllo = new AbortController()
      letture.current.set(voce.id, controllo)
      try {
        let corpo: Blob = originale
        if (dichiarato === 'immagine' || dichiarato === 'heic') {
          try {
            corpo = await riduciImmagine(originale)
          } catch {
            throw new Rifiuto(dichiarato === 'heic' ? ERRORI_ALLEGATO.heic(voce.nome) : ERRORI_ALLEGATO.fotoIllegibile(voce.nome))
          }
        }
        if (corpo.size > DIMENSIONE_MAX) throw new Rifiuto(ERRORI_ALLEGATO.troppoGrande(voce.nome))
        const allegato = await leggiSulServer(corpo, originale.name, controllo.signal)
        if (!controllo.signal.aborted) aggiorna(voce.id, { stato: 'pronto', allegato, tipo: allegato.tipo })
      } catch (e) {
        if (controllo.signal.aborted) return
        quanti.current -= 1
        aggiorna(voce.id, null)
        onErrore([e instanceof Rifiuto ? e.message : ERRORI_ALLEGATO.illeggibile(voce.nome)], false)
      } finally {
        letture.current.delete(voce.id)
      }
    },
    [aggiorna, onErrore],
  )

  const aggiungi = useCallback(
    (scelti: FileList | File[] | null) => {
      const lista = Array.from(scelti ?? [])
      if (lista.length === 0) return
      const errori: string[] = []
      const posti = ALLEGATI_MAX - quanti.current
      if (lista.length > posti) errori.push(ERRORI_ALLEGATO.troppi)
      const nuovi: { voce: InAttesa; originale: File; dichiarato: TipoAllegato | 'heic' }[] = []
      for (const originale of lista.slice(0, Math.max(0, posti))) {
        const nome = nomePulito(originale.name)
        const dichiarato = tipoDichiarato(originale.name, originale.type)
        if (dichiarato === null) {
          errori.push(ERRORI_ALLEGATO.nonSupportato(nome))
          continue
        }
        if (dichiarato === 'vecchio') {
          errori.push(ERRORI_ALLEGATO.vecchio(nome))
          continue
        }
        const foto = dichiarato === 'immagine' || dichiarato === 'heic'
        if (originale.size === 0) {
          errori.push(ERRORI_ALLEGATO.vuoto(nome))
          continue
        }
        if (foto ? originale.size > IMMAGINE_ORIGINALE_MAX : originale.size > DIMENSIONE_MAX) {
          errori.push(foto ? ERRORI_ALLEGATO.fotoTroppoGrande(nome) : ERRORI_ALLEGATO.troppoGrande(nome))
          continue
        }
        const voce: InAttesa = {
          id: crypto.randomUUID(),
          nome,
          dimensione: originale.size,
          tipo: foto ? 'immagine' : dichiarato,
          stato: 'legge',
        }
        nuovi.push({ voce, originale, dichiarato })
      }
      onErrore(errori, true)
      if (nuovi.length === 0) return
      quanti.current += nuovi.length
      setFile((attuali) => [...attuali, ...nuovi.map((n) => n.voce)])
      for (const n of nuovi) void leggi(n.voce, n.originale, n.dichiarato)
    },
    [leggi, onErrore],
  )

  const togli = useCallback(
    (id: string) => {
      letture.current.get(id)?.abort()
      quanti.current = Math.max(0, quanti.current - 1)
      aggiorna(id, null)
    },
    [aggiorna],
  )

  const svuota = useCallback(() => {
    letture.current.forEach((c) => c.abort())
    letture.current.clear()
    quanti.current = 0
    setFile([])
  }, [])

  // the panel goes away: no reading goes on behind it
  useEffect(() => {
    const correnti = letture.current
    return () => correnti.forEach((c) => c.abort())
  }, [])

  return {
    file,
    pronti: file.flatMap((f) => (f.stato === 'pronto' && f.allegato ? [f.allegato] : [])),
    inLettura: file.some((f) => f.stato === 'legge'),
    pieno: file.length >= ALLEGATI_MAX,
    aggiungi,
    togli,
    svuota,
  }
}

function IconaTipo({ tipo, className }: { tipo: TipoAllegato; className?: string }) {
  const Icona = tipo === 'immagine' ? FileImage : tipo === 'xlsx' || tipo === 'csv' ? FileSpreadsheet : FileText
  return <Icona className={className} aria-hidden="true" />
}

/**
 * One file as a chip: name, size (or "In lettura…"), and the X to take it off
 * before sending. In a sent message the same chip, without the X.
 */
export function ChipAllegato({
  nome,
  tipo,
  dettaglio,
  inLettura = false,
  togli,
  testId,
}: {
  nome: string
  tipo: TipoAllegato
  dettaglio: string
  inLettura?: boolean
  togli?: () => void
  testId?: string
}) {
  return (
    <div
      className={cn(
        'flex h-11 max-w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card pl-3 text-sm sm:max-w-64',
        !togli && 'pr-3',
      )}
      data-testid={testId}
      data-stato={inLettura ? 'legge' : 'pronto'}
    >
      {inLettura ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <IconaTipo tipo={tipo} className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-medium">{nome}</span>
        <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span>
      </span>
      {togli ? (
        <button
          type="button"
          onClick={togli}
          aria-label={`Togli ${nome}`}
          className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/** The chips above the box, while the files wait for the message. */
export function AllegatiInAttesa({ file, togli }: { file: InAttesa[]; togli: (id: string) => void }) {
  if (file.length === 0) return null
  const inLettura = file.filter((f) => f.stato === 'legge')
  return (
    <div className="mb-2 space-y-2">
      <ul className="flex flex-wrap gap-2" aria-label="File da mandare">
        {file.map((f) => (
          <li key={f.id} className="max-w-full min-w-0">
            <ChipAllegato
              nome={f.nome}
              tipo={f.tipo}
              // once read, the size of what travels (a photo shrunk by the browser), as in the sent message
              dettaglio={
                f.stato === 'legge'
                  ? 'In lettura…'
                  : `${f.allegato?.descrizione ?? ''} · ${dimensioneLeggibile(f.allegato?.dimensione ?? f.dimensione)}`
              }
              inLettura={f.stato === 'legge'}
              togli={() => togli(f.id)}
              testId="alfire-allegato"
            />
          </li>
        ))}
      </ul>
      {inLettura.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          <span className="min-w-0 truncate">
            Leggo {inLettura[0].nome}
            {inLettura.length > 1 ? ` e altri ${inLettura.length - 1}` : ''}…
          </span>
        </p>
      ) : null}
    </div>
  )
}

/** The files of a sent message, as chips: never their text. */
export function AllegatiInviati({ allegati }: { allegati: Allegato[] }) {
  if (allegati.length === 0) return null
  return (
    <ul className="flex max-w-[85%] flex-wrap justify-end gap-2" aria-label="File allegati">
      {allegati.map((a, i) => (
        <li key={`${a.nome}-${i}`} className="max-w-full min-w-0" data-testid="alfire-allegato-inviato">
          <ChipAllegato nome={a.nome} tipo={a.tipo} dettaglio={`${a.descrizione} · ${dimensioneLeggibile(a.dimensione)}`} />
        </li>
      ))}
    </ul>
  )
}
