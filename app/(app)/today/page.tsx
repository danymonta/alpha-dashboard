import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { formatData } from '@/lib/format'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function OggiPage() {
  await requireRuolo(['setter', 'admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Oggi"
        descrizione={`Report del ${formatData(new Date())}. Si compila in meno di 60 secondi.`}
      />
      <InArrivo fase={2} cosa="Stepper per ogni numero, salvataggio automatico e stato «Salvato alle …»." />
    </>
  )
}
