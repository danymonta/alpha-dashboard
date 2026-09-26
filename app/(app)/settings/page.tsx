import { ChevronRight, Download, Package, Percent, Users } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const SEZIONI = [
  { href: '/settings/products', titolo: 'Prodotti', descrizione: 'Percorsi in vendita, durata e prezzo di listino.', Icona: Package, pronta: true },
  { href: '/settings/team', titolo: 'Team', descrizione: 'Inviti, ruoli, attivazione degli account.', Icona: Users, pronta: false },
  { href: '/settings/team', titolo: 'Regole provvigioni', descrizione: 'Percentuale e tipi di vendita per collaboratore.', Icona: Percent, pronta: false },
  { href: '/settings/team', titolo: 'Esporta CSV', descrizione: 'Vendite, incassi e costi del mese per la commercialista.', Icona: Download, pronta: false },
]

export default async function ImpostazioniPage() {
  await requireRuolo(['admin'])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <IntestazionePagina titolo="Impostazioni" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {SEZIONI.map(({ href, titolo, descrizione, Icona, pronta }) => (
          <li key={titolo}>
            {pronta ? (
              <Link href={href} className="flex min-h-20 items-center gap-3 rounded-xl bg-card p-4 hover:bg-accent">
                <Icona className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{titolo}</span>
                  <span className="block text-sm text-muted-foreground">{descrizione}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ) : (
              <div className="flex min-h-20 items-center gap-3 rounded-xl border border-dashed border-border p-4" aria-disabled="true">
                <Icona className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-muted-foreground">{titolo}</span>
                  <span className="block text-sm text-muted-foreground">{descrizione}</span>
                </span>
                <span className="text-xs text-muted-foreground">Fase 4</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
