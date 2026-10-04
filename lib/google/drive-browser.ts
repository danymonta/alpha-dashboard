import {
  ERRORI_DRIVE,
  MIME_CARTELLA,
  SCOPE_DRIVE_FILE,
  SCRIPT_GOOGLE,
  erroreAccessoGoogle,
  type ConfigPicker,
} from '@/lib/google/picker'

/**
 * The browser side of "Scegli da Drive": Google Identity Services gives an
 * access token with the drive.file scope (a popup, after the person's tap),
 * the Google Picker shows the folders. The token lives in the memory of the
 * page only: never sent to our server, never stored.
 *
 * Only the few calls used here are typed; the libraries are Google's own,
 * loaded from their official addresses.
 */

type RispostaToken = { access_token?: string; expires_in?: number | string; error?: string }
type ClientToken = { requestAccessToken: (opzioni?: { prompt?: string }) => void }

type Vista = {
  setIncludeFolders: (v: boolean) => Vista
  setSelectFolderEnabled: (v: boolean) => Vista
  setMimeTypes: (tipi: string) => Vista
  setOwnedByMe: (v: boolean) => Vista
}
type Costruttore = {
  setAppId: (id: string) => Costruttore
  setOAuthToken: (token: string) => Costruttore
  setDeveloperKey: (chiave: string) => Costruttore
  setLocale: (lingua: string) => Costruttore
  setTitle: (titolo: string) => Costruttore
  addView: (vista: Vista) => Costruttore
  setCallback: (fn: (dati: Record<string, unknown>) => void) => Costruttore
  build: () => { setVisible: (v: boolean) => void; dispose?: () => void }
}

type Google = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        include_granted_scopes?: boolean
        callback: (risposta: RispostaToken) => void
        error_callback?: (errore: { type?: string }) => void
      }) => ClientToken
    }
  }
  picker?: {
    ViewId: { FOLDERS: string }
    DocsView: new (vista?: string) => Vista
    PickerBuilder: new () => Costruttore
    Action: { PICKED: string; CANCEL: string; ERROR?: string }
    Response: { ACTION: string; DOCUMENTS: string }
    Document: { ID: string; MIME_TYPE: string; NAME: string }
  }
}

type Gapi = {
  load: (
    librerie: string,
    opzioni: { callback: () => void; onerror?: () => void; timeout?: number; ontimeout?: () => void },
  ) => void
}

type Finestra = Window & { google?: Google; gapi?: Gapi }

function finestra(): Finestra {
  return window as Finestra
}

/** Thrown with the words for the person. */
export class ErroreDrive extends Error {}

/**
 * Both libraries are on the page, the Picker's included. Until then a tap must
 * not ask for the token: Google's window would open after the tap, and the
 * browser (Safari first) blocks a popup opened later than the tap.
 */
export function googlePronto(): boolean {
  const g = finestra().google
  return Boolean(g?.accounts?.oauth2 && g?.picker)
}

const script = new Map<string, Promise<void>>()

function caricaScript(src: string, pronto: () => boolean): Promise<void> {
  if (pronto()) return Promise.resolve()
  let promessa = script.get(src)
  if (!promessa) {
    promessa = new Promise<void>((risolvi, rifiuta) => {
      const tag = document.createElement('script')
      tag.src = src
      tag.async = true
      tag.onload = () => risolvi()
      tag.onerror = () => {
        // the next tap tries again
        script.delete(src)
        tag.remove()
        rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento))
      }
      document.head.appendChild(tag)
    })
    script.set(src, promessa)
  }
  return promessa
}

let pickerPronto: Promise<void> | null = null

/** Both libraries, the Picker's included: loaded once per page, again only after a failure. */
export function caricaGoogle(): Promise<void> {
  const identita = caricaScript(SCRIPT_GOOGLE.identita, () => Boolean(finestra().google?.accounts?.oauth2))
  if (!pickerPronto) {
    pickerPronto = caricaScript(SCRIPT_GOOGLE.api, () => Boolean(finestra().gapi))
      .then(
        () =>
          new Promise<void>((risolvi, rifiuta) => {
            const gapi = finestra().gapi
            if (finestra().google?.picker) return risolvi()
            if (!gapi) return rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento))
            gapi.load('picker', {
              callback: () => risolvi(),
              onerror: () => rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento)),
              timeout: 15_000,
              ontimeout: () => rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento)),
            })
          }),
      )
      .catch((e: unknown) => {
        pickerPronto = null
        throw e
      })
  }
  return Promise.all([identita, pickerPronto]).then(() => undefined)
}

export type TokenDrive = { valore: string; scadeAlle: number }

/**
 * The access token, after the person's consent in Google's popup. To be called
 * right after the tap (the browser opens a popup only then).
 */
export function chiediToken(config: ConfigPicker): Promise<TokenDrive> {
  return new Promise((risolvi, rifiuta) => {
    const oauth2 = finestra().google?.accounts?.oauth2
    if (!oauth2) return rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento))
    const client = oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE_DRIVE_FILE,
      // only drive.file in the token, never the login's own scopes (email, profile) of the same client
      include_granted_scopes: false,
      callback: (risposta) => {
        if (risposta.error || !risposta.access_token) return rifiuta(new ErroreDrive(erroreAccessoGoogle(risposta.error)))
        const secondi = Number(risposta.expires_in) || 3600
        risolvi({ valore: risposta.access_token, scadeAlle: Date.now() + secondi * 1000 })
      },
      error_callback: (errore) => rifiuta(new ErroreDrive(erroreAccessoGoogle(errore?.type))),
    })
    client.requestAccessToken()
  })
}

export type SceltaPicker = { azione: 'scelta'; documento: { id?: unknown; mimeType?: unknown } } | { azione: 'annullata' }

/**
 * The Picker on the person's folders and the ones shared with him; one folder,
 * never a file. Two tabs, because "show folders" and "owned by me / shared with
 * me" are not combined (Google's reference used to say the second is then
 * ignored): the person's Drive with its folders, and the folders shared with
 * him, as a list.
 */
export function apriPicker(config: ConfigPicker, token: string): Promise<SceltaPicker> {
  return new Promise((risolvi, rifiuta) => {
    const gp = finestra().google?.picker
    if (!gp) return rifiuta(new ErroreDrive(ERRORI_DRIVE.caricamento))
    const mioDrive = new gp.DocsView(gp.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(MIME_CARTELLA)
    const condivise = new gp.DocsView(gp.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes(MIME_CARTELLA)
      .setOwnedByMe(false)
    const picker = new gp.PickerBuilder()
      .setAppId(config.appId)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setLocale('it')
      .setTitle('Scegli la cartella del cliente')
      .addView(mioDrive)
      .addView(condivise)
      .setCallback((dati) => {
        const azione = dati[gp.Response.ACTION]
        if (azione === gp.Action.PICKED) {
          const documenti = dati[gp.Response.DOCUMENTS]
          const primo = Array.isArray(documenti) ? (documenti[0] as Record<string, unknown> | undefined) : undefined
          picker.dispose?.()
          risolvi({
            azione: 'scelta',
            documento: { id: primo?.[gp.Document.ID], mimeType: primo?.[gp.Document.MIME_TYPE] },
          })
        } else if (azione === gp.Action.CANCEL) {
          picker.dispose?.()
          risolvi({ azione: 'annullata' })
        } else if (azione === (gp.Action.ERROR ?? 'error')) {
          // a key or an origin Google refuses, or Drive not answering: never a flow left hanging
          picker.dispose?.()
          rifiuta(new ErroreDrive(ERRORI_DRIVE.picker))
        }
      })
      .build()
    picker.setVisible(true)
  })
}
