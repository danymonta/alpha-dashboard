import { Plus, Receipt } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ElencoVendite } from '@/components/vendite/elenco-vendite'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { VENDITE } from '@/lib/i18n/testi/vendite'
import { leggiPeriodo } from '@/lib/periodo'
import { caricaVendite } from '@/lib/queries/vendite'
import { createClient } from '@/lib/supabase/server'
import { TIPI_VENDITA, type TipoVendita } from '@/lib/validation/vendita'

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
  const lingua = await getLingua()
  const t = VENDITE[lingua]
  const periodo = leggiPeriodo(parametri, oggi, lingua)
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

  // the admin can be the setter of his own sales
  const setters = (persone ?? []).filter((p) => p.ruolo === 'setter' || p.ruolo === 'admin')
  const closers = (persone ?? []).filter((p) => p.ruolo !== 'setter')
  const filtriAttivi = { tipo, setter, closer }

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={
          <>
            {t.descrizionePrima}{' '}
            <Link href="/payments" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              {t.incassi}
            </Link>
            .
          </>
        }
        azione={
          (
            <LinkBottone href="/sales/new" data-tour="nuova-vendita">
              <Plus className="size-4" aria-hidden="true" />
              {t.nuovaVendita}
            </LinkBottone>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/sales" parametri={filtriAttivi} />

        <form method="get" className="flex flex-wrap items-center gap-2" aria-label={t.filtri}>
          {/* the filters keep the period: ?mese= or ?da=&a= */}
          {Object.entries(periodo.parametri).map(([chiave, valore]) => (
            <input key={chiave} type="hidden" name={chiave} value={valore} />
          ))}
          <label className="sr-only" htmlFor="filtro-tipo">{t.tipo}</label>
          <select id="filtro-tipo" name="tipo" defaultValue={tipo ?? ''} className={selectClassi}>
            <option value="">{t.tuttiTipi}</option>
            {TIPI_VENDITA.map((v) => (
              <option key={v} value={v}>{ETICHETTE[lingua].tipoVendita[v]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-setter">{t.setter}</label>
          <select id="filtro-setter" name="setter" defaultValue={setter ?? ''} className={selectClassi}>
            <option value="">{t.tuttiSetter}</option>
            {setters.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-closer">{t.closer}</label>
          <select id="filtro-closer" name="closer" defaultValue={closer ?? ''} className={selectClassi}>
            <option value="">{t.tuttiCloser}</option>
            {closers.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-lg border border-input px-3 text-sm hover:bg-accent">
            {t.filtra}
          </button>
        </form>
      </div>

      {righe.length === 0 ? (
        <StatoVuoto
          Icona={Receipt}
          titolo={t.nessuna(periodo.frase)}
          descrizione={t.nessunaAdmin}
          azione={<LinkBottone href="/sales/new">{t.registra}</LinkBottone>}
        />
      ) : (
        <ElencoVendite righe={righe} mostraPersone />
      )}
    </div>
  )
}
