import {
  ChevronRight,
  Download,
  FolderKanban,
  History,
  KeyRound,
  MessagesSquare,
  Package,
  Percent,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { VoceNovita } from '@/components/changelog/voce-novita'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

type Sezione = { href: string; titolo: string; descrizione: string; Icona: LucideIcon }

/**
 * The settings by category (1.38.0, Dany 16/10/2026): who is in the team, what
 * is sold and paid, the keys of the outside services, the data out, the
 * projects. The addresses are the same as before.
 */
const GRUPPI: { titolo: string; sezioni: Sezione[] }[] = [
  {
    titolo: 'Team e accessi',
    sezioni: [{ href: '/settings/team', titolo: 'Team', descrizione: 'Inviti, ruoli, attivazione degli account.', Icona: Users }],
  },
  {
    titolo: 'Prodotti e provvigioni',
    sezioni: [
      { href: '/settings/products', titolo: 'Prodotti', descrizione: 'Percorsi in vendita, durata e prezzo di listino.', Icona: Package },
      { href: '/settings/commissions', titolo: 'Regole provvigioni', descrizione: 'Percentuale e tipi di vendita per collaboratore.', Icona: Percent },
    ],
  },
  {
    titolo: 'Chiavi e collegamenti',
    sezioni: [
      {
        href: '/settings/chiavi',
        titolo: 'Chiavi e guide',
        descrizione: 'Instagram, Messenger, Fathom, Claude e Groq: se funzionano, quando scadono, come rigenerarle.',
        Icona: KeyRound,
      },
      {
        href: '/settings/instagram',
        titolo: 'Instagram e Messenger',
        descrizione: 'I DM che precompilano il report del setter e preparano l’Insight: chi li lavora, chat escluse, analisi dei reel.',
        Icona: MessagesSquare,
      },
      {
        href: '/settings/fathom',
        titolo: 'Fathom',
        descrizione: 'Le registrazioni delle call e l’analisi di Claude: interruttori e limite di spesa.',
        Icona: Video,
      },
    ],
  },
  {
    titolo: 'Esporta e backup',
    sezioni: [
      { href: '/settings/export', titolo: 'Esporta CSV', descrizione: 'Vendite, incassi e costi del mese per la commercialista.', Icona: Download },
      { href: '/settings/audit', titolo: 'Registro modifiche', descrizione: 'Chi ha cambiato un importo, un ruolo o una regola, e quando.', Icona: History },
    ],
  },
  {
    titolo: 'Progetti',
    sezioni: [
      { href: '/settings/progetti', titolo: 'Progetti', descrizione: 'Reparti e modelli con cui nascono i progetti.', Icona: FolderKanban },
    ],
  },
]

export default async function ImpostazioniPage() {
  await requireRuolo(['admin'])

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina titolo="Impostazioni" />
      {GRUPPI.map(({ titolo, sezioni }) => {
        const id = `gruppo-${titolo.toLowerCase().replaceAll(' ', '-')}`
        return (
          <section key={titolo} aria-labelledby={id} className="space-y-2">
            <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {titolo}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sezioni.map(({ href, titolo: nome, descrizione, Icona }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-20 items-center gap-3 rounded-xl bg-card p-4 hover:bg-accent">
                    <Icona className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{nome}</span>
                      <span className="block text-sm text-muted-foreground">{descrizione}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/* the app itself: which version is live and what changed (CLAUDE.md section 23) */}
      <VoceNovita testId="voce-changelog" descrizione="il changelog: cosa cambia a ogni aggiornamento, per te e per il team." />
    </div>
  )
}
