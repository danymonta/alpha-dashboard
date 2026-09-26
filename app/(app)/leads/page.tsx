import { CalendarPlus, Search, SquareKanban } from 'lucide-react'
import Link from 'next/link'

import { StatoLeadArea, type Suggerimento } from '@/app/(app)/leads/stato-lead'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_FONTE, ETICHETTA_TIPO_CALL } from '@/lib/validation/call'
import { ETICHETTA_STATO_LEAD, STATI_LEAD, type StatoLead } from '@/lib/validation/lead'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Filtro = 'aperti' | StatoLead

const APERTI: StatoLead[] = ['call_fissata', 'follow_up']

const ETICHETTA_ESITO: Record<string, string> = {
  chiusa: 'chiusa',
  follow_up: 'follow-up',
  persa: 'persa',
}

type Ruolo = 'admin' | 'setter' | 'closer'

/**
 * The one action that resolves a mismatch between the last call and the lead
 * status. Nothing is changed automatically (manual pipeline, section 8).
 */
function suggerisci(
  stato: StatoLead,
  ultima: { id: string; stato: string; esito: string | null; programmata_il: string } | undefined,
  ruolo: Ruolo,
  adesso: number,
): Suggerimento | null {
  if (!ultima) return null
  const puoVendere = ruolo !== 'setter'

  if (ultima.esito === 'persa' && stato !== 'perso') {
    return { tipo: 'stato', testo: 'L’ultima call è andata persa.', stato: 'perso', etichetta: 'Segna perso' }
  }
  if (ultima.esito === 'follow_up' && stato !== 'follow_up' && stato !== 'cliente') {
    return { tipo: 'stato', testo: 'L’ultima call chiede un follow-up.', stato: 'follow_up', etichetta: 'Sposta in follow-up' }
  }
  if (ultima.esito === 'chiusa' && stato !== 'cliente') {
    return {
      tipo: 'stato',
      testo: 'Call chiusa.',
      stato: 'cliente',
      etichetta: 'Segna cliente',
      link: puoVendere ? { href: `/sales/new?call=${ultima.id}`, etichetta: 'Registra la vendita' } : undefined,
    }
  }
  if (ultima.stato === 'programmata' && new Date(ultima.programmata_il).getTime() < adesso) {
    return puoVendere
      ? { tipo: 'link', testo: 'Call passata senza esito.', href: '/calls', etichetta: 'Registra esito' }
      : { tipo: 'info', testo: 'Call passata: si aspetta l’esito del closer.' }
  }
  return null
}

/** Dynamic Server Component: rendered once per request, so reading the clock is stable. */
function adessoMs() {
  return Date.now()
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; q?: string }>
}) {
  const profilo = await requireRuolo(['admin', 'setter', 'closer'])
  const { stato, q } = await searchParams
  const filtro: Filtro = STATI_LEAD.includes(stato as StatoLead) ? (stato as StatoLead) : 'aperti'
  const ricerca = (q ?? '').trim().slice(0, 60)
  const supabase = await createClient()

  // RLS scopes the rows: own leads for the setter, the leads of his calls for
  // the closer, everything for the admin. The explicit filter keeps the setter
  // view "mine" even if policies change.
  const conta = (stati: StatoLead[]) => {
    let query = supabase.from('leads').select('id', { count: 'exact', head: true }).in('stato', stati)
    if (profilo.ruolo === 'setter') query = query.eq('setter_id', profilo.id)
    return query
  }

  const [aperti, ...perStato] = await Promise.all([
    conta(APERTI),
    ...STATI_LEAD.map((s) => conta([s])),
  ])
  const conteggi = Object.fromEntries(STATI_LEAD.map((s, i) => [s, perStato[i].count ?? 0]))

  let query = supabase
    .from('leads')
    .select(
      'id, nome, instagram_handle, fonte, stato, created_at, setter:profiles!leads_setter_id_fkey(nome), calls(id, tipo, programmata_il, stato, esito)',
    )
    .in('stato', filtro === 'aperti' ? APERTI : [filtro])
    .order('created_at', { ascending: false })
    .limit(100)
  if (profilo.ruolo === 'setter') query = query.eq('setter_id', profilo.id)
  if (ricerca) {
    const termine = ricerca.replace(/[%,()]/g, ' ')
    query = query.or(`nome.ilike.%${termine}%,instagram_handle.ilike.%${termine}%`)
  }

  const { data: leads, error } = await query
  if (error) throw new Error('Impossibile caricare la pipeline')
  const adesso = adessoMs()

  const filtri: { valore: Filtro; etichetta: string; n: number }[] = [
    { valore: 'aperti', etichetta: 'Aperti', n: aperti.count ?? 0 },
    ...STATI_LEAD.map((s) => ({ valore: s as Filtro, etichetta: ETICHETTA_STATO_LEAD[s], n: conteggi[s] })),
  ]

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Pipeline"
        descrizione="Ogni persona che hai caricato, con il suo stato. Si cambia con un tocco."
        azione={
          profilo.ruolo === 'setter' ? (
            <LinkBottone href="/calls/new">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Nuova call
            </LinkBottone>
          ) : undefined
        }
      />

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {filtri.map((f) => {
          const attivo = f.valore === filtro
          const qs = new URLSearchParams()
          if (f.valore !== 'aperti') qs.set('stato', f.valore)
          if (ricerca) qs.set('q', ricerca)
          return (
            <Link
              key={f.valore}
              href={`/leads${qs.size ? `?${qs}` : ''}`}
              aria-current={attivo ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm',
                attivo
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {f.etichetta}
              <span className="num text-xs opacity-80">{f.n}</span>
            </Link>
          )
        })}
      </nav>

      <form method="get" role="search" className="relative">
        {filtro !== 'aperti' ? <input type="hidden" name="stato" value={filtro} /> : null}
        <label htmlFor="cerca-lead" className="sr-only">Cerca per nome o handle</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="cerca-lead"
          name="q"
          defaultValue={ricerca}
          placeholder="Cerca per nome o handle"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-input bg-input/30 pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </form>

      {leads.length === 0 ? (
        <StatoVuoto
          Icona={SquareKanban}
          titolo={ricerca ? `Nessun lead per «${ricerca}»` : 'Nessun lead in questo stato'}
          descrizione={
            profilo.ruolo === 'setter'
              ? 'Un lead nasce quando fissi una call.'
              : 'I lead compaiono qui quando hanno una call assegnata a te.'
          }
          azione={
            profilo.ruolo === 'setter' ? <LinkBottone href="/calls/new">Fissa una call</LinkBottone> : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {leads.map((lead) => {
            const ultima = [...lead.calls].sort((a, b) => b.programmata_il.localeCompare(a.programmata_il))[0]
            const dettagli = [
              lead.instagram_handle,
              ETICHETTA_FONTE[lead.fonte],
              profilo.ruolo !== 'setter' && lead.setter ? `da ${lead.setter.nome.split(' ')[0]}` : null,
            ].filter(Boolean)
            const idTitolo = `lead-${lead.id}`

            return (
              <li key={lead.id}>
                <article aria-labelledby={idTitolo} className="space-y-3 rounded-xl bg-card p-3">
                  <div>
                    <h3 id={idTitolo} className="truncate text-sm font-medium">{lead.nome}</h3>
                    <p className="truncate text-sm text-muted-foreground">{dettagli.join(' · ')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ultima
                        ? `Ultima call: ${ETICHETTA_TIPO_CALL[ultima.tipo]} del ${formatData(oggiRoma(new Date(ultima.programmata_il)))}${
                            ultima.esito ? ` · ${ETICHETTA_ESITO[ultima.esito]}` : ultima.stato === 'programmata' ? ' · in programma' : ''
                          }`
                        : `Caricato il ${formatData(oggiRoma(new Date(lead.created_at)))}`}
                    </p>
                  </div>
                  <StatoLeadArea
                    leadId={lead.id}
                    nome={lead.nome}
                    stato={lead.stato}
                    suggerimento={suggerisci(lead.stato, ultima, profilo.ruolo as Ruolo, adesso)}
                  />
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
