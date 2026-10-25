import { Receipt } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ElencoVendite } from '@/components/vendite/elenco-vendite'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { MIE_VENDITE } from '@/lib/i18n/testi/mie-vendite'
import { caricaVendite } from '@/lib/queries/vendite'

export const dynamic = 'force-dynamic'

export default async function LeMieVenditePage() {
  const profilo = await requireRuolo(['closer'])
  const righe = await caricaVendite({ closerId: profilo.id })
  const t = MIE_VENDITE[await getLingua()]

  // v_vendite already computed what is still due: here we only split the list
  const aperte = righe.filter((r) => Number(r.da_incassare ?? 0) > 0)
  const saldate = righe.filter((r) => Number(r.da_incassare ?? 0) === 0)

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      {righe.length === 0 ? (
        <StatoVuoto
          Icona={Receipt}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
          azione={<LinkBottone href="/calls" variant="outline">{t.vaiCall}</LinkBottone>}
        />
      ) : (
        <>
          {aperte.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.aperte(aperte.length)}
              </h2>
              <ElencoVendite righe={aperte} mostraPersone={false} />
            </section>
          ) : null}
          {saldate.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.saldate}
              </h2>
              <ElencoVendite righe={saldate} mostraPersone={false} />
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
