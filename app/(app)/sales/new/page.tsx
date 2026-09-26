import { SearchX } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { InArrivo } from '@/components/stati/in-arrivo'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { Button } from '@/components/ui/button'
import { requireRuolo } from '@/lib/auth/session'
import { formatData } from '@/lib/format'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Landing of "Chiusa": the sale is prefilled from the call (client from the
 * lead, setter, closer, call_id). The form with the instalment plan is the
 * next Phase 2 screen; this page already resolves and shows the prefill.
 */
export default async function NuovaVenditaPage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string }>
}) {
  const profilo = await requireRuolo(['closer', 'admin'])
  const { call: callId } = await searchParams

  const supabase = await createClient()
  const { data: call } = callId
    ? await supabase
        .from('calls')
        .select(
          'id, programmata_il, esito, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
        )
        .eq('id', callId)
        .maybeSingle()
    : { data: null }

  if (callId && !call) {
    return (
      <div className="mx-auto max-w-xl">
        <IntestazionePagina titolo="Nuova vendita" />
        <StatoVuoto
          Icona={SearchX}
          titolo="Call non trovata"
          descrizione="La call non esiste o non è assegnata a te."
          azione={
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/calls" />}>
              Torna alle mie call
            </Button>
          }
        />
      </div>
    )
  }

  const righe = call
    ? [
        ['Cliente', [call.lead?.nome, call.lead?.instagram_handle].filter(Boolean).join(' · ')],
        ['Setter', call.setter?.nome ?? '–'],
        ['Closer', call.closer?.nome ?? profilo.nome],
        ['Call del', formatData(oggiRoma(new Date(call.programmata_il)))],
      ]
    : []

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <IntestazionePagina
        titolo="Nuova vendita"
        descrizione={call ? 'Precompilata dalla call appena chiusa.' : undefined}
      />

      {call ? (
        <dl className="divide-y divide-border rounded-xl bg-card px-3" data-testid="precompilata">
          {righe.map(([etichetta, valore]) => (
            <div key={etichetta} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <dt className="text-sm text-muted-foreground">{etichetta}</dt>
              <dd className="text-right text-sm">{valore}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <InArrivo fase={2} cosa="Prodotto, valore, numero di rate e piano rate generato in automatico." />
    </div>
  )
}
