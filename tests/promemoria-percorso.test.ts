import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { emailPromemoria, traQuanto, type Promemoria } from '@/lib/email/promemoria'
import type { EsitoInvio } from '@/lib/email/invia'
import { inviaPromemoriaPercorso, MASSIMO_PER_SERA, TEMPO_INVIO_MAX_MS } from '@/lib/promemoria/percorso'

const URL_APP = 'https://dashboard.percorsoalpha.com'
const OGGI = '2026-10-04'

function promemoria(p: Partial<Promemoria> = {}): Promemoria {
  return {
    client_id: 'c1',
    sale_id: 's1',
    tipo: 'feedback_3_mesi',
    azione: 'invia',
    nome: 'Mario',
    cognome: 'Rossi',
    telefono: '349 243 8115',
    prodotto: 'Percorso Alpha 6 mesi',
    data_inizio: '2026-07-02',
    data_fine: '2027-01-01',
    giorni_mancanti: 89,
    ...p,
  }
}

describe('email della call dei 3 mesi', () => {
  const email = emailPromemoria(promemoria(), { urlApp: URL_APP, oggi: OGGI })

  it('oggetto chiaro, con il nome del cliente', () => {
    expect(email.oggetto).toBe('Call dei 3 mesi con Mario Rossi: raccogli il feedback')
  })

  it('dice prodotto, inizio, fine e giorni alla fine', () => {
    expect(email.testo).toContain('Il percorso di Mario Rossi finisce il 01/01/2027, tra 89 giorni')
    expect(email.testo).toContain('raccogliere il suo feedback')
    expect(email.testo).toContain('Percorso: Percorso Alpha 6 mesi')
    expect(email.testo).toContain('Inizio: 02/07/2026')
    expect(email.testo).toContain('Fine: 01/01/2027')
    expect(email.testo).toContain('Giorni alla fine: 89 giorni')
    expect(email.html).toContain('Promemoria · Call dei 3 mesi')
    expect(email.html).toContain('lang="it"')
  })

  it('porta alla scheda del cliente e su WhatsApp, mai a registrare un rinnovo', () => {
    expect(email.testo).toContain(`Apri la scheda del cliente: ${URL_APP}/clients/c1`)
    expect(email.html).toContain(`href="${URL_APP}/clients/c1"`)
    expect(email.testo).toMatch(/Scrivi su WhatsApp: https:\/\/wa\.me\/393492438115\?text=/)
    expect(decodeURIComponent(email.testo)).toContain('raccogliere il tuo feedback')
    expect(email.testo).not.toContain('Registra rinnovo')
    expect(email.html).toContain(`src="${URL_APP}/brand/percorso-alpha-email.png"`)
  })

  it('bottoni col colore sulla cella (Outlook) e un piè di pagina vero anche se la fine cambia', () => {
    expect(email.html).toContain('bgcolor="#7A1F2B"')
    expect(email.html).toContain('bgcolor="#FFFFFF"')
    expect(email.testo).toContain('se cambia la data di fine del percorso, ti arriva di nuovo per quella nuova')
    expect(email.testo).not.toContain('una volta per percorso')
  })
})

describe('email della call di rinnovo', () => {
  const email = emailPromemoria(
    promemoria({ tipo: 'rinnovo_1_mese', data_inizio: '2026-04-27', data_fine: '2026-10-26', giorni_mancanti: 22 }),
    { urlApp: `${URL_APP}/`, oggi: OGGI },
  )

  it('oggetto con la data di fine', () => {
    expect(email.oggetto).toBe('Call di rinnovo con Mario Rossi: il percorso finisce il 26/10/2026')
  })

  it('dice di contattarlo, con scheda, WhatsApp e «Registra rinnovo»', () => {
    expect(email.testo).toContain('Il percorso di Mario Rossi finisce il 26/10/2026, tra 22 giorni: contattalo per la call di rinnovo.')
    expect(email.testo).toContain(`Apri la scheda del cliente: ${URL_APP}/clients/c1`)
    expect(email.testo).toContain(`Registra rinnovo: ${URL_APP}/sales/new?cliente=c1&tipo=rinnovo`)
    expect(email.html).toContain(`href="${URL_APP}/sales/new?cliente=c1&amp;tipo=rinnovo"`)
    expect(decodeURIComponent(email.testo)).toContain('finisce il 26/10/2026')
    expect(email.html).toContain('Promemoria · Call di rinnovo')
  })

  it('senza telefono niente WhatsApp; l’ultimo giorno dice «oggi»', () => {
    const oggi = emailPromemoria(promemoria({ tipo: 'rinnovo_1_mese', telefono: null, data_fine: OGGI, giorni_mancanti: 0 }), {
      urlApp: URL_APP,
      oggi: OGGI,
    })
    expect(oggi.testo).not.toContain('WhatsApp')
    expect(oggi.html).not.toContain('wa.me')
    expect(oggi.testo).toContain('finisce oggi, 04/10/2026')
    expect(oggi.testo).toContain('Giorni alla fine: Finisce oggi')
    expect(traQuanto(1)).toBe('tra 1 giorno')
  })

  it('i nomi non diventano HTML', () => {
    const strano = emailPromemoria(promemoria({ nome: '<b>Ugo</b>', cognome: '"Rossi"' }), { urlApp: URL_APP, oggi: OGGI })
    expect(strano.html).not.toContain('<b>Ugo</b>')
    expect(strano.html).toContain('&lt;b&gt;Ugo&lt;/b&gt; &quot;Rossi&quot;')
  })
})

// ---------------------------------------------------------------------------
// The cron step: books, sends, then records; a failure frees the booking.
// The fake database books like the real one (promemoria_percorso_prenota):
// one row per client, kind and end, a booking taken only when free.
// ---------------------------------------------------------------------------
type Registrata = { id: string; client_id: string; tipo: string; data_fine: string; esito: string }

function dbFinto(dovuti: Promemoria[], { ritardoMs = 0 }: { ritardoMs?: number } = {}) {
  const eventi: string[] = []
  const righe = new Map<string, Registrata>()
  const chiamate: { nome: string; argomenti: unknown }[] = []
  let progressivo = 0
  const pausa = () => new Promise((r) => setTimeout(r, ritardoMs))

  const db = {
    rpc: vi.fn(async (nome: string, argomenti: Record<string, string>) => {
      chiamate.push({ nome, argomenti })
      await pausa()
      if (nome === 'promemoria_percorso_da_inviare') {
        // what is already in the table is not due any more
        const liberi = dovuti.filter((d) => !righe.has(`${d.client_id}|${d.tipo}|${d.data_fine}`))
        return { data: liberi, error: null }
      }
      expect(nome).toBe('promemoria_percorso_prenota')
      const chiave = `${argomenti.p_client_id}|${argomenti.p_tipo}|${argomenti.p_data_fine}`
      if (righe.has(chiave)) return { data: null, error: null }
      const riga = {
        id: `r${++progressivo}`,
        client_id: argomenti.p_client_id,
        tipo: argomenti.p_tipo,
        data_fine: argomenti.p_data_fine,
        esito: argomenti.p_esito,
      }
      righe.set(chiave, riga)
      eventi.push(`prenota:${riga.client_id}:${riga.tipo}:${riga.esito}`)
      return { data: riga.id, error: null }
    }),
    from: vi.fn((tabella: string) => {
      expect(tabella).toBe('promemoria_percorso')
      const filtro = (azione: (r: Registrata) => void) => {
        const condizioni: [string, string][] = []
        const catena = {
          eq: (colonna: string, valore: string) => {
            condizioni.push([colonna, valore])
            return condizioni.length === 2 ? esegui() : catena
          },
        }
        const esegui = async () => {
          for (const r of [...righe.values()]) {
            if (condizioni.every(([c, v]) => (r as Record<string, string>)[c] === v)) azione(r)
          }
          return { error: null }
        }
        return catena
      }
      return {
        update: (valori: { esito: string }) =>
          filtro((r) => {
            r.esito = valori.esito
            eventi.push(`registra:${r.client_id}:${r.tipo}:${r.esito}`)
          }),
        delete: () =>
          filtro((r) => {
            righe.delete(`${r.client_id}|${r.tipo}|${r.data_fine}`)
            eventi.push(`libera:${r.client_id}:${r.tipo}`)
          }),
      }
    }),
  }
  const registrate = () => [...righe.values()]
  return { db: db as unknown as Parameters<typeof inviaPromemoriaPercorso>[0]['db'], eventi, registrate, chiamate }
}

describe('passo dei promemoria nel cron giornaliero', () => {
  const ambiente = { ...process.env }
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_finta'
    process.env.EMAIL_MITTENTE = 'Percorso Alpha <join@percorsoalpha.com>'
  })
  afterEach(() => {
    process.env = { ...ambiente }
  })

  it('prenota ogni promemoria, lo manda agli admin, poi lo segna inviato; il recupero salta la call dei 3 mesi', async () => {
    const { db, eventi, registrate, chiamate } = dbFinto([
      promemoria({ client_id: 'a', tipo: 'rinnovo_1_mese', data_fine: '2026-10-26', giorni_mancanti: 22 }),
      promemoria({ client_id: 'a', tipo: 'feedback_3_mesi', azione: 'salta', data_fine: '2026-10-26', giorni_mancanti: 22 }),
      promemoria({ client_id: 'b', tipo: 'feedback_3_mesi', nome: 'Bruno', cognome: 'Bianchi' }),
    ])
    const invia = vi.fn(
      async (m: { a: string | string[]; oggetto: string; idempotenza?: string; timeoutMs?: number }): Promise<EsitoInvio> => {
        eventi.push(`invia:${m.oggetto}`)
        return { inviata: true }
      },
    )

    const esito = await inviaPromemoriaPercorso({ db, oggi: OGGI, indirizzi: ['dany@alpha.test'], urlApp: URL_APP, invia, pausaMs: 0 })

    expect(chiamate[0]).toEqual({ nome: 'promemoria_percorso_da_inviare', argomenti: { p_giorno: OGGI } })
    expect(chiamate[1]).toEqual({
      nome: 'promemoria_percorso_prenota',
      argomenti: { p_client_id: 'a', p_tipo: 'feedback_3_mesi', p_data_fine: '2026-10-26', p_sale_id: 's1', p_esito: 'saltato' },
    })
    expect(invia).toHaveBeenCalledTimes(2)
    expect(invia.mock.calls[0][0].a).toEqual(['dany@alpha.test'])
    // Resend sends the same reminder of the same day once, and never waits forever
    expect(invia.mock.calls[0][0].idempotenza).toBe('promemoria-percorso/a/rinnovo_1_mese/2026-10-26/2026-10-04')
    expect(invia.mock.calls[0][0].timeoutMs).toBe(TEMPO_INVIO_MAX_MS)
    expect(eventi).toEqual([
      'prenota:a:feedback_3_mesi:saltato',
      'prenota:a:rinnovo_1_mese:in_invio',
      'invia:Call di rinnovo con Mario Rossi: il percorso finisce il 26/10/2026',
      'registra:a:rinnovo_1_mese:inviato',
      'prenota:b:feedback_3_mesi:in_invio',
      'invia:Call dei 3 mesi con Bruno Bianchi: raccogli il feedback',
      'registra:b:feedback_3_mesi:inviato',
    ])
    expect(registrate().map((r) => `${r.client_id}:${r.tipo}:${r.data_fine}:${r.esito}`).sort()).toEqual([
      'a:feedback_3_mesi:2026-10-26:saltato',
      'a:rinnovo_1_mese:2026-10-26:inviato',
      'b:feedback_3_mesi:2027-01-01:inviato',
    ])
    expect(esito).toEqual({ configurata: true, inviati: 2, saltati: 1, non_riusciti: 0, gia_presi: 0, rimandati: 0 })
  })

  it('due giri del cron la stessa sera: una sola email per promemoria', async () => {
    // both read the same due reminders before either books one
    const { db, registrate } = dbFinto(
      [promemoria({ client_id: 'a', tipo: 'rinnovo_1_mese' }), promemoria({ client_id: 'b' })],
      { ritardoMs: 5 },
    )
    const oggetti: string[] = []
    const invia = vi.fn(async (m: { oggetto: string }): Promise<EsitoInvio> => {
      oggetti.push(m.oggetto)
      await new Promise((r) => setTimeout(r, 20))
      return { inviata: true }
    })
    const argomenti = { db, oggi: OGGI, indirizzi: ['dany@alpha.test'], urlApp: URL_APP, invia, pausaMs: 0 }

    const [primo, secondo] = await Promise.all([inviaPromemoriaPercorso(argomenti), inviaPromemoriaPercorso(argomenti)])

    expect(invia).toHaveBeenCalledTimes(2)
    expect(new Set(oggetti).size).toBe(2)
    expect(registrate().map((r) => r.esito)).toEqual(['inviato', 'inviato'])
    const somma = (k: 'inviati' | 'gia_presi') =>
      (primo.configurata ? primo[k] : 0) + (secondo.configurata ? secondo[k] : 0)
    expect(somma('inviati')).toBe(2)
    expect(somma('gia_presi')).toBe(2)
  })

  it('se Resend non lo accetta toglie la prenotazione e non registra niente: riparte la sera dopo', async () => {
    const { db, registrate, eventi } = dbFinto([promemoria({ client_id: 'a', tipo: 'rinnovo_1_mese' })])
    const invia = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: false, motivo: 'errore' }))

    const esito = await inviaPromemoriaPercorso({ db, oggi: OGGI, indirizzi: ['dany@alpha.test'], urlApp: URL_APP, invia, pausaMs: 0 })

    expect(invia).toHaveBeenCalledTimes(1)
    expect(eventi).toEqual(['prenota:a:rinnovo_1_mese:in_invio', 'libera:a:rinnovo_1_mese'])
    expect(registrate()).toEqual([])
    expect(esito).toEqual({ configurata: true, inviati: 0, saltati: 0, non_riusciti: 1, gia_presi: 0, rimandati: 0 })
  })

  it('dopo tre rifiuti di fila si ferma; oltre il massimo della sera, il resto domani', async () => {
    const tanti = Array.from({ length: MASSIMO_PER_SERA + 5 }, (_, i) => promemoria({ client_id: `c${i}` }))
    const rifiuti = dbFinto(tanti)
    const rifiuta = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: false, motivo: 'errore' }))
    const fermo = await inviaPromemoriaPercorso({ db: rifiuti.db, oggi: OGGI, indirizzi: ['d@a.test'], urlApp: URL_APP, invia: rifiuta, pausaMs: 0 })
    expect(rifiuta).toHaveBeenCalledTimes(3)
    expect(fermo).toMatchObject({ non_riusciti: 3, rimandati: tanti.length - 3 })
    expect(rifiuti.registrate()).toEqual([])

    const ok = dbFinto(tanti)
    const accetta = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: true }))
    const sera = await inviaPromemoriaPercorso({ db: ok.db, oggi: OGGI, indirizzi: ['d@a.test'], urlApp: URL_APP, invia: accetta, pausaMs: 0 })
    expect(accetta).toHaveBeenCalledTimes(MASSIMO_PER_SERA)
    expect(ok.registrate()).toHaveLength(MASSIMO_PER_SERA)
    expect(sera).toMatchObject({ inviati: MASSIMO_PER_SERA, rimandati: 5 })
  })

  it('un invio parte solo se finisce in tempo, anche aspettando Resend fino al suo limite: il resto domani, niente prenotato', async () => {
    const { db, registrate } = dbFinto([promemoria({ client_id: 'a' }), promemoria({ client_id: 'b' })])
    const invia = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: true }))

    const esito = await inviaPromemoriaPercorso({
      db,
      oggi: OGGI,
      indirizzi: ['dany@alpha.test'],
      urlApp: URL_APP,
      invia,
      pausaMs: 0,
      // still 5 seconds, not enough for an email that may wait 8
      entro: Date.now() + TEMPO_INVIO_MAX_MS - 3_000,
    })

    expect(invia).not.toHaveBeenCalled()
    expect(registrate()).toEqual([])
    expect(esito).toEqual({ configurata: true, inviati: 0, saltati: 0, non_riusciti: 0, gia_presi: 0, rimandati: 2 })
  })

  it('senza RESEND_API_KEY non chiede, non manda e non registra niente', async () => {
    delete process.env.RESEND_API_KEY
    const { db, registrate, chiamate } = dbFinto([promemoria(), promemoria({ azione: 'salta' })])
    const invia = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: true }))

    const esito = await inviaPromemoriaPercorso({ db, oggi: OGGI, indirizzi: ['dany@alpha.test'], urlApp: URL_APP, invia, pausaMs: 0 })

    expect(esito).toEqual({ configurata: false })
    expect(invia).not.toHaveBeenCalled()
    expect(chiamate).toEqual([])
    expect(registrate()).toEqual([])
  })

  it('senza admin attivi nemmeno', async () => {
    const { db, chiamate } = dbFinto([promemoria()])
    const invia = vi.fn(async (): Promise<EsitoInvio> => ({ inviata: true }))
    expect(await inviaPromemoriaPercorso({ db, oggi: OGGI, indirizzi: [], urlApp: URL_APP, invia, pausaMs: 0 })).toEqual({ configurata: false })
    expect(invia).not.toHaveBeenCalled()
    expect(chiamate).toEqual([])
  })
})
