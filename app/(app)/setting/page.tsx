import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function SettingPage() {
  await requireRuolo(['admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Setting"
        descrizione="Volumi DM, call prenotate e svolte, show rate e close rate per periodo e per setter."
      />
      <InArrivo fase={3} cosa="Metriche di setting e call, più la tabella dei report giornalieri." />
    </>
  )
}
