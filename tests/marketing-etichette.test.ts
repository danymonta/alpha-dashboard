import { describe, expect, it } from 'vitest'

import {
  BOZZA_REEL,
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_COLONNE,
  ORDINE_GRUPPI,
  ORDINE_SEZIONI,
  SEZIONI,
  gruppoDiStatus,
  sezioniVisibili,
  valoreDaEtichetta,
} from '@/lib/marketing/etichette'
import { Constants } from '@/lib/supabase/database.types'

// Notion's "📸 Instagram Posts DANYMONTA", checked on 09/10/2026
describe('le etichette di Notion', () => {
  it('Reel Type, Format e Status hanno le opzioni di Notion, nel suo ordine', () => {
    expect(Constants.public.Enums.contenuto_reel_type.map((v) => ETICHETTA_REEL_TYPE[v])).toEqual([
      'Attraction',
      'Education',
      'Converting',
      'RADIO',
      'Workshop',
    ])
    expect(Constants.public.Enums.contenuto_format.map((v) => ETICHETTA_FORMAT[v])).toEqual([
      'Text opinion',
      'Check Caption',
      'Split',
      'Reaction',
      'B roll',
      'Green Screen',
      'Raw Talking Head',
      'Storytelling',
      'Transformation',
      'Show&Tell',
    ])
    expect(Constants.public.Enums.contenuto_status.map((v) => ETICHETTA_STATUS[v])).toEqual([
      'Not started',
      'To be recorded',
      'To be edited',
      'To be posted',
      'Posted',
      'Canceled',
    ])
  })

  it('ogni valore degli enum del database ha la sua etichetta', () => {
    for (const v of Constants.public.Enums.contenuto_reel_type) expect(ETICHETTA_REEL_TYPE[v]).toBeTruthy()
    for (const v of Constants.public.Enums.contenuto_format) expect(ETICHETTA_FORMAT[v]).toBeTruthy()
    for (const v of Constants.public.Enums.contenuto_status) expect(ETICHETTA_STATUS[v]).toBeTruthy()
    for (const v of Constants.public.Enums.contenuto_tipo) expect(ETICHETTA_MODELLO[v]).toBeTruthy()
    expect(Object.keys(ETICHETTA_REEL_TYPE)).toHaveLength(Constants.public.Enums.contenuto_reel_type.length)
    expect(Object.keys(ETICHETTA_FORMAT)).toHaveLength(Constants.public.Enums.contenuto_format.length)
    expect(Object.keys(ETICHETTA_STATUS)).toHaveLength(Constants.public.Enums.contenuto_status.length)
  })

  it('i gruppi di Status sono quelli di Notion: ogni Status una volta, nel loro ordine', () => {
    expect(ORDINE_GRUPPI.map((g) => ETICHETTA_GRUPPO[g])).toEqual(['To-do', 'In progress', 'Complete'])
    expect(ORDINE_GRUPPI.flatMap((g) => GRUPPI_STATUS[g].map((s) => ETICHETTA_STATUS[s]))).toEqual([
      'Canceled',
      'Not started',
      'To be posted',
      'To be edited',
      'To be recorded',
      'Posted',
    ])
    const tutti = ORDINE_GRUPPI.flatMap((g) => GRUPPI_STATUS[g])
    expect(new Set(tutti).size).toBe(tutti.length)
    expect([...tutti].sort()).toEqual([...Constants.public.Enums.contenuto_status].sort())
    for (const g of ORDINE_GRUPPI) for (const s of GRUPPI_STATUS[g]) expect(gruppoDiStatus(s)).toBe(g)
  })

  it('i modelli hanno i nomi dei template di Notion', () => {
    expect(ETICHETTA_MODELLO).toEqual({ reel: 'Reel Topic', carousel: 'Carousel Topic' })
    expect(CAMPO_MODELLO).toBe('Modello')
  })

  it('le colonne sono quelle della vista tabella di Notion, con i nomi di Notion', () => {
    expect(ORDINE_COLONNE.map((c) => CAMPI[c])).toEqual([
      'Name',
      'Reel Type',
      'Format',
      'Inspiration',
      'Status',
      'Post Date',
      'Audio',
      'URL',
      'View Count',
    ])
  })

  it('le sezioni hanno i titoli dei due template', () => {
    expect(ORDINE_SEZIONI.map((s) => SEZIONI.reel[s])).toEqual([
      'Topic / Main Message',
      'Script (Rough Draft)',
      'Comments',
      'Script (Final)',
    ])
    expect(ORDINE_SEZIONI.map((s) => SEZIONI.carousel[s])).toEqual(['Idea/Message', 'Carousel', 'Comments', 'Caption'])
  })

  it('un reel nasce con Hook, Line, Line, CTA, una riga ciascuno', () => {
    expect(BOZZA_REEL.split('\n')).toEqual(['Hook:', 'Line:', 'Line:', '…', 'CTA:'])
  })
})

describe('sezioniVisibili', () => {
  const vuote = { messaggio: null, bozza: null, commenti: null, finale: null }

  it('un reel mostra sempre le quattro sezioni', () => {
    expect(sezioniVisibili('reel', vuote)).toEqual(['messaggio', 'bozza', 'commenti', 'finale'])
  })

  it('un carosello mostra «Comments» solo quando ha del testo (Carousel Topic non lo ha)', () => {
    expect(sezioniVisibili('carousel', vuote)).toEqual(['messaggio', 'bozza', 'finale'])
    expect(sezioniVisibili('carousel', { ...vuote, commenti: '  \n ' })).toEqual(['messaggio', 'bozza', 'finale'])
    expect(sezioniVisibili('carousel', { ...vuote, commenti: 'Da rivedere' })).toEqual([
      'messaggio',
      'bozza',
      'commenti',
      'finale',
    ])
  })
})

describe('valoreDaEtichetta', () => {
  it('prima l’etichetta esatta, poi senza maiuscole; spazi tolti', () => {
    expect(valoreDaEtichetta(ETICHETTA_REEL_TYPE, 'RADIO')).toBe('radio')
    expect(valoreDaEtichetta(ETICHETTA_REEL_TYPE, 'radio')).toBe('radio')
    expect(valoreDaEtichetta(ETICHETTA_FORMAT, ' Show&Tell ')).toBe('show_and_tell')
    expect(valoreDaEtichetta(ETICHETTA_FORMAT, 'b roll')).toBe('b_roll')
    expect(valoreDaEtichetta(ETICHETTA_STATUS, 'To be recorded')).toBe('to_be_recorded')
  })

  it('un’etichetta sconosciuta o vuota non indovina niente', () => {
    expect(valoreDaEtichetta(ETICHETTA_FORMAT, 'Show & Tell')).toBeNull()
    expect(valoreDaEtichetta(ETICHETTA_STATUS, 'Done')).toBeNull()
    expect(valoreDaEtichetta(ETICHETTA_STATUS, '  ')).toBeNull()
  })
})
