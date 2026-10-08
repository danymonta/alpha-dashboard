import { describe, expect, it } from 'vitest'

import {
  decisaDaUnAltro,
  firmaProposte,
  giornoProposta,
  paroleScheda,
  primoNome,
} from '@/app/(app)/today/proposta-instagram'

// The proposals of the setter's report from Instagram, decided by the setter
// in "Oggi" and, since 08/10/2026, by the admin on the "Setter" page.

const OGGI = '2026-10-08'

describe('le parole della scheda', () => {
  it('il setter: le parole di sempre, senza nomi', () => {
    const parole = paroleScheda({ data: '2026-10-07' }, OGGI, 'setter')
    expect(parole.titolo).toBe('Da Instagram · ieri')
    expect(parole.suoi).toBe('tu')
    expect(parole.tieni).toBe('Tieni i miei')
    expect(parole.fatto.scarto).toBe('Report di ieri: tenuti i tuoi numeri')
    expect(parole.dopoLoScarto).toBe(false)
  })

  it('l’admin: il nome del setter e il giorno per intero', () => {
    const parole = paroleScheda({ data: '2026-10-07', setter_nome: 'Loris Lo Presti' }, OGGI, 'admin')
    expect(parole.titolo).toBe('Loris Lo Presti · ieri, mercoledì 07/10')
    expect(parole.suoi).toBe('Loris')
    expect(parole.tieni).toBe('Tieni quelli di Loris')
    expect(parole.confrontoFoglio('53', '52')).toBe('Instagram 53 · Loris 52')
    expect(parole.fatto).toEqual({
      conferma: 'Report di Loris di ieri compilato con i numeri di Instagram',
      correzione: 'Report di Loris di ieri compilato con i numeri corretti',
      scarto: 'Report di Loris di ieri: tenuti i suoi numeri',
    })
    // the setter sees who decided: the admin is told
    expect(parole.dopo).toContain('vede che hai deciso tu')
    expect(parole.dopoLoScarto).toBe(true)
    // an older day: no "ieri"
    expect(paroleScheda({ data: '2026-10-05', setter_nome: 'Loris' }, OGGI, 'admin').titolo).toBe('Loris · lunedì 05/10')
  })

  it('il nome breve e il giorno', () => {
    expect(primoNome('  Loris  Lo Presti ')).toBe('Loris')
    expect(primoNome('Loris')).toBe('Loris')
    expect(giornoProposta('2026-10-07', OGGI)).toBe('ieri, mercoledì 07/10')
    expect(giornoProposta('2026-09-30', OGGI)).toBe('mercoledì 30/09')
  })
})

describe('chi ha deciso, nel giorno del setter', () => {
  const SETTER = 'setter-id'
  const ADMIN = 'admin-id'

  const DANY = { nome: 'Dany Montagnolo' }

  it('l’admin: chi e cosa, mai i numeri', () => {
    expect(decisaDaUnAltro({ stato: 'confermata', corretta: false, deciso_da: ADMIN, decisore: DANY }, SETTER)).toBe(
      'Dany Montagnolo ha confermato i numeri di Instagram per questo giorno.',
    )
    expect(decisaDaUnAltro({ stato: 'scartata', corretta: false, deciso_da: ADMIN, decisore: DANY }, SETTER)).toBe(
      'Dany Montagnolo ha tenuto i tuoi numeri per questo giorno.',
    )
  })

  it('corretti con «Correggi»: mai «ha confermato i numeri di Instagram»', () => {
    const frase = decisaDaUnAltro({ stato: 'confermata', corretta: true, deciso_da: ADMIN, decisore: DANY }, SETTER)
    expect(frase).toBe('Dany Montagnolo ha corretto i numeri di Instagram per questo giorno.')
    expect(frase).not.toMatch(/\d/)
  })

  it('niente quando ha deciso lui, o chi ha deciso non c’è più', () => {
    expect(
      decisaDaUnAltro({ stato: 'confermata', corretta: true, deciso_da: SETTER, decisore: { nome: 'Loris' } }, SETTER),
    ).toBeNull()
    expect(decisaDaUnAltro({ stato: 'confermata', corretta: false, deciso_da: null, decisore: null }, SETTER)).toBeNull()
    expect(
      decisaDaUnAltro({ stato: 'da_confermare', corretta: false, deciso_da: ADMIN, decisore: { nome: 'Dany' } }, SETTER),
    ).toBeNull()
  })
})

describe('le proposte di Oggi in una stringa (il ritorno in primo piano)', () => {
  const una = [{ id: 'a', calcolato_il: '2026-10-08T00:30:00.123456+00:00' }]

  it('le stesse proposte e la stessa decisione danno la stessa firma', () => {
    expect(firmaProposte(una, null)).toBe(firmaProposte([{ ...una[0] }], null))
  })

  it('una proposta ricalcolata, una in più, una decisa o il giorno deciso cambiano la firma', () => {
    const base = firmaProposte(una, null)
    expect(firmaProposte([{ id: 'a', calcolato_il: '2026-10-08T01:30:00+00:00' }], null)).not.toBe(base)
    expect(firmaProposte([...una, { id: 'b', calcolato_il: una[0].calcolato_il }], null)).not.toBe(base)
    expect(firmaProposte([], null)).not.toBe(base)
    expect(firmaProposte(una, '2026-10-08T09:00:00+00:00')).not.toBe(base)
  })

  it('una lettura non riuscita (null) non vale mai un elenco vuoto', () => {
    expect(firmaProposte(null, null)).not.toBe(firmaProposte([], null))
  })
})
