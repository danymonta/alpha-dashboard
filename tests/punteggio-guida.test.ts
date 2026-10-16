import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { GUIDA_AGGIORNATA_IL, GUIDA_CONTESTO, GUIDA_LINEE, GUIDA_SCORING, guidaCompleta } from '@/lib/marketing/punteggio/guida'
import { SISTEMA_PUNTEGGIO, sistemaPunteggio } from '@/lib/marketing/punteggio/prompt'
import { ICP } from '@/lib/marketing/icp'

// Editors and marketing read this guide through Claude and never read the price list (CLAUDE.md sections 6 and 26):
// not a price, a payment term or an income figure may be in it, nor in the prompt that carries it.

describe('la guida nel codice', () => {
  const tutto = guidaCompleta()

  it('non ha prezzi, importi, condizioni di pagamento né redditi', () => {
    expect(tutto).not.toMatch(/euro/i)
    expect(tutto).not.toContain('€')
    expect(tutto).not.toMatch(/rate da/i)
    expect(tutto).not.toMatch(/\d\s*(euro|eur|€)/i)
    expect(tutto).not.toMatch(/reddito/i)
  })

  it('il prompt che la porta non ha prezzi nemmeno lui', () => {
    const sistema = sistemaPunteggio()[0].text
    expect(SISTEMA_PUNTEGGIO).not.toMatch(/euro|€/i)
    // the ICP is the app's anonymous one, the same file: no price there either
    expect(ICP).not.toMatch(/\d\s*(euro|€)/i)
    expect(sistema).not.toMatch(/\d\s*(euro|€)/i)
    expect(sistema).not.toMatch(/rate da/i)
  })

  it('non ha nomi di allievi né dell’head coach', () => {
    expect(tutto).not.toMatch(/\bAndrea\b/)
    expect(tutto).not.toMatch(/\bIvan\b/)
  })

  it('ha le tre parti: contesto, linee guida e scoring, e il tono di Dany', () => {
    expect(GUIDA_CONTESTO).toContain('Percorso Alpha')
    expect(GUIDA_CONTESTO).toContain('<icp>')
    expect(GUIDA_LINEE).toContain('## 4. Tono di voce di Dany')
    expect(GUIDA_LINEE).toContain('## 12. Regole delle CTA')
    expect(GUIDA_SCORING).toContain('## 21. Tabelle pesi per tipo di contenuto')
    expect(GUIDA_SCORING).toContain('## 23. Penalità e limiti')
    expect(GUIDA_SCORING).toContain('## 26. Protocollo di rifacimento')
    expect(tutto).toContain('Non è solo fisico. È sicurezza personale.')
  })

  it('il cliente ideale non è copiato: c’è solo il rimando al file unico', () => {
    expect(tutto).not.toContain('Pain ricorrenti')
    expect(tutto).not.toContain('Tre cause radice')
    expect(GUIDA_CONTESTO).toContain('vale l\'ICP')
  })

  it('la guida non chiede il JSON dell’originale: lo schema è quello della richiesta', () => {
    expect(GUIDA_SCORING).not.toContain('"totale_grezzo"')
    expect(GUIDA_SCORING).toContain('non calcolare totali')
  })

  it('porta il giorno in cui il testo è stato scritto', () => {
    expect(GUIDA_AGGIORNATA_IL).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('il sistema è sempre lo stesso: niente giorni, niente reel, nessun dato', () => {
    expect(sistemaPunteggio()).toEqual(sistemaPunteggio())
    expect(sistemaPunteggio()[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(sistemaPunteggio()[0].text).toContain('<guida>')
    expect(sistemaPunteggio()[0].text).toContain('<icp>')
  })
})
