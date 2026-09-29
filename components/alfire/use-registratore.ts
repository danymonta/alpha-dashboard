'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  AUDIO_MINIMO_BYTE,
  BIT_AL_SECONDO,
  PEZZO_MS,
  dopoParziale,
  serveParziale,
  type StatoParziali,
} from '@/lib/alfire/dettatura'

/** Two minutes at most: the route refuses more, and a chat question is shorter. */
const DURATA_MAX_MS = 120_000

const nessunaSottoscrizione = () => () => {}

/** 'apre': the microphone is opening (the permission prompt, a slow phone). */
export type StatoRegistratore = 'fermo' | 'apre' | 'registra' | 'trascrive'

function formatoSupportato(): { mime: string; estensione: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  // Chrome and Firefox: webm/opus; Safari (iPhone too): mp4/aac
  for (const [mime, estensione] of [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'm4a'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, estensione }
  }
  return null
}

function nuovoRegistratore(flusso: MediaStream, mime: string): MediaRecorder {
  try {
    return new MediaRecorder(flusso, { mimeType: mime, audioBitsPerSecond: BIT_AL_SECONDO })
  } catch {
    // a browser that refuses the bitrate records at its own
    return new MediaRecorder(flusso, { mimeType: mime })
  }
}

function trascrivi(audio: Blob, nomeFile: string, parziale: boolean, signal?: AbortSignal): Promise<Response> {
  const corpo = new FormData()
  corpo.append('audio', audio, nomeFile)
  if (parziale) corpo.append('parziale', '1')
  return fetch('/api/alfire/voce', { method: 'POST', body: corpo, signal })
}

type Ascolto = {
  /** The text of the audio so far, while recording: shown, never the final word. */
  onParziale: (testo: string) => void
  /** The text of the whole recording, after the stop. */
  onTesto: (testo: string) => void
  onErrore: (messaggio: string) => void
}

/**
 * Press to talk, press again to stop: the audio goes to /api/alfire/voce and
 * comes back as text. While recording, the audio so far is transcribed about
 * every 2 seconds and shown live; at the stop one transcription of the whole
 * audio replaces it. Nothing is recorded before the tap, nothing is kept.
 * A browser that gives no audio before the stop simply shows no live text.
 */
export function useRegistratore({ onParziale, onTesto, onErrore }: Ascolto) {
  const [stato, setStato] = useState<StatoRegistratore>('fermo')
  // the live text stopped for this recording: the whole text comes at the stop
  const [inPausa, setInPausa] = useState(false)
  const registratore = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // one recorder at a time: a second tap while the microphone opens does nothing
  const avviando = useRef(false)
  // the panel closed while recording: no final transcription nobody would read
  const smontato = useRef(false)
  // false on the server, where MediaRecorder does not exist
  const supportato = useSyncExternalStore(
    nessunaSottoscrizione,
    () => Boolean(formatoSupportato() && navigator.mediaDevices?.getUserMedia),
    () => false,
  )

  // read afresh every time: the recorder can change while the microphone opens
  const staRegistrando = useCallback(() => registratore.current?.state === 'recording', [])

  const ferma = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (registratore.current?.state === 'recording') registratore.current.stop()
  }, [])

  const avvia = useCallback(async () => {
    if (avviando.current || staRegistrando()) return
    const formato = formatoSupportato()
    if (!formato) return onErrore('Questo browser non registra audio: scrivi il messaggio.')
    avviando.current = true
    setStato('apre')
    setInPausa(false)
    let flusso: MediaStream
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStato('fermo')
      return onErrore('Serve il permesso del microfono: abilitalo nelle impostazioni del browser.')
    } finally {
      avviando.current = false
    }
    // the panel closed while the microphone opened: nobody could stop it any more
    if (smontato.current || staRegistrando()) {
      flusso.getTracks().forEach((t) => t.stop())
      return
    }

    const tipo = formato.mime.split(';')[0]
    const nomeFile = `voce.${formato.estensione}`
    let pezzi: Blob[] = []
    const parziali: StatoParziali = {
      ultimoInvio: performance.now(),
      pezziInviati: 0,
      inVolo: false,
      sospesi: false,
      falliti: 0,
    }
    let parzialeInVolo: AbortController | null = null

    let r: MediaRecorder
    try {
      r = nuovoRegistratore(flusso, formato.mime)
    } catch {
      flusso.getTracks().forEach((t) => t.stop())
      setStato('fermo')
      return onErrore('Questo browser non registra audio: scrivi il messaggio.')
    }
    registratore.current = r

    const esitoParziale = (status: number | null) => {
      Object.assign(parziali, dopoParziale(parziali, status))
      if (parziali.sospesi && r.state === 'recording') setInPausa(true)
    }

    r.ondataavailable = (e) => {
      if (e.data.size > 0) pezzi.push(e.data)
      // the last piece comes with the stop: the final transcription takes it
      if (r.state !== 'recording') return
      const ora = performance.now()
      if (!serveParziale(parziali, ora, pezzi.length)) return
      // every piece from the start, same type: the first carries the header
      const audio = new Blob(pezzi, { type: tipo })
      if (audio.size < AUDIO_MINIMO_BYTE) return
      Object.assign(parziali, { inVolo: true, ultimoInvio: ora, pezziInviati: pezzi.length })
      const controllo = new AbortController()
      parzialeInVolo = controllo
      trascrivi(audio, nomeFile, true, controllo.signal)
        .then(async (risposta) => {
          if (!risposta.ok) return esitoParziale(risposta.status)
          const dati = (await risposta.json()) as { testo?: string }
          esitoParziale(risposta.status)
          // a partial that comes back after the stop is old news: the final decides
          if (!controllo.signal.aborted && r.state === 'recording' && dati.testo) onParziale(dati.testo)
        })
        // a partial that fails never stops the recording: only the final speaks
        .catch(() => {
          if (!controllo.signal.aborted) esitoParziale(null)
        })
        .finally(() => {
          parziali.inVolo = false
          if (parzialeInVolo === controllo) parzialeInVolo = null
        })
    }

    r.onstop = async () => {
      flusso.getTracks().forEach((t) => t.stop())
      parzialeInVolo?.abort()
      const audio = new Blob(pezzi, { type: tipo })
      pezzi = []
      if (smontato.current || audio.size < AUDIO_MINIMO_BYTE) {
        setStato('fermo')
        return
      }
      setStato('trascrive')
      try {
        const risposta = await trascrivi(audio, nomeFile, false)
        const dati = (await risposta.json()) as { testo?: string; errore?: string }
        if (!risposta.ok || !dati.testo) onErrore(dati.errore ?? 'Trascrizione non riuscita. Riprova.')
        else onTesto(dati.testo)
      } catch {
        onErrore('Connessione assente. Riprova.')
      } finally {
        setStato('fermo')
      }
    }

    try {
      // a piece every second, for the live text
      r.start(PEZZO_MS)
    } catch {
      r.start()
    }
    setStato('registra')
    timer.current = setTimeout(ferma, DURATA_MAX_MS)
  }, [ferma, onErrore, onParziale, onTesto, staRegistrando])

  useEffect(() => {
    smontato.current = false
    return () => {
      smontato.current = true
      ferma()
    }
  }, [ferma])

  return { stato, inPausa, supportato, avvia, ferma }
}
