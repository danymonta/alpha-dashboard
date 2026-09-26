import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function LeMieVenditePage() {
  await requireRuolo(['closer', 'admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Le mie vendite"
        descrizione="Le vendite che hai chiuso, con la registrazione degli incassi."
      />
      <InArrivo fase={2} cosa="Elenco in sola lettura più «Segna rata incassata» sulle tue vendite." />
    </>
  )
}
