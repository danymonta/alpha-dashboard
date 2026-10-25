import { DatabaseBackup, Download } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { buttonVariants } from '@/components/ui/button'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { leggiPeriodo } from '@/lib/periodo'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const EXPORT = ['vendite', 'incassi', 'costi'] as const

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const T = IMPOSTAZIONI[lingua]
  const t = T.esporta
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi, lingua)
  // same period params as the page: ?mese= or ?da=&a=
  const query = new URLSearchParams(periodo.parametri).toString()
  const quando = periodo.mese ? t.delMese(periodo.etichetta) : periodo.frase

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: T.titolo }}
        titolo={T.sezioni.export[0]}
        descrizione={t.descrizione}
      />
      <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/settings/export" />

      <ul className="grid gap-2 sm:grid-cols-3">
        {EXPORT.map((tipo) => {
          const [titolo, descrizione] = t.voci[tipo]
          return (
            <li key={tipo} className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4">
              <div>
                <p className="text-sm font-medium">{titolo}</p>
                <p className="text-sm text-muted-foreground">{descrizione}</p>
              </div>
              <a
                href={`/api/export/${tipo}?${query}`}
                download
                // a long range wraps instead of overflowing the card
                className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-11 py-2 text-center whitespace-normal')}
              >
                <Download className="size-4" aria-hidden="true" />
                {titolo} {quando}
              </a>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">{t.formato}</p>

      <section
        aria-labelledby="titolo-backup"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4"
      >
        <div className="min-w-0 space-y-1">
          <h2 id="titolo-backup" className="text-sm font-medium">
            {t.backup}
          </h2>
          <p className="text-sm text-muted-foreground">{t.backupDescrizione}</p>
        </div>
        <a href="/api/backup" download className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
          <DatabaseBackup className="size-4" aria-hidden="true" />
          {t.scaricaBackup}
        </a>
      </section>
    </div>
  )
}
