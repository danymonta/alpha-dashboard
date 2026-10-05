import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  archivioClienteSchema,
  chiusuraClienteSchema,
  MOTIVO_CHIUSURA_MAX,
  togliArchivioSchema,
} from '@/lib/validation/chiusura'

const CLIENTE = '00000000-0000-4000-8000-000000000001'

describe('«Non rinnova»: lo schema del foglio e della server action', () => {
  it('oggi, con un motivo: il motivo senza spazi attorno', () => {
    expect(chiusuraClienteSchema.parse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo: '  Si allena da solo  ' })).toEqual({
      client_id: CLIENTE,
      chiuso_il: oggiRoma(),
      motivo: 'Si allena da solo',
    })
  })

  it('il motivo è facoltativo: vuoto, null o assente diventano null', () => {
    for (const motivo of ['', '   ', null, undefined]) {
      expect(chiusuraClienteSchema.parse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo }).motivo).toBeNull()
    }
  })

  it('al massimo 500 caratteri di motivo', () => {
    const ok = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: oggiRoma(), motivo: 'x'.repeat(MOTIVO_CHIUSURA_MAX) })
    expect(ok.success).toBe(true)
    const troppo = chiusuraClienteSchema.safeParse({
      client_id: CLIENTE,
      chiuso_il: oggiRoma(),
      motivo: 'x'.repeat(MOTIVO_CHIUSURA_MAX + 1),
    })
    expect(troppo.success ? null : troppo.error.issues[0]?.message).toBe('Al massimo 500 caratteri')
  })

  it('un giorno passato sì, il futuro mai, una data scritta male nemmeno', () => {
    expect(chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: aggiungiGiorni(oggiRoma(), -40) }).success).toBe(true)
    const futuro = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: aggiungiGiorni(oggiRoma(), 1) })
    expect(futuro.success ? null : futuro.error.issues[0]?.message).toBe('Il giorno non può essere nel futuro')
    const scritta = chiusuraClienteSchema.safeParse({ client_id: CLIENTE, chiuso_il: '05/10/2026' })
    expect(scritta.success ? null : scritta.error.issues.map((i) => i.message)).toEqual(['Scegli il giorno'])
  })
})

describe('«Archivia come ex cliente» e «Togli dall’archivio»: solo il cliente', () => {
  it('vuole un cliente valido, il giorno è quello di oggi deciso dal server', () => {
    expect(archivioClienteSchema.safeParse({ client_id: '11111111-1111-4111-8111-111111111111' }).success).toBe(true)
    expect(archivioClienteSchema.safeParse({ client_id: 'mario' }).success).toBe(false)
    expect(archivioClienteSchema.safeParse({}).success).toBe(false)
    // a day sent from the page is not taken: the archive starts today
    expect(
      archivioClienteSchema.parse({ client_id: '11111111-1111-4111-8111-111111111111', archiviato_il: '2020-01-01' }),
    ).toEqual({ client_id: '11111111-1111-4111-8111-111111111111' })
  })

  it('«Annulla» del toast toglie solo l’archivio scritto dal suo tocco: la versione della chiusura, non il giorno', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    // the closure's updated_at as PostgREST returns it, microseconds and offset
    const versione = '2026-10-05T08:12:34.123456+00:00'
    expect(togliArchivioSchema.parse({ client_id: id })).toEqual({ client_id: id })
    expect(togliArchivioSchema.parse({ client_id: id, solo_se_versione: versione })).toEqual({
      client_id: id,
      solo_se_versione: versione,
    })
    expect(togliArchivioSchema.parse({ client_id: id, solo_se_versione: '2026-10-05T08:12:34+00:00' }).solo_se_versione).toBe(
      '2026-10-05T08:12:34+00:00',
    )
    // a day alone is no version: archived again the same day it would match
    expect(togliArchivioSchema.safeParse({ client_id: id, solo_se_versione: '2026-10-05' }).success).toBe(false)
    expect(togliArchivioSchema.safeParse({ client_id: id, solo_se_versione: 'ieri' }).success).toBe(false)
    expect(togliArchivioSchema.safeParse({ solo_se_versione: versione }).success).toBe(false)
    // the old key is not read
    expect(togliArchivioSchema.parse({ client_id: id, solo_se_il: '2026-10-05' })).toEqual({ client_id: id })
  })
})
