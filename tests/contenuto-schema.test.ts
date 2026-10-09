import { describe, expect, it } from 'vitest'

import {
  ERRORE_LINK,
  ERRORE_LINK_CONDIVISIONE,
  ERRORE_SEZIONE_LUNGA,
  ERRORE_VIEW_COUNT,
  contenutoSchema,
  linkFacoltativo,
  modificaContenutoSchema,
  normalizzaSezione,
  parseViewCount,
  sezioneContenutoSchema,
  statusContenutoSchema,
  urlPost,
} from '@/lib/validation/contenuto'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
const base = { tipo: 'reel', nome: 'Trazioni senza sbarra', stato: 'not_started' } as const

function errore(risultato: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return risultato.success ? undefined : risultato.error?.issues[0]?.message
}

describe('linkFacoltativo (Inspiration, URL)', () => {
  it('vuoto è null', () => {
    expect(linkFacoltativo.parse('')).toBeNull()
    expect(linkFacoltativo.parse('   ')).toBeNull()
    expect(linkFacoltativo.parse(null)).toBeNull()
    expect(linkFacoltativo.parse(undefined)).toBeNull()
  })

  it('senza schema riceve https://; lo schema si scrive in minuscolo', () => {
    expect(linkFacoltativo.parse('www.instagram.com/reel/ABCdef12345/')).toBe('https://www.instagram.com/reel/ABCdef12345/')
    expect(linkFacoltativo.parse(' instagram.com/p/Xyz12345 ')).toBe('https://instagram.com/p/Xyz12345')
    expect(linkFacoltativo.parse('HTTPS://www.tiktok.com/@qualcuno')).toBe('https://www.tiktok.com/@qualcuno')
    expect(linkFacoltativo.parse('http://esempio.it/x')).toBe('http://esempio.it/x')
  })

  it('rifiuta spazi, javascript:, altri schemi, un dominio senza punto e un link troppo lungo', () => {
    expect(errore(linkFacoltativo.safeParse('https://www.instagram.com/reel/ab cd'))).toBe(ERRORE_LINK)
    expect(errore(linkFacoltativo.safeParse('javascript:alert(1)'))).toBe(ERRORE_LINK)
    expect(errore(linkFacoltativo.safeParse('ftp://esempio.it/file'))).toBe(ERRORE_LINK)
    expect(errore(linkFacoltativo.safeParse('https://ciao'))).toBe(ERRORE_LINK)
    expect(errore(linkFacoltativo.safeParse(`https://esempio.it/${'a'.repeat(490)}`))).toBe(ERRORE_LINK)
    expect(linkFacoltativo.safeParse(`https://esempio.it/${'a'.repeat(400)}`).success).toBe(true)
  })

  it('quello che accetta passa il controllo della tabella: ^https?://\\S+$', () => {
    for (const link of ['www.instagram.com/reel/x1', 'HTTP://a.it', 'https://a.it/b?c=d#e']) {
      expect(linkFacoltativo.parse(link)).toMatch(/^https?:\/\/\S+$/)
    }
  })
})

describe('urlPost', () => {
  it('rifiuta un link di condivisione e spiega come copiare quello del post', () => {
    expect(errore(urlPost.safeParse('https://www.instagram.com/share/reel/SHAREabc123/'))).toBe(ERRORE_LINK_CONDIVISIONE)
    expect(errore(urlPost.safeParse('instagram.com/share/p/SHAREabc123'))).toBe(ERRORE_LINK_CONDIVISIONE)
  })

  it('accetta il link del post e il vuoto', () => {
    expect(urlPost.parse('https://www.instagram.com/reel/ABCdef12345/?igsh=x')).toBe(
      'https://www.instagram.com/reel/ABCdef12345/?igsh=x',
    )
    expect(urlPost.parse('')).toBeNull()
  })
})

describe('View Count', () => {
  it.each([
    ['12345', 12345],
    ['12.345', 12345],
    ['12,345', 12345],
    ['1.234.567', 1234567],
    [' 0 ', 0],
  ])('«%s» è %i', (testo, numero) => {
    expect(parseViewCount(testo)).toBe(numero)
    expect(contenutoSchema.parse({ ...base, view_count: testo }).view_count).toBe(numero)
  })

  it.each(['1,5', '1.50', '12.3456', '-3', '1.234,567', '12 345', 'mille', '1e3'])('«%s» no', (testo) => {
    expect(parseViewCount(testo)).toBeNull()
    expect(errore(contenutoSchema.safeParse({ ...base, view_count: testo }))).toBe(ERRORE_VIEW_COUNT)
  })

  it('vuoto è null; un numero intero va, un decimale no; al massimo 2.000.000.000', () => {
    expect(contenutoSchema.parse({ ...base, view_count: '' }).view_count).toBeNull()
    expect(contenutoSchema.parse({ ...base }).view_count).toBeNull()
    expect(contenutoSchema.parse({ ...base, view_count: 12480 }).view_count).toBe(12480)
    expect(errore(contenutoSchema.safeParse({ ...base, view_count: 1.5 }))).toBe(ERRORE_VIEW_COUNT)
    expect(contenutoSchema.safeParse({ ...base, view_count: '2.000.000.001' }).success).toBe(false)
    expect(contenutoSchema.parse({ ...base, view_count: '2.000.000.000' }).view_count).toBe(2_000_000_000)
  })
})

describe('contenutoSchema', () => {
  it('il minimo: modello e Name; Status di base Not started; il resto vuoto', () => {
    expect(contenutoSchema.parse({ tipo: 'carousel', nome: '  Tre errori  ' })).toEqual({
      tipo: 'carousel',
      nome: 'Tre errori',
      reel_type: null,
      formato: null,
      stato: 'not_started',
      post_date: null,
      inspiration: null,
      url: null,
      audio: null,
      view_count: null,
    })
  })

  it('un Name vuoto o di soli spazi non va', () => {
    expect(errore(contenutoSchema.safeParse({ ...base, nome: '   ' }))).toBe('Scrivi il nome.')
    expect(errore(contenutoSchema.safeParse({ tipo: 'reel' }))).toBe('Scrivi il nome.')
    expect(errore(contenutoSchema.safeParse({ ...base, nome: 'x'.repeat(301) }))).toBe('Al massimo 300 caratteri.')
  })

  it('Reel Type e Format: un valore della lista, o nessuno', () => {
    const v = contenutoSchema.parse({ ...base, reel_type: 'radio', formato: '' })
    expect(v.reel_type).toBe('radio')
    expect(v.formato).toBeNull()
    expect(contenutoSchema.safeParse({ ...base, reel_type: 'RADIO' }).success).toBe(false)
  })

  it('Post Date: un giorno valido, passato o futuro, o vuoto', () => {
    expect(contenutoSchema.parse({ ...base, post_date: '2026-09-02' }).post_date).toBe('2026-09-02')
    expect(contenutoSchema.parse({ ...base, post_date: '2027-03-31' }).post_date).toBe('2027-03-31')
    expect(contenutoSchema.parse({ ...base, post_date: '' }).post_date).toBeNull()
    expect(errore(contenutoSchema.safeParse({ ...base, post_date: '2026-02-30' }))).toBe('Data non valida.')
    expect(errore(contenutoSchema.safeParse({ ...base, post_date: '02/09/2026' }))).toBe('Data non valida.')
  })

  it('Audio: spazi tolti, vuoto è null, al massimo 200 caratteri', () => {
    expect(contenutoSchema.parse({ ...base, audio: '  Brano originale ' }).audio).toBe('Brano originale')
    expect(contenutoSchema.parse({ ...base, audio: '  ' }).audio).toBeNull()
    expect(contenutoSchema.safeParse({ ...base, audio: 'a'.repeat(201) }).success).toBe(false)
  })

  it('le modifiche portano l’id e la versione letta', () => {
    const versione = '2026-10-09T08:15:42.123456+00:00'
    expect(modificaContenutoSchema.parse({ ...base, id: ID, versione })).toMatchObject({ id: ID, versione })
    expect(modificaContenutoSchema.safeParse({ ...base, id: ID, versione: '' }).success).toBe(false)
    expect(modificaContenutoSchema.safeParse({ ...base, id: ID, versione: 'ieri' }).success).toBe(false)
    expect(modificaContenutoSchema.safeParse({ ...base, id: 'x', versione }).success).toBe(false)
  })

  it('lo Status con un tocco: id e uno Status valido', () => {
    expect(statusContenutoSchema.parse({ id: ID, stato: 'to_be_edited' })).toEqual({ id: ID, stato: 'to_be_edited' })
    expect(statusContenutoSchema.safeParse({ id: ID, stato: 'To be edited' }).success).toBe(false)
  })
})

describe('le sezioni', () => {
  const impronta = 'd41d8cd98f00b204e9800998ecf8427e'

  it('normalizzaSezione: via le righe vuote in testa e gli spazi in coda; il rientro della prima riga resta', () => {
    expect(normalizzaSezione('\n  \n\nNuovo testo  \n\n')).toBe('Nuovo testo')
    expect(normalizzaSezione('\n\tRientro della prima riga\n')).toBe('\tRientro della prima riga')
    expect(normalizzaSezione('   \n  ')).toBeNull()
    expect(normalizzaSezione(null)).toBeNull()
    expect(normalizzaSezione('Riga 1\r\nRiga 2\r\n')).toBe('Riga 1\r\nRiga 2')
  })

  it('l’impronta è un md5 esadecimale minuscolo', () => {
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'finale', testo: 'Ciao', impronta }).success).toBe(true)
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'finale', testo: '', impronta }).success).toBe(true)
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'finale', testo: 'x', impronta: impronta.toUpperCase() }).success).toBe(false)
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'finale', testo: 'x', impronta: 'abc' }).success).toBe(false)
  })

  it('solo le quattro sezioni', () => {
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'nome', testo: 'x', impronta }).success).toBe(false)
  })

  it('al massimo 30.000 caratteri, contati come Postgres dopo la normalizzazione', () => {
    expect(
      sezioneContenutoSchema.safeParse({ id: ID, campo: 'bozza', testo: `${'a'.repeat(30_000)}\n\n  `, impronta }).success,
    ).toBe(true)
    expect(errore(sezioneContenutoSchema.safeParse({ id: ID, campo: 'bozza', testo: 'a'.repeat(30_001), impronta }))).toBe(
      ERRORE_SEZIONE_LUNGA,
    )
    // an emoji is one character for Postgres, two UTF-16 units for JavaScript
    expect(sezioneContenutoSchema.safeParse({ id: ID, campo: 'bozza', testo: '💡'.repeat(30_000), impronta }).success).toBe(
      true,
    )
  })
})
