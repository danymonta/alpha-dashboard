'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Two minutes at most: the route refuses more, and a chat question is shorter. */
const DURATA_MAX_MS = 120_000

const nessunaSottoscrizione = () => () => {}

export type StatoRegistratore = 'fermo' | 'registra' | 'trascrive'

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

/**
 * Press to talk, press again to send: the audio goes to /api/alfire/voce and
 * comes back as text. Nothing is recorded before the tap, nothing is kept.
 */
export function useRegistratore(onTesto: (testo: string) => void, onErrore: (messaggio: string) => void) {
  const [stato, setStato] = useState<StatoRegistratore>('fermo')
  const registratore = useRef<MediaRecorder | null>(null)
  const pezzi = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // false on the server, where MediaRecorder does not exist
  const supportato = useSyncExternalStore(
    nessunaSottoscrizione,
    () => Boolean(formatoSupportato() && navigator.mediaDevices?.getUserMedia),
    () => false,
  )

  const ferma = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (registratore.current?.state === 'recording') registratore.current.stop()
  }, [])

  const avvia = useCallback(async () => {
    const formato = formatoSupportato()
    if (!formato) return onErrore('Questo browser non registra audio: scrivi il messaggio.')
    let flusso: MediaStream
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return onErrore('Serve il permesso del microfono: abilitalo nelle impostazioni del browser.')
    }

    pezzi.current = []
    const r = new MediaRecorder(flusso, { mimeType: formato.mime })
    registratore.current = r
    r.ondataavailable = (e) => {
      if (e.data.size > 0) pezzi.current.push(e.data)
    }
    r.onstop = async () => {
      flusso.getTracks().forEach((t) => t.stop())
      const audio = new Blob(pezzi.current, { type: formato.mime.split(';')[0] })
      if (audio.size < 1000) {
        setStato('fermo')
        return
      }
      setStato('trascrive')
      try {
        const corpo = new FormData()
        corpo.append('audio', audio, `voce.${formato.estensione}`)
        const risposta = await fetch('/api/alfire/voce', { method: 'POST', body: corpo })
        const dati = (await risposta.json()) as { testo?: string; errore?: string }
        if (!risposta.ok || !dati.testo) onErrore(dati.errore ?? 'Trascrizione non riuscita. Riprova.')
        else onTesto(dati.testo)
      } catch {
        onErrore('Connessione assente. Riprova.')
      } finally {
        setStato('fermo')
      }
    }
    r.start()
    setStato('registra')
    timer.current = setTimeout(ferma, DURATA_MAX_MS)
  }, [ferma, onErrore, onTesto])

  useEffect(() => ferma, [ferma])

  return { stato, supportato, avvia, ferma }
}
