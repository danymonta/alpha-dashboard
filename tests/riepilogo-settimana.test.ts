import { describe, expect, it } from 'vitest'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  MASSIMO_INCASSI,
  MASSIMO_VENDITE,
  emailRiepilogo,
  settimanaDelRiepilogo,
  type Riepilogo,
} from '@/lib/email/riepilogo'

// formatEuro puts a non-breaking space before the €
const spazi = (t: string) => t.replace(/ /g, ' ')
const URL_APP = 'https://dashboard.percorsoalpha.com'

describe('settimanaDelRiepilogo: solo il venerdì, da sabato a venerdì', () => {
  it('il venerdì copre i sette giorni da sabato a quel venerdì', () => {
    expect(settimanaDelRiepilogo('2026-10-09')).toEqual({ da: '2026-10-03', a: '2026-10-09' })
    expect(settimanaDelRiepilogo('2026-10-16')).toEqual({ da: '2026-10-10', a: '2026-10-16' })
  })

  it('gli altri giorni nessun riepilogo', () => {
    expect(settimanaDelRiepilogo('2026-10-10')).toBeNull() // sabato
    expect(settimanaDelRiepilogo('2026-10-08')).toBeNull() // giovedì
    // the whole week from Saturday to Thursday
    for (let i = 0; i < 6; i++) expect(settimanaDelRiepilogo(aggiungiGiorni('2026-10-03', i))).toBeNull()
  })

  it('due venerdì di fila: nessun giorno resta fuori, nessuno conta due volte', () => {
    const prima = settimanaDelRiepilogo('2026-10-09')!
    const dopo = settimanaDelRiepilogo('2026-10-16')!
    expect(aggiungiGiorni(prima.a, 1)).toBe(dopo.da)
  })

  it('attorno al cambio dell’ora e a capodanno', () => {
    // back to winter time on Sunday 25/10/2026
    expect(settimanaDelRiepilogo('2026-10-30')).toEqual({ da: '2026-10-24', a: '2026-10-30' })
    expect(settimanaDelRiepilogo('2026-10-25')).toBeNull()
    // summer time from Sunday 28/03/2027
    expect(settimanaDelRiepilogo('2027-04-02')).toEqual({ da: '2027-03-27', a: '2027-04-02' })
    expect(settimanaDelRiepilogo('2027-03-28')).toBeNull()
    expect(settimanaDelRiepilogo('2027-01-01')).toEqual({ da: '2026-12-26', a: '2027-01-01' })
  })

  it('il giorno è quello di Roma, non quello del server in UTC', () => {
    // the cron runs at 18:00 UTC: Friday evening in Rome in summer and in winter
    expect(settimanaDelRiepilogo(oggiRoma(new Date('2026-10-23T18:00:00Z')))).toEqual({ da: '2026-10-17', a: '2026-10-23' })
    expect(settimanaDelRiepilogo(oggiRoma(new Date('2026-10-30T18:00:00Z')))).toEqual({ da: '2026-10-24', a: '2026-10-30' })
    // 22:30 UTC on a Friday: already Saturday in summer (00:30), still Friday in winter (23:30)
    expect(settimanaDelRiepilogo(oggiRoma(new Date('2026-10-23T22:30:00Z')))).toBeNull()
    expect(settimanaDelRiepilogo(oggiRoma(new Date('2026-10-30T22:30:00Z')))).toEqual({ da: '2026-10-24', a: '2026-10-30' })
    // 23:30 UTC on Thursday in summer: Friday in Rome
    expect(settimanaDelRiepilogo(oggiRoma(new Date('2026-10-08T23:30:00Z')))).toEqual({ da: '2026-10-03', a: '2026-10-09' })
  })
})

describe('emailRiepilogo: la settimana del team', () => {
  const r: Riepilogo = {
    da: '2026-10-03',
    a: '2026-10-09',
    cash: 2350,
    cash_per_parte: { nuovi_clienti: 1500, rate_precedenti: 500, rinnovo: 350, upsell: 0 },
    incassi: [
      {
        giorno: '2026-10-05',
        cliente: 'Loris Lo Presti',
        importo: 1500,
        metodo: 'contanti',
        rimborso: false,
        tipo: 'nuovo',
        numero_rata: 1,
        numero_rate: 3,
        parte: 'nuovi_clienti',
      },
      {
        giorno: '2026-10-07',
        cliente: 'Fausto Neri',
        importo: 350,
        metodo: 'paypal',
        rimborso: false,
        tipo: 'rinnovo',
        numero_rata: 1,
        numero_rate: 1,
        parte: 'rinnovo',
      },
      {
        giorno: '2026-10-09',
        cliente: 'Mario Rossi',
        importo: 500,
        metodo: 'bonifico',
        rimborso: false,
        tipo: 'nuovo',
        numero_rata: 2,
        numero_rate: 4,
        parte: 'rate_precedenti',
      },
    ],
    vendite: [
      { giorno: '2026-10-05', cliente: 'Loris Lo Presti', tipo: 'nuovo', valore: 4500 },
      { giorno: '2026-10-07', cliente: 'Fausto Neri', tipo: 'rinnovo', valore: 350 },
      { giorno: '2026-10-08', cliente: 'Elia Martini', tipo: 'nuovo', valore: 1500 },
    ],
    vendite_per_tipo: { nuovo: 2, rinnovo: 1, upsell: 0 },
    in_ritardo: { numero: 2, totale: 1650 },
    clienti_in_ritardo: ['Elia Martini', 'Gino Verdi'],
    clienti_in_ritardo_totale: 2,
    in_scadenza_7_giorni: { numero: 1, totale: 500 },
    dm_totali: 420,
    conversazioni: 96,
    call_prenotate: 14,
    call_svolte: 9,
    no_show: 2,
    chiuse: 3,
  }

  it('oggetto, intestazione e cash della settimana', () => {
    const { oggetto, testo, html } = emailRiepilogo(r, URL_APP)
    expect(spazi(oggetto)).toBe('Alpha Management · settimana dal 03/10 al 09/10: 2.350,00 € incassati')
    expect(testo.split('\n')[0]).toBe('La settimana da sabato 03/10 a venerdì 09/10/2026')
    expect(spazi(testo)).toContain('Cash incassato nella settimana: 2.350,00 €')
    // the parts that are not zero, as SQL gives them
    expect(spazi(testo)).toContain(
      'Di cui: nuovi clienti della settimana 1.500,00 €, rate di clienti già entrati 500,00 €, rinnovi 350,00 €',
    )
    expect(testo).not.toContain('upsell 0')
    expect(html).toContain('La settimana da sabato 03/10 a venerdì 09/10/2026')
    expect(spazi(html)).toContain('2.350,00 € <span')
    expect(spazi(html)).toContain('Di cui: nuovi clienti della settimana 1.500,00 €')
  })

  it('le righe della settimana: vendite coi tipi, ritardi e scadenze, volumi del team', () => {
    const { testo, html } = emailRiepilogo(r, URL_APP)
    const t = spazi(testo)
    expect(t).toContain('Vendite firmate: 3 (2 nuovi clienti, 1 rinnovo)')
    expect(t).toContain('Rate in ritardo oggi: 2 · 1.650,00 €')
    expect(t).toContain('In scadenza nei prossimi 7 giorni: 1 · 500,00 €')
    expect(t).toContain('DM del team: 420')
    expect(t).toContain('Conversazioni: 96')
    expect(t).toContain('Call prenotate: 14')
    expect(t).toContain('Call svolte: 9')
    expect(t).toContain('No show: 2')
    expect(t).toContain('Chiuse: 3')
    // the same rows in the HTML
    for (const etichetta of ['Vendite firmate', 'Rate in ritardo oggi', 'DM del team', 'Conversazioni', 'Call prenotate', 'Call svolte', 'No show', 'Chiuse']) {
      expect(html).toContain(`>${etichetta}</td>`)
    }
  })

  it('ogni incasso e ogni vendita col suo giorno davanti, dal più vecchio', () => {
    const { testo, html } = emailRiepilogo(r, URL_APP)
    const t = spazi(testo)
    expect(t).toContain('lun 05/10 · Incasso: Loris Lo Presti, 1.500,00 € (rata 1 di 3, nuovo cliente, contanti)')
    expect(t).toContain('mer 07/10 · Incasso: Fausto Neri, 350,00 € (rata 1 di 1, rinnovo, PayPal)')
    expect(t).toContain('ven 09/10 · Incasso: Mario Rossi, 500,00 € (rata 2 di 4, cliente già entrato, bonifico)')
    expect(t).toContain('gio 08/10 · Vendita: Elia Martini, nuovo cliente, 1.500,00 €')
    expect(t.indexOf('lun 05/10 · Incasso')).toBeLessThan(t.indexOf('ven 09/10 · Incasso'))
    expect(t).toContain('In ritardo: Elia Martini, Gino Verdi')
    expect(t).toContain(`Apri la dashboard: ${URL_APP}`)
    expect(spazi(html)).toContain('ven 09/10 · Incasso: Mario Rossi, 500,00 € (rata 2 di 4, cliente già entrato, bonifico)')
    expect(html).toContain(`href="${URL_APP}"`)
    // nothing to cut: no "e altri"
    expect(testo).not.toContain('e altri')
    expect(testo).not.toContain('e altre')
  })

  it('un rimborso si dice rimborso, col suo importo', () => {
    const { testo } = emailRiepilogo(
      { ...r, incassi: [{ ...r.incassi[0], giorno: '2026-10-08', importo: -100, rimborso: true }] },
      URL_APP,
    )
    expect(spazi(testo)).toContain('gio 08/10 · Rimborso: Loris Lo Presti, -100,00 € (rata 1 di 3, nuovo cliente, contanti)')
  })

  it('una settimana senza vendite né incassi: zero, nessun elenco vuoto', () => {
    const vuota: Riepilogo = {
      ...r,
      cash: 0,
      cash_per_parte: { nuovi_clienti: 0, rate_precedenti: 0, rinnovo: 0, upsell: 0 },
      incassi: [],
      vendite: [],
      vendite_per_tipo: { nuovo: 0, rinnovo: 0, upsell: 0 },
      clienti_in_ritardo: [],
      clienti_in_ritardo_totale: 0,
    }
    const { oggetto, testo, html } = emailRiepilogo(vuota, URL_APP)
    expect(spazi(oggetto)).toBe('Alpha Management · settimana dal 03/10 al 09/10: 0,00 € incassati')
    expect(testo).toContain('Vendite firmate: 0')
    expect(testo).not.toContain('Di cui')
    expect(testo).not.toContain('Incassi della settimana')
    expect(testo).not.toContain('Vendite della settimana')
    expect(testo).not.toContain('In ritardo:')
    expect(html).not.toContain('<ul')
  })

  it(`oltre ${MASSIMO_INCASSI} incassi e ${MASSIMO_VENDITE} vendite: il resto si trova nell'app`, () => {
    const incassi = Array.from({ length: MASSIMO_INCASSI + 3 }, (_, i) => ({
      ...r.incassi[2],
      cliente: `Cliente ${i + 1}`,
    }))
    const vendite = Array.from({ length: MASSIMO_VENDITE + 1 }, (_, i) => ({ ...r.vendite[0], cliente: `Vendita ${i + 1}` }))
    const { testo, html } = emailRiepilogo({ ...r, incassi, vendite }, `${URL_APP}/`)
    const righeIncassi = testo.split('\n').filter((l) => l.includes('· Incasso:'))
    expect(righeIncassi).toHaveLength(MASSIMO_INCASSI)
    expect(testo).toContain(`Cliente ${MASSIMO_INCASSI},`)
    expect(testo).not.toContain(`Cliente ${MASSIMO_INCASSI + 1},`)
    expect(testo).toContain(`e altri 3: li trovi in Incassi (${URL_APP}/payments)`)
    expect(testo.split('\n').filter((l) => l.includes('· Vendita:'))).toHaveLength(MASSIMO_VENDITE)
    expect(testo).toContain(`e un’altra: la trovi in Vendite (${URL_APP}/sales)`)
    expect(html).toContain(`href="${URL_APP}/payments"`)
    expect(html).toContain('e altri 3: li trovi in Incassi</a>')
    expect(html).toContain(`href="${URL_APP}/sales"`)
    // the totals stay those of SQL, not of the lines shown
    expect(spazi(testo)).toContain('Cash incassato nella settimana: 2.350,00 €')
  })

  it('oltre 8 clienti in ritardo: i più vecchi per nome, poi quanti altri e dove trovarli', () => {
    const clienti = Array.from({ length: 8 }, (_, i) => `Cliente ${i + 1}`)
    const { testo, html } = emailRiepilogo({ ...r, clienti_in_ritardo: clienti, clienti_in_ritardo_totale: 11 }, URL_APP)
    expect(testo).toContain(`In ritardo: ${clienti.join(', ')}`)
    expect(testo).toContain(`e altri 3: li trovi in Incassi (${URL_APP}/payments?vista=ritardo)`)
    expect(html).toContain(`href="${URL_APP}/payments?vista=ritardo"`)
    expect(emailRiepilogo({ ...r, clienti_in_ritardo: clienti, clienti_in_ritardo_totale: 9 }, URL_APP).testo).toContain(
      'e un altro: lo trovi in Incassi',
    )
    // all of them shown: nothing more to say
    expect(emailRiepilogo({ ...r, clienti_in_ritardo: clienti, clienti_in_ritardo_totale: 8 }, URL_APP).testo).not.toContain('e altri')
  })

  it('un incasso solo in più: «e un altro»', () => {
    const incassi = Array.from({ length: MASSIMO_INCASSI + 1 }, () => r.incassi[0])
    expect(emailRiepilogo({ ...r, incassi }, URL_APP).testo).toContain('e un altro: lo trovi in Incassi')
  })

  it('non lascia passare HTML da nomi e indirizzi', () => {
    const { html } = emailRiepilogo(
      {
        ...r,
        clienti_in_ritardo: ['<script>x</script>'],
        incassi: [{ ...r.incassi[0], cliente: '<img src=x onerror=alert(1)>' }],
        vendite: [{ ...r.vendite[0], cliente: 'Tom & "Jerry"' }],
      },
      'https://x.it/"><script>',
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Tom &amp; &quot;Jerry&quot;')
  })

  it('solo totali del team e clienti: nessun nome di chi ha compilato', () => {
    const { testo } = emailRiepilogo(r, URL_APP)
    expect(testo).not.toMatch(/setter|closer|compilat/i)
  })
})
