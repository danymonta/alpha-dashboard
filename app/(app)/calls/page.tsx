import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function LeMieCallPage() {
  const profilo = await requireRuolo(['setter', 'closer', 'admin'])

  return (
    <>
      <IntestazionePagina
        titolo="Le mie call"
        descrizione={
          profilo.ruolo === 'closer'
            ? 'Call di oggi e prossime. L’esito si aggiorna in massimo tre tap.'
            : 'Le call che hai fissato, con stato ed esito.'
        }
      />
      <InArrivo fase={2} cosa="Elenco call con aggiornamento esito e passaggio diretto a «Nuova vendita»." />
    </>
  )
}
