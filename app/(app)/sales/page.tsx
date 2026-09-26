import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function VenditePage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Vendite"
        descrizione="Nuovi, rinnovi e upsell, con il piano rate di ogni vendita."
      />
      <InArrivo fase={2} cosa="Registrazione vendita, piano rate automatico e incassi." />
    </>
  )
}
