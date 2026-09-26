import { redirect } from 'next/navigation'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireProfilo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function PanoramicaPage() {
  const profilo = await requireProfilo()

  // Setter and closer have their own landing page.
  if (profilo.ruolo === 'setter') redirect('/today')
  if (profilo.ruolo === 'closer') redirect('/calls')

  return (
    <>
      <IntestazionePagina
        titolo="Panoramica"
        descrizione="Quanto hai incassato questo mese, da cosa, e quanto resta dopo provvigioni e costi."
      />
      <InArrivo fase={3} cosa="KPI del mese, grafico del cash, funnel, da incassare e clienti in scadenza." />
    </>
  )
}
