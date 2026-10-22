import { describe, expect, it } from 'vitest'

import {
  emailContenutiSettimana,
  linkPubblicati,
  settimanaDeiContenuti,
  type RiepilogoContenutiSettimana,
} from '@/lib/email/contenuti-settimana'

const URL_APP = 'https://dashboard.percorsoalpha.com'

const settimana: RiepilogoContenutiSettimana = {
  da: '2026-10-19',
  a: '2026-10-25',
  lead: { totale: 14, in_target: 9, fuori_target: 4, da_verificare: 1, da_un_contenuto: 11, da_storie: 2 },
  nuovi_clienti: 2,
  rinnovi: 1,
  call: { fissate: 7, svolte: 5, no_show: 1, chiuse: 2, da_registrare: 2 },
  contenuti: {
    pubblicati: 5,
    reel_non_valutati: 2,
    migliori: [
      {
        permalink: 'https://www.instagram.com/reel/AbCdE12345/',
        titolo: 'Trazioni <da zero> & costanza',
        giorno: '2026-10-20',
        tipo: 'Reel',
        views: 12480,
        lead: 6,
        in_target: 4,
        fuori_target: 2,
        punteggio: 82,
        fascia: 'pubblicare_dopo_ritocchi',
      },
    ],
    da_cambiare: [
      {
        permalink: 'https://www.instagram.com/reel/ZzZzZ99999/',
        titolo: 'Allenarsi a casa',
        giorno: '2026-10-22',
        views: 900,
        punteggio: 41,
        fascia: 'scartare',
        verdetto: 'cambiare',
        problema: 'Hook oltre le 15 parole e nessuna identificazione del cliente ideale.',
      },
    ],
  },
  fathom: {
    svolte: 5,
    registrate: 4,
    analizzate: 3,
    in_target: 2,
    fuori_target: 1,
    obiezioni: [
      { categoria: 'prezzo_cassa', n: 2 },
      { categoria: 'tempo', n: 1 },
    ],
  },
}

const vuota: RiepilogoContenutiSettimana = {
  da: '2026-10-19',
  a: '2026-10-25',
  lead: { totale: 0, in_target: 0, fuori_target: 0, da_verificare: 0, da_un_contenuto: 0, da_storie: 0 },
  nuovi_clienti: 0,
  rinnovi: 0,
  call: { fissate: 0, svolte: 0, no_show: 0, chiuse: 0, da_registrare: 0 },
  contenuti: { pubblicati: 0, reel_non_valutati: 0, migliori: [], da_cambiare: [] },
  fathom: { svolte: 0, registrate: 0, analizzate: 0, in_target: 0, fuori_target: 0, obiezioni: [] },
}

describe('la settimana della mail dei contenuti', () => {
  it('parte la domenica sera: da lunedì a oggi', () => {
    expect(settimanaDeiContenuti('2026-10-25')).toEqual({ da: '2026-10-19', a: '2026-10-25' })
  })

  it('negli altri giorni non c’è', () => {
    for (const giorno of ['2026-10-19', '2026-10-22', '2026-10-24', '2026-10-26']) {
      expect(settimanaDeiContenuti(giorno)).toBeNull()
    }
  })

  it('il link apre Pubblicati', () => {
    expect(linkPubblicati(URL_APP)).toBe('https://dashboard.percorsoalpha.com/marketing/pubblicati')
    expect(linkPubblicati(`${URL_APP}/`)).toBe('https://dashboard.percorsoalpha.com/marketing/pubblicati')
  })
})

describe('la mail dei contenuti', () => {
  const { oggetto, html, testo } = emailContenutiSettimana(settimana, URL_APP)

  it('l’oggetto dice la settimana e i lead in target', () => {
    expect(oggetto).toBe('Alpha Management · Contenuti dal 19/10 al 25/10/2026: 9 lead in target su 14')
  })

  it('la frase in cima dice lead in target, fuori target e da verificare', () => {
    const frase = 'Questa settimana hai attratto 14 lead: 9 in target e 4 fuori target, 1 da verificare.'
    expect(testo).toContain(frase)
    expect(html).toContain(frase)
    expect(testo).toContain('11 su 14 arrivano da un tuo contenuto, 2 da una risposta a una storia.')
  })

  it('nuovi clienti, call fissate e svolte', () => {
    expect(testo).toContain('Nuovi clienti: 2')
    expect(testo).toContain('Call fissate: 7')
    expect(testo).toContain('Call svolte: 5 (2 chiuse)')
    expect(testo).toContain('Rinnovi: 1')
    expect(testo).toContain('2 call svolte aspettano ancora l’esito.')
  })

  it('cosa ha attirato: i lead in target del contenuto e le views', () => {
    expect(testo).toContain('- Reel · Trazioni <da zero> & costanza: 4 in target su 6 lead · 12.480 views')
    expect(html).toContain('href="https://www.instagram.com/reel/AbCdE12345/"')
  })

  it('cosa cambiare: il punteggio, l’azione e il primo problema', () => {
    expect(testo).toContain('- Reel · Allenarsi a casa: 41/100 · Rifallo da capo · 900 views')
    expect(testo).toContain('Da sistemare per primo: Hook oltre le 15 parole e nessuna identificazione del cliente ideale.')
    expect(testo).toContain('2 reel della settimana non sono ancora valutati.')
  })

  it('dalle call di Fathom: registrate, analizzate, in target e obiezioni con le parole dell’app', () => {
    expect(testo).toContain('Call svolte: 5 · registrate su Fathom: 4 · analizzate da Claude: 3')
    expect(testo).toContain('In target secondo Claude: 2 · fuori target: 1')
    expect(testo).toContain('Obiezioni più frequenti: Prezzo e flusso di cassa del momento (2), Tempo (1)')
  })

  it('i nomi dei contenuti sono escapati nell’HTML', () => {
    expect(html).toContain('Trazioni &lt;da zero&gt; &amp; costanza')
    expect(html).not.toContain('<da zero>')
  })

  it('dice che non chiede analisi nuove a Claude e porta il link a Pubblicati', () => {
    expect(testo).toContain('Questa mail non chiede nessuna analisi nuova a Claude.')
    expect(html).toContain('href="https://dashboard.percorsoalpha.com/marketing/pubblicati"')
    expect(testo).toContain('Apri Pubblicati: https://dashboard.percorsoalpha.com/marketing/pubblicati')
  })

  it('niente trattini lunghi', () => {
    expect(`${oggetto}${html}${testo}`).not.toContain('—')
  })
})

describe('una settimana vuota', () => {
  const { oggetto, testo, html } = emailContenutiSettimana(vuota, URL_APP)

  it('lo dice senza numeri finti', () => {
    expect(oggetto).toBe('Alpha Management · Contenuti dal 19/10 al 25/10/2026: nessun lead nuovo')
    expect(testo).toContain('Questa settimana nessun lead nuovo dai DM.')
    expect(testo).toContain('Nessun lead è stato collegato a un contenuto questa settimana.')
    expect(testo).toContain('Questa settimana non hai pubblicato niente.')
    expect(testo).toContain('Nessuna call svolta questa settimana.')
    expect(html).not.toContain('arrivano da un tuo contenuto')
  })

  it('con contenuti pubblicati e tutti valutati: nessun reel da rifare', () => {
    const r = { ...vuota, contenuti: { ...vuota.contenuti, pubblicati: 3 } }
    expect(emailContenutiSettimana(r, URL_APP).testo).toContain('Nessun reel della settimana da rifare.')
  })

  it('con reel non valutati: dice di aprire Pubblicati e toccare Analizza', () => {
    const r = { ...vuota, contenuti: { ...vuota.contenuti, pubblicati: 3, reel_non_valutati: 1 } }
    expect(emailContenutiSettimana(r, URL_APP).testo).toContain(
      '1 reel non è ancora valutato: apri Pubblicati e tocca Analizza su quelli da controllare.',
    )
  })
})
