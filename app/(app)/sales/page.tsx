import { Plus, Receipt } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ElencoVendite } from '@/components/vendite/elenco-vendite'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { leggiPeriodo } from '@/lib/periodo'
import { caricaVendite } from '@/lib/queries/vendite'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA, TIPI_VENDITA, type TipoVendita } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

const selectClassi =
  'h-11 min-w-0 rounded-lg border border-input bg-input/30 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default async function VenditePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const parametri = await searchParams
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(parametri, oggi)
  const filtro = (chiave: string) => {
    const v = parametri[chiave]
    return (Array.isArray(v) ? v[0] : v) || undefined
  }
  const tipoRichiesto = filtro('tipo')
  const tipo = TIPI_VENDITA.includes(tipoRichiesto as TipoVendita) ? (tipoRichiesto as TipoVendita) : undefined
  const setter = filtro('setter')
  const closer = filtro('closer')

  const supabase = await createClient()
  const [righe, { data: persone }] = await Promise.all([
    caricaVendite({ da: periodo.da, a: periodo.a, tipo, setterId: setter, closerId: closer }),
    supabase.from('profiles').select('id, nome, ruolo').in('ruolo', ['admin', 'setter', 'closer']).order('nome'),
  ])

  const setters = (persone ?? []).filter((p) => p.ruolo === 'setter')
  const closers = (persone ?? []).filter((p) => p.ruolo !== 'setter')
  const filtriAttivi = { tipo, setter, closer }

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo="Vendite"
        descrizione={
          <>
            I contratti firmati: chi ha comprato, cosa, per quanto e in quante rate. Le singole rate, pagate o da pagare,
            sono in{' '}
            <Link href="/payments" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Incassi
            </Link>
            .
          </>
        }
        azione={
          <LinkBottone href="/sales/new">
            <Plus className="size-4" aria-hidden="true" />
            Nuova vendita
          </LinkBottone>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/sales" parametri={filtriAttivi} />

        <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Filtri">
          {/* the filters keep the period: ?mese= or ?da=&a= */}
          {Object.entries(periodo.parametri).map(([chiave, valore]) => (
            <input key={chiave} type="hidden" name={chiave} value={valore} />
          ))}
          <label className="sr-only" htmlFor="filtro-tipo">Tipo</label>
          <select id="filtro-tipo" name="tipo" defaultValue={tipo ?? ''} className={selectClassi}>
            <option value="">Tutti i tipi</option>
            {TIPI_VENDITA.map((t) => (
              <option key={t} value={t}>{ETICHETTA_TIPO_VENDITA[t]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-setter">Setter</label>
          <select id="filtro-setter" name="setter" defaultValue={setter ?? ''} className={selectClassi}>
            <option value="">Tutti i setter</option>
            {setters.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-closer">Closer</label>
          <select id="filtro-closer" name="closer" defaultValue={closer ?? ''} className={selectClassi}>
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
          titolo={`Nessuna vendita ${periodo.frase}`}
          descrizione="Cambia periodo o filtri, oppure registra una vendita."
          azione={<LinkBottone href="/sales/new">Registra una vendita</LinkBottone>}
        />
      ) : (
        <ElencoVendite righe={righe} mostraPersone />
      )}
    </div>
  )
}
