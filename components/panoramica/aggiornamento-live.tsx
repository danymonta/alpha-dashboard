'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { formatOra } from '@/lib/date'
import { PANORAMICA } from '@/lib/i18n/testi/panoramica'
import { autenticaRealtime, createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TABELLE = ['setter_daily_reports', 'calls', 'payments', 'sales', 'expenses'] as const

type Stato = 'connessione' | 'live' | 'offline'

/** Away from the page longer than this, it reads its numbers again on return. */
const ASSENZA_MINIMA_MS = 100

/** Without an answer from the channel by then, the old page reads its numbers anyway. */
const ATTESA_CANALE_MS = 1500

// Each render of the overview, by its `lettaIl`, and when it last left the screen.
// A mount of a render that has already left is the same page reopened from the
// browser cache (next.config.ts, staleTimes) or with Back: whatever happened while
// it was away (an instalment, Loris's report) reached no channel. Measured on this
// clock only (the server's and the phone's never meet). React's strict mode in dev
// remounts within the same moment: under 100 ms does not count.
const uscite = new Map<number, number>()
// Renders back on screen that still have to read their numbers. A set and not a
// local flag: strict mode mounts twice and the second mount must still read them.
const daRileggere = new Set<number>()

// One topic per mount: supabase-js hands back a channel with the same topic while
// the previous one is still leaving (RealtimeClient.channel), and a quick back and
// forth would never hear SUBSCRIBED again.
let progressivo = 0

/**
 * Supabase Realtime: when Loris saves a report, a call changes or cash comes
 * in, the overview re-renders on the server. RLS applies to the events too.
 * Events that arrived while Dany was on another page are lost: an overview
 * reopened from the browser cache refreshes once the channel is listening, so it
 * shows at once and a moment later has the true numbers (spec 1.33.0 A1b; the
 * time away counts, not the age of the page: an instalment that came in during a
 * second on Incassi was lost all the same). The channel lives as long as the
 * page: a refresh brings a new `lettaIl` without leaving it, so no event is lost
 * while it would subscribe again.
 */
export function AggiornamentoLive({ lettaIl }: { lettaIl: number }) {
  const router = useRouter()
  const t = PANORAMICA[useLingua()]
  const [stato, setStato] = useState<Stato>('connessione')
  const [ultimo, setUltimo] = useState<string | null>(null)
  // the render on screen now, and how to read its numbers again (set by the channel)
  const sulloSchermo = useRef(lettaIl)
  const rileggi = useRef<() => void>(() => {})

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    progressivo += 1
    const canale = supabase.channel(`panoramica-live-${progressivo}`)
    let attivo = true

    function aggiorna() {
      if (!attivo) return
      // a burst of saves (autosave, a whole instalment plan) becomes one refresh
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        router.refresh()
        setUltimo(new Date().toISOString())
      }, 400)
    }
    // an old page reads its numbers once: when the channel listens (no gap), or anyway
    rileggi.current = () => {
      if (daRileggere.delete(sulloSchermo.current)) aggiorna()
    }

    for (const table of TABELLE) {
      canale.on('postgres_changes', { event: '*', schema: 'public', table }, aggiorna)
    }

    void autenticaRealtime(supabase).then(() => {
      if (!attivo) return
      canale.subscribe((status) => {
        if (!attivo) return
        if (status === 'SUBSCRIBED') setStato('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setStato('offline')
        if (status !== 'CLOSED') rileggi.current()
      })
    })

    return () => {
      attivo = false
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(canale)
    }
  }, [router])

  useEffect(() => {
    sulloSchermo.current = lettaIl
    const uscita = uscite.get(lettaIl)
    uscite.delete(lettaIl)
    if (uscita !== undefined && performance.now() - uscita > ASSENZA_MINIMA_MS) daRileggere.add(lettaIl)
    const attesa = daRileggere.has(lettaIl) ? setTimeout(() => rileggi.current(), ATTESA_CANALE_MS) : null
    return () => {
      if (attesa) clearTimeout(attesa)
      uscite.set(lettaIl, performance.now())
      // the browser keeps only the last pages: so does this list
      if (uscite.size > 50) uscite.delete(uscite.keys().next().value!)
    }
  }, [lettaIl])

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
          ? t.liveAlle(formatOra(ultimo))
          : t.live
        : stato === 'offline'
          ? t.liveNo
          : t.collegamento}
    </p>
  )
}
