/**
 * "Scegli da Drive" (Dany, 04/10/2026: «un pulsante che richiama Drive e ti
 * permette, collegandoti con Google, di cliccare su una cartella e collegarla
 * direttamente»): the client's Drive folder chosen with the Google Picker, in
 * the browser. This file holds the pure parts, shared by the server (is the
 * button configured?) and the browser (which URL does a picked folder give?).
 *
 * The browser needs three public values, never secrets: the OAuth web client
 * id, a Picker API key restricted by website (docs.google.com included), and the Cloud project
 * number (the Picker's appId). Read with or without the NEXT_PUBLIC_ prefix
 * (CLAUDE.md section 5: Vercel may refuse the prefix on a sensitive variable).
 * Missing any of them: no button, the typed link stays.
 */

import { isDevLoginEnabled } from '@/lib/auth/dev-login'

export type ConfigPicker = {
  /** OAuth 2.0 web client id: "1234-abc.apps.googleusercontent.com". */
  clientId: string
  /** API key restricted to the Picker and Drive APIs and to the app's sites plus docs.google.com (the Picker's frame). */
  apiKey: string
  /** The Google Cloud project number: the Picker's appId, so drive.file covers the folder. */
  appId: string
}

type Ambiente = Partial<Record<string, string | undefined>>

/** The least scope: only the files and folders the person picks, nothing else of the Drive. Non-sensitive. */
export const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'

export const MIME_CARTELLA = 'application/vnd.google-apps.folder'

/** The two Google scripts the button loads, only where the folder can be linked (client sheet, client's project). */
export const SCRIPT_GOOGLE = {
  identita: 'https://accounts.google.com/gsi/client',
  api: 'https://apis.google.com/js/api.js',
} as const

function valore(env: Ambiente, nome: string): string {
  return (env[`NEXT_PUBLIC_${nome}`] || env[nome] || '').trim()
}

/** The Picker's configuration from the environment, or null when anything is missing (no button). */
export function configPicker(env: Ambiente = process.env): ConfigPicker | null {
  const clientId = valore(env, 'GOOGLE_CLIENT_ID')
  const apiKey = valore(env, 'GOOGLE_PICKER_API_KEY')
  const appId = valore(env, 'GOOGLE_APP_ID')
  if (!clientId || !apiKey || !appId) return null
  // a value pasted with spaces or quotes, or a project id where the number goes: no button rather than a broken one
  if (/[\s"']/.test(clientId + apiKey) || !/^\d+$/.test(appId)) return null
  return { clientId, apiKey, appId }
}

/**
 * Only for the local e2e (Playwright never calls Google): with the dev login on
 * (ENABLE_DEV_LOGIN=true, never in a production build) a cookie turns on a fake
 * configuration, so the button can be tested against a fake Google without
 * restarting the dev server with other variables.
 */
export const COOKIE_PICKER_E2E = 'alpha-e2e-google-picker'
export const CONFIG_PICKER_E2E: ConfigPicker = {
  clientId: 'e2e-finto.apps.googleusercontent.com',
  apiKey: 'e2e-chiave-finta',
  appId: '000000000000',
}

/** The configuration of a request: the environment's, or the e2e one behind the cookie, locally only. */
export function configPickerPer(env: Ambiente = process.env, cookieE2E?: string): ConfigPicker | null {
  if (cookieE2E === '1' && isDevLoginEnabled(env)) return CONFIG_PICKER_E2E
  return configPicker(env)
}

/** A Drive file id: letters, digits, "-" and "_" (the ids of Drive are 19 to 44 characters long). */
const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/

/**
 * The folder's URL rebuilt from its id: never the URL the picker hands back,
 * so a link that does not lead to drive.google.com never gets saved.
 */
export function urlCartellaDrive(id: unknown): string | null {
  return typeof id === 'string' && ID_DRIVE.test(id) ? `https://drive.google.com/drive/folders/${id}` : null
}

/** What the Picker gave back, checked: a folder with a valid id, or the words for the person. */
export function cartellaScelta(documento: { id?: unknown; mimeType?: unknown } | null | undefined):
  | { ok: true; url: string }
  | { ok: false; errore: string } {
  if (!documento) return { ok: false, errore: ERRORI_DRIVE.nessuna }
  if (documento.mimeType !== MIME_CARTELLA) return { ok: false, errore: ERRORI_DRIVE.non_cartella }
  const url = urlCartellaDrive(documento.id)
  return url ? { ok: true, url } : { ok: false, errore: ERRORI_DRIVE.non_valida }
}

/**
 * A file's URL rebuilt from its id (21/10/2026, the contract of a sale): never
 * the URL the picker hands back.
 */
export function urlFileDrive(id: unknown): string | null {
  return typeof id === 'string' && ID_DRIVE.test(id) ? `https://drive.google.com/file/d/${id}/view` : null
}

/** What the Picker gave back in "file" mode, checked: a file (not a folder) with a valid id, or the words for the person. */
export function fileScelto(documento: { id?: unknown; mimeType?: unknown } | null | undefined):
  | { ok: true; url: string }
  | { ok: false; errore: string } {
  if (!documento) return { ok: false, errore: ERRORI_DRIVE.nessun_file }
  if (documento.mimeType === MIME_CARTELLA) return { ok: false, errore: ERRORI_DRIVE.non_file }
  const url = urlFileDrive(documento.id)
  return url ? { ok: true, url } : { ok: false, errore: ERRORI_DRIVE.file_non_valido }
}

/** What the Picker picks: a folder (the client's) or a file (the contract of a sale). */
export type ModoPicker = 'cartella' | 'file'

/** Every way the flow can stop, in Italian. */
export const ERRORI_DRIVE = {
  nessun_file: 'Nessun file scelto: scegline uno o incolla il link.',
  non_file: 'Hai scelto una cartella, non un file: scegli il contratto.',
  file_non_valido: 'Il file scelto non ha un indirizzo valido: riprova o incolla il link.',
  caricamento: 'Non riesco a caricare Google Drive: controlla la connessione e riprova.',
  popup_bloccato:
    'Il browser ha bloccato la finestra di Google: riprova, e se succede di nuovo consenti le finestre popup per questo sito.',
  popup_chiuso: 'Hai chiuso la finestra di Google prima di collegarti: riprova.',
  accesso_negato: 'Senza il permesso di Google non posso aprire Drive: riprova e consenti l’accesso.',
  accesso: 'Google non ha dato l’accesso a Drive: riprova.',
  nessuna: 'Nessuna cartella scelta: scegline una o incolla il link.',
  non_cartella: 'Hai scelto un file, non una cartella: scegli una cartella.',
  non_valida: 'La cartella scelta non ha un indirizzo valido: riprova o incolla il link.',
  picker: 'Google Drive non si è aperto: riprova o incolla il link.',
  /** Not an error: the libraries were still loading at the tap, the next tap opens Google's window. */
  pronto: 'Google Drive è pronto: tocca di nuovo «Scegli da Drive».',
} as const

/**
 * The words for an error of Google's sign-in: the error_callback types of the
 * token client (popup_failed_to_open, popup_closed) and the OAuth errors of its
 * callback (access_denied and the others).
 */
export function erroreAccessoGoogle(tipo: unknown): string {
  switch (tipo) {
    case 'popup_failed_to_open':
      return ERRORI_DRIVE.popup_bloccato
    case 'popup_closed':
      return ERRORI_DRIVE.popup_chiuso
    case 'access_denied':
      return ERRORI_DRIVE.accesso_negato
    default:
      return ERRORI_DRIVE.accesso
  }
}
