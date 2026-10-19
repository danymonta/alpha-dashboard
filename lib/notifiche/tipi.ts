/**
 * The notification center (1.41.0, CLAUDE.md sections 8 and 10): every email the
 * app sends to a profile of the app is also saved in public.notifiche, for the
 * person it was sent to. Client-safe constants and the one pure check of the
 * link; the writer is lib/notifiche/registra.ts (server only).
 */
export const TIPI_NOTIFICA = ['riepilogo_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo'] as const
export type TipoNotifica = (typeof TIPI_NOTIFICA)[number]

/** The name of the kind, as the list shows it. */
export const ETICHETTA_TIPO: Record<TipoNotifica, string> = {
  riepilogo_settimana: 'Riepilogo della settimana',
  backup: 'Backup',
  promemoria_feedback: 'Call dei 3 mesi',
  promemoria_rinnovo: 'Call di rinnovo',
}

/** Same bounds as the checks of the table (20261021090000_notifiche.sql). */
export const LIMITI_NOTIFICA = { titolo: 300, anteprima: 300, corpoHtml: 200_000, link: 500, chiave: 200 } as const

export function eTipoNotifica(valore: unknown): valore is TipoNotifica {
  return typeof valore === 'string' && (TIPI_NOTIFICA as readonly string[]).includes(valore)
}

/**
 * An internal path only: one slash at the start, never two ("//host" leaves the
 * app), no backslash, no space or control character, at most 500 characters.
 * The same rule as the table's check; anything else becomes "no link".
 */
export function linkInterno(link: string | null | undefined): string | null {
  if (!link) return null
  if (link.length > LIMITI_NOTIFICA.link) return null
  if (!link.startsWith('/') || link.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\\\s\u0000-\u001f\u007f]/.test(link)) return null
  return link
}
