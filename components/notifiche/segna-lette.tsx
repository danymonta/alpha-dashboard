'use client'

import { CheckCheck, LoaderCircle } from 'lucide-react'
import { useEffect, useTransition } from 'react'
import { toast } from 'sonner'

import { segnaLetta, segnaTutteLette } from '@/app/(app)/notifiche/actions'
import { ricontaNotifiche } from '@/components/shell/notifiche-provider'
import { Button } from '@/components/ui/button'

/** "Segna tutte come lette": a 44 px button; off when there is nothing to read. */
export function SegnaTutteLette({ daLeggere }: { daLeggere: number }) {
  const [inCorso, avvia] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={daLeggere === 0 || inCorso}
      data-testid="segna-tutte-lette"
      onClick={() =>
        avvia(async () => {
          let esito: Awaited<ReturnType<typeof segnaTutteLette>>
          try {
            esito = await segnaTutteLette()
          } catch {
            toast.error('Connessione assente. Riprova.')
            return
          }
          if (!esito.ok) {
            toast.error(esito.errore)
            return
          }
          ricontaNotifiche()
          toast.success('Tutte le notifiche sono segnate come lette')
        })
      }
    >
      {inCorso ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCheck className="size-4" aria-hidden="true" />
      )}
      Segna tutte come lette
    </Button>
  )
}

/**
 * Opening a notification marks it read: once, when the page shows it unread.
 * Nothing on the screen: the bell's count goes down on its own. A failure is
 * silent (the notification simply stays unread); it never breaks reading it.
 */
export function SegnaLettaAllApertura({ id, giaLetta }: { id: string; giaLetta: boolean }) {
  useEffect(() => {
    if (giaLetta) return
    let attivo = true
    void segnaLetta(id)
      .then((esito) => {
        if (attivo && esito.ok) ricontaNotifiche()
      })
      .catch(() => {})
    return () => {
      attivo = false
    }
  }, [id, giaLetta])
  return null
}
