'use client'

import { eliminaNotifica } from '@/app/(app)/notifiche/actions'
import { Elimina } from '@/components/form/elimina'
import { useTesti } from '@/components/i18n/lingua-provider'
import { ricontaNotifiche } from '@/components/shell/notifiche-provider'
import { NOTIFICHE } from '@/lib/i18n/testi/notifiche'

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
  const t = useTesti(NOTIFICHE)
  return (
    <Elimina
      cosa={t.eliminaCosa(titolo)}
      fatto={t.eliminata}
      variante={variante}
      dopo={dopo}
      conseguenze={[t.eliminaConseguenza]}
      azione={async () => {
        const esito = await eliminaNotifica(id)
        if (esito.ok) ricontaNotifiche()
        return esito
      }}
    />
  )
}
