'use client'

import { Info } from 'lucide-react'
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { segnaFatto } from '@/app/(app)/insight/actions'
import { useAnnuncia } from '@/components/insight/annunci'
import type { Fonte } from '@/lib/insight/canale'
import { annuncioNonSalvato, FATTO } from '@/lib/insight/parole'
import { autenticaRealtime, createClient } from '@/lib/supabase/client'

type Contesto = {
  fatto: (chiave: string) => boolean
  segna: (chiave: string, on: boolean, chi: string) => void
  /** «Non salvato, riprova» under the switch, for 3 seconds */
  inErrore: (chiave: string) => boolean
  solaLettura: boolean
}

const ContestoFatti = createContext<Contesto>({
  fatto: () => false,
  segna: () => {},
  inErrore: () => false,
  solaLettura: true,
})

export function useFatti() {
  return useContext(ContestoFatti)
}

/** How long «Non salvato, riprova» stays, as the artifact. */
const ERRORE_MS = 3000

// One topic per mount: supabase-js hands back a channel with the same topic while
// the previous one is still leaving (as components/panoramica/aggiornamento-live.tsx).
let progressivo = 0

/**
 * The «Fatto» switches of one recap (fonte, giorno), shared by the admin and
 * the setters (1.35.0, D11, D12): a checklist, never who ticked or when.
 *
 * - What is on screen: the set read from the database, plus the taps in
 *   flight (useOptimistic, startTransition: the new value at once, the
 *   database's by itself if the write fails, with «Non salvato, riprova»).
 *   The server actions of a tab run one at a time, in order: the last tap
 *   wins, as in the artifact.
 * - The others' taps: Realtime on insight_fatto (RLS applies to its events).
 *   A DELETE carries only the uuid key (D12): the set is read again.
 * - The set is read again from the browser on mount and when the page comes
 *   back (visibilitychange): a page reopened from the browser's 30 s cache
 *   shows the ticks of now, not of then (N17). A read that started before one
 *   of our writes finished never undoes it.
 */
export function FattiProvider({
  fonte,
  giorno,
  iniziali,
  perRuolo = false,
  children,
}: {
  fonte: Fonte
  giorno: string
  iniziali: readonly string[]
  /** The business coach (22/10/2026): the ticks to read, every switch off; no banner, it is his role. */
  perRuolo?: boolean
  children: ReactNode
}) {
  const [server, setServer] = useState<Set<string>>(() => new Set(iniziali))
  const [errori, setErrori] = useState<Set<string>>(() => new Set())
  // a write the database refused as read only: the banner says so
  const [rifiutata, setSolaLettura] = useState(false)
  const solaLettura = perRuolo || rifiutata
  const [realtime, setRealtime] = useState<'connessione' | 'live' | 'offline'>('connessione')
  const annuncia = useAnnuncia()
  // our confirmed writes, with when they finished: a read started before must not undo them
  const scritte = useRef(new Map<string, { on: boolean; finita: number }>())
  const timerErrori = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const [visibili, applica] = useOptimistic(server, (stato: Set<string>, tocco: { chiave: string; on: boolean }) => {
    const nuovo = new Set(stato)
    if (tocco.on) nuovo.add(tocco.chiave)
    else nuovo.delete(tocco.chiave)
    return nuovo
  })

  const rileggi = useCallback(async () => {
    const iniziata = Date.now()
    const supabase = createClient()
    const { data, error } = await supabase
      .from('insight_fatto')
      .select('chiave')
      .eq('giorno', giorno)
      .eq('canale', fonte)
      .eq('fatto', true)
    if (error || !Array.isArray(data)) return
    const letti = new Set((data as { chiave: string }[]).map((r) => r.chiave))
    for (const [chiave, scritta] of scritte.current) {
      if (scritta.finita < iniziata) continue
      if (scritta.on) letti.add(chiave)
      else letti.delete(chiave)
    }
    setServer(letti)
  }, [fonte, giorno])

  // Realtime, and the reading of now on mount
  useEffect(() => {
    const supabase = createClient()
    progressivo += 1
    const canale = supabase.channel(`insight-fatti-${fonte}-${giorno}-${progressivo}`)
    let attivo = true

    canale.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'insight_fatto', filter: `giorno=eq.${giorno}` },
      (evento) => {
        if (!attivo) return
        if (evento.eventType === 'DELETE') {
          void rileggi()
          return
        }
        const riga = evento.new as { canale?: string; chiave?: string; fatto?: boolean }
        if (riga.canale !== fonte || !riga.chiave) return
        const chiave = riga.chiave
        setServer((prima) => {
          if (prima.has(chiave) === Boolean(riga.fatto)) return prima
          const nuovo = new Set(prima)
          if (riga.fatto) nuovo.add(chiave)
          else nuovo.delete(chiave)
          return nuovo
        })
      },
    )

    // the reading of now, right after mounting (a page reopened from the 30 s cache shows old ticks)
    queueMicrotask(() => void rileggi())
    void autenticaRealtime(supabase).then(() => {
      if (!attivo) return
      canale.subscribe((status) => {
        if (!attivo) return
        if (status === 'SUBSCRIBED') {
          setRealtime('live')
          // what changed between the first reading and the channel listening
          void rileggi()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtime('offline')
      })
    })

    function alRitorno() {
      if (document.visibilityState === 'visible') void rileggi()
    }
    document.addEventListener('visibilitychange', alRitorno)

    return () => {
      attivo = false
      document.removeEventListener('visibilitychange', alRitorno)
      void supabase.removeChannel(canale)
    }
  }, [fonte, giorno, rileggi])

  useEffect(() => {
    const timers = timerErrori.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [])

  const mostraErrore = useCallback(
    (chiave: string, chi: string) => {
      setErrori((prima) => new Set(prima).add(chiave))
      annuncia(annuncioNonSalvato(chi))
      const vecchio = timerErrori.current.get(chiave)
      if (vecchio) clearTimeout(vecchio)
      timerErrori.current.set(
        chiave,
        setTimeout(() => {
          timerErrori.current.delete(chiave)
          setErrori((prima) => {
            const nuovo = new Set(prima)
            nuovo.delete(chiave)
            return nuovo
          })
        }, ERRORE_MS),
      )
    },
    [annuncia],
  )

  const segna = useCallback(
    (chiave: string, on: boolean, chi: string) => {
      if (solaLettura) return
      startTransition(async () => {
        applica({ chiave, on })
        const input = { fonte, giorno, chiave, fatto: on }
        let esito: Awaited<ReturnType<typeof segnaFatto>> | null = null
        try {
          esito = await segnaFatto(input)
        } catch {
          // the network: one more try after a moment, as the artifact
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 600))
          try {
            esito = await segnaFatto(input)
          } catch {
            esito = null
          }
        }
        if (esito?.ok) {
          scritte.current.set(chiave, { on, finita: Date.now() })
          setServer((prima) => {
            if (prima.has(chiave) === on) return prima
            const nuovo = new Set(prima)
            if (on) nuovo.add(chiave)
            else nuovo.delete(chiave)
            return nuovo
          })
          return
        }
        if (esito && !esito.ok && esito.solaLettura) {
          setSolaLettura(true)
          return
        }
        mostraErrore(chiave, chi)
      })
    },
    [applica, fonte, giorno, mostraErrore, solaLettura],
  )

  const valore = useMemo<Contesto>(
    () => ({
      fatto: (chiave) => visibili.has(chiave),
      segna,
      inErrore: (chiave) => errori.has(chiave),
      solaLettura,
    }),
    [visibili, segna, errori, solaLettura],
  )

  return (
    <ContestoFatti.Provider value={valore}>
      {rifiutata && !perRuolo ? (
        <p
          role="status"
          className="sticky top-16 z-20 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-md md:top-4"
        >
          <strong>{FATTO.solaLetturaTitolo}</strong> {FATTO.solaLettura}
        </p>
      ) : null}
      {realtime === 'offline' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="fatti-offline">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          {FATTO.realtimeGiu}
        </p>
      ) : null}
      {children}
    </ContestoFatti.Provider>
  )
}
