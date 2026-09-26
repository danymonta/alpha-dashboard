import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function IMieiNumeriPage() {
  await requireRuolo(['setter', 'admin'])

  return (
    <>
      <IntestazionePagina
        titolo="I miei numeri"
        descrizione="Le tue metriche del mese e le provvigioni maturate e pagate."
      />
      <InArrivo fase={3} cosa="Metriche personali del mese e totali di provvigione, senza dettaglio per cliente." />
    </>
  )
}
