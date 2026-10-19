'use client'

import { eliminaNotifica } from '@/app/(app)/notifiche/actions'
import { Elimina } from '@/components/form/elimina'
import { ricontaNotifiche } from '@/components/shell/notifiche-provider'

/**
 * The one way to delete (components/form/elimina.tsx) for a notification: the
 * question says what goes (only this copy in the app; the email, if it was
 * sent, stays in the inbox) and, in the row, the 44 px trash icon.
 */
export function EliminaNotifica({
  id,
  titolo,
  variante,
  dopo,
}: {
  id: string
  titolo: string
  variante: 'foglio' | 'icona'
  /** The detail page is gone after deleting: back to the list. */
  dopo?: string
}) {
  return (
    <Elimina
      cosa={`la notifica «${titolo}»`}
      fatto="Notifica eliminata"
      variante={variante}
      dopo={dopo}
      conseguenze={['Si toglie solo da qui: l’email, se è partita, resta nella tua posta.']}
      azione={async () => {
        const esito = await eliminaNotifica(id)
        if (esito.ok) ricontaNotifiche()
        return esito
      }}
    />
  )
}
