import { describe, expect, it } from 'vitest'

import { ERRORI_DRIVE, MIME_CARTELLA, fileScelto, urlFileDrive } from '@/lib/google/picker'
import {
  ERRORE_URL_CONTRATTO,
  URL_CONTRATTO_MAX,
  contrattoVenditaSchema,
  normalizzaUrlContratto,
  salvaContrattoSchema,
  urlContrattoValido,
} from '@/lib/validation/contratto'

const VENDITA = '00000000-0000-4000-8000-000000000001'
const ID = '1E2eContrattoScelto_DaDrive-0123456789'

describe('il link del contratto di una vendita', () => {
  it('accetta Drive e Docs, con o senza https://', () => {
    for (const url of [
      'https://drive.google.com/file/d/abc123/view',
      'https://docs.google.com/document/d/abc123/edit',
      'drive.google.com/file/d/abc123/view',
      '  docs.google.com/document/d/abc123/edit  ',
    ]) {
      const r = salvaContrattoSchema.safeParse({ sale_id: VENDITA, url })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.url.startsWith('https://')).toBe(true)
    }
    expect(normalizzaUrlContratto(' drive.google.com/x ')).toBe('https://drive.google.com/x')
  })

  it('rifiuta ogni altro indirizzo, http, spazi, vuoto e troppo lungo', () => {
    for (const url of [
      'https://example.com/contratto.pdf',
      'http://drive.google.com/file/d/abc/view',
      'https://drive.google.com.evil.com/file',
      'https://evil.com/?u=https://drive.google.com/x',
      'https://drive.google.com/file d/abc',
      'https://drive.google.com/',
    ]) {
      expect(salvaContrattoSchema.safeParse({ sale_id: VENDITA, url }).success, url).toBe(false)
    }
    const vuoto = salvaContrattoSchema.safeParse({ sale_id: VENDITA, url: '   ' })
    expect(vuoto.success ? null : vuoto.error.issues[0]?.message).toBe('Incolla il link del contratto')
    const storto = salvaContrattoSchema.safeParse({ sale_id: VENDITA, url: 'https://example.com/x' })
    expect(storto.success ? null : storto.error.issues[0]?.message).toBe(ERRORE_URL_CONTRATTO)
    const lungo = salvaContrattoSchema.safeParse({
      sale_id: VENDITA,
      url: `https://drive.google.com/${'a'.repeat(URL_CONTRATTO_MAX)}`,
    })
    expect(lungo.success ? null : lungo.error.issues[0]?.message).toBe(`Al massimo ${URL_CONTRATTO_MAX} caratteri`)
  })

  it('vuole una vendita valida; togliere il link vuole solo la vendita', () => {
    expect(salvaContrattoSchema.safeParse({ sale_id: 'no', url: 'drive.google.com/x' }).success).toBe(false)
    expect(contrattoVenditaSchema.safeParse({ sale_id: VENDITA }).success).toBe(true)
    expect(contrattoVenditaSchema.safeParse({ sale_id: 'no' }).success).toBe(false)
  })
})

describe('«Scegli da Drive» per il contratto: un file, il link si ricostruisce dall’id', () => {
  it('il link del file è sempre quello di Drive, mai quello che dà il Picker', () => {
    expect(urlFileDrive(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`)
    expect(urlFileDrive('corto')).toBeNull()
    expect(urlFileDrive('con spazi nell’id 123')).toBeNull()
    expect(urlFileDrive(undefined)).toBeNull()
    expect(urlContrattoValido(urlFileDrive(ID) ?? '')).toBe(true)
  })

  it('un file vale; una cartella, niente o un id strano no, con le parole per la persona', () => {
    expect(fileScelto({ id: ID, mimeType: 'application/pdf' })).toEqual({ ok: true, url: `https://drive.google.com/file/d/${ID}/view` })
    expect(fileScelto({ id: ID, mimeType: 'application/vnd.google-apps.document' }).ok).toBe(true)
    expect(fileScelto({ id: ID, mimeType: MIME_CARTELLA })).toEqual({ ok: false, errore: ERRORI_DRIVE.non_file })
    expect(fileScelto(null)).toEqual({ ok: false, errore: ERRORI_DRIVE.nessun_file })
    expect(fileScelto({ id: 'no', mimeType: 'application/pdf' })).toEqual({ ok: false, errore: ERRORI_DRIVE.file_non_valido })
  })
})
