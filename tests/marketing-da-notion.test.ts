import { describe, expect, it } from 'vitest'

import {
  diventaCodice,
  dividiPerFile,
  markdownPulito,
  nomiFile,
  paginaInRiga,
  paroleMancanti,
  problemiImport,
  sezioniDaMarkdown,
  sqlImportContenuti,
  tipoDaPagina,
  uuidNotion,
  type PaginaNotion,
  type RigaImport,
} from '@/lib/marketing/da-notion'
import { BOZZA_REEL } from '@/lib/marketing/etichette'

// Invented pages in the shape notion-fetch gives (CLAUDE.md, section 26):
// tabs for nesting, <callout>, toggles, <empty-block/>, mentions, media.
// No real name, username or text.

const ID = '0a1b2c3d4e5f40718293a4b5c6d7e8f9'
const ID_UUID = '0a1b2c3d-4e5f-4071-8293-a4b5c6d7e8f9'

/** The Reel Topic template, filled in */
const REEL = [
  '# Topic / Main Message',
  '---',
  '<callout icon="💡" color="gray_bg">',
  '\tAllenarsi a casa dopo i 30 **funziona**<br>anche senza attrezzi',
  '</callout>',
  '<empty-block/>',
  '### Script (Rough Draft) {toggle="true"}',
  '\tHook: Non ti serve una palestra',
  '\tLine: Bastano 20 minuti',
  '\tLine: Tre volte a settimana',
  '\t…',
  '\tCTA: Scrivimi CASA',
  '### Comments {toggle="true"}',
  '\tAccorciare la seconda riga',
  '### Script (Final) {toggle="true"}',
  '\tNon ti serve una palestra.',
  '\tBastano 20 minuti, tre volte a settimana.',
].join('\n')

function pagina(campi: Partial<PaginaNotion> & { proprieta?: Record<string, unknown> } = {}): PaginaNotion {
  return {
    id: ID,
    createdTime: '2026-09-01T08:30:00.000Z',
    icona: 'movie_purple',
    markdown: REEL,
    ...campi,
    proprieta: {
      Name: 'Allenarsi a casa dopo i 30',
      Status: 'Posted',
      'Reel Type': 'Education',
      Format: 'Raw Talking Head',
      'date:Post Date:start': '2026-09-02',
      'date:Post Date:is_datetime': 0,
      url: `https://www.notion.so/${ID}`,
      ...campi.proprieta,
    },
  }
}

function ok(p: PaginaNotion) {
  const esito = paginaInRiga(p)
  if (!esito.ok) throw new Error(`pagina rifiutata: ${esito.motivi.join('; ')}`)
  return esito
}

function motivi(p: PaginaNotion): string[] {
  const esito = paginaInRiga(p)
  if (esito.ok) throw new Error('la pagina doveva essere rifiutata')
  return esito.motivi
}

describe('le sezioni dei modelli', () => {
  it('Reel Topic: il callout è il messaggio, i tre toggle bozza, commenti e finale', () => {
    const { sezioni } = sezioniDaMarkdown(REEL)
    expect(sezioni).toEqual({
      messaggio: 'Allenarsi a casa dopo i 30 **funziona**\nanche senza attrezzi',
      bozza:
        'Hook: Non ti serve una palestra\nLine: Bastano 20 minuti\nLine: Tre volte a settimana\n…\nCTA: Scrivimi CASA',
      commenti: 'Accorciare la seconda riga',
      finale: 'Non ti serve una palestra.\nBastano 20 minuti, tre volte a settimana.',
    })
  })

  it('il modello Hook/Line/CTA mai toccato resta com’è; un callout vuoto e un toggle vuoto sono null', () => {
    const md = [
      '# Topic / Main Message',
      '---',
      '<callout icon="💡" color="gray_bg">',
      '\t<empty-block/>',
      '</callout>',
      '### Script (Rough Draft) {toggle="true"}',
      '\tHook:',
      '\tLine:',
      '\tLine:',
      '\t…',
      '\tCTA:',
      '### Comments {toggle="true"}',
      '### Script (Final) {toggle="true"}',
    ].join('\n')
    expect(sezioniDaMarkdown(md).sezioni).toEqual({ messaggio: null, bozza: BOZZA_REEL, commenti: null, finale: null })
  })

  it('Carousel Topic, con i toggle come <details>: Carousel è la bozza, Caption il finale', () => {
    const md = [
      '# Idea/Message',
      '---',
      '<callout icon="💡">',
      '\tTre errori negli addominali',
      '</callout>',
      '<details color="gray">',
      '<summary>Carousel</summary>',
      '\t1. Copertina',
      '\t2. Errore uno',
      '</details>',
      '<details>',
      '<summary>Caption</summary>',
      '\tSalva il post',
      '</details>',
    ].join('\n')
    expect(sezioniDaMarkdown(md).sezioni).toEqual({
      messaggio: 'Tre errori negli addominali',
      bozza: '1. Copertina\n2. Errore uno',
      commenti: null,
      finale: 'Salva il post',
    })
  })

  it('i nomi che usano le pagine vere: Rough Draft, Final Draft, H1 di qualsiasi livello come toggle', () => {
    const md = [
      '## Rough Draft {toggle="true" color="blue"}',
      '\tBozza',
      '#### Final Draft {toggle="true"}',
      '\tFinale',
    ].join('\n')
    expect(sezioniDaMarkdown(md).sezioni).toMatchObject({ messaggio: null, bozza: 'Bozza', finale: 'Finale' })
  })

  it('una pagina senza H1: il callout e il testo libero vanno nel messaggio', () => {
    const md = ['Testo libero sopra', '<callout icon="💡">', '\tIl messaggio', '</callout>'].join('\n')
    expect(sezioniDaMarkdown(md).sezioni.messaggio).toBe('Testo libero sopra\nIl messaggio')
  })

  it('un H1 che non è quello del modello resta, e il --- sotto l’H1 se ne va', () => {
    const md = ['# Il vero titolo', '---', 'Corpo'].join('\n')
    expect(sezioniDaMarkdown(md).sezioni.messaggio).toBe('# Il vero titolo\nCorpo')
  })

  it('un altro toggle va nel messaggio sotto il suo nome, dopo il testo libero', () => {
    const md = [
      '<callout icon="💡">',
      '\tIl messaggio',
      '</callout>',
      '### Versione inglese {toggle="true"}',
      '\tEnglish version',
      'Testo libero in fondo',
    ].join('\n')
    expect(sezioniDaMarkdown(md).sezioni.messaggio).toBe(
      'Il messaggio\nTesto libero in fondo\n\n### Versione inglese\nEnglish version',
    )
  })

  it('«Idea/Message» fatto toggle: il suo testo apre il messaggio, senza titolo', () => {
    const md = ['## Idea/Message {toggle="true"}', '\tL’idea', 'Altro testo'].join('\n')
    expect(sezioniDaMarkdown(md).sezioni.messaggio).toBe('L’idea\n\nAltro testo')
    expect(paroleMancanti(md, sezioniDaMarkdown(md).sezioni, ['Idea/Message'])).toBe(0)
  })

  it('un secondo toggle della stessa sezione segue sotto il suo nome', () => {
    const md = ['### Script (Final) {toggle="true"}', '\tPrimo', '### Caption {toggle="true"}', '\tSecondo'].join('\n')
    expect(sezioniDaMarkdown(md).sezioni.finale).toBe('Primo\n\n### Caption\n\nSecondo')
  })

  it('un toggle dentro il callout perde due livelli e va nella sua sezione', () => {
    const md = [
      '<callout icon="💡">',
      '\tIdea',
      '\t### Script (Final) {toggle="true"}',
      '\t\tPrima riga',
      '\t\t- punto',
      '\t\t\t- sotto punto',
      '\t\t\t\tTesto sotto il sotto punto',
      '\t\tUltima riga',
      '</callout>',
    ].join('\n')
    const { sezioni } = sezioniDaMarkdown(md)
    expect(sezioni.messaggio).toBe('Idea')
    expect(sezioni.finale).toBe('Prima riga\n\n- punto\n  - sotto punto\n    Testo sotto il sotto punto\n\nUltima riga')
    expect(diventaCodice(sezioni.finale!)).toBe(false)
  })
})

describe('pulizia del Markdown di Notion', () => {
  it('<br> va a capo, <br><br> lascia una riga vuota; dentro un elenco resta nella voce', () => {
    expect(markdownPulito('Uno<br>due<br><br>tre')).toBe('Uno\ndue\n\ntre')
    expect(markdownPulito('- voce<br>seguito')).toBe('- voce\n  seguito')
  })

  it('le menzioni diventano il loro testo; le date dd/MM/yyyy, con l’ora di Roma', () => {
    expect(
      markdownPulito(
        'Con <mention-user url="user://abc">Persona Inventata</mention-user> su <mention-page url="https://www.notion.so/x">Pagina inventata</mention-page>',
      ),
    ).toBe('Con Persona Inventata su Pagina inventata')
    expect(markdownPulito('Il <mention-date start="2026-09-02"/>')).toBe('Il 02/09/2026')
    expect(markdownPulito('Dal <mention-date start="2026-09-02" end="2026-09-05"/>')).toBe('Dal 02/09/2026 → 05/09/2026')
    expect(markdownPulito('Alle <mention-date start="2026-09-02T16:00:00.000Z"/>')).toBe('Alle 02/09/2026 18:00')
  })

  it('le immagini restano in Notion: una riga lo dice, mai l’indirizzo firmato', () => {
    const md = [
      'Prima',
      '<image source="https://prod-files-secure.s3.amazonaws.com/firmato?X-Amz-Signature=abc">Copertina</image>',
      '![](https://prod-files-secure.s3.amazonaws.com/altra?X-Amz-Signature=def)',
      '<video source="file://video">Prova</video>',
    ].join('\n')
    const { sezioni, immagini, allegati } = sezioniDaMarkdown(md)
    expect(immagini).toBe(2)
    expect(allegati).toBe(1)
    expect(sezioni.messaggio).toBe(
      'Prima\n_[Immagine «Copertina»: è nella pagina su Notion]_\n_[Immagine: è nella pagina su Notion]_\n_[Video «Prova»: è nella pagina su Notion]_',
    )
    expect(sezioni.messaggio).not.toContain('amazonaws')
  })

  it('toglie gli attributi, <empty-block/>, gli escape inutili; tiene grassetto, link, elenchi e --- interni', () => {
    const md = [
      'Testo **forte** e [link](https://esempio.it/a) {color="red"}',
      '<empty-block/>',
      'Ore 18\\:30, costo \\$0 \\*non\\* cambia',
      'Sopra il divisore',
      '---',
      '- [ ] da fare',
      'Dopo l’elenco',
    ].join('\n')
    expect(markdownPulito(md)).toBe(
      'Testo **forte** e [link](https://esempio.it/a)\n\nOre 18:30, costo $0 \\*non\\* cambia\nSopra il divisore\n\n---\n\n- [ ] da fare\n\nDopo l’elenco',
    )
  })

  it('una tabella diventa una tabella GitHub', () => {
    const md = [
      '<table header-row="true">',
      '\t<tr>',
      '\t\t<td>Giorno</td>',
      '\t\t<td>Esercizio</td>',
      '\t</tr>',
      '\t<tr>',
      '\t\t<td>Lunedì</td>',
      '\t\t<td>Trazioni | 3x8</td>',
      '\t</tr>',
      '</table>',
    ].join('\n')
    expect(markdownPulito(md)).toBe('| Giorno | Esercizio |\n| --- | --- |\n| Lunedì | Trazioni \\| 3x8 |')
  })

  it('un blocco di codice recintato resta com’è', () => {
    const md = ['```', '\tindentato', '```', 'dopo'].join('\n')
    expect(markdownPulito(md)).toBe('```\n\tindentato\n```\n\ndopo')
  })

  it('un titolo senza testo se ne va: mai un <h3> vuoto (il ### del callout del modello)', () => {
    const md = ['<callout icon="💡" color="gray_bg">', '\t### ', '\tIl testo del callout', '</callout>', '##', 'Dopo'].join('\n')
    expect(markdownPulito(md)).toBe('Il testo del callout\nDopo')
    expect(markdownPulito('### **  **\nTesto')).toBe('Testo')
    // the text after a <br> is still the heading's
    expect(markdownPulito('## <br>Titolo vero<br>')).toBe('## Titolo vero')
    expect(markdownPulito('### Sottotitolo\nTesto')).toBe('### Sottotitolo\nTesto')
  })

  it('un paragrafo con spazi davanti non diventa codice', () => {
    expect(markdownPulito('        rientrato')).toBe('rientrato')
    expect(diventaCodice('    rientrato')).toBe(true)
    expect(diventaCodice('Hook:\nLine:')).toBe(false)
  })
})

describe('tipoDaPagina', () => {
  it('l’icona del modello decide: drafts_* carosello, movie_* reel', () => {
    expect(tipoDaPagina({ icona: 'drafts_blue', markdown: REEL })).toBe('carousel')
    expect(tipoDaPagina({ icona: 'https://www.notion.so/icons/drafts_blue.svg', markdown: '' })).toBe('carousel')
    expect(tipoDaPagina({ icona: 'movie_purple', markdown: '### Caption {toggle="true"}\n\tx' })).toBe('reel')
  })

  it('senza l’icona di un modello, un toggle Carousel o Caption fa un carosello', () => {
    expect(tipoDaPagina({ icona: null, markdown: '### Carousel {toggle="true"}\n\tx' })).toBe('carousel')
    expect(tipoDaPagina({ icona: '🔥', markdown: '<details>\n<summary>Caption</summary>\n\tx\n</details>' })).toBe(
      'carousel',
    )
    expect(tipoDaPagina({ icona: null, markdown: REEL })).toBe('reel')
  })
})

describe('paginaInRiga', () => {
  it('le proprietà con le etichette di Notion diventano i valori del database', () => {
    const esito = ok(
      pagina({
        proprieta: {
          'Reel Type': 'RADIO',
          Format: 'Show&Tell',
          Inspiration: 'www.instagram.com/reel/AbcDe12345/',
          Audio: '  Brano originale ',
          'View Count': 12480,
          'userDefined:URL': 'https://www.instagram.com/reel/XyZ1234567/',
        },
      }),
    )
    expect(esito.riga).toEqual({
      notion_page_id: ID_UUID,
      tipo: 'reel',
      nome: 'Allenarsi a casa dopo i 30',
      reel_type: 'radio',
      formato: 'show_and_tell',
      inspiration: 'https://www.instagram.com/reel/AbcDe12345/',
      stato: 'posted',
      post_date: '2026-09-02',
      audio: 'Brano originale',
      url: 'https://www.instagram.com/reel/XyZ1234567/',
      view_count: 12480,
      ...sezioniDaMarkdown(REEL).sezioni,
      created_at: '2026-09-01T08:30:00.000Z',
    })
    expect(esito.inspirationCompletata).toBe(true)
    expect(esito.nomeDiModello).toBe(false)
  })

  it('Name e Audio sono testo semplice: via il grassetto, i <br> e il link scritto in Markdown', () => {
    const esito = ok(
      pagina({
        proprieta: {
          Name: '**Reel #9 - MOF - Trazioni senza sbarra**<br>',
          Audio: '[https://www.youtube.com/watch?v=Inventato1](https://www.youtube.com/watch?v=Inventato1)',
        },
      }),
    )
    expect(esito.riga.nome).toBe('Reel #9 - MOF - Trazioni senza sbarra')
    expect(esito.riga.audio).toBe('https://www.youtube.com/watch?v=Inventato1')
    expect(ok(pagina({ proprieta: { Audio: 'Brano [versione lunga](https://esempio.it/b)' } })).riga.audio).toBe(
      'Brano versione lunga https://esempio.it/b',
    )
    expect(ok(pagina({ proprieta: { Name: 'Due \\*stelle\\* e __sottolineato__' } })).riga.nome).toBe(
      'Due *stelle* e sottolineato',
    )
    // only markup: as empty as an empty Name
    expect(motivi(pagina({ proprieta: { Name: '****<br>' } }))).toContain('Name: Scrivi il nome.')
  })

  it('il link della pagina (url) dà solo l’id, mai l’URL del post; l’URL è userDefined:URL', () => {
    const senza = ok(pagina())
    expect(senza.riga.url).toBeNull()
    expect(senza.riga.notion_page_id).toBe(ID_UUID)
    expect(ok(pagina({ proprieta: { 'userDefined:URL': 'instagram.com/p/Post123456' } })).riga.url).toBe(
      'https://instagram.com/p/Post123456',
    )
  })

  it('un id che non coincide con il link della pagina si rifiuta', () => {
    expect(motivi(pagina({ proprieta: { url: 'https://www.notion.so/ffffffffffffffffffffffffffffffff' } }))).toContain(
      'id e link della pagina non coincidono',
    )
  })

  it('Status vuoto è Not started; un nome uguale a un modello si conta', () => {
    const esito = ok(pagina({ proprieta: { Status: null, Name: 'Reel Topic' } }))
    expect(esito.riga.stato).toBe('not_started')
    expect(esito.nomeDiModello).toBe(true)
  })

  it('una data con l’ora diventa il suo giorno a Roma', () => {
    const esito = ok(
      pagina({
        proprieta: { 'date:Post Date:start': '2026-09-30T23:30:00.000Z', 'date:Post Date:is_datetime': 1 },
      }),
    )
    expect(esito.riga.post_date).toBe('2026-10-01')
  })

  it('un intervallo di date si rifiuta: un post ha un giorno solo', () => {
    expect(motivi(pagina({ proprieta: { 'date:Post Date:end': '2026-09-04' } }))).toContain(
      'Post Date è un intervallo: un post ha un giorno solo',
    )
  })

  it('un View Count con i decimali si rifiuta', () => {
    expect(motivi(pagina({ proprieta: { 'View Count': 12.5 } }))).toContain('View Count: non è un numero intero ≥ 0')
    expect(motivi(pagina({ proprieta: { 'View Count': -1 } }))).toContain('View Count: non è un numero intero ≥ 0')
  })

  it('un’etichetta sconosciuta si rifiuta e non scrive niente', () => {
    const esito = paginaInRiga(pagina({ proprieta: { Format: 'Talking Head', Status: 'Done' } }))
    expect(esito.ok).toBe(false)
    expect(esito).not.toHaveProperty('riga')
    if (!esito.ok) {
      expect(esito.id).toBe(ID_UUID)
      expect(esito.motivi).toEqual(
        expect.arrayContaining(['Status: etichetta sconosciuta «Done»', 'Format: etichetta sconosciuta «Talking Head»']),
      )
    }
  })

  it('un link di condivisione come URL e un Name vuoto si rifiutano con le parole del form', () => {
    const m = motivi(pagina({ proprieta: { 'userDefined:URL': 'https://www.instagram.com/share/reel/Abc123/', Name: ' ' } }))
    expect(m).toEqual(
      expect.arrayContaining([
        'Name: Scrivi il nome.',
        'URL: Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.',
      ]),
    )
  })

  it('una sezione oltre 30.000 caratteri si rifiuta', () => {
    const lunga = `### Script (Final) {toggle="true"}\n\t${'parola '.repeat(5000)}`
    expect(motivi(pagina({ markdown: lunga }))).toContain('Script (Final): oltre 30.000 caratteri')
  })

  it('nessuna parola persa su una pagina con tutto dentro', () => {
    const md = [
      '# Topic / Main Message {color="gray"}',
      '---',
      '<callout icon="💡" color="gray_bg">',
      '\tVersione italiana<br>con **due** righe',
      '\t> Una citazione<br>su due righe',
      '\t<columns>',
      '\t\t<column>',
      '\t\t\tColonna sinistra',
      '\t\t</column>',
      '\t\t<column>',
      '\t\t\tColonna destra',
      '\t\t</column>',
      '\t</columns>',
      '</callout>',
      '<details>',
      '<summary>English version</summary>',
      '\tSame idea in English',
      '</details>',
      '### Script (Rough Draft) {toggle="true"}',
      '\t1. Primo',
      '\t\t- dettaglio <span color="red">rosso</span>',
      '\t2. Secondo',
      '\t<image source="https://esempio.it/x.png">Schema</image>',
      'Chiusura con <mention-page url="https://www.notion.so/y">Altra pagina</mention-page>',
    ].join('\n')
    const esito = ok(pagina({ markdown: md }))
    const { sezioni } = sezioniDaMarkdown(md)
    expect(paroleMancanti(md, sezioni, ['Topic / Main Message', 'Script (Rough Draft)'])).toBe(0)
    expect(esito.riga.messaggio).toBe(
      'Versione italiana\ncon **due** righe\n\n> Una citazione\n> su due righe\n\nColonna sinistra\nColonna destra\nChiusura con Altra pagina\n\n### English version\nSame idea in English',
    )
  })

  it('il controllo delle parole se ne accorge quando una parola manca', () => {
    const sezioni = { messaggio: 'Allenarsi a casa', bozza: null, commenti: null, finale: null }
    expect(paroleMancanti('Allenarsi a casa dopo i 30', sezioni)).toBe(3)
  })
})

describe('uuidNotion', () => {
  it('32 esadecimali, con o senza trattini, o l’ultimo id del percorso di un link', () => {
    expect(uuidNotion(ID)).toBe(ID_UUID)
    expect(uuidNotion(ID_UUID.toUpperCase())).toBe(ID_UUID)
    expect(uuidNotion(`https://www.notion.so/Titolo-inventato-${ID}`)).toBe(ID_UUID)
    expect(uuidNotion(`https://www.notion.so/${ID}?v=ffffffffffffffffffffffffffffffff`)).toBe(ID_UUID)
    expect(uuidNotion('non un id')).toBeNull()
    expect(uuidNotion(42)).toBeNull()
  })
})

describe('il file SQL', () => {
  function riga(n: number, campi: Partial<RigaImport> = {}): RigaImport {
    return {
      notion_page_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      tipo: 'reel',
      nome: `Contenuto inventato ${n}`,
      reel_type: null,
      formato: null,
      inspiration: null,
      stato: 'posted',
      post_date: '2026-09-02',
      audio: null,
      url: null,
      view_count: null,
      messaggio: 'Testo con l’apostrofo e $ dollari',
      bozza: null,
      commenti: null,
      finale: null,
      created_at: '2026-09-01T08:30:00.000Z',
      ...campi,
    }
  }

  it('gira come l’admin sotto RLS e salta le pagine già importate', () => {
    const sql = sqlImportContenuti([riga(1), riga(2)], 'Prova')
    expect(sql.startsWith('-- Prova\n')).toBe(true)
    expect(sql).toContain("execute 'set local role authenticated'")
    expect(sql).toContain('on conflict (notion_page_id) do nothing')
    expect(sql).toContain('jsonb_to_recordset($contenuti$')
    expect(sql).toContain('tipo public.contenuto_tipo')
    expect(sql).toContain('stato public.contenuto_status')
    expect(sql).toContain("raise notice 'Pagine lette: %, create: %, già importate: %'")
    expect(sql).toContain('exception when unique_violation')
    expect(sql).toContain('order by p.created_at')
    expect(sql.match(/\$body\$/g)).toHaveLength(2)
    expect(sql.match(/\$contenuti\$/g)).toHaveLength(2)
  })

  it('i dati sono il JSON delle righe, una per riga', () => {
    const righe = [riga(1), riga(2)]
    const sql = sqlImportContenuti(righe, 'Prova')
    const json = /\$contenuti\$\n([\s\S]*?)\n\$contenuti\$/.exec(sql)?.[1]
    expect(JSON.parse(json!)).toEqual(righe)
  })

  it('con l’email dell’admin sceglie lui; un’email strana no', () => {
    expect(sqlImportContenuti([riga(1)], 'Prova', { admin: 'admin@alpha.test' })).toContain(
      "lower(p.email) = lower('admin@alpha.test')",
    )
    expect(() => sqlImportContenuti([riga(1)], 'Prova', { admin: "x'@a.it" })).toThrow(/email/)
  })

  it('rifiuta un testo che chiuderebbe il dollar quoting', () => {
    expect(() => sqlImportContenuti([riga(1, { finale: 'prezzo $contenuti$' })], 'Prova')).toThrow(/\$contenuti\$/)
    expect(() => sqlImportContenuti([riga(1, { messaggio: 'x $body$ y' })], 'Prova')).toThrow(/\$body\$/)
  })

  it('rifiuta due righe con lo stesso post e la stessa pagina due volte', () => {
    const doppie = [
      riga(1, { url: 'https://www.instagram.com/reel/Stesso1234/' }),
      riga(2, { url: 'https://instagram.com/reel/Stesso1234?igsh=abc' }),
    ]
    expect(problemiImport(doppie)).toEqual([
      'lo stesso post (Stesso1234) è su 2 pagine: 00000000-0000-4000-8000-000000000001, 00000000-0000-4000-8000-000000000002',
    ])
    expect(() => sqlImportContenuti(doppie, 'Prova')).toThrow(/Stesso1234/)
    expect(problemiImport([riga(1), riga(1)])).toEqual(['la pagina 00000000-0000-4000-8000-000000000001 c’è 2 volte'])
    expect(problemiImport([riga(1), riga(2)])).toEqual([])
  })

  it('--per-file divide le righe e numera i file', () => {
    const righe = Array.from({ length: 41 }, (_, i) => riga(i + 1))
    const parti = dividiPerFile(righe, 20)
    expect(parti.map((p) => p.length)).toEqual([20, 20, 1])
    expect(parti.flat()).toEqual(righe)
    expect(dividiPerFile(righe, null)).toEqual([righe])
    expect(dividiPerFile(righe, 50)).toEqual([righe])
    expect(nomiFile('import/contenuti.sql', 3)).toEqual([
      'import/contenuti-1.sql',
      'import/contenuti-2.sql',
      'import/contenuti-3.sql',
    ])
    expect(nomiFile('import/contenuti.sql', 1)).toEqual(['import/contenuti.sql'])
  })
})
