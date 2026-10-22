/**
 * The notification center (1.41.0, CLAUDE.md sections 8 and 10): every email the
 * app sends to a profile of the app is also saved in public.notifiche, for the
 * person it was sent to. Client-safe constants and the one pure check of the
 * link; the writer is lib/notifiche/registra.ts (server only).
 */
export const TIPI_EMAIL = ['riepilogo_settimana', 'tempo_team', 'contenuti_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo'] as const
/**
 * The in-app alerts (1.42.0, Dany 19/10/2026: «rate in ritardo, token di Instagram in scadenza, giornate di Loris
 * da approvare, spesa di Claude vicina al limite» · «si tutte»): they exist only in the app, no email.
 */
export const TIPI_AVVISO = [
  'rate_in_ritardo',
  'chiave_in_scadenza',
  'chiave_rifiutata',
  'proposta_da_approvare',
  'spesa_claude',
] as const
export const TIPI_NOTIFICA = [...TIPI_EMAIL, ...TIPI_AVVISO] as const
export type TipoNotifica = (typeof TIPI_NOTIFICA)[number]
export type TipoAvviso = (typeof TIPI_AVVISO)[number]
export type TipoEmail = (typeof TIPI_EMAIL)[number]

/** Where a notification lives: an email's copy, or an alert that exists only in the app. */
export type CanaleNotifica = 'email' | 'app'

/** The name of the kind, as the list shows it. */
export const ETICHETTA_TIPO: Record<TipoNotifica, string> = {
  riepilogo_settimana: 'Riepilogo della settimana',
  tempo_team: 'Tempo del team',
  contenuti_settimana: 'Andamento dei contenuti',
  backup: 'Backup',
  promemoria_feedback: 'Call dei 3 mesi',
  promemoria_rinnovo: 'Call di rinnovo',
  rate_in_ritardo: 'Rate in ritardo',
  chiave_in_scadenza: 'Chiave in scadenza',
  chiave_rifiutata: 'Chiave da rifare',
  proposta_da_approvare: 'Da approvare',
  spesa_claude: 'Spesa di Claude',
}

/** Same bounds as the checks of the table (20261021090000_notifiche.sql, 20261022090000_notifiche_avvisi.sql). */
export const LIMITI_NOTIFICA = {
  titolo: 300,
  anteprima: 300,
  corpoHtml: 200_000,
  link: 500,
  chiave: 200,
  /** lines of an alert's detail list, and the length of one line */
  dettagli: 31,
  riga: 300,
} as const

export function eTipoAvviso(valore: unknown): valore is TipoAvviso {
  return typeof valore === 'string' && (TIPI_AVVISO as readonly string[]).includes(valore)
}

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
  if (/[\\\s\u0000-\u001f\u007f]/.test(link)) return null
  return link
}

/** The words of the button that opens what the notification is about, from its internal link. */
export function etichettaLink(link: string | null): string | null {
  if (!link) return null
  if (link === '/') return 'Apri la Panoramica'
  if (link.startsWith('/clients/')) return 'Apri la scheda del cliente'
  if (link.startsWith('/tempo/team')) return 'Apri Tempo › Team'
  if (link.startsWith('/marketing/pubblicati')) return 'Apri Pubblicati'
  if (link.startsWith('/settings/export')) return 'Apri Esporta'
  if (link.startsWith('/payments')) return 'Apri Incassi'
  if (link.startsWith('/settings/chiavi')) return 'Apri Chiavi e collegamenti'
  if (link.startsWith('/settings/instagram')) return 'Apri le impostazioni delle analisi'
  if (link.startsWith('/settings/fathom')) return 'Apri le impostazioni di Fathom'
  if (link.startsWith('/setting#') || link.startsWith('/setting?') || link === '/setting') return 'Apri il tracciamento da approvare'
  return 'Apri'
}
