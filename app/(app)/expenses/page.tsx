import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function CostiPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Costi"
        descrizione="Team, software, ads, formazione: quello che sta sotto il margine operativo."
      />
      <InArrivo fase={2} cosa="Inserimento e lista dei costi, con ricorrenti." />
    </>
  )
}
