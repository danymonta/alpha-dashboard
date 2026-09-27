'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useTimer } from '@/components/pm/tempo/timer-provider'

/**
 * Re-renders the page on the server when time changes elsewhere (a timer
 * stopped on the phone, an entry added on another tab). The events come from
 * the shell's Realtime subscription, so the page opens no channel of its own.
 */
export function AggiornaConTempo() {
  const { versione } = useTimer()
  const router = useRouter()
  const vista = useRef(versione)

  useEffect(() => {
    if (versione === vista.current) return
    vista.current = versione
    router.refresh()
  }, [versione, router])

  return null
}
