'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { autenticaRealtime, createClient } from '@/lib/supabase/client'

/**
 * Supabase Realtime on the tasks and lists of one project: when someone in the
 * team closes or adds a task, the page re-renders on the server. RLS applies
 * to the events too. Deletes cannot be filtered by column (Realtime only has
 * the primary key of a deleted row), so any task deletion triggers a refresh.
 */
export function AggiornamentoTaskLive({ progettoId }: { progettoId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const aggiorna = () => {
      // a burst of changes (a template, a whole list) becomes one refresh
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 400)
    }
    const filter = `progetto_id=eq.${progettoId}`

    const canale = supabase
      .channel(`progetto-${progettoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pm_task', filter }, aggiorna)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pm_task', filter }, aggiorna)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pm_task' }, aggiorna)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pm_tasklist', filter }, aggiorna)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pm_tasklist', filter }, aggiorna)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pm_tasklist' }, aggiorna)
    let attivo = true
    void autenticaRealtime(supabase).then(() => {
      if (attivo) canale.subscribe()
    })

    return () => {
      attivo = false
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(canale)
    }
  }, [progettoId, router])

  return null
}
