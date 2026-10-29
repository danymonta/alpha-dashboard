'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { autenticaRealtime, createClient } from '@/lib/supabase/client'

export type TimerAcceso = {
  id: string
  progetto_id: string
  progetto: string | null
  task_id: string | null
  task: string | null
  inizio: string
  nota: string | null
  /** When it was paused, null while it runs (1.66.0). */
  pausa_dal: string | null
  /** Seconds of the pauses already ended. */
  pausa_secondi: number
}

type StatoTimer = {
  stato: 'caricamento' | 'pronto' | 'errore'
  timer: TimerAcceso | null
  /** Reads the running timer again (after an action on this device). */
  ricarica: () => Promise<void>
  /** Grows at every change of the user's time arriving through Realtime. */
  versione: number
}

const Contesto = createContext<StatoTimer>({
  stato: 'caricamento',
  timer: null,
  ricarica: async () => {},
  versione: 0,
})

/** The user's running timer, the same everywhere in the shell. */
export function useTimer() {
  return useContext(Contesto)
}

/**
 * One source of truth for the running timer: the database. Read once through
 * pm_timer_attivo (the caller's own timer only), then kept in sync with
 * Supabase Realtime on pm_tempo, so a timer started on the phone shows up on
 * the computer. RLS applies to the events too.
 */
export function TimerProvider({ profiloId, children }: { profiloId: string; children: ReactNode }) {
  const [stato, setStato] = useState<StatoTimer['stato']>('caricamento')
  const [timer, setTimer] = useState<TimerAcceso | null>(null)
  const [versione, setVersione] = useState(0)
  const [collegato, setCollegato] = useState(false)

  const ricarica = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('pm_timer_attivo')
    if (error) {
      setStato('errore')
      return
    }
    const riga = data?.[0]
    setTimer(riga && riga.inizio ? { ...riga, inizio: riga.inizio, pausa_dal: riga.pausa_dal ?? null, pausa_secondi: riga.pausa_secondi ?? 0 } : null)
    setStato('pronto')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let attesa: ReturnType<typeof setTimeout> | null = null
    let attivo = true

    const primaLettura = setTimeout(() => void ricarica(), 0)

    const canale = supabase
      .channel(`pm-tempo-${Math.random().toString(36).slice(2)}`)
      // own rows only: RLS would let a manager's client receive other people's logged time
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_tempo', filter: `profile_id=eq.${profiloId}` }, () => {
        // a burst (stop + start) becomes one read
        if (attesa) clearTimeout(attesa)
        attesa = setTimeout(() => {
          if (!attivo) return
          void ricarica()
          setVersione((v) => v + 1)
        }, 300)
      })

    void autenticaRealtime(supabase).then(() => {
      if (!attivo) return
      canale.subscribe((status) => {
        if (attivo) setCollegato(status === 'SUBSCRIBED')
      })
    })

    return () => {
      attivo = false
      clearTimeout(primaLettura)
      if (attesa) clearTimeout(attesa)
      void supabase.removeChannel(canale)
    }
  }, [ricarica, profiloId])

  const valore = useMemo(() => ({ stato, timer, ricarica, versione }), [stato, timer, ricarica, versione])

  return (
    <Contesto.Provider value={valore}>
      {children}
      {/* whether live updates are on: read by the e2e tests, invisible to people */}
      <span hidden data-testid="timer-live" data-stato={collegato ? 'live' : 'offline'} />
    </Contesto.Provider>
  )
}
