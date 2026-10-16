import { describe, expect, it } from 'vitest'

import { contenutoDaRifacimento, haRifacimento, INDICE_RIFACIMENTO } from '@/lib/marketing/punteggio/rifacimento'
import { contenutoSchema } from '@/lib/validation/contenuto'
import type { PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'

const P = {
  tipo: 'mof',
  totale: 63,
  rifacimento: {
    istruzioni: ['Aprire col risultato.', 'Portare la CTA prima.'],
    hook_alternativi: [
      { testo: 'Schiena forte senza sbarra.', categoria: 'Educational', perche_funziona: 'x' },
      { testo: 'Il tavolo batte la sbarra.', categoria: 'Mito', perche_funziona: 'y' },
    ],
    script_riscritto: 'Hook: Schiena forte senza sbarra. (Dany al tavolo)\nBody: Il primo è il tavolo.\nCTA: Provalo stasera.',
    caption_riscritta: 'Scrivimi METODO.',
    punteggio_atteso: 85,
  },
} as unknown as PunteggioContenuto

describe('il rifacimento come contenuto del calendario', () => {
  const r = contenutoDaRifacimento(P, { nome: 'Schiena da scrivania', permalink: 'https://www.instagram.com/reel/AbC123/', pubblicato_il: '2026-10-03T10:00:00Z', formato: 'raw_talking_head' })

  it('è un Reel Topic Not started, senza data, col Reel Type della fase', () => {
    expect(r.input).toMatchObject({ tipo: 'reel', nome: 'Rifacimento: Schiena da scrivania', reel_type: 'education', formato: 'raw_talking_head', stato: 'not_started', post_date: null, url: null })
    expect(contenutoSchema.safeParse(r.input).success).toBe(true)
    expect(contenutoDaRifacimento({ ...P, tipo: 'tof' }, { nome: 'x', permalink: 'https://www.instagram.com/reel/a/', pubblicato_il: null }).input.reel_type).toBe('attraction')
    expect(contenutoDaRifacimento({ ...P, tipo: 'bof' }, { nome: 'x', permalink: 'https://www.instagram.com/reel/a/', pubblicato_il: null }).input.reel_type).toBe('converting')
  })

  it('lo script va nella bozza così com’è; istruzioni, hook e origine nelle altre sezioni', () => {
    expect(r.sezioni.bozza).toBe(P.rifacimento.script_riscritto)
    expect(r.sezioni.messaggio).toContain('punteggio 63 su 100')
    expect(r.sezioni.messaggio).toContain('1. Aprire col risultato.')
    expect(r.sezioni.commenti).toContain('Caption: Scrivimi METODO.')
    expect(r.sezioni.commenti).toContain('- Schiena forte senza sbarra. (Educational)')
    expect(r.sezioni.commenti).toContain('Punteggio atteso dopo il rifacimento: 85.')
    expect(r.sezioni.commenti).toContain('https://www.instagram.com/reel/AbC123/')
    expect(r.sezioni.messaggio).toContain('03/10/2026')
  })

  it('un nome lungo si taglia ai 300 caratteri del Name', () => {
    const lungo = contenutoDaRifacimento(P, { nome: 'x'.repeat(400), permalink: 'https://www.instagram.com/reel/a/', pubblicato_il: null })
    expect(lungo.input.nome.length).toBe(300)
  })

  it('il rifacimento c’è solo con uno script', () => {
    expect(haRifacimento(P)).toBe(true)
    expect(haRifacimento({ rifacimento: { ...P.rifacimento, script_riscritto: '  ' } })).toBe(false)
    expect(haRifacimento(null)).toBe(false)
    expect(INDICE_RIFACIMENTO).toBe(9)
  })
})
