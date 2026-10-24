import { describe, expect, it } from 'vitest'

import {
  BOZZA_REEL,
  CAMPI,
  CAMPO_MODELLO,
  COLONNE_PIANO,
  COLORE_STATUS,
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
  bozzaIniziale,
  canaleDiTipo,
  colonneDelCanale,
  gruppoDiStatus,
  sezioniVisibili,
  valoreDaEtichetta,
} from '@/lib/marketing/etichette'
import { tipiCompatibili } from '@/lib/marketing/abbinamento'
import { filtriDaParametri, haFiltri, soloCanale } from '@/lib/marketing/filtri'
import { Constants } from '@/lib/supabase/database.types'

// Notion's "📸 Instagram Posts DANYMONTA", checked on 09/10/2026
describe('le etichette di Notion', () => {
  it('Reel Type, Format e Status hanno le opzioni di Notion, nel suo ordine', () => {
    // Reel Type and Format are the labels of marketing_opzioni since 21/10/2026: here the starting names
    expect(Object.values(ETICHETTA_REEL_TYPE)).toEqual(['Attraction', 'Education', 'Converting', 'RADIO', 'Workshop'])
    expect(Object.values(ETICHETTA_FORMAT)).toEqual([
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

  it('ogni valore degli enum del database ha la sua etichetta; i codici di partenza di Reel Type e Format sono quelli dei vecchi enum', () => {
    for (const v of Constants.public.Enums.contenuto_status) expect(ETICHETTA_STATUS[v]).toBeTruthy()
    for (const v of Constants.public.Enums.contenuto_tipo) expect(ETICHETTA_MODELLO[v]).toBeTruthy()
    expect(Object.keys(ETICHETTA_STATUS)).toHaveLength(Constants.public.Enums.contenuto_status.length)
    // the slugs the contents already had (migration 20261009120100) stay the same
    expect(Object.keys(ETICHETTA_REEL_TYPE)).toEqual(['attraction', 'education', 'converting', 'radio', 'workshop'])
    expect(Object.keys(ETICHETTA_FORMAT)).toEqual([
      'text_opinion',
      'check_caption',
      'split',
      'reaction',
      'b_roll',
      'green_screen',
      'raw_talking_head',
      'storytelling',
      'transformation',
      'show_and_tell',
    ])
  })

  it('ogni Status ha il suo colore, quelli degli screenshot di Notion', () => {
    expect(COLORE_STATUS).toEqual({
      not_started: 'gray',
      to_be_recorded: 'blue',
      to_be_edited: 'purple',
      to_be_posted: 'orange',
      posted: 'green',
      canceled: 'red',
    })
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

  it('i modelli hanno i nomi dei template di Notion, più YouTube Video', () => {
    expect(ETICHETTA_MODELLO).toEqual({ reel: 'Reel Topic', carousel: 'Carousel Topic', youtube: 'YouTube Video' })
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

describe('YouTube nel Piano editoriale (24/10/2026)', () => {
  it('un video YouTube non ha Format, ha tutte e quattro le sezioni e uno script iniziale', () => {
    expect(colonneDelCanale('youtube')).not.toContain('formato')
    expect(colonneDelCanale('reels')).toEqual(COLONNE_PIANO)
    expect(COLONNE_PIANO).toContain('inspiration')
    expect(sezioniVisibili('youtube', { messaggio: null, bozza: null, commenti: null, finale: null })).toEqual(ORDINE_SEZIONI)
    expect(bozzaIniziale('youtube')).toMatch(/^Hook:/)
    expect(bozzaIniziale('carousel')).toBeNull()
    expect(canaleDiTipo('youtube')).toBe('youtube')
    expect(canaleDiTipo('carousel')).toBe('reels')
  })

  it('un video YouTube non si abbina mai a un post di Instagram', () => {
    for (const post of ['reel', 'carousel', 'foto'] as const) expect(tipiCompatibili(post, 'youtube')).toBe(false)
    expect(tipiCompatibili('reel', 'reel')).toBe(true)
  })

  it('la scheda YouTube sta nell’indirizzo e «Togli i filtri» la tiene', () => {
    const f = filtriDaParametri({ canale: 'youtube', q: 'trazioni' })
    expect(f).toEqual({ canale: 'youtube', q: 'trazioni' })
    expect(haFiltri({ canale: 'youtube' })).toBe(false)
    expect(soloCanale(f)).toEqual({ canale: 'youtube' })
    expect(filtriDaParametri({ canale: 'tiktok' })).toEqual({})
  })
})
