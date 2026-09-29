import { UserX } from 'lucide-react'

import { NuovaCallForm } from '@/app/(app)/calls/new/nuova-call-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoDiRitorno } from '@/lib/auth/origine'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { GIORNI_AVANTI_CALL, GIORNI_INDIETRO_CALL, GIORNI_INDIETRO_CALL_ADMIN } from '@/lib/validation/call'

export const dynamic = 'force-dynamic'

type Parametri = Record<string, string | string[] | undefined>

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

export default async function NuovaCallPage({ searchParams }: { searchParams: Promise<Parametri> }) {
  const profilo = await requireRuolo(['setter', 'admin'])
  const admin = profilo.ruolo === 'admin'
  const oggi = oggiRoma()
  const parametri = await searchParams

  // "?data=": the day to book on (from the closer's day); outside the window, today
  const richiesta = primo(parametri.data)
  const indietro = admin ? GIORNI_INDIETRO_CALL_ADMIN : GIORNI_INDIETRO_CALL
  const dataIniziale =
    isDataISO(richiesta) &&
    richiesta >= aggiungiGiorni(oggi, -indietro) &&
    richiesta <= aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)
      ? richiesta
      : oggi

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, ruolo')
    .eq('attivo', true)
    .in('ruolo', admin ? ['admin', 'closer', 'setter'] : ['admin', 'closer'])
    .order('created_at')

  if (error) throw new Error('Impossibile caricare il team')

  // Admins first (the first admin is Dany, the default closer), then closers
  const closers = [
    ...data.filter((p) => p.ruolo === 'admin'),
    ...data.filter((p) => p.ruolo === 'closer'),
  ].map(({ id, nome }) => ({ id, nome }))

  // "?closer=" (admin, from another closer's day) first; then the admin runs his
  // own calls; the setter's default is the first admin (Dany)
  const richiesto = primo(parametri.closer)
  const closerPredefinito =
    admin && closers.some((c) => c.id === richiesto)
      ? (richiesto as string)
      : admin && closers.some((c) => c.id === profilo.id)
        ? profilo.id
        : closers[0]?.id

  // The admin books for himself ("Io", the default) or for an active setter
  const setters = admin
    ? [
        { id: profilo.id, nome: 'Io' },
        ...data.filter((p) => p.ruolo === 'setter').map(({ id, nome }) => ({ id, nome })),
      ]
    : null

  // "?da=": back where the booking started (the closer's day), only a path of this app
  const tornaA = percorsoDiRitorno(primo(parametri.da))

  return (
    <div className="max-w-xl">
      <IntestazionePagina
        titolo="Nuova call"
        // opened from another page (the closer's day): the way back, where saving also lands
        indietro={tornaA ? { href: tornaA, etichetta: 'Indietro' } : undefined}
        descrizione={
          admin
            ? 'Fissa una discovery call, anche per un setter, o aggiungi una call già fatta: lead e call nascono insieme.'
            : 'Fissa una discovery call: lead e call nascono insieme.'
        }
      />

      {!closerPredefinito ? (
        <StatoVuoto
          Icona={UserX}
          titolo="Nessun closer disponibile"
          descrizione={
            admin
              ? 'Per fissare una call serve almeno un closer o un admin attivo. Sistemalo in Impostazioni › Team.'
              : 'Per fissare una call serve almeno un closer o un admin attivo. Chiedi a Dany di sistemare il team.'
          }
        />
      ) : (
        <NuovaCallForm
          oggi={oggi}
          dataIniziale={dataIniziale}
          closers={closers}
          closerPredefinito={closerPredefinito}
          setters={setters}
          tornaA={tornaA}
        />
      )}
    </div>
  )
}
