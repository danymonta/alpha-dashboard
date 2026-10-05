import { Search, Users } from 'lucide-react'
import Link from 'next/link'

import { ETICHETTA_STATO_CLIENTE, StatoClienteBadge, type StatoCliente } from '@/components/cliente/stato-cliente'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { formatData, formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Constants } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'

const STATI = Constants.public.Enums.client_status

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; q?: string }>
}) {
  await requireRuolo(['admin'])
  const { stato, q } = await searchParams
  const filtro = STATI.includes(stato as StatoCliente) ? (stato as StatoCliente) : null
  const ricerca = (q ?? '').trim().slice(0, 60)
  const supabase = await createClient()

  // counts per status come from SQL, one head request each
  const conteggi = await Promise.all(
    [null, ...STATI].map((s) => {
      const query = supabase.from('v_clienti').select('client_id', { count: 'exact', head: true })
      return s ? query.eq('stato', s) : query
    }),
  )

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

  const { data: clienti, error } = await query
  if (error) throw new Error('Impossibile caricare i clienti')

  const chip = (valore: StatoCliente | null, etichetta: string, n: number | null) => {
    const qs = new URLSearchParams()
    if (valore) qs.set('stato', valore)
    if (ricerca) qs.set('q', ricerca)
    const attivo = valore === filtro
    return (
      <Link
        key={valore ?? 'tutti'}
        href={`/clients${qs.size ? `?${qs}` : ''}`}
        aria-current={attivo ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm',
          attivo
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {etichetta}
        <span className="num text-xs opacity-80">{n ?? 0}</span>
      </Link>
    )
  }

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo="Clienti"
        descrizione="Lo stato si calcola dalle vendite: attivo, in scadenza, da iniziare, scaduto, ex cliente. Chiuso lo decidi tu, con «Non rinnova» nella scheda del cliente; se poi non ricompra, «Archivia come ex cliente» lo mette tra gli ex clienti."
      />

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {chip(null, 'Tutti', conteggi[0].count)}
        {STATI.map((s, i) => chip(s, ETICHETTA_STATO_CLIENTE[s], conteggi[i + 1].count))}
      </nav>

      <form method="get" role="search" className="relative max-w-md">
        {filtro ? <input type="hidden" name="stato" value={filtro} /> : null}
        <label htmlFor="cerca-cliente" className="sr-only">Cerca un cliente</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="cerca-cliente"
          name="q"
          defaultValue={ricerca}
          placeholder="Cerca per nome, cognome o handle"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-input bg-input/30 pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
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
                <Link href={`/clients/${c.client_id}`} className="block rounded-xl bg-card p-3 hover:bg-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{[c.nome, c.cognome].filter(Boolean).join(' ')}</p>
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
                </Link>
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
                      <Link href={`/clients/${c.client_id}`} className="font-medium hover:underline">
                        {[c.nome, c.cognome].filter(Boolean).join(' ')}
                      </Link>
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
