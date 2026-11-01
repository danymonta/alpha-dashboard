import { getSchema } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'

import { ColoreTesto, ESTENSIONI_MARKDOWN, OPZIONI_MARKED, SfondoTesto } from '@/lib/marketing/editor-markdown'
import { BOZZA_REEL, BOZZA_YOUTUBE } from '@/lib/marketing/etichette'
import { ripristinaIndirizzi } from '@/lib/marketing/link'

/** What the section editor saves for a text it loaded and nobody changed. */
function andataERitorno(testo: string): string {
  const m = new MarkdownManager({ extensions: ESTENSIONI_MARKDOWN, markedOptions: OPZIONI_MARKED })
  // as the editor saves it (markdownDellEditor)
  return ripristinaIndirizzi(m.serialize(m.parse(testo)))
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

/** The editor as it was before the highlighter: a text without colours must come back byte for byte the same. */
function andataERitornoSenzaColori(testo: string): string {
  const senza = ESTENSIONI_MARKDOWN.filter((e) => e !== ColoreTesto && e !== SfondoTesto)
  const m = new MarkdownManager({ extensions: senza, markedOptions: OPZIONI_MARKED })
  return m.serialize(m.parse(testo))
}

describe('editor delle sezioni: i colori dell’evidenziatore (01/11/2026)', () => {
  it('colore del testo e sfondo tornano come sono, anche con grassetto, corsivo, barrato e link', () => {
    const testi = [
      'Un <span data-colore="rosso">testo rosso</span> e <mark data-sfondo="giallo">uno giallo</mark>.',
      'Prima <span data-colore="blu">**forte e blu**</span> poi <mark data-sfondo="verde">*corsivo su verde*</mark>.',
      'prima<span data-colore="rosso">**dentro una parola**</span>dopo',
      '<span data-colore="viola">~~barrato~~</span> e <span data-colore="rosa">[un link](https://esempio.it)</span>',
      '<span data-colore="rosso"><mark data-sfondo="giallo">rosso su giallo</mark></span>',
      '<span data-colore="grigio">a</span><mark data-sfondo="marrone">b</mark><span data-colore="arancione">c</span>',
    ]
    for (const t of testi) expect(andataERitorno(t)).toBe(t)
  })

  it('negli elenchi, negli elenchi annidati e nelle tabelle', () => {
    const elenchi = '- uno <span data-colore="verde">verde</span>\n- due\n  - <mark data-sfondo="rosa">annidato rosa</mark>\n\n1. <span data-colore="blu">primo</span>'
    expect(andataERitorno(elenchi)).toBe(elenchi)
    const tabella = andataERitorno('| a | b |\n| --- | --- |\n| <span data-colore="rosso">1</span> | <mark data-sfondo="giallo">**2**</mark> |')
    expect(tabella).toContain('| <span data-colore="rosso">1</span> ')
    expect(tabella).toContain('| <mark data-sfondo="giallo">**2**</mark> ')
    // and read again it is the same table
    expect(andataERitorno(tabella)).toBe(tabella)
  })

  it('un a capo dentro un colore chiude il colore e lo riapre sulla riga dopo', () => {
    expect(andataERitorno('Hook:\n<span data-colore="rosso">Line uno\nLine due</span>\nCTA:')).toBe(
      'Hook:\n<span data-colore="rosso">Line uno</span>\n<span data-colore="rosso">Line due</span>\nCTA:',
    )
  })

  it('lo span con tutti e due gli attributi si legge e torna come due tag annidati', () => {
    const atteso = '<span data-colore="rosso"><mark data-sfondo="giallo">tutti e due</mark></span>'
    expect(andataERitorno('<span data-colore="rosso" data-sfondo="giallo">tutti e due</span>')).toBe(atteso)
    expect(andataERitorno('<span data-sfondo="giallo" data-colore="rosso">tutti e due</span>')).toBe(atteso)
    // and read twice it does not change any more
    expect(andataERitorno(atteso)).toBe(atteso)
  })

  it('un colore dentro un altro: vince quello interno', () => {
    expect(andataERitorno('<span data-colore="rosso">a <span data-colore="blu">b</span> c</span>')).toBe(
      '<span data-colore="rosso">a</span> <span data-colore="blu">b</span> <span data-colore="rosso">c</span>',
    )
  })

  it('un colore sconosciuto, un attributo in più o un tag senza chiusura restano testo', () => {
    for (const t of [
      '<span data-colore="fucsia">sconosciuto</span>',
      '<span data-colore="Rosso">maiuscolo</span>',
      '<span data-colore=\'rosso\'>apici</span>',
      '<mark data-colore="rosso">colore su mark</mark>',
      '<span data-colore="rosso">senza chiusura',
      '<span style="color:red">stile</span>',
    ]) {
      const fuori = andataERitorno(t)
      // the editor keeps it as text: written back with its «<» escaped, never as one of our tags
      expect(fuori, t).not.toMatch(/<span|<mark/)
      expect(fuori, t).toContain('&lt;')
    }
  })

  it('un <script> o un onclick restano testo, mai un tag', () => {
    for (const t of ['<script>alert(1)</script>', '<span data-colore="rosso" onclick="alert(1)">clic</span>', '<img src=x onerror="alert(1)">']) {
      const fuori = andataERitorno(t)
      expect(fuori, t).not.toMatch(/<(script|span|img)/)
      expect(fuori, t).toContain('&lt;')
    }
  })

  it('un testo scritto con «<» non diventa mai un colore', () => {
    const m = new MarkdownManager({ extensions: ESTENSIONI_MARKDOWN, markedOptions: OPZIONI_MARKED })
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<span data-colore="rosso">x</span>' }] }] }
    const fuori = m.serialize(doc)
    expect(fuori).toBe('&lt;span data-colore="rosso"&gt;x&lt;/span&gt;')
    expect(m.parse(fuori).content?.[0]?.content?.[0]?.marks).toBeUndefined()
  })

  it('un testo senza colori torna identico a prima dell’evidenziatore, byte per byte', () => {
    const testi = [
      BOZZA_REEL,
      BOZZA_YOUTUBE,
      "**Note per l'editor**\n\nPrima e dopo in alto come gancio visivo.\n\n---\n\n## ITALIANO\n\n### Hook\n\nHo preso 20 kg, da casa.",
      '- uno\n- due\n  - due a\n- tre\n\n1. primo\n2. secondo',
      'Testo con *corsivo*, [un link](https://esempio.it), `codice` e ~~barrato~~.',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      'Prima\n\n> una citazione',
      'Show&Tell, a < b e <b>grassetto HTML</b> <span>senza attributi</span>',
      '```\n<span data-colore="rosso">nel codice</span>\n```',
      'Un `<mark data-sfondo="giallo">` in linea',
    ]
    for (const t of testi) expect(andataERitorno(t), t).toBe(andataERitornoSenzaColori(t))
  })
})

describe('editor delle sezioni: i link (01/11/2026, «stile Google Drive»)', () => {
  it('un link scritto [testo](url) torna com’era, anche con titolo, grassetto e colore', () => {
    for (const t of [
      'Vedi [il reel](https://www.instagram.com/reel/ABC_def/) qui',
      '[**forte**](https://esempio.it "titolo")',
      '<span data-colore="rosso">[rosso](https://esempio.it/a_b)</span> fine',
      '[https://esempio.it](https://esempio.it)',
    ])
      expect(andataERitorno(t), t).toBe(t)
  })

  it('un indirizzo nudo resta nudo, senza escape: https, www, tra parentesi angolari, un’email', () => {
    for (const t of [
      'Nudo https://www.instagram.com/reel/ABC_def/ fine',
      'www.esempio.it/a_b fine',
      'https://esempio.it/x*y*z e https://esempio.it/?a=1&b=2',
      'Link <https://esempio.it/a_b> angolari',
      'Scrivi a mail@esempio.it',
      '- https://esempio.it/uno\n- [due](https://esempio.it/due)',
    ])
      expect(andataERitorno(t), t).toBe(t)
  })

  it('un indirizzo nudo diventato altre parole torna come [testo](url)', () => {
    const m = new MarkdownManager({ extensions: ESTENSIONI_MARKDOWN, markedOptions: OPZIONI_MARKED })
    // through the schema, as in the editor: the attributes not given take their default
    const schema = getSchema(ESTENSIONI_MARKDOWN)
    const conLink = (testo: string, attrs: Record<string, unknown>) =>
      schema
        .nodeFromJSON({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: testo, marks: [{ type: 'link', attrs }] }] }],
        })
        .toJSON()
    expect(ripristinaIndirizzi(m.serialize(conLink('clicca_qui', { href: 'https://esempio.it', forma: 'nudo' })))).toBe(
      '[clicca\\_qui](https://esempio.it)',
    )
    // a link made in the editor (typed, pasted): bare while its text is its address
    expect(ripristinaIndirizzi(m.serialize(conLink('https://nuovo.it/a_b', { href: 'https://nuovo.it/a_b' })))).toBe('https://nuovo.it/a_b')
  })
})
