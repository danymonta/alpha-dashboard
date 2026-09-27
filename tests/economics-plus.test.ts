import { describe, expect, it } from 'vitest'

import { emailRiepilogo, type Riepilogo } from '@/lib/email/riepilogo'
import { obiettiviSchema } from '@/lib/validation/obiettivi'
import { linkWhatsApp, messaggioRata, messaggioRinnovo, numeroWhatsApp } from '@/lib/whatsapp'

const spazi = (t: string) => t.replace(/ /g, ' ')

describe('WhatsApp', () => {
  it('riconosce i numeri italiani scritti in ogni modo', () => {
    expect(numeroWhatsApp('+39 349 243 8115')).toBe('393492438115')
    expect(numeroWhatsApp('349 2438115')).toBe('393492438115')
    expect(numeroWhatsApp('0039 349 2438115')).toBe('393492438115')
    expect(numeroWhatsApp('+41 79 123 45 67')).toBe('41791234567')
    expect(numeroWhatsApp('')).toBeNull()
    expect(numeroWhatsApp('ciao')).toBeNull()
    expect(numeroWhatsApp(null)).toBeNull()
  })

  it('il link apre la chat col messaggio già scritto', () => {
    expect(linkWhatsApp('3492438115', 'Ciao Loris!')).toBe('https://wa.me/393492438115?text=Ciao%20Loris!')
    expect(linkWhatsApp(null, 'x')).toBeNull()
  })

  it('il promemoria della rata cambia se è già scaduta', () => {
    const prima = spazi(messaggioRata({ nome: 'Loris Lo Presti', numero_rata: 2, importo: 500, scadenza: '2026-10-12', oggi: '2026-10-01' }))
    expect(prima).toBe('Ciao Loris, un promemoria per la rata 2 del tuo percorso Percorso Alpha (500,00 €), in scadenza il 12/10/2026. Grazie!')
    const dopo = spazi(messaggioRata({ nome: 'Loris', numero_rata: 2, importo: 500, scadenza: '2026-09-12', oggi: '2026-10-01' }))
    expect(dopo).toContain('che era in scadenza il 12/09/2026')
  })

  it('il messaggio del rinnovo', () => {
    expect(messaggioRinnovo({ nome: 'Saverio Rossi', data_fine: '2026-10-20', oggi: '2026-10-01' })).toContain(
      'Ciao Saverio! Il tuo percorso con Percorso Alpha finisce il 20/10/2026',
    )
    expect(messaggioRinnovo({ nome: null, data_fine: '2026-09-20', oggi: '2026-10-01' })).toContain('si è chiuso il 20/09/2026')
  })
})

describe('obiettivi del mese', () => {
  it('importi all’italiana, campi vuoti = nessun obiettivo', () => {
    expect(obiettiviSchema.parse({ mese: '2026-10-01', cash: '10.000', nuovi_clienti: '5' })).toEqual({
      mese: '2026-10-01',
      cash: 10000,
      nuovi_clienti: 5,
    })
    expect(obiettiviSchema.parse({ mese: '2026-10-01', cash: '', nuovi_clienti: '' })).toEqual({
      mese: '2026-10-01',
      cash: null,
      nuovi_clienti: null,
    })
    expect(obiettiviSchema.safeParse({ mese: '2026-10-15', cash: '1' }).success).toBe(false)
    expect(obiettiviSchema.safeParse({ mese: '2026-10-01', nuovi_clienti: '2,5' }).success).toBe(false)
  })
})

describe('riepilogo serale', () => {
  const r: Riepilogo = {
    giorno: '2026-10-01',
    cash: 2500,
    incassi: [{ cliente: 'Loris Lo Presti', importo: 2500, metodo: 'contanti' }],
    vendite: [{ cliente: 'Loris Lo Presti', tipo: 'nuovo', valore: 2500 }],
    in_ritardo: { numero: 2, totale: 1650 },
    clienti_in_ritardo: ['Elia Martini', 'Fausto Neri'],
    in_scadenza_7_giorni: { numero: 1, totale: 500 },
    dm_totali: 80,
    call_svolte: 3,
    chiuse: 1,
  }

  it('oggetto e testo con i numeri del giorno, solo totali di team', () => {
    const { oggetto, testo, html } = emailRiepilogo(r, 'https://dashboard.percorsoalpha.com')
    expect(spazi(oggetto)).toBe('Alpha Management · 01/10/2026: 2.500,00 € incassati')
    expect(spazi(testo)).toContain('Rate in ritardo: 2 · 1.650,00 €')
    expect(testo).toContain('Incasso: Loris Lo Presti')
    expect(testo).toContain('In ritardo: Elia Martini, Fausto Neri')
    expect(testo).toContain('DM del team: 80')
    expect(html).toContain('https://dashboard.percorsoalpha.com')
  })

  it('non lascia passare HTML dai nomi', () => {
    const { html } = emailRiepilogo({ ...r, clienti_in_ritardo: ['<script>x</script>'] }, 'https://x.it')
    expect(html).not.toContain('<script>')
  })
})
