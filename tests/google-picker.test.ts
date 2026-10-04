import { describe, expect, it } from 'vitest'

import {
  CONFIG_PICKER_E2E,
  ERRORI_DRIVE,
  MIME_CARTELLA,
  cartellaScelta,
  configPicker,
  configPickerPer,
  erroreAccessoGoogle,
  urlCartellaDrive,
} from '@/lib/google/picker'
import { cartellaDriveSchema } from '@/lib/validation/cartella'

const COMPLETA = {
  GOOGLE_CLIENT_ID: '123456789012-abcdef.apps.googleusercontent.com',
  GOOGLE_PICKER_API_KEY: 'AIzaSyEsempioDiChiave_123',
  GOOGLE_APP_ID: '123456789012',
}

describe('configurazione del Google Picker: senza tutti e tre i valori, niente bottone', () => {
  it('con i tre valori, senza prefisso', () => {
    expect(configPicker(COMPLETA)).toEqual({
      clientId: COMPLETA.GOOGLE_CLIENT_ID,
      apiKey: COMPLETA.GOOGLE_PICKER_API_KEY,
      appId: COMPLETA.GOOGLE_APP_ID,
    })
  })

  it('con il prefisso NEXT_PUBLIC_, che vince; spazi attorno tolti', () => {
    expect(
      configPicker({
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: ' 1-x.apps.googleusercontent.com ',
        GOOGLE_CLIENT_ID: 'altro.apps.googleusercontent.com',
        NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: 'chiave',
        NEXT_PUBLIC_GOOGLE_APP_ID: '42',
      }),
    ).toEqual({ clientId: '1-x.apps.googleusercontent.com', apiKey: 'chiave', appId: '42' })
  })

  it('ne manca uno, o è vuoto: null', () => {
    for (const manca of Object.keys(COMPLETA)) {
      expect(configPicker({ ...COMPLETA, [manca]: undefined }), manca).toBeNull()
      expect(configPicker({ ...COMPLETA, [manca]: '   ' }), manca).toBeNull()
    }
    expect(configPicker({})).toBeNull()
  })

  it('un valore incollato male (virgolette, spazi, l’id del progetto al posto del numero): null, non un bottone rotto', () => {
    expect(configPicker({ ...COMPLETA, GOOGLE_APP_ID: 'percorso-alpha-123' })).toBeNull()
    expect(configPicker({ ...COMPLETA, GOOGLE_PICKER_API_KEY: '"AIzaSy"' })).toBeNull()
    expect(configPicker({ ...COMPLETA, GOOGLE_CLIENT_ID: 'a b.apps.googleusercontent.com' })).toBeNull()
  })

  it('la configurazione finta dei test e2e: solo col login di sviluppo e il cookie, mai in produzione', () => {
    const locale = { ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'development' }
    expect(configPickerPer(locale, '1')).toEqual(CONFIG_PICKER_E2E)
    expect(configPickerPer(locale, undefined)).toBeNull()
    expect(configPickerPer(locale, '0')).toBeNull()
    expect(configPickerPer({ ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'production' }, '1')).toBeNull()
    expect(configPickerPer({ NODE_ENV: 'development' }, '1')).toBeNull()
    // in production the cookie changes nothing: the real values stay
    expect(configPickerPer({ ...COMPLETA, ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'production' }, '1')).toEqual(
      configPicker(COMPLETA),
    )
  })
})

describe('la cartella scelta: l’indirizzo si ricostruisce dall’id, mai preso dal Picker', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz-_0123'

  it('un id valido dà il link della cartella, che lo schema del link accetta', () => {
    const url = urlCartellaDrive(ID)
    expect(url).toBe(`https://drive.google.com/drive/folders/${ID}`)
    expect(cartellaDriveSchema.safeParse({ client_id: '00000000-0000-4000-8000-000000000001', url }).success).toBe(true)
  })

  it('un id strano non diventa mai un link', () => {
    for (const id of ['', 'corto', '../../evil', 'abc/def/ghijklmnop', 'https://evil.example/x', 'a'.repeat(201), 'id con spazi 12345', null, 42, undefined]) {
      expect(urlCartellaDrive(id), String(id)).toBeNull()
    }
  })

  it('solo una cartella: un file o niente lo dicono con parole loro', () => {
    expect(cartellaScelta({ id: ID, mimeType: MIME_CARTELLA })).toEqual({
      ok: true,
      url: `https://drive.google.com/drive/folders/${ID}`,
    })
    expect(cartellaScelta({ id: ID, mimeType: 'application/pdf' })).toEqual({ ok: false, errore: ERRORI_DRIVE.non_cartella })
    expect(cartellaScelta({ id: '../x', mimeType: MIME_CARTELLA })).toEqual({ ok: false, errore: ERRORI_DRIVE.non_valida })
    expect(cartellaScelta(undefined)).toEqual({ ok: false, errore: ERRORI_DRIVE.nessuna })
  })

  it('gli errori di Google in italiano', () => {
    expect(erroreAccessoGoogle('popup_failed_to_open')).toBe(ERRORI_DRIVE.popup_bloccato)
    expect(erroreAccessoGoogle('popup_closed')).toBe(ERRORI_DRIVE.popup_chiuso)
    expect(erroreAccessoGoogle('access_denied')).toBe(ERRORI_DRIVE.accesso_negato)
    expect(erroreAccessoGoogle('qualcos_altro')).toBe(ERRORI_DRIVE.accesso)
    expect(erroreAccessoGoogle(undefined)).toBe(ERRORI_DRIVE.accesso)
  })
})
