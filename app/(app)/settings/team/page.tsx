import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Team"
        descrizione="Inviti, ruoli, attivazione. L’accesso all’app è solo su invito."
      />
      <InArrivo fase={4} cosa="Gestione utenti, inviti e ruoli, più prodotti, regole provvigioni ed export CSV." />
    </>
  )
}
