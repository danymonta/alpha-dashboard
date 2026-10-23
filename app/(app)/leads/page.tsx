import { CalendarPlus, Search, SquareKanban } from 'lucide-react'
import Link from 'next/link'

import { StatoLeadArea, type Suggerimento } from '@/app/(app)/leads/stato-lead'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { PIPELINE } from '@/lib/i18n/testi/pipeline'
import { createClient } from '@/lib/supabase/server'
import { STATI_LEAD, type StatoLead } from '@/lib/validation/lead'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Filtro = 'aperti' | StatoLead

const APERTI: StatoLead[] = ['call_fissata', 'follow_up']

/** Same reading as the suggestion below it: a past call without outcome is not "in programma". */
function statoUltimaCall(
  ultima: { stato: string; esito: string | null; programmata_il: string },
  adesso: number,
  lingua: Lingua,
) {
  const t = PIPELINE[lingua]
  if (ultima.esito) return (t.esito as Record<string, string>)[ultima.esito]
  if (ultima.stato === 'programmata') {
    return new Date(ultima.programmata_il).getTime() < adesso ? t.statoCall.daRegistrare : t.statoCall.inProgramma
  }
  return (t.statoCall as Record<string, string>)[ultima.stato] ?? null
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
  lingua: Lingua,
): Suggerimento | null {
  if (!ultima) return null
  const puoVendere = ruolo !== 'setter'
  const t = PIPELINE[lingua].suggerimenti

  if (ultima.esito === 'persa' && stato !== 'perso') {
    return { tipo: 'stato', testo: t.persa, stato: 'perso', etichetta: t.segnaPerso }
  }
  if (ultima.esito === 'follow_up' && stato !== 'follow_up' && stato !== 'cliente') {
    return { tipo: 'stato', testo: t.followUp, stato: 'follow_up', etichetta: t.spostaFollowUp }
  }
  if (ultima.esito === 'chiusa' && stato !== 'cliente') {
    return {
      tipo: 'stato',
      testo: t.chiusa,
      stato: 'cliente',
      etichetta: t.segnaCliente,
      link: puoVendere ? { href: `/sales/new?call=${ultima.id}`, etichetta: t.registraVendita } : undefined,
    }
  }
  if (ultima.stato === 'programmata' && new Date(ultima.programmata_il).getTime() < adesso) {
    return puoVendere
      ? { tipo: 'link', testo: t.senzaEsito, href: '/calls', etichetta: t.registraEsito }
      : { tipo: 'info', testo: t.attesaCloser }
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
  const lingua = await getLingua()
  const t = PIPELINE[lingua]
  const { formatData } = formato(lingua)
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
      'id, nome, instagram_handle, fonte, note, stato, created_at, setter_id, setter:profiles!leads_setter_id_fkey(nome), calls(id, tipo, programmata_il, stato, esito)',
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
  if (error) throw new Error(t.errore)
  const adesso = adessoMs()

  const filtri: { valore: Filtro; etichetta: string; n: number }[] = [
    { valore: 'aperti', etichetta: t.aperti, n: aperti.count ?? 0 },
    ...STATI_LEAD.map((s) => ({ valore: s as Filtro, etichetta: ETICHETTE[lingua].statoLead[s], n: conteggi[s] })),
  ]

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        azione={
          profilo.ruolo === 'setter' ? (
            <LinkBottone href="/calls/new">
              <CalendarPlus className="size-4" aria-hidden="true" />
              {t.nuova}
            </LinkBottone>
          ) : undefined
        }
      />

      <nav aria-label={t.filtra} className="flex flex-wrap gap-2">
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
                'inline-flex min-h-11 items-center gap-1.5 rounded-pillola border px-3 text-sm',
                attivo
                  ? 'border-selezione bg-selezione text-selezione-foreground'
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
        <label htmlFor="cerca-lead" className="sr-only">
          {t.cerca}
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="cerca-lead"
          name="q"
          defaultValue={ricerca}
          placeholder={t.cerca}
          autoComplete="off"
          className="h-11 w-full rounded-pillola border border-input bg-input/30 pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </form>

      {leads.length === 0 ? (
        <StatoVuoto
          Icona={SquareKanban}
          titolo={ricerca ? t.nessunoPer(ricerca) : t.nessuno}
          descrizione={profilo.ruolo === 'setter' ? t.vuotoSetter : t.vuotoAltri}
          azione={
            profilo.ruolo === 'setter' ? <LinkBottone href="/calls/new">{t.fissa}</LinkBottone> : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {leads.map((lead) => {
            const ultima = [...lead.calls].sort((a, b) => b.programmata_il.localeCompare(a.programmata_il))[0]
            const dettagli = [
              lead.instagram_handle,
              ETICHETTE[lingua].fonte[lead.fonte],
              profilo.ruolo !== 'setter' && lead.setter ? t.da(lead.setter.nome.split(' ')[0]) : null,
            ].filter(Boolean)
            const idTitolo = `lead-${lead.id}`

            return (
              <li key={lead.id}>
                <article aria-labelledby={idTitolo} className="space-y-2 rounded-xl bg-card p-3">
                  <StatoLeadArea
                    leadId={lead.id}
                    nome={lead.nome}
                    stato={lead.stato}
                    suggerimento={suggerisci(lead.stato, ultima, profilo.ruolo as Ruolo, adesso, lingua)}
                    // the closer moves the status but does not rewrite the lead
                    dati={
                      profilo.ruolo === 'admin' || lead.setter_id === profilo.id
                        ? { nome: lead.nome, instagram_handle: lead.instagram_handle, fonte: lead.fonte, note: lead.note }
                        : null
                    }
                    titolo={<h3 id={idTitolo} className="truncate text-sm font-medium">{lead.nome}</h3>}
                    eliminabile={profilo.ruolo === 'admin'}
                    lingua={lingua}
                  >
                    <p className="truncate text-sm text-muted-foreground">{dettagli.join(' · ')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ultima
                        ? [
                            t.ultimaCall(ETICHETTE[lingua].tipoCall[ultima.tipo], formatData(oggiRoma(new Date(ultima.programmata_il)))),
                            statoUltimaCall(ultima, adesso, lingua),
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : t.caricatoIl(formatData(oggiRoma(new Date(lead.created_at))))}
                    </p>
                  </StatoLeadArea>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
