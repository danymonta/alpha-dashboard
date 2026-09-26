import { CircleCheck, CircleMinus, Clock, Percent, type LucideIcon } from 'lucide-react'

import { ChiudiRegola, ModificaRegola, NuovaRegola } from '@/app/(app)/settings/commissions/regole-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData, formatPercentuale } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

export default async function RegoleProvvigioniPage() {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const supabase = await createClient()

  const [{ data: regole, error }, { data: persone, error: errorePersone }] = await Promise.all([
    supabase
      .from('commission_rules')
      .select('id, profile_id, percentuale, applica_a, valida_dal, valida_al, persona:profiles!commission_rules_profile_id_fkey(nome)')
      .order('valida_dal', { ascending: false }),
    supabase.from('profiles').select('id, nome').eq('attivo', true).in('ruolo', ['setter', 'closer']).order('nome'),
  ])
  if (error || errorePersone) throw new Error('Impossibile caricare le regole')

  // icon + words like every other status in the app; colour only reinforces
  const stato = (r: { valida_dal: string; valida_al: string | null }): { etichetta: string; Icona: LucideIcon; tono: string } =>
    r.valida_dal > oggi
      ? { etichetta: 'Futura', Icona: Clock, tono: 'text-muted-foreground' }
      : r.valida_al && r.valida_al < oggi
        ? { etichetta: 'Chiusa', Icona: CircleMinus, tono: 'text-muted-foreground' }
        : { etichetta: 'In vigore', Icona: CircleCheck, tono: 'text-status-ok' }

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Regole provvigioni"
        descrizione="La provvigione matura sull’incasso con la regola valida quel giorno. Una nuova regola non riscrive il passato."
        azione={<NuovaRegola persone={persone} dataPredefinita={aggiungiMesi(primoDelMeseISO(oggi), 1)} />}
      />

      {regole.length === 0 ? (
        <StatoVuoto
          Icona={Percent}
          titolo="Nessuna regola"
          descrizione="Senza una regola non matura nessuna provvigione. Crea quella del setter, ad esempio 5% sulle vendite nuove."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="regole">
          {regole.map((r) => {
            const { etichetta, Icona, tono } = stato(r)
            return (
              <li key={r.id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {r.persona?.nome} ·{' '}
                    <span className="num text-base font-semibold">{formatPercentuale(r.percentuale)}</span>
                  </p>
                  <span className={`inline-flex items-center gap-1.5 text-sm ${tono}`}>
                    <Icona className="size-4 shrink-0" aria-hidden="true" />
                    {etichetta}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Sull’incassato di: {r.applica_a.map((t) => ETICHETTA_TIPO_VENDITA[t].toLowerCase()).join(', ')} · dal{' '}
                  {formatData(r.valida_dal)}
                  {r.valida_al ? ` al ${formatData(r.valida_al)}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ModificaRegola
                    regola={{
                      id: r.id,
                      // fraction -> points for the form (0.05 -> 5)
                      percentuale: Math.round(r.percentuale * 10000) / 100,
                      applica_a: r.applica_a,
                      valida_dal: r.valida_dal,
                      valida_al: r.valida_al,
                    }}
                    etichetta={`${r.persona?.nome ?? 'Regola'} · ${formatPercentuale(r.percentuale)}`}
                  />
                  {!r.valida_al && r.valida_dal <= oggi ? (
                    <ChiudiRegola
                      ruleId={r.id}
                      oggi={oggi}
                      etichetta={`${r.persona?.nome ?? 'Regola'} · ${formatPercentuale(r.percentuale)}`}
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
