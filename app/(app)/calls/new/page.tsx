import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function NuovaCallPage() {
  await requireRuolo(['setter', 'admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Nuova call"
        descrizione="Un lead nasce qui, nel momento in cui fissi la call."
      />
      <InArrivo fase={2} cosa="Form corto che crea lead e call insieme, con closer predefinito." />
    </>
  )
}
