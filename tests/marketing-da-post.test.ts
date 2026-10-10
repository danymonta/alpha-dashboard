import { describe, expect, it } from 'vitest'

import { contenutoDaPost, nomeDaDidascalia, NOME_DA_POST_MAX } from '@/lib/marketing/da-post'
import { contenutoSchema } from '@/lib/validation/contenuto'

// Invented posts and captions.
const REEL = {
  media_type: 'VIDEO',
  reel: true,
  // 20:30 in Rome
  pubblicato_il: '2026-10-03T18:30:00Z',
  permalink: 'https://www.instagram.com/reel/ProvaReel01/',
  didascalia: 'Niente sbarra? Nessun problema.\nTre alternative con quello che hai in casa.\n#schiena #allenamentoacasa',
}

describe('il contenuto nato da un post', () => {
  it('Name dalla prima riga, Status Posted, Post Date di Roma, URL il permalink, il resto vuoto', () => {
    expect(contenutoDaPost(REEL)).toEqual({
      tipo: 'reel',
      nome: 'Niente sbarra? Nessun problema.',
      stato: 'posted',
      post_date: '2026-10-03',
      url: REEL.permalink,
      reel_type: null,
      formato: null,
      inspiration: null,
      audio: null,
      view_count: null,
    })
  })

  it('passa contenutoSchema, senza la bozza del reel', () => {
    const parsed = contenutoSchema.safeParse(contenutoDaPost(REEL))
    expect(parsed.success).toBe(true)
    expect(parsed.data).not.toHaveProperty('bozza')
  })

  it('hashtag, menzioni e link si tolgono; una riga di soli hashtag si salta', () => {
    expect(nomeDaDidascalia('#reel #fitness\n@coach.alpha guarda https://alpha.it questo   esercizio 💪')).toBe(
      'guarda questo esercizio 💪',
    )
    expect(nomeDaDidascalia('#solo #tag\n\n@nome')).toBeNull()
    expect(nomeDaDidascalia('')).toBeNull()
    expect(nomeDaDidascalia(null)).toBeNull()
  })

  it('al massimo 120 caratteri, tagliati a parola con «…»', () => {
    const lunga = `${'parola '.repeat(40)}fine`
    const nome = nomeDaDidascalia(lunga) ?? ''
    expect([...nome].length).toBeLessThanOrEqual(NOME_DA_POST_MAX)
    expect(nome.endsWith('parola…')).toBe(true)
    // one word longer than the limit: cut inside it
    const parola = nomeDaDidascalia('x'.repeat(300)) ?? ''
    expect([...parola].length).toBe(NOME_DA_POST_MAX)
    expect(parola.endsWith('…')).toBe(true)
  })

  it('senza didascalia: «Reel del …» o «Post del …»', () => {
    expect(contenutoDaPost({ ...REEL, didascalia: null }).nome).toBe('Reel del 03/10/2026')
    expect(
      contenutoDaPost({ ...REEL, media_type: 'CAROUSEL_ALBUM', reel: false, permalink: 'https://www.instagram.com/p/ProvaPost01/', didascalia: '#tag' })
        .nome,
    ).toBe('Post del 03/10/2026')
  })

  it('il tipo per ogni media: reel e video Reel Topic, carosello e foto Carousel Topic', () => {
    expect(contenutoDaPost({ ...REEL, media_type: 'VIDEO', reel: true }).tipo).toBe('reel')
    expect(contenutoDaPost({ ...REEL, media_type: 'VIDEO', reel: false }).tipo).toBe('reel')
    expect(contenutoDaPost({ ...REEL, media_type: 'CAROUSEL_ALBUM', reel: false }).tipo).toBe('carousel')
    expect(contenutoDaPost({ ...REEL, media_type: 'IMAGE', reel: false }).tipo).toBe('carousel')
  })

  it('il giorno di Roma: le 00:30 del 04/10 sono il 04/10', () => {
    expect(contenutoDaPost({ ...REEL, pubblicato_il: '2026-10-03T22:30:00Z' }).post_date).toBe('2026-10-04')
  })
})
