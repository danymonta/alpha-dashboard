import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function ClientiPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Clienti"
        descrizione="Stato derivato dalle vendite: attivo, in scadenza, scaduto, ex cliente."
      />
      <InArrivo fase={2} cosa="Anagrafica, scheda cliente, storico vendite e valore nel tempo." />
    </>
  )
}
