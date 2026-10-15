import { describe, expect, it } from 'vitest'

import {
  abbina,
  chiaveCoppia,
  fontiDelContenuto,
  gancio,
  giorniTra,
  nomeSenzaCodici,
  parole,
  pesiParole,
  postDaAbbinare,
  SOGLIE,
  somiglianza,
  tipiCompatibili,
  tipoDelPost,
  type ContenutoDaAbbinare,
  type PostDaAbbinare,
} from '@/lib/marketing/abbinamento'
import { BOZZA_REEL } from '@/lib/marketing/etichette'

// Every caption, Name and script here is invented.

let progressivo = 0
function contenuto(extra: Partial<ContenutoDaAbbinare> = {}): ContenutoDaAbbinare {
  progressivo++
  return {
    id: `00000000-0000-4000-8000-${String(progressivo).padStart(12, '0')}`,
    tipo: 'reel',
    stato: 'posted',
    post_date: '2026-10-03',
    nome: 'Contenuto di prova',
    bozza: BOZZA_REEL,
    finale: null,
    messaggio: null,
    ...extra,
  }
}

function post(extra: Partial<PostDaAbbinare> = {}): PostDaAbbinare {
  progressivo++
  return { shortcode: `Post${String(progressivo).padStart(6, '0')}`, giorno: '2026-10-03', tipo: 'reel', didascalia: null, ...extra }
}

/** A corpus of everyday captions of the profile: their words weigh little. */
const CORPUS = [
  'Allenamento di petto a casa senza attrezzi. Scrivi PETTO nei commenti.',
  'Petto scavato? Tre esercizi a corpo libero per il petto.',
  'Il mio allenamento di oggi: petto e spalle, a casa.',
  'Allenamento a corpo libero per chi parte da zero.',
  'Spalle larghe senza palestra: allenamento a casa.',
  'Dieta e allenamento: cosa mangio in una giornata.',
]

function corre(input: {
  post: PostDaAbbinare[]
  contenuti: ContenutoDaAbbinare[]
  rifiutati?: string[]
  corpus?: (string | null)[]
  automatici?: boolean
}) {
  return abbina({
    post: input.post,
    contenuti: input.contenuti,
    rifiutati: new Set(input.rifiutati ?? []),
    didascalieDelCorpus: input.corpus ?? [...CORPUS, ...input.post.map((p) => p.didascalia)],
    automatici: input.automatici,
  })
}

describe('parole', () => {
  it('toglie accenti, maiuscole, link, menzioni, hashtag ed emoji', () => {
    expect(parole('Perché il PETTO è scavato? 💪🏽 @coach.alpha #allenamento https://x.com/a www.sito.it')).toEqual([
      'pett',
      'scavat',
    ])
  })

  it('emoji con ZWJ, toni della pelle e bandiere spariscono; le cifre restano', () => {
    expect(parole('👨‍👩‍👧 famiglia 🇮🇹 italia 👍🏻 2017 50 anni 7')).toEqual(['famigli', 'itali', '2017', '50', 'anni'])
  })

  it('gli apostrofi dritti e curvi separano; le parole vuote se ne vanno', () => {
    expect(parole("L'uomo dell’anno")).toEqual(['uomo', 'anno'])
    expect(parole('nell’ombra sull’erba all’alba')).toEqual(['ombr', 'erba', 'alba'])
  })

  it('le virgolette e i segni separano, le parole del calendario no', () => {
    expect(parole('«Iniziare» a 50 anni \u2014 "da zero"! Reel TOF CTA hook')).toEqual(['iniziar', '50', 'anni', 'zero'])
  })

  it('radice leggera: allenamento e allenamenti sono la stessa parola, le corte restano', () => {
    expect(parole('allenamento allenamenti scavato scavata casa')).toEqual(['allenament', 'allenament', 'scavat', 'scavat', 'casa'])
  })

  it('niente testo, niente parole', () => {
    expect(parole(null)).toEqual([])
    expect(parole('')).toEqual([])
    expect(parole('🔥🔥 #tag @nome')).toEqual([])
  })
})

describe('le frasi del contenuto', () => {
  it('i codici del Name se ne vanno', () => {
    expect(nomeSenzaCodici('Reel #5 - TOF - About Me Reel')).toBe('About Me Reel')
    expect(nomeSenzaCodici('#6MOF "Le trazioni senza sbarra" \u2014 IT')).toBe('"Le trazioni senza sbarra"')
    expect(nomeSenzaCodici('#3 Iniziare a 50 anni da zero')).toBe('Iniziare a 50 anni da zero')
    expect(parole(nomeSenzaCodici('CONTENUTO c4993'))).toEqual([])
  })

  it('la citazione nel Name, tra "…", “…” o «…»', () => {
    for (const nome of ['#6MOF Trazioni «Le trazioni senza sbarra»', '#6 Trazioni “Le trazioni senza sbarra”', '#6 Trazioni "Le trazioni senza sbarra"']) {
      expect(fontiDelContenuto(contenuto({ nome }))).toContain('Le trazioni senza sbarra')
    }
    // a quote shorter than 8 characters says nothing by itself
    expect(fontiDelContenuto(contenuto({ nome: 'Trazioni «sbarra»' }))).toEqual(['Trazioni «sbarra»'])
  })

  it('il gancio: Hook in riga, **Hook** con la riga dopo, #### Hook, Hook a schermo', () => {
    expect(gancio('Hook: Il petto scavato non è genetica\nLine: x')).toBe('Il petto scavato non è genetica')
    expect(gancio('**Hook**\n\n"Il petto scavato non è genetica"\nLine:')).toBe('Il petto scavato non è genetica')
    expect(gancio('#### Hook\nTre errori negli addominali')).toBe('Tre errori negli addominali')
    expect(gancio('**Hook a schermo:** Nessuna sbarra, nessun problema')).toBe('Nessuna sbarra, nessun problema')
    expect(gancio('> Hook a schermo\nNessuna sbarra, nessun problema')).toBe('Nessuna sbarra, nessun problema')
  })

  it('il modello vuoto della bozza non dà niente, e nemmeno un gancio corto', () => {
    expect(gancio(BOZZA_REEL)).toBeNull()
    expect(gancio('Hook: ciao\nLine: altro')).toBeNull()
    expect(gancio('Hook:\nCTA: scrivi PETTO')).toBeNull()
    expect(fontiDelContenuto(contenuto({ nome: 'Reel #5 - TOF - CONTENUTO c4993', bozza: BOZZA_REEL }))).toEqual([])
  })

  it('il gancio: prima Final, poi Bozza, poi il Messaggio', () => {
    const c = contenuto({
      nome: 'Reel #1',
      finale: 'Hook: Quello del final vince sempre',
      bozza: 'Hook: Quello della bozza resta fuori',
      messaggio: 'Hook: Quello del messaggio resta fuori',
    })
    expect(fontiDelContenuto(c)).toEqual(['Quello del final vince sempre'])
  })

  it('i link del Messaggio non diventano mai una frase né uno shortcode', () => {
    const c = contenuto({
      nome: 'Reel #2',
      messaggio: 'Reference: https://www.instagram.com/p/ALTROcreator1/ "https://www.instagram.com/reel/XYZ12345/"\n"Il gancio vero del messaggio"',
    })
    const fonti = fontiDelContenuto(c)
    expect(fonti).toEqual(['Il gancio vero del messaggio'])
    expect(fonti.join(' ')).not.toContain('instagram.com')
  })

  it('senza doppioni', () => {
    const c = contenuto({ nome: '#7 "Tre errori negli addominali"', finale: 'Hook: Tre errori negli addominali' })
    expect(fontiDelContenuto(c)).toEqual(['"Tre errori negli addominali"'])
  })
})

describe('pesi e somiglianza', () => {
  it('una parola di tutte le didascalie pesa poco, una di nessuna pesa di più', () => {
    const peso = pesiParole(['petto casa', 'petto zaino', 'petto tavolo', null])
    const [petto, zaino, asciugamano] = parole('petto zaino asciugamano')
    expect(peso(petto)).toBeLessThan(peso(zaino))
    expect(peso(zaino)).toBeLessThan(peso(asciugamano))
  })

  it('la didascalia che comincia col gancio è simile; un Name generico no', () => {
    const peso = pesiParole([...CORPUS, 'Il petto scavato non è genetica: ecco perché.'])
    expect(somiglianza('Il petto scavato non è genetica: ecco perché.', ['Il petto scavato non è genetica'], peso)).toBe(1)
    expect(somiglianza('Il petto scavato non è genetica.', ['About Me Reel'], peso)).toBe(0)
    expect(somiglianza(null, ['Il petto scavato'], peso)).toBe(0)
    expect(somiglianza('Il petto scavato', [], peso)).toBe(0)
  })

  it('una frase di una o due parole conta al massimo un terzo o due terzi', () => {
    const peso = pesiParole(['trazioni', 'sbarra'])
    expect(somiglianza('Trazioni', ['Trazioni'], peso)).toBeCloseTo(0.333, 3)
    expect(somiglianza('Trazioni sbarra', ['Trazioni sbarra'], peso)).toBeCloseTo(0.667, 3)
  })

  it('conta solo l’inizio della didascalia', () => {
    const peso = pesiParole(['x'])
    const lunga = `${'parola '.repeat(120)} trazioni senza sbarra`
    expect(somiglianza(lunga, ['trazioni senza sbarra'], peso)).toBe(0)
  })
})

describe('il post come lo legge il giro', () => {
  it('il giorno è quello di Roma: le 01:30 del 03/10 a Roma (23:30 UTC del 02/10) sono il 03/10', () => {
    const p = postDaAbbinare({ shortcode: 'Abcde1', media_type: 'VIDEO', reel: true, pubblicato_il: '2026-10-02T23:30:00Z', didascalia: null })
    expect(p?.giorno).toBe('2026-10-03')
  })

  it('la notte del cambio d’ora (25/10/2026)', () => {
    const prima = postDaAbbinare({ shortcode: 'Abcde2', media_type: 'IMAGE', reel: false, pubblicato_il: '2026-10-24T22:30:00Z', didascalia: null })
    const dopo = postDaAbbinare({ shortcode: 'Abcde3', media_type: 'IMAGE', reel: false, pubblicato_il: '2026-10-25T23:30:00Z', didascalia: null })
    // 00:30 of 25/10 in summer time (UTC+2), 00:30 of 26/10 in winter time (UTC+1)
    expect(prima?.giorno).toBe('2026-10-25')
    expect(dopo?.giorno).toBe('2026-10-26')
    expect(postDaAbbinare({ shortcode: 'Abcde4', media_type: 'IMAGE', reel: false, pubblicato_il: 'ieri', didascalia: null })).toBeNull()
  })

  it('i tipi: reel e video, carosello, foto; e quali vanno insieme', () => {
    expect(tipoDelPost({ media_type: 'VIDEO', reel: true })).toBe('reel')
    expect(tipoDelPost({ media_type: 'VIDEO', reel: false })).toBe('reel')
    expect(tipoDelPost({ media_type: 'CAROUSEL_ALBUM', reel: false })).toBe('carousel')
    expect(tipoDelPost({ media_type: 'IMAGE', reel: false })).toBe('foto')
    expect(tipiCompatibili('reel', 'reel')).toBe(true)
    expect(tipiCompatibili('reel', 'carousel')).toBe(false)
    expect(tipiCompatibili('carousel', 'carousel')).toBe(true)
    expect(tipiCompatibili('foto', 'carousel')).toBe(true)
    expect(tipiCompatibili('carousel', 'reel')).toBe(false)
    expect(giorniTra('2026-10-03', '2026-09-30')).toBe(3)
    expect(giorniTra('2026-10-25', '2026-10-26')).toBe(1)
  })
})

describe('abbina', () => {
  const GANCIO = 'Il petto scavato non è genetica'
  const CAPTION = `${GANCIO}: ecco cosa cambia davvero con tre esercizi.\n#petto #allenamentoacasa`

  it('stesso giorno e didascalia che comincia col gancio: collegato da solo', () => {
    const c = contenuto({ nome: '#6MOF "Il petto scavato non è genetica"' })
    const p = post({ didascalia: CAPTION })
    const [a, ...resto] = corre({ post: [p], contenuti: [c] })
    expect(resto).toEqual([])
    expect(a).toMatchObject({ shortcode: p.shortcode, contenuto_id: c.id, esito: 'automatico', giorni: 0 })
    expect(a.motivi).toEqual(expect.arrayContaining(['stessa_data', 'didascalia_simile', 'unico_del_giorno']))
    expect(a.somiglianza).toBeGreaterThanOrEqual(SOGLIE.SIM_SICURA)
  })

  it('due reel e due contenuti lo stesso giorno con didascalie incrociate: due automatici giusti', () => {
    const c1 = contenuto({ nome: '#6 "Il petto scavato non è genetica"' })
    const c2 = contenuto({ nome: '#7 "Tre errori negli addominali bassi"' })
    const p1 = post({ didascalia: 'Tre errori negli addominali bassi che fanno quasi tutti.' })
    const p2 = post({ didascalia: CAPTION })
    const esiti = corre({ post: [p1, p2], contenuti: [c1, c2] })
    expect(esiti.filter((a) => a.esito === 'automatico').map((a) => [a.shortcode, a.contenuto_id]).sort()).toEqual(
      [
        [p1.shortcode, c2.id],
        [p2.shortcode, c1.id],
      ].sort(),
    )
    expect(esiti.filter((a) => a.esito === 'proposto')).toEqual([])
  })

  it('un collegamento sicuro lascia sola l’altra coppia del giorno: lo stesso giro collega anche quella', () => {
    const generico = contenuto({ nome: 'Reel #7 - TOF - Allenamento a casa' })
    const scheda = contenuto({ nome: 'Reel #8 - MOF - Allenamento a casa: la scheda' })
    const p1 = post({ didascalia: 'Allenamento a casa per chi inizia da zero.' })
    const p2 = post({ didascalia: 'Allenamento a casa: la scheda della settimana, salvala.' })
    const esiti = corre({ post: [p1, p2], contenuti: [generico, scheda] })
    // p2 is clearly "la scheda"; with it linked, p1 is the only reel of the day left for the other one
    expect(esiti.map((a) => [a.shortcode, a.contenuto_id, a.esito])).toEqual([
      [p2.shortcode, scheda.id, 'automatico'],
      [p1.shortcode, generico.id, 'automatico'],
    ])
  })

  it('un secondo giro sugli stessi dati non collega niente di nuovo e propone le stesse coppie', () => {
    const corpus = [...CORPUS, 'Allenamento a casa per chi inizia da zero.']
    const contenuti = [
      contenuto({ nome: 'Reel #7 - TOF - Allenamento a casa' }),
      contenuto({ nome: 'Reel #8 - MOF - Allenamento a casa: la scheda' }),
      contenuto({ nome: `#6 "${GANCIO}"`, stato: 'to_be_posted' }),
      contenuto({ nome: 'Reel #9 - BOF - About Me Reel', post_date: '2026-10-04' }),
    ]
    const tutti = [
      post({ didascalia: 'Allenamento a casa per chi inizia da zero.' }),
      post({ didascalia: 'Allenamento a casa: la scheda della settimana, salvala.' }),
      post({ didascalia: CAPTION }),
      post({ didascalia: 'Una giornata con me: allenamento e lavoro.', giorno: '2026-10-04' }),
    ]
    const primo = corre({ post: tutti, contenuti, corpus })
    const collegati = primo.filter((a) => a.esito === 'automatico')
    expect(collegati.length).toBeGreaterThan(0)
    // the next run no longer reads a linked post nor a content with a URL
    const secondo = corre({
      post: tutti.filter((p) => !collegati.some((a) => a.shortcode === p.shortcode)),
      contenuti: contenuti.filter((c) => !collegati.some((a) => a.contenuto_id === c.id)),
      corpus,
    })
    expect(secondo.filter((a) => a.esito === 'automatico')).toEqual([])
    expect(secondo).toEqual(primo.filter((a) => a.esito === 'proposto'))
  })

  it('due reel e due contenuti con Name generici: solo proposte, due per post', () => {
    const c1 = contenuto({ nome: 'Reel #5 - TOF - About Me Reel' })
    const c2 = contenuto({ nome: 'reel workshop 13' })
    const p1 = post({ didascalia: 'Una giornata con me: allenamento e lavoro.' })
    const p2 = post({ didascalia: 'Il mio primo workshop dal vivo.' })
    const esiti = corre({ post: [p1, p2], contenuti: [c1, c2] })
    expect(esiti.every((a) => a.esito === 'proposto')).toBe(true)
    expect(esiti.filter((a) => a.shortcode === p1.shortcode)).toHaveLength(2)
    expect(esiti.filter((a) => a.shortcode === p2.shortcode)).toHaveLength(2)
  })

  it('un giorno di distanza con didascalia forte: automatico; due giorni: proposta', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, post_date: '2026-10-02' })
    const vicino = corre({ post: [post({ didascalia: CAPTION })], contenuti: [c] })
    expect(vicino).toMatchObject([{ esito: 'automatico', giorni: 1, motivi: expect.arrayContaining(['giorno_vicino']) }])
    const lontano = corre({ post: [post({ didascalia: CAPTION, giorno: '2026-10-04' })], contenuti: [c] })
    expect(lontano).toMatchObject([{ esito: 'proposto', giorni: 2 }])
  })

  it('un contenuto non ancora Posted, anche perfetto, è solo una proposta', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, stato: 'to_be_edited' })
    expect(corre({ post: [post({ didascalia: CAPTION })], contenuti: [c] })).toMatchObject([{ esito: 'proposto' }])
  })

  it('un contenuto Canceled mai', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, stato: 'canceled' })
    expect(corre({ post: [post({ didascalia: CAPTION })], contenuti: [c] })).toEqual([])
  })

  it('un reel con un Carousel Topic mai; una foto con un Carousel Topic sì', () => {
    const carosello = contenuto({ tipo: 'carousel', nome: `"${GANCIO}"` })
    expect(corre({ post: [post({ didascalia: CAPTION })], contenuti: [carosello] })).toEqual([])
    expect(corre({ post: [post({ tipo: 'foto', didascalia: CAPTION })], contenuti: [carosello] })).toMatchObject([
      { esito: 'automatico' },
    ])
  })

  it('una coppia rifiutata mai, e l’altra candidata non diventa automatica per questo', () => {
    const c1 = contenuto({ nome: `#6 "${GANCIO}"` })
    const c2 = contenuto({ nome: `#7 "${GANCIO} davvero"` })
    const p = post({ didascalia: CAPTION })
    const esiti = corre({ post: [p], contenuti: [c1, c2], rifiutati: [chiaveCoppia(p.shortcode, c1.id)] })
    expect(esiti.some((a) => a.contenuto_id === c1.id)).toBe(false)
    expect(esiti).toMatchObject([{ contenuto_id: c2.id, esito: 'proposto' }])
  })

  it('un post senza didascalia: solo proposte per data', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"` })
    expect(corre({ post: [post({ didascalia: null })], contenuti: [c] })).toMatchObject([
      { esito: 'proposto', somiglianza: 0, punteggio: 40, motivi: ['stessa_data', 'unico_del_giorno'] },
    ])
  })

  it('un contenuto senza Post Date con didascalia forte: proposta, mai automatico', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, post_date: null })
    const esiti = corre({ post: [post({ didascalia: CAPTION })], contenuti: [c] })
    expect(esiti).toMatchObject([{ esito: 'proposto', giorni: null }])
    // and with a weak caption, nothing
    expect(corre({ post: [post({ didascalia: 'Altro argomento del tutto diverso.' })], contenuti: [c] })).toEqual([])
  })

  it('un Name di una sola parola: mai regola A, regola B solo se unico nei due versi', () => {
    const corpus = ['trazioni', 'oggi altro', 'domani altro']
    const c = contenuto({ nome: 'Trazioni', bozza: null })
    const solo = corre({ post: [post({ didascalia: 'Trazioni' })], contenuti: [c], corpus })
    expect(solo).toMatchObject([{ esito: 'automatico', motivi: expect.arrayContaining(['unico_del_giorno']) }])
    expect(solo[0].somiglianza).toBeLessThan(SOGLIE.SIM_SICURA)
    // another reel the same day: no longer unique, a proposal
    const due = corre({ post: [post({ didascalia: 'Trazioni' }), post({ didascalia: null })], contenuti: [c], corpus })
    expect(due.every((a) => a.esito === 'proposto')).toBe(true)
  })

  it('un candidato più simile a 2-7 giorni blocca la regola B: solo proposte', () => {
    const corpus = [
      'Trazioni a casa senza sbarra: tre esercizi con un asciugamano e una porta',
      'Colazione proteica in cinque minuti per chi va di fretta',
      'Il petto scavato non è genetica: tre errori nella spinta',
      'Allenamento a corpo libero per spalle larghe a 40 anni',
      'Dormire meglio per recuperare: tre abitudini serali',
    ]
    // the real reel was planned 3 days earlier and went out late; the content of the day says less of it
    const delGiorno = contenuto({ nome: 'Asciugamano: esercizi per la schiena', post_date: '2026-10-05', bozza: null })
    const slittato = contenuto({ nome: 'Trazioni a casa senza sbarra con asciugamano e porta', post_date: '2026-10-02', bozza: null })
    const p = post({ giorno: '2026-10-05', didascalia: corpus[0] })
    const esiti = corre({ post: [p], contenuti: [delGiorno, slittato], corpus })
    expect(esiti.filter((a) => a.esito === 'automatico')).toEqual([])
    expect(esiti.map((a) => a.contenuto_id).sort()).toEqual([delGiorno.id, slittato.id].sort())
    // alone, without the closer content days away, the content of the day is linked as before
    const solo = corre({ post: [post({ giorno: '2026-10-05', didascalia: corpus[0] })], contenuti: [delGiorno], corpus })
    expect(solo).toMatchObject([{ esito: 'automatico', motivi: expect.arrayContaining(['unico_del_giorno']) }])
  })

  it('un candidato più simile oltre una settimana, o senza Post Date, blocca la regola B anche sotto la soglia del testo', () => {
    const corpus = [
      'Trazioni a casa senza sbarra: tre esercizi con un asciugamano e una porta',
      'Colazione proteica in cinque minuti per chi va di fretta',
      'Il petto scavato non è genetica: tre errori nella spinta',
      'Allenamento a corpo libero per spalle larghe a 40 anni',
      'Dormire meglio per recuperare: tre abitudini serali',
    ]
    const delGiorno = contenuto({ nome: 'Esercizi con asciugamano per schiena e postura', post_date: '2026-10-05', bozza: null })
    const p = post({ giorno: '2026-10-05', didascalia: corpus[0] })
    const peso = pesiParole(corpus)
    const simDelGiorno = somiglianza(p.didascalia, fontiDelContenuto(delGiorno), peso)
    for (const postDate of ['2026-09-27', '2026-09-20', null]) {
      // the real content: planned 8 or 15 days earlier (or never dated), still To be posted
      const slittato = contenuto({
        nome: 'Trazioni senza sbarra con asciugamano: dorsali e bicipiti',
        post_date: postDate,
        stato: 'to_be_posted',
        bozza: null,
      })
      const simSlittato = somiglianza(p.didascalia, fontiDelContenuto(slittato), peso)
      // closer than the content of the day, yet under the text-only threshold: never a proposal by itself
      expect(simSlittato).toBeGreaterThan(simDelGiorno)
      expect(simSlittato).toBeLessThan(SOGLIE.SIM_SENZA_DATA)
      const esiti = corre({ post: [p], contenuti: [delGiorno, slittato], corpus })
      expect(esiti.filter((a) => a.esito === 'automatico'), `Post Date ${postDate}`).toEqual([])
      expect(esiti).toMatchObject([{ contenuto_id: delGiorno.id, esito: 'proposto' }])
    }
    // alone, the content of the day is linked as before
    expect(corre({ post: [p], contenuti: [delGiorno], corpus })).toMatchObject([{ esito: 'automatico' }])
  })

  it('regola B, nell’altro verso: un altro post più simile allo stesso contenuto, giorni dopo, la blocca', () => {
    const corpus = [
      'Trazioni a casa senza sbarra: tre esercizi con un asciugamano e una porta',
      'Asciugamano: esercizi per la schiena, anche a casa',
      'Colazione proteica in cinque minuti per chi va di fretta',
      'Dormire meglio per recuperare: tre abitudini serali',
    ]
    const c = contenuto({ nome: 'Asciugamano: esercizi per la schiena', post_date: '2026-10-05', bozza: null })
    const delGiorno = post({ giorno: '2026-10-05', didascalia: corpus[0] })
    // the reel that really is this content went out 3 days late
    const suo = post({ giorno: '2026-10-08', didascalia: corpus[1] })
    const esiti = corre({ post: [delGiorno, suo], contenuti: [c], corpus })
    expect(esiti.filter((a) => a.esito === 'automatico')).toEqual([])
    const solo = corre({ post: [post({ giorno: '2026-10-05', didascalia: corpus[0] })], contenuti: [c], corpus })
    expect(solo).toMatchObject([{ esito: 'automatico' }])
  })

  it('un post e due contenuti ugualmente buoni: nessun automatico, due proposte', () => {
    const c1 = contenuto({ nome: `#6 "${GANCIO}"` })
    const c2 = contenuto({ nome: `#8 "${GANCIO}"` })
    const esiti = corre({ post: [post({ didascalia: CAPTION })], contenuti: [c1, c2] })
    expect(esiti).toHaveLength(2)
    expect(esiti.every((a) => a.esito === 'proposto')).toBe(true)
  })

  it('al massimo 3 proposte per post, in un ordine stabile', () => {
    // all alike, none Posted: five proposals worth it, the best three kept
    const contenuti = [5, 4, 3, 2, 1].map((n) =>
      contenuto({ nome: `Workshop trazioni sbarra ${n}`, post_date: `2026-10-0${n}`, stato: 'to_be_edited' }),
    )
    const p = post({ giorno: '2026-10-03', didascalia: 'Workshop: trazioni alla sbarra per tutti.' })
    const uno = corre({ post: [p], contenuti })
    const due = corre({ post: [p], contenuti: [...contenuti].reverse() })
    expect(uno).toHaveLength(3)
    expect(uno).toEqual(due)
    // the same day first, then the nearest, the most recent Post Date first
    expect(uno.map((a) => a.giorni)).toEqual([0, 1, 1])
    expect(uno[1].contenuto_id).toBe(contenuti[1].id)
  })

  it('a tocco di una persona (automatici: false) niente si collega da solo', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"` })
    expect(corre({ post: [post({ didascalia: CAPTION })], contenuti: [c], automatici: false })).toMatchObject([
      { esito: 'proposto' },
    ])
  })

  it('oltre una settimana e senza didascalia simile, niente; oltre 366 giorni mai', () => {
    const c = contenuto({ nome: 'reel workshop 1', post_date: '2026-09-20' })
    expect(corre({ post: [post({ didascalia: 'Altro.' })], contenuti: [c] })).toEqual([])
    const lontanissimo = contenuto({ nome: `#6 "${GANCIO}"`, post_date: '2025-01-01' })
    expect(corre({ post: [post({ didascalia: CAPTION })], contenuti: [lontanissimo] })).toEqual([])
  })
})

describe('il parlato del reel (1.36.0)', () => {
  const GANCIO = 'Il petto scavato non è genetica'
  const PARLATO = `${GANCIO}. Ti spiego tre esercizi per il petto che puoi fare a casa senza attrezzi.`

  it('postDaAbbinare porta il parlato solo quando c’è', () => {
    const riga = { shortcode: 'SeedPost02', media_type: 'VIDEO', reel: true, pubblicato_il: '2026-10-03T08:00:00Z', didascalia: 'x' }
    expect(postDaAbbinare(riga)).not.toHaveProperty('parlato')
    expect(postDaAbbinare(riga, null)).not.toHaveProperty('parlato')
    expect(postDaAbbinare(riga, 'ciao')).toMatchObject({ parlato: 'ciao' })
  })

  it('il parlato che dice il gancio rende una proposta una coppia senza didascalia, col motivo «parlato simile»', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, stato: 'to_be_posted', post_date: '2026-10-03' })
    const p = post({ didascalia: 'Nuovo reel, salvalo.', parlato: PARLATO })
    const esiti = corre({ post: [p], contenuti: [c] })
    expect(esiti).toHaveLength(1)
    expect(esiti[0]).toMatchObject({ shortcode: p.shortcode, contenuto_id: c.id, esito: 'proposto' })
    expect(esiti[0].motivi).toContain('parlato_simile')
  })

  it('il parlato non fa mai un collegamento da solo: le regole sicure chiedono la didascalia', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, post_date: '2026-10-03' })
    const p = post({ didascalia: 'Nuovo reel, salvalo.', parlato: PARLATO })
    expect(corre({ post: [p], contenuti: [c] }).filter((a) => a.esito === 'automatico')).toEqual([])
  })

  it('senza il parlato il risultato è quello di prima', () => {
    const c = contenuto({ nome: `#6 "${GANCIO}"`, post_date: '2026-10-03' })
    const con = post({ didascalia: `${GANCIO}: ecco cosa cambia davvero.`, parlato: null })
    const senza = { ...con }
    delete (senza as { parlato?: unknown }).parlato
    expect(corre({ post: [con], contenuti: [c] })).toEqual(corre({ post: [senza], contenuti: [c] }))
  })

  it('un parlato che dice un altro contenuto toglie il collegamento al contenuto vicino', () => {
    const giusto = contenuto({ nome: '#7 "Tre errori negli addominali bassi"', post_date: '2026-10-03' })
    const vicino = contenuto({ nome: `#6 "${GANCIO}"`, post_date: '2026-10-03' })
    const p = post({
      didascalia: `${GANCIO}: ecco cosa cambia davvero.`,
      parlato: 'Tre errori negli addominali bassi che fanno quasi tutti, e come correggerli.',
    })
    const esiti = corre({ post: [p], contenuti: [giusto, vicino] })
    expect(esiti.filter((a) => a.esito === 'automatico')).toEqual([])
  })
})
