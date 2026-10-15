import { describe, expect, it } from 'vitest'

import { ICP, ICP_AGGIORNATO_IL } from '@/lib/marketing/icp'

/**
 * The capitalised words of a text that do not open a sentence, a line, a list
 * item, a heading or a quotation: where a first or last name would show up.
 */
function maiuscoleInFrase(testo: string): string[] {
  const trovate: string[] = []
  for (const riga of testo.split('\n')) {
    for (const m of riga.matchAll(/\p{Lu}[\p{L}\p{M}'’-]*/gu)) {
      const prima = riga.slice(0, m.index)
      // what opens the word: spaces, bold, brackets, list and heading marks, quotes
      const apertura = /[\s*«"“(#\-–]*$/u.exec(prima)?.[0] ?? ''
      const resto = prima.slice(0, prima.length - apertura.length)
      const inizio =
        /^\s*(\d+\.)?\s*$/u.test(resto) || // the line, a list item or a numbered item
        /[.!?:;·»]$/u.test(resto) || // after the end of a sentence or a separator
        /[«"“]/u.test(apertura) // a quotation opens
      if (!inizio) trovate.push(m[0])
    }
  }
  return trovate
}

/**
 * Names that are not people: the business and its owner (Dany is the public
 * face of Percorso Alpha, its posts are his), the app's own words, the stages
 * of the funnel, a social app and a cartoon character quoted by a client.
 */
const AMMESSE = new Set([
  'Dany',
  'Percorso',
  'Alpha',
  'ICP',
  'IVA',
  'AI',
  'DM',
  'TOF',
  'MOF',
  'BOF',
  'Telegram',
  'Instagram',
  'Punto',
  'A',
  'B',
  'Goku',
])

describe('l’ICP per Claude (10/10/2026)', () => {
  it('è il profilo intero, in Markdown, con le parole dei clienti e le indicazioni per i contenuti', () => {
    expect(ICP_AGGIORNATO_IL).toBe('2026-10-10')
    expect(ICP.startsWith('# Profilo del cliente ideale di Percorso Alpha (ICP)')).toBe(true)
    for (const titolo of [
      '## Identikit',
      '## Il passato e il punto di rottura',
      '## Punto A',
      '## Pain profondi',
      '## Desideri (Punto B e identità)',
      '## Cosa ha già provato e perché è fallito',
      '## Perché sceglie Dany',
      "## Cosa lo convince nell'offerta",
      '## Obiezioni tipiche e gestione che funziona',
      '## Linguaggio del cliente (da usare nei contenuti)',
      '## Segnali in DM e in call',
      '## Indicazioni per i contenuti',
    ]) {
      expect(ICP, titolo).toContain(`\n${titolo}\n`)
    }
    expect(ICP).toContain('**fit, non grosso**')
    expect(ICP).toContain('Nessuno vuole il fisico da bodybuilder.')
    expect(ICP).toContain('«Un babbo atletico, sul pezzo.»')
    expect(ICP).toContain('tempistiche oneste (6 mesi per un vero cambiamento, 12 per il pectus)')
    expect(ICP).toBe(ICP.trim())
  })

  it('nessun nome o cognome: le maiuscole a metà frase sono solo nomi di prodotto e del brand', () => {
    expect(maiuscoleInFrase(ICP).filter((p) => !AMMESSE.has(p))).toEqual([])
  })

  it('la rete prende davvero un nome a metà frase o dopo una virgola', () => {
    expect(maiuscoleInFrase('Ne ho parlato con Marco Rossi ieri.')).toEqual(['Marco', 'Rossi'])
    expect(maiuscoleInFrase('- Fisico: magro, Luca dice «Sono stanco».')).toEqual(['Luca'])
    // the starts of a line, a sentence, an item and a quotation are not names
    expect(maiuscoleInFrase('## Punto\n1. Togliersi la maglia. Poi «Sono io» · «Basta»')).toEqual([])
  })

  it('nessun numero di telefono, email o account', () => {
    const senzaDate = ICP.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '')
    expect(senzaDate).not.toMatch(/\+?\d(?:[\s./-]?\d){7,}/)
    expect(ICP).not.toContain('@')
    expect(ICP).not.toMatch(/https?:|www\./)
  })

  it('niente prezzi né condizioni di pagamento: video editor e marketing non leggono il listino', () => {
    expect(ICP).not.toMatch(/€|\beuro\b|\brat[ae]\b|caparra|acconto|rimbors|listino/i)
  })

  it('niente trattini lunghi', () => {
    expect(ICP).not.toContain('—')
  })
})
