import { describe, expect, it } from 'vitest'

import {
  creaOpzioneSchema,
  eliminaOpzioneSchema,
  modificaOpzioneSchema,
  nomeOpzioneSchema,
  normalizzaNomeOpzione,
} from '@/lib/validation/opzione'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'

function errore(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.error?.issues[0]?.message
}

describe('il nome di un’etichetta', () => {
  it('spazi singoli, nessuno ai bordi: come lo salva il database', () => {
    expect(normalizzaNomeOpzione('  Case   study \n')).toBe('Case study')
    expect(nomeOpzioneSchema.parse('  Case   study ')).toBe('Case study')
  })

  it('da 1 a 60 caratteri, contati come Postgres (code point)', () => {
    expect(errore(nomeOpzioneSchema.safeParse('   '))).toBe('Scrivi il nome dell’etichetta.')
    expect(errore(nomeOpzioneSchema.safeParse(undefined))).toBe('Scrivi il nome dell’etichetta.')
    expect(errore(nomeOpzioneSchema.safeParse(12))).toBe('Scrivi il nome dell’etichetta.')
    expect(nomeOpzioneSchema.safeParse('a'.repeat(60)).success).toBe(true)
    expect(errore(nomeOpzioneSchema.safeParse('a'.repeat(61)))).toBe('Il nome è lungo al massimo 60 caratteri.')
    // 60 emoji are 120 UTF-16 units but 60 characters
    expect(nomeOpzioneSchema.safeParse('😀'.repeat(60)).success).toBe(true)
    expect(nomeOpzioneSchema.safeParse('😀'.repeat(61)).success).toBe(false)
  })
})

describe('creaOpzioneSchema', () => {
  it('il campo è Reel Type o Format; il colore, se c’è, uno dei dieci', () => {
    expect(creaOpzioneSchema.parse({ campo: 'reel_type', nome: ' Case study ' })).toEqual({ campo: 'reel_type', nome: 'Case study' })
    expect(creaOpzioneSchema.parse({ campo: 'formato', nome: 'Meme', colore: 'pink' })).toEqual({ campo: 'formato', nome: 'Meme', colore: 'pink' })
    expect(errore(creaOpzioneSchema.safeParse({ campo: 'stato', nome: 'Meme' }))).toBe('Campo non valido.')
    expect(errore(creaOpzioneSchema.safeParse({ campo: 'formato', nome: 'Meme', colore: 'magenta' }))).toBe(
      'Scegli uno dei colori della lista.',
    )
  })
})

describe('modificaOpzioneSchema', () => {
  it('rinomina e/o ricolora, almeno una delle due', () => {
    expect(modificaOpzioneSchema.parse({ id: ID, nome: 'Nuovo' })).toEqual({ id: ID, nome: 'Nuovo' })
    expect(modificaOpzioneSchema.parse({ id: ID, colore: 'red' })).toEqual({ id: ID, colore: 'red' })
    expect(modificaOpzioneSchema.parse({ id: ID, nome: ' A  b ', colore: 'blue' })).toEqual({ id: ID, nome: 'A b', colore: 'blue' })
    expect(errore(modificaOpzioneSchema.safeParse({ id: ID }))).toBe('Dimmi cosa cambiare: il nome o il colore.')
    expect(errore(modificaOpzioneSchema.safeParse({ id: 'x', nome: 'A' }))).toBe('Etichetta non valida.')
  })

  it('il codice e il campo non si cambiano: non esistono nello schema', () => {
    const letto = modificaOpzioneSchema.parse({ id: ID, nome: 'A', valore: 'altro', campo: 'formato' })
    expect(letto).toEqual({ id: ID, nome: 'A' })
  })
})

describe('eliminaOpzioneSchema', () => {
  it('vuole l’id', () => {
    expect(eliminaOpzioneSchema.parse({ id: ID })).toEqual({ id: ID })
    expect(eliminaOpzioneSchema.safeParse({ id: 'x' }).success).toBe(false)
    expect(eliminaOpzioneSchema.safeParse({}).success).toBe(false)
  })
})
