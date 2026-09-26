import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function IncassiPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Incassi"
        descrizione="Tutte le rate: in ritardo, prossimi 30 giorni, oltre."
      />
      <InArrivo fase={2} cosa="Elenco rate con filtro per stato e mese e azione «Segna rata incassata»." />
    </>
  )
}
