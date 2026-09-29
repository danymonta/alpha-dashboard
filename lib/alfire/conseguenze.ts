import { formatEuro, formatMese } from '@/lib/format'

/**
 * What a deletion (or a removal) takes with it when there is nothing to count
 * in SQL: the very words the app shows in its own confirmation, so the chat
 * and the page say the same thing. tests/alfire-scritture.test.ts checks them
 * against the components. Counted consequences come from
 * public.anteprima_eliminazione through lib/eliminazione.ts.
 */
export const CONSEGUENZE = {
  // app/(app)/calls/modifica-call.tsx
  call: ['Il lead resta nella pipeline.', 'Se da questa call è nata una vendita, la vendita resta, senza la call collegata.'],
  // app/(app)/settings/products/prodotto-form.tsx
  prodotto: ['Se vuoi solo non offrirlo più, mettilo fuori vendita: resta nello storico.'],
  // app/(app)/settings/commissions/regole-client.tsx
  regola: [
    'Le provvigioni maturate con questa regola spariscono da tutti i mesi, anche passati.',
    'Per smettere da una data in poi, usa “Chiudi” invece di eliminare.',
  ],
  // app/(app)/setting/modifica-report.tsx
  report: ['Le metriche di setting del periodo si ricalcolano senza questo giorno.'],
  // components/pm/membri/membri-client.tsx
  membro: [
    'Non vedrà più il progetto ed esce dai task a cui è assegnato: chi li condivide li tiene. Se ne era responsabile, il progetto resta senza responsabile.',
  ],
  // components/pm/progetto/modifica-progetto.tsx
  progetto: ['Se ne vanno liste, task, tempo registrato e note del progetto. Non si può annullare.'],
  // app/(app)/clients/[id]/interrompi-percorso.tsx
  interruzione: ['Gli incassi già fatti non cambiano.'],
} as const

/** app/(app)/sales/[id]/rata-azioni.tsx: an instalment deleted. */
export function conseguenzeRata(stato: string, importoIncassato: number | null): string[] {
  return stato === 'incassata'
    ? [`Il suo incasso (${formatEuro(importoIncassato)}) esce dal cash e dalle provvigioni del mese.`]
    : ['Le altre rate si rinumerano in ordine di scadenza.']
}

/** A cost deleted: the operating margin of its month moves (not said in the app, which asks nothing). */
export function conseguenzeCosto(data: string): string[] {
  return [`Il margine operativo di ${formatMese(data)} cambia di conseguenza.`]
}

/** components/pm/attivita/dettaglio-task.tsx: a task with its sub-tasks. */
export function conseguenzeTask(sottoTask: number): string[] {
  return [
    sottoTask > 0
      ? `Se ne vanno anche i suoi ${sottoTask === 1 ? 'sotto-task' : `${sottoTask} sotto-task`}. Non si può annullare.`
      : 'Non si può annullare.',
  ]
}

/** A list with its tasks (on delete cascade). */
export function conseguenzeLista(task: number): string[] {
  return [
    task > 0
      ? `Se ne vanno anche ${task === 1 ? 'il suo task' : `i suoi ${task} task`}, sotto-task compresi. Non si può annullare.`
      : 'Non si può annullare.',
  ]
}
