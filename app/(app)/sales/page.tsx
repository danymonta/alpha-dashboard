import { Plus, Receipt } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ElencoVendite } from '@/components/vendite/elenco-vendite'
import { requireRuolo } from '@/lib/auth/session'
import { fineMese, oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formatMese } from '@/lib/format'
import { caricaVendite } from '@/lib/queries/vendite'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA, TIPI_VENDITA, type TipoVendita } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

const selectClassi =
  'h-11 min-w-0 rounded-lg border border-input bg-input/30 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default async function VenditePage({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string; tipo?: string; setter?: string; closer?: string }>
}) {
  await requireRuolo(['admin'])
  const parametri = await searchParams
  const meseCorrente = primoDelMeseISO(oggiRoma())
  const mese = parseMese(parametri.mese) ?? meseCorrente
  const tipo = TIPI_VENDITA.includes(parametri.tipo as TipoVendita) ? (parametri.tipo as TipoVendita) : undefined

  const supabase = await createClient()
  const [righe, { data: persone }] = await Promise.all([
    caricaVendite({
      da: mese,
      a: fineMese(mese),
      tipo,
      setterId: parametri.setter || undefined,
      closerId: parametri.closer || undefined,
    }),
    supabase.from('profiles').select('id, nome, ruolo').in('ruolo', ['admin', 'setter', 'closer']).order('nome'),
  ])

  const setters = (persone ?? []).filter((p) => p.ruolo === 'setter')
  const closers = (persone ?? []).filter((p) => p.ruolo !== 'setter')
  const filtriAttivi = { tipo, setter: parametri.setter, closer: parametri.closer }

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo="Vendite"
        descrizione="Nuovi, rinnovi e upsell del mese, con quanto è già entrato."
        azione={
          <LinkBottone href="/sales/new">
            <Plus className="size-4" aria-hidden="true" />
            Nuova vendita
          </LinkBottone>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettoreMese mese={mese} meseCorrente={meseCorrente} percorso="/sales" parametri={filtriAttivi} />

        <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Filtri">
          <input type="hidden" name="mese" value={mese.slice(0, 7)} />
          <label className="sr-only" htmlFor="filtro-tipo">Tipo</label>
          <select id="filtro-tipo" name="tipo" defaultValue={tipo ?? ''} className={selectClassi}>
            <option value="">Tutti i tipi</option>
            {TIPI_VENDITA.map((t) => (
              <option key={t} value={t}>{ETICHETTA_TIPO_VENDITA[t]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-setter">Setter</label>
          <select id="filtro-setter" name="setter" defaultValue={parametri.setter ?? ''} className={selectClassi}>
            <option value="">Tutti i setter</option>
            {setters.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-closer">Closer</label>
          <select id="filtro-closer" name="closer" defaultValue={parametri.closer ?? ''} className={selectClassi}>
            <option value="">Tutti i closer</option>
            {closers.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-lg border border-input px-3 text-sm hover:bg-accent">
            Filtra
          </button>
        </form>
      </div>

      {righe.length === 0 ? (
        <StatoVuoto
          Icona={Receipt}
          titolo={`Nessuna vendita a ${formatMese(mese)}`}
          descrizione="Cambia mese o filtri, oppure registra una vendita."
          azione={<LinkBottone href="/sales/new">Registra una vendita</LinkBottone>}
        />
      ) : (
        <ElencoVendite righe={righe} mostraPersone />
      )}
    </div>
  )
}
