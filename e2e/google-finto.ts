import type { BrowserContext, Page } from '@playwright/test'

import { MIME_CARTELLA } from '../lib/google/picker'

/**
 * A fake Google for the "Scegli da Drive" tests (04/10/2026): Playwright never
 * calls the real Google. Shared by the client sheet and the client's project
 * (05/10/2026).
 */

export const ID_CARTELLA = '1E2eCartellaScelta_DaDrive-0123456789'
export const TOKEN_FINTO = 'token-finto-e2e-ya29'

export type CompitoFinto = {
  /** What Google's sign-in answers: a token, or one of its errors. */
  accesso: 'ok' | 'popup_failed_to_open' | 'popup_closed' | 'access_denied'
  /** What the person does in the Picker, or the Picker's own error. */
  picker: 'cartella' | 'file' | 'annulla' | 'errore'
  /** The libraries arrive only when the app loads Google's scripts (answered locally by the test). */
  tardi?: boolean
}

/**
 * A fake Google on window, before the page loads: the app finds the libraries
 * already there and never adds their scripts (with `tardi`, they arrive when
 * the app loads the scripts, which the test answers locally). It records what
 * the app asked.
 */
export async function googleFinto(page: Page, compito: CompitoFinto) {
  await page.addInitScript(
    ({ compito, token, id, mime }) => {
      const w = window as unknown as Record<string, unknown>
      const registro: Record<string, unknown>[] = []
      w.__driveFinto = { compito, registro }
      const finto = () => (w.__driveFinto as { compito: typeof compito }).compito
      class DocsView {
        impostazioni: Record<string, unknown> = {}
        constructor(vista: string) {
          this.impostazioni.vista = vista
        }
        setIncludeFolders(v: boolean) {
          this.impostazioni.cartelle = v
          return this
        }
        setSelectFolderEnabled(v: boolean) {
          this.impostazioni.sceltaCartella = v
          return this
        }
        setMimeTypes(v: string) {
          this.impostazioni.mime = v
          return this
        }
        setOwnedByMe(v: boolean) {
          this.impostazioni.mie = v
          return this
        }
      }
      class PickerBuilder {
        impostazioni: Record<string, unknown> = { viste: [] as unknown[] }
        callback: (dati: Record<string, unknown>) => void = () => undefined
        setAppId(v: string) {
          this.impostazioni.appId = v
          return this
        }
        setOAuthToken(v: string) {
          this.impostazioni.token = v
          return this
        }
        setDeveloperKey(v: string) {
          this.impostazioni.chiave = v
          return this
        }
        setLocale(v: string) {
          this.impostazioni.lingua = v
          return this
        }
        setTitle(v: string) {
          this.impostazioni.titolo = v
          return this
        }
        addView(v: DocsView) {
          ;(this.impostazioni.viste as unknown[]).push(v.impostazioni)
          return this
        }
        setCallback(fn: (dati: Record<string, unknown>) => void) {
          this.callback = fn
          return this
        }
        build() {
          registro.push({ picker: this.impostazioni })
          const cb = this.callback
          return {
            setVisible: () =>
              setTimeout(() => {
                const scelta = finto().picker
                if (scelta === 'annulla') return cb({ action: 'cancel' })
                if (scelta === 'errore') return cb({ action: 'error' })
                cb({
                  action: 'picked',
                  docs: [
                    {
                      id: scelta === 'file' ? 'unFileQualsiasi-123' : id,
                      mimeType: scelta === 'file' ? 'application/pdf' : mime,
                      name: 'Cartella del cliente',
                      // never used: the URL is rebuilt from the id
                      url: 'https://esempio.invalid/non-drive',
                    },
                  ],
                })
              }, 50),
            dispose: () => undefined,
          }
        }
      }
      const google = {
        accounts: {
          oauth2: {
            initTokenClient: (config: {
              client_id: string
              scope: string
              include_granted_scopes?: boolean
              callback: (r: Record<string, unknown>) => void
              error_callback?: (e: { type: string }) => void
            }) => {
              registro.push({
                token: { client_id: config.client_id, scope: config.scope, altri_permessi: config.include_granted_scopes },
              })
              return {
                requestAccessToken: () =>
                  setTimeout(() => {
                    const accesso = finto().accesso
                    if (accesso === 'ok') config.callback({ access_token: token, expires_in: 3599 })
                    else if (accesso === 'access_denied') config.callback({ error: 'access_denied' })
                    else config.error_callback?.({ type: accesso })
                  }, 50),
              }
            },
          },
        },
        picker: {
          ViewId: { FOLDERS: 'folders' },
          DocsView,
          PickerBuilder,
          Action: { PICKED: 'picked', CANCEL: 'cancel', ERROR: 'error' },
          Response: { ACTION: 'action', DOCUMENTS: 'docs' },
          Document: { ID: 'id', MIME_TYPE: 'mimeType', NAME: 'name' },
        },
      }
      const installa = () => {
        w.google = google
        w.gapi = { load: (_: string, o: { callback: () => void }) => setTimeout(o.callback, 0) }
      }
      w.__installaGoogle = installa
      if (!compito.tardi) installa()
    },
    { compito, token: TOKEN_FINTO, id: ID_CARTELLA, mime: MIME_CARTELLA },
  )
}

/** Every request to Google is refused and written down: the test must leave it empty. */
export async function bloccaGoogle(context: BrowserContext) {
  const chiamate: string[] = []
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(google\.com|googleapis\.com|gstatic\.com)\//, (r) => {
    chiamate.push(r.request().url())
    return r.abort()
  })
  return chiamate
}

export async function registro(page: Page) {
  return page.evaluate(() => (window as unknown as { __driveFinto: { registro: Record<string, unknown>[] } }).__driveFinto.registro)
}

export async function impostaCompito(page: Page, compito: Partial<CompitoFinto>) {
  await page.evaluate((c) => {
    const f = (window as unknown as { __driveFinto: { compito: Record<string, unknown> } }).__driveFinto
    Object.assign(f.compito, c)
  }, compito)
}
