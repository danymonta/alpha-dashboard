/**
 * How the Instagram token stands, in one place for Impostazioni › Chiavi e
 * collegamenti and Impostazioni › Instagram e Messenger (1.38.0; the rules are
 * those of 1.30.0 on the Instagram page): pure, no clock of its own.
 */
const GIORNO_MS = 86_400_000

/** The nightly run refreshes the token every week: this close to the end, it has not managed to. */
export const AVVISO_SCADENZA_GIORNI = 7

export type StatoToken = {
  presente: boolean
  /** Expired by its date, or refused by Meta (code 190) on the last run, maybe well before its date. */
  scaduto: boolean
  scadutoPerData: boolean
  /** Days to the end, rounded up; null without a date. */
  giorniAllaScadenza: number | null
  /** Within AVVISO_SCADENZA_GIORNI days and not expired already. */
  scadePresto: boolean
}

export function statoToken({
  presente,
  scadeIl,
  rifiutatoDaMeta,
  adesso,
}: {
  presente: boolean
  scadeIl: string | null
  /** The last error is the one of a refused token (FRASI_ERRORE.token). */
  rifiutatoDaMeta: boolean
  adesso: number
}): StatoToken {
  const scadeMs = scadeIl ? Date.parse(scadeIl) : Number.NaN
  const conData = Number.isFinite(scadeMs)
  const scadutoPerData = conData && scadeMs <= adesso
  const scaduto = presente && (scadutoPerData || rifiutatoDaMeta)
  const giorniAllaScadenza = conData ? Math.ceil((scadeMs - adesso) / GIORNO_MS) : null
  const scadePresto =
    presente && !scaduto && giorniAllaScadenza !== null && giorniAllaScadenza <= AVVISO_SCADENZA_GIORNI
  return { presente, scaduto, scadutoPerData, giorniAllaScadenza, scadePresto }
}

/** "Scade tra 1 giorno", "Scade tra 5 giorni". */
export function fraseScadePresto(giorni: number): string {
  return `Scade tra ${giorni === 1 ? '1 giorno' : `${giorni} giorni`}`
}
