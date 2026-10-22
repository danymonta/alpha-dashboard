import { CirclePause, Search, Users } from 'lucide-react'

import { ElencoClienti } from '@/components/cliente/elenco-clienti'
import { ETICHETTA_STATO_CLIENTE, StatoClienteBadge, type StatoCliente } from '@/components/cliente/stato-cliente'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import {
  ETICHETTA_VISTA,
  STATI_VISTA,
  VISTE,
  ordinaElenco,
  vistaDa,
  type RigaElenco,
  type Vista,
} from '@/lib/clienti/elenco'
import { oggiRoma } from '@/lib/date'
import { formatData, formatEuro } from '@/lib/format'
import { configPickerRichiesta } from '@/lib/google/picker-server'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const STATI = Constants.public.Enums.client_status

type VistaTabella = Exclude<Vista, 'tutti'>

/** What each table card says when it has nothing to list. */
const VUOTO: Record<VistaTabella, { titolo: string; descrizione: string }> = {
  attivi: {
    titolo: 'Nessun cliente attivo',
    descrizione: 'Un cliente è attivo da quando registri la sua prima vendita, finché dura il percorso.',
  },
  sospesi: {
    titolo: 'Nessun cliente sospeso',
    descrizione: 'Con «Sospendi» nella scheda del cliente lo metti in pausa: lo trovi qui, con percorso e rate come prima.',
  },
  chiusi: {
    titolo: 'Nessun cliente chiuso',
    descrizione: 'Con «Non rinnova» nella scheda del cliente lo chiudi: lo trovi qui, e il suo valore nel tempo resta.',
  },
}

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; stato?: string; q?: string }>
}) {
  await requireRuolo(['admin'])
  const { vista: vistaRichiesta, stato, q } = await searchParams
  const vista = vistaDa(vistaRichiesta, stato, q)
  const filtro = vista === 'tutti' && STATI.includes(stato as StatoCliente) ? (stato as StatoCliente) : null
  const ricerca = vista === 'tutti' ? (q ?? '').trim().slice(0, 60) : ''
  const supabase = await createClient()
  const oggi = oggiRoma()

  // counts of the cards come from SQL, one head request each: the same function that lists them
  const conteggioVista = (v: VistaTabella) =>
    supabase.rpc('clienti_elenco', { p_stati: STATI_VISTA[v] }, { head: true, count: 'exact' })
  const [attivi, sospesi, chiusi, tutti] = await Promise.all([
    conteggioVista('attivi'),
    conteggioVista('sospesi'),
    conteggioVista('chiusi'),
    supabase.from('v_clienti').select('client_id', { count: 'exact', head: true }),
  ])
  if (attivi.error || sospesi.error || chiusi.error || tutti.error) throw new Error('Impossibile caricare i clienti')
  const conteggi: Record<Vista, number> = {
    attivi: attivi.count ?? 0,
    sospesi: sospesi.count ?? 0,
    chiusi: chiusi.count ?? 0,
    tutti: tutti.count ?? 0,
  }

  const schede = (
    <nav aria-label="Elenco dei clienti" className="flex flex-wrap gap-2">
      {VISTE.map((v) => {
        const attiva = v === vista
        return (
          <LinkRiga
            key={v}
            href={`/clients?vista=${v}`}
            aria-current={attiva ? 'page' : undefined}
            data-testid={`vista-${v}`}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm',
              attiva
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {ETICHETTA_VISTA[v]}
            <span className="num text-xs opacity-80">{conteggi[v]}</span>
          </LinkRiga>
        )
      })}
    </nav>
  )

  const intestazione = (
    <IntestazionePagina
      titolo="Clienti"
      descrizione="Attivi, sospesi e chiusi con il loro percorso, il contratto, quanto hanno pagato e le rate da saldare. Lo stato si calcola dalle vendite; Sospeso e Chiuso li decidi tu dalla scheda del cliente («Sospendi», «Non rinnova»)."
    />
  )

  if (vista !== 'tutti') {
    const { data, error } = await supabase.rpc('clienti_elenco', { p_stati: STATI_VISTA[vista] })
    if (error) throw new Error('Impossibile caricare i clienti')
    // the generated types make every column non-null: the nullable ones are typed by hand
    const righe = ordinaElenco(data as unknown as RigaElenco[], vista)

    // the Instagram handle is not in the list function: one more read, only for these clients
    const { data: anagrafiche, error: errAnagrafiche } = righe.length
      ? await supabase.from('clients').select('id, instagram_handle').in('id', righe.map((r) => r.client_id))
      : { data: [], error: null }
    if (errAnagrafiche) throw new Error('Impossibile caricare i clienti')
    const handle = Object.fromEntries((anagrafiche ?? []).map((c) => [c.id, c.instagram_handle]))
    const picker = righe.length ? await configPickerRichiesta() : null

    return (
      <div className="space-y-5">
        {intestazione}
        {schede}
        {righe.length === 0 ? (
          <StatoVuoto Icona={vista === 'sospesi' ? CirclePause : Users} titolo={VUOTO[vista].titolo} descrizione={VUOTO[vista].descrizione} />
        ) : (
          <ElencoClienti righe={righe} handle={handle} oggi={oggi} picker={picker} etichetta={`Clienti ${ETICHETTA_VISTA[vista].toLowerCase()}`} />
        )}
      </div>
    )
  }

  // "Tutti": the list of always, with the filter by state and the search
  let query = supabase
    .from('v_clienti')
    .select('client_id, nome, cognome, stato, instagram_handle, data_fine_ultima, incassato, da_incassare, in_ritardo, numero_vendite')
    .order('stato')
    .order('data_fine_ultima', { ascending: true, nullsFirst: false })
    .limit(300)
  if (filtro) query = query.eq('stato', filtro)
  if (ricerca) {
    const termine = ricerca.replace(/[%,()]/g, ' ')
    query = query.or(`nome.ilike.%${termine}%,cognome.ilike.%${termine}%,instagram_handle.ilike.%${termine}%`)
  }

  // counts per status come from SQL, one head request each
  const perStato = await Promise.all(
    STATI.map((s) => supabase.from('v_clienti').select('client_id', { count: 'exact', head: true }).eq('stato', s)),
  )
  const { data: clienti, error } = await query
  if (error || perStato.some((r) => r.error)) throw new Error('Impossibile caricare i clienti')

  const chip = (valore: StatoCliente | null, etichetta: string, n: number | null) => {
    const qs = new URLSearchParams({ vista: 'tutti' })
    if (valore) qs.set('stato', valore)
    if (ricerca) qs.set('q', ricerca)
    const attivo = valore === filtro
    // one per state: prefetched only on intent, like the rows
    return (
      <LinkRiga
        key={valore ?? 'tutti'}
        href={`/clients?${qs}`}
        aria-current={attivo ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-pillola border px-3 text-sm',
          attivo
            ? 'border-selezione bg-selezione text-selezione-foreground'
            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {etichetta}
        <span className="num text-xs opacity-80">{n ?? 0}</span>
      </LinkRiga>
    )
  }

  return (
    <div className="space-y-5">
      {intestazione}
      {schede}

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {chip(null, 'Tutti gli stati', conteggi.tutti)}
        {STATI.map((s, i) => chip(s, ETICHETTA_STATO_CLIENTE[s], perStato[i].count))}
      </nav>

      <form method="get" role="search" className="relative max-w-md">
        <input type="hidden" name="vista" value="tutti" />
        {filtro ? <input type="hidden" name="stato" value={filtro} /> : null}
        <label htmlFor="cerca-cliente" className="sr-only">Cerca un cliente</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="cerca-cliente"
          name="q"
          defaultValue={ricerca}
          placeholder="Cerca per nome, cognome o handle"
          autoComplete="off"
          className="h-11 w-full rounded-pillola border border-input bg-input/30 pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </form>

      {clienti.length === 0 ? (
        <StatoVuoto
          Icona={Users}
          titolo={ricerca ? `Nessun cliente per «${ricerca}»` : 'Nessun cliente in questo stato'}
          descrizione="Un cliente nasce quando registri la sua prima vendita."
        />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {clienti.map((c) => (
              <li key={c.client_id}>
                <LinkRiga href={`/clients/${c.client_id}`} className="block rounded-xl bg-card p-3 hover:bg-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{[c.nome, c.cognome].filter(Boolean).join(' ')}</span>
                        <IndicatoreLink />
                      </p>
                      <StatoClienteBadge stato={c.stato!} className="text-xs" />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-medium">{formatEuro(c.incassato)}</p>
                      <p className="text-xs text-muted-foreground">incassato</p>
                    </div>
                  </div>
                  {c.data_fine_ultima ? (
                    <p className="mt-2 text-xs text-muted-foreground">Percorso fino al {formatData(c.data_fine_ultima)}</p>
                  ) : null}
                </LinkRiga>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl bg-card md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Clienti</caption>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">Cliente</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">Stato</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">Fine percorso</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Vendite</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Incassato (LTV)</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Da incassare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clienti.map((c) => (
                  <tr key={c.client_id} className="hover:bg-accent/50">
                    <td className="px-3 py-2.5">
                      <LinkRiga href={`/clients/${c.client_id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                        {[c.nome, c.cognome].filter(Boolean).join(' ')}
                        <IndicatoreLink />
                      </LinkRiga>
                      {c.instagram_handle ? <p className="text-xs text-muted-foreground">{c.instagram_handle}</p> : null}
                    </td>
                    <td className="px-3 py-2.5"><StatoClienteBadge stato={c.stato!} /></td>
                    <td className="px-3 py-2.5">{formatData(c.data_fine_ultima)}</td>
                    <td className="px-3 py-2.5 text-right">{c.numero_vendite}</td>
                    <td className="px-3 py-2.5 text-right">{formatEuro(c.incassato)}</td>
                    <td className="px-3 py-2.5 text-right">{formatEuro(c.da_incassare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
