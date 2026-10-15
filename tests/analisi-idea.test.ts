import { describe, expect, it } from 'vitest'

import { contenutoDaIdea } from '@/lib/marketing/analisi/idea'
import type { IdeaContenuto } from '@/lib/marketing/analisi/tipi'
import { BOZZA_REEL } from '@/lib/marketing/etichette'
import { contenutoSchema } from '@/lib/validation/contenuto'

const IDEA: IdeaContenuto = {
  tipo: 'seguito',
  name: 'Parte 2: la schiena da scrivania',
  reel_type: 'education',
  format: 'raw_talking_head',
  gancio: 'Due ore a settimana bastano',
  messaggio: 'La schiena si allena anche in casa.',
  script: { hook: 'Niente sbarra?', righe: ['Prima riga', 'Seconda riga'], cta: 'Salvalo' },
  perche: 'Il reel ha il doppio dei salvataggi.',
}

describe('contenutoDaIdea', () => {
  it('un Reel Topic Not started senza data, che passa dallo schema del form', () => {
    const { input } = contenutoDaIdea(IDEA, { permalink: 'https://www.instagram.com/reel/SeedPost02/', giorno: '2026-10-03' })
    expect(input).toMatchObject({ tipo: 'reel', nome: IDEA.name, reel_type: 'education', formato: 'raw_talking_head', stato: 'not_started', post_date: null, url: null })
    expect(contenutoSchema.safeParse(input).success).toBe(true)
  })

  it('messaggio col perché, bozza Hook / Line / CTA, commenti con l’origine', () => {
    const { sezioni } = contenutoDaIdea(IDEA, { permalink: 'https://www.instagram.com/reel/SeedPost02/', giorno: '2026-10-03' })
    expect(sezioni.messaggio).toBe('La schiena si allena anche in casa.\n\nPerché: Il reel ha il doppio dei salvataggi.')
    expect(sezioni.bozza).toBe('Hook: Niente sbarra?\nLine: Prima riga\nLine: Seconda riga\nCTA: Salvalo')
    expect(sezioni.commenti).toBe("Idea di Claude dall'analisi del reel del 03/10/2026: https://www.instagram.com/reel/SeedPost02/")
  })

  it('senza perché il messaggio è solo il messaggio; senza giorno la data non c’è', () => {
    const { sezioni } = contenutoDaIdea({ ...IDEA, perche: '' }, { permalink: 'https://x.test/p', giorno: null })
    expect(sezioni.messaggio).toBe(IDEA.messaggio)
    expect(sezioni.commenti).toBe("Idea di Claude dall'analisi del reel: https://x.test/p")
  })

  it('uno script vuoto non lascia una bozza vuota', () => {
    const { sezioni } = contenutoDaIdea({ ...IDEA, script: { hook: '', righe: [], cta: '' } }, { permalink: 'https://x.test/p', giorno: null })
    expect(sezioni.bozza).toBe(BOZZA_REEL)
  })
})
