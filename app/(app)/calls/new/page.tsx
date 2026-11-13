import { UserX } from 'lucide-react'

import { NuovaCallForm } from '@/app/(app)/calls/new/nuova-call-form'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoDiRitorno } from '@/lib/auth/origine'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { NUOVA_CALL } from '@/lib/i18n/testi/esito'
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
  const t = NUOVA_CALL[await getLingua()]
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

  // "?ora=", "?nome=", "?handle=": a booking of the calendar «Dany Discovery Call» to add
  // («Aggiungi alla pipeline», 13/11/2026). Only starting values: a wrong one is dropped, the
  // form checks everything again, and the source is never filled in (Dany picks it every time).
  const oraRichiesta = primo(parametri.ora)
  const oraIniziale = oraRichiesta && /^([01]\d|2[0-3]):[0-5]\d$/.test(oraRichiesta) ? oraRichiesta : ''
  const nomeRichiesto = primo(parametri.nome)?.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() ?? ''
  const nomeIniziale = nomeRichiesto.length >= 2 && nomeRichiesto.length <= 120 ? nomeRichiesto : ''
  const handleRichiesto = primo(parametri.handle)?.trim().replace(/^@+/, '').toLowerCase() ?? ''
  const handleIniziale = /^[a-z0-9._]{1,30}$/.test(handleRichiesto) ? handleRichiesto : ''

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, ruolo')
    .eq('attivo', true)
    .in('ruolo', admin ? ['admin', 'closer', 'setter'] : ['admin', 'closer'])
    .order('created_at')

  if (error) throw new Error(t.errore)

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
        { id: profilo.id, nome: t.io },
        ...data.filter((p) => p.ruolo === 'setter').map(({ id, nome }) => ({ id, nome })),
      ]
    : null

  // "?da=": back where the booking started (the closer's day), only a path of this app
  const tornaA = percorsoDiRitorno(primo(parametri.da))

  return (
    <div className="max-w-xl">
      <IntestazionePagina
        titolo={t.titolo}
        // opened from another page (the closer's day): the way back, where saving also lands
        indietro={tornaA ? { href: tornaA, etichetta: t.indietro } : undefined}
        descrizione={admin ? t.descrizioneAdmin : t.descrizione}
      />

      {!closerPredefinito ? (
        <StatoVuoto
          Icona={UserX}
          titolo={t.nessunCloser}
          descrizione={admin ? t.nessunCloserAdmin : t.nessunCloserSetter}
        />
      ) : (
        <NuovaCallForm
          oggi={oggi}
          dataIniziale={dataIniziale}
          oraIniziale={oraIniziale}
          nomeIniziale={nomeIniziale}
          handleIniziale={handleIniziale}
          closers={closers}
          closerPredefinito={closerPredefinito}
          setters={setters}
          tornaA={tornaA}
        />
      )}
    </div>
  )
}
