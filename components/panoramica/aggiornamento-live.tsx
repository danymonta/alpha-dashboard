'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatOra } from '@/lib/date'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TABELLE = ['setter_daily_reports', 'calls', 'payments', 'sales', 'expenses'] as const

type Stato = 'connessione' | 'live' | 'offline'

/**
 * Supabase Realtime: when Loris saves a report, a call changes or cash comes
 * in, the overview re-renders on the server. RLS applies to the events too.
 */
export function AggiornamentoLive() {
  const router = useRouter()
  const [stato, setStato] = useState<Stato>('connessione')
  const [ultimo, setUltimo] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const canale = supabase.channel('panoramica-live')

    for (const table of TABELLE) {
      canale.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        // a burst of saves (autosave, a whole instalment plan) becomes one refresh
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          router.refresh()
          setUltimo(new Date().toISOString())
        }, 400)
      })
    }

    canale.subscribe((status) => {
      if (status === 'SUBSCRIBED') setStato('live')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setStato('offline')
    })

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(canale)
    }
  }, [router])

  return (
    <p
      aria-live="polite"
      data-testid="stato-live"
      data-stato={stato}
      className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="relative flex size-2.5" aria-hidden="true">
        {stato === 'live' ? (
          <span className="absolute inline-flex size-full rounded-full bg-status-ok opacity-60 motion-safe:animate-ping" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex size-2.5 rounded-full',
            stato === 'live' ? 'bg-status-ok' : stato === 'offline' ? 'bg-status-critical' : 'bg-muted-foreground',
          )}
        />
      </span>
      {stato === 'live'
        ? ultimo
          ? `In tempo reale · aggiornato alle ${formatOra(ultimo)}`
          : 'In tempo reale'
        : stato === 'offline'
          ? 'Aggiornamento automatico non disponibile: ricarica la pagina'
          : 'Collegamento…'}
    </p>
  )
}
