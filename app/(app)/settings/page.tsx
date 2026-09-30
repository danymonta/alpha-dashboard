import { ChevronRight, Download, FolderKanban, History, Package, Percent, ScrollText, Users } from 'lucide-react'
import Link from 'next/link'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { VERSIONE_CORRENTE } from '@/lib/changelog/versioni'

export const dynamic = 'force-dynamic'

const SEZIONI = [
  { href: '/settings/team', titolo: 'Team', descrizione: 'Inviti, ruoli, attivazione degli account.', Icona: Users, pronta: true },
  { href: '/settings/products', titolo: 'Prodotti', descrizione: 'Percorsi in vendita, durata e prezzo di listino.', Icona: Package, pronta: true },
  { href: '/settings/commissions', titolo: 'Regole provvigioni', descrizione: 'Percentuale e tipi di vendita per collaboratore.', Icona: Percent, pronta: true },
  { href: '/settings/export', titolo: 'Esporta CSV', descrizione: 'Vendite, incassi e costi del mese per la commercialista.', Icona: Download, pronta: true },
  { href: '/settings/audit', titolo: 'Registro modifiche', descrizione: 'Chi ha cambiato un importo, un ruolo o una regola, e quando.', Icona: History, pronta: true },
  { href: '/settings/progetti', titolo: 'Progetti', descrizione: 'Reparti e modelli con cui nascono i progetti.', Icona: FolderKanban, pronta: true },
]

export default async function ImpostazioniPage() {
  await requireRuolo(['admin'])

  return (
    <div className="max-w-3xl space-y-6">
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

      {/* the app itself: which version is live and what changed (CLAUDE.md section 23) */}
      <Link
        href="/changelog"
        className="flex min-h-16 items-center gap-3 rounded-xl bg-card p-4 hover:bg-accent"
        data-testid="voce-changelog"
      >
        <ScrollText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Changelog</span>
          <span className="block text-sm text-muted-foreground">
            {VERSIONE_CORRENTE ? (
              <>
                <span className="num">Versione {VERSIONE_CORRENTE.versione}</span> · cosa è cambiato a ogni aggiornamento.
              </>
            ) : (
              'Cosa è cambiato a ogni aggiornamento.'
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  )
}
