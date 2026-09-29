import { UserX } from 'lucide-react'

import { NuovaCallForm } from '@/app/(app)/calls/new/nuova-call-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function NuovaCallPage() {
  await requireRuolo(['setter'])

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, ruolo')
    .eq('attivo', true)
    .in('ruolo', ['admin', 'closer'])
    .order('created_at')

  if (error) throw new Error('Impossibile caricare i closer')

  // Admins first (the first admin is Dany, the default closer), then closers
  const closers = [
    ...data.filter((p) => p.ruolo === 'admin'),
    ...data.filter((p) => p.ruolo === 'closer'),
  ].map(({ id, nome }) => ({ id, nome }))

  return (
    <div className="max-w-xl">
      <IntestazionePagina
        titolo="Nuova call"
        descrizione="Fissa una discovery call: lead e call nascono insieme."
      />

      {closers.length === 0 ? (
        <StatoVuoto
          Icona={UserX}
          titolo="Nessun closer disponibile"
          descrizione="Per fissare una call serve almeno un closer o un admin attivo. Chiedi a Dany di sistemare il team."
        />
      ) : (
        <NuovaCallForm
          oggi={oggiRoma()}
          closers={closers}
          closerPredefinito={closers[0].id}
        />
      )}
    </div>
  )
}
