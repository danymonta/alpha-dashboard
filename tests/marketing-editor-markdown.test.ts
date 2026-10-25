import { MarkdownManager } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'

import { ESTENSIONI_MARKDOWN, OPZIONI_MARKED } from '@/lib/marketing/editor-markdown'
import { BOZZA_REEL, BOZZA_YOUTUBE } from '@/lib/marketing/etichette'

/** What the section editor saves for a text it loaded and nobody changed. */
function andataERitorno(testo: string): string {
  const m = new MarkdownManager({ extensions: ESTENSIONI_MARKDOWN, markedOptions: OPZIONI_MARKED })
  return m.serialize(m.parse(testo))
}

describe('editor delle sezioni: il Markdown torna com’era (24/10/2026)', () => {
  it('un a capo resta un solo «\\n», mai i due spazi del Markdown', () => {
    expect(andataERitorno(BOZZA_REEL)).toBe(BOZZA_REEL)
    expect(andataERitorno(BOZZA_YOUTUBE)).toBe(BOZZA_YOUTUBE)
  })

  it('grassetto, titoli, separatori ed elenchi annidati restano uguali', () => {
    const testi = [
      "**Note per l'editor**\n\nPrima e dopo in alto come gancio visivo.\n\n---\n\n## ITALIANO\n\n### Hook\n\nHo preso 20 kg, da casa.",
      '- uno\n- due\n  - due a\n- tre\n\n1. primo\n2. secondo',
      'Testo con *corsivo*, [un link](https://esempio.it), `codice` e ~~barrato~~.',
    ]
    for (const t of testi) expect(andataERitorno(t)).toBe(t)
  })

  it('una tabella e una citazione non si perdono', () => {
    expect(andataERitorno('| a | b |\n| --- | --- |\n| 1 | 2 |')).toMatch(/\| 1 +\| 2 +\|/)
    expect(andataERitorno('Prima\n\n> una citazione')).toBe('Prima\n\n> una citazione')
  })
})
