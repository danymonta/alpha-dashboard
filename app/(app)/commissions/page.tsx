import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function ProvvigioniPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Provvigioni"
        descrizione="Maturato sull’incasso, pagato e saldo, per collaboratore e per mese."
      />
      <InArrivo fase={3} cosa="Calcolo del maturato sul cash e registrazione dei pagamenti." />
    </>
  )
}
