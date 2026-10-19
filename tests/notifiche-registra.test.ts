import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/backup/crea', () => ({
  creaBackup: vi.fn(async () => ({ creato_il: '2026-10-19T04:00:00Z', tabelle: {} })),
  fileBackup: vi.fn(() => ({ nome: 'backup.json.gz', contenuto: Buffer.from('x') })),
}))
vi.mock('@/lib/email/backup', () => ({
  emailBackup: vi.fn(() => ({ oggetto: 'Backup', html: '<p>b</p>', testo: 'b' })),
}))

import { inviaBackup } from '@/lib/backup/invia'
import { creaBackup } from '@/lib/backup/crea'
import { inviaRiepilogoSettimana } from '@/lib/email/riepilogo-invio'
import type { Promemoria } from '@/lib/email/promemoria'
import { documentoSicuro } from '@/lib/notifiche/documento'
import { registraNotifica, valoriNotifica, type NotificaDaRegistrare } from '@/lib/notifiche/registra'
import { anteprimaDaTesto, corpoDiRiserva, notificaBackup } from '@/lib/notifiche/testi'
import { LIMITI_NOTIFICA, linkInterno } from '@/lib/notifiche/tipi'
import { chiaveNotifica, inviaPromemoriaPercorso } from '@/lib/promemoria/percorso'

const ADMIN_A = '11111111-1111-4111-8111-111111111111'
const ADMIN_B = '11111111-1111-4111-8111-222222222222'

type Riga = { destinatario: string; chiave: string; tipo: string; titolo: string; email_inviata: boolean; link: string | null }

/** A fake database that saves notifications like public.notifiche_registra: idempotent, a repeat only turns email_inviata on. */
function dbFinto({ promemoria = [], riepilogo }: { promemoria?: Promemoria[]; riepilogo?: unknown } = {}) {
  const righe = new Map<string, Riga>()
  const chiamate: string[] = []
  const prenotati = new Set<string>()
  const db = {
    rpc: vi.fn(async (nome: string, a: Record<string, unknown>) => {
      chiamate.push(nome)
      if (nome === 'notifiche_registra') {
        for (const d of a.p_destinatari as string[]) {
          const k = `${d}|${a.p_chiave}`
          const c = righe.get(k)
          if (c) c.email_inviata = c.email_inviata || Boolean(a.p_email_inviata)
          else
            righe.set(k, {
              destinatario: d,
              chiave: a.p_chiave as string,
              tipo: a.p_tipo as string,
              titolo: a.p_titolo as string,
              email_inviata: Boolean(a.p_email_inviata),
              link: (a.p_link as string | null) ?? null,
            })
        }
        return { data: (a.p_destinatari as string[]).length, error: null }
      }
      if (nome === 'riepilogo_settimana') return { data: riepilogo ?? null, error: null }
      if (nome === 'promemoria_percorso_da_inviare') {
        return { data: promemoria.filter((p) => !prenotati.has(`${p.client_id}|${p.tipo}|${p.data_fine}`)), error: null }
      }
      if (nome === 'promemoria_percorso_prenota') {
        const k = `${a.p_client_id}|${a.p_tipo}|${a.p_data_fine}`
        if (prenotati.has(k)) return { data: null, error: null }
        prenotati.add(k)
        return { data: `r-${k}`, error: null }
      }
      throw new Error(`rpc inattesa ${nome}`)
    }),
    from: vi.fn(() => ({
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      delete: () => ({
        eq: () => ({
          eq: async () => {
            // the booking is freed: due again tomorrow
            prenotati.clear()
            return { error: null }
          },
        }),
      }),
    })),
  }
  return { db: db as never, righe, chiamate }
}

function promemoria(p: Partial<Promemoria> = {}): Promemoria {
  return {
    client_id: 'c1',
    sale_id: 's1',
    tipo: 'rinnovo_1_mese',
    azione: 'invia',
    nome: 'Mario',
    cognome: 'Rossi',
    telefono: null,
    prodotto: 'Percorso Alpha 6 mesi',
    data_inizio: '2026-05-01',
    data_fine: '2026-11-18',
    giorni_mancanti: 30,
    ...p,
  }
}

const base: NotificaDaRegistrare = {
  tipo: 'riepilogo_settimana',
  titolo: 'Riepilogo',
  anteprima: 'Una riga',
  corpoHtml: '<p>Corpo</p>',
  link: '/payments',
  emailInviata: true,
  chiave: 'k1',
}

describe('i valori di una notifica restano nei limiti della tabella', () => {
  it('taglia titolo e riga, tiene il corpo che ci sta', () => {
    const v = valoriNotifica({ ...base, titolo: 'T'.repeat(500), anteprima: 'A'.repeat(500) })
    expect(v.titolo).toHaveLength(LIMITI_NOTIFICA.titolo)
    expect(v.anteprima).toHaveLength(LIMITI_NOTIFICA.anteprima)
    expect(v.corpoHtml).toBe('<p>Corpo</p>')
  })

  it('un corpo oltre il limite (o vuoto) diventa un corpo semplice col titolo e la riga', () => {
    for (const corpoHtml of ['x'.repeat(LIMITI_NOTIFICA.corpoHtml + 1), '']) {
      const v = valoriNotifica({ ...base, corpoHtml })
      expect(v.corpoHtml.length).toBeLessThanOrEqual(LIMITI_NOTIFICA.corpoHtml)
      expect(v.corpoHtml).toContain('Riepilogo')
      expect(v.corpoHtml).toContain('Una riga')
    }
  })

  it('la riga viene dal testo dell’email quando manca', () => {
    const v = valoriNotifica({ ...base, anteprima: undefined, testo: 'Cash della settimana: 3.200 €\nhttps://x.test/a\nAltro' })
    expect(v.anteprima).toBe('Cash della settimana: 3.200 € · Altro')
  })

  it('il link è un percorso interno o niente', () => {
    expect(linkInterno('/payments')).toBe('/payments')
    expect(linkInterno('/clients/abc?x=1')).toBe('/clients/abc?x=1')
    for (const cattivo of ['//evil.test/x', 'https://evil.test', 'javascript:alert(1)', '/a\\b', '/a b', '/a\nb', 'payments', '', null, undefined]) {
      expect(linkInterno(cattivo as string | null)).toBeNull()
    }
    expect(linkInterno('/' + 'a'.repeat(600))).toBeNull()
    expect(valoriNotifica({ ...base, link: '//evil.test' }).link).toBeNull()
  })

  it('anteprimaDaTesto accorcia con i puntini', () => {
    const lunga = anteprimaDaTesto('parola '.repeat(100), 60)
    expect(lunga.length).toBeLessThanOrEqual(60)
    expect(lunga.endsWith('…')).toBe(true)
    expect(corpoDiRiserva('<b>x</b>', 'y')).toContain('&lt;b&gt;x')
  })
})

describe('registraNotifica', () => {
  afterEach(() => vi.restoreAllMocks())

  it('salva per ogni destinatario con la stessa chiave', async () => {
    const { db, righe } = dbFinto()
    expect(await registraNotifica({ db, destinatari: [ADMIN_A, ADMIN_B], notifica: base })).toBe(true)
    expect([...righe.values()].map((r) => r.destinatario).sort()).toEqual([ADMIN_A, ADMIN_B])
  })

  it('è idempotente: la stessa chiave non raddoppia, e un giro con l’email partita accende “inviata”', async () => {
    const { db, righe } = dbFinto()
    await registraNotifica({ db, destinatari: [ADMIN_A], notifica: { ...base, emailInviata: false } })
    await registraNotifica({ db, destinatari: [ADMIN_A], notifica: { ...base, emailInviata: false } })
    expect(righe.size).toBe(1)
    expect([...righe.values()][0].email_inviata).toBe(false)
    await registraNotifica({ db, destinatari: [ADMIN_A], notifica: { ...base, emailInviata: true } })
    expect(righe.size).toBe(1)
    expect([...righe.values()][0].email_inviata).toBe(true)
    await registraNotifica({ db, destinatari: [ADMIN_A], notifica: { ...base, emailInviata: false } })
    expect([...righe.values()][0].email_inviata).toBe(true)
  })

  it('senza destinatari non chiama il database', async () => {
    const { db, chiamate } = dbFinto()
    expect(await registraNotifica({ db, destinatari: [], notifica: base })).toBe(true)
    expect(chiamate).toEqual([])
  })

  it('un errore del database non lancia: una riga di log col solo codice', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { rpc: vi.fn(async () => ({ data: null, error: { code: '23514', message: 'Titolo segreto del cliente Rossi' } })) } as never
    await expect(registraNotifica({ db, destinatari: [ADMIN_A], notifica: { ...base, titolo: 'Titolo segreto del cliente Rossi' } })).resolves.toBe(false)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).toContain('23514')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Rossi')
  })

  it('un’eccezione (rete, client rotto) non lancia nemmeno', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { rpc: vi.fn(async () => { throw new Error('fetch failed: Rossi') }) } as never
    await expect(registraNotifica({ db, destinatari: [ADMIN_A], notifica: base })).resolves.toBe(false)
    expect(JSON.stringify(log.mock.calls)).not.toContain('Rossi')
  })
})

describe('il documento mostrato nel riquadro isolato', () => {
  const html = '<!doctype html><html lang="it"><body><p>Ciao</p><a href="https://x.test">x</a></body></html>'

  it('apre i link in una nuova scheda e chiude tutto tranne le immagini della propria app', () => {
    const d = documentoSicuro(html, 'https://dashboard.percorsoalpha.com/settings')
    expect(d).toContain('<base target="_blank">')
    expect(d).toContain("default-src 'none'")
    expect(d).toContain('img-src data: https://dashboard.percorsoalpha.com;')
    expect(d).not.toMatch(/script-src|allow-scripts/)
    expect(d.indexOf('<base')).toBeLessThan(d.indexOf('<body>'))
    expect(d).toContain('<p>Ciao</p>')
  })

  it('un’email con il suo <head> riceve le regole per prime; un frammento viene avvolto', () => {
    const conHead = documentoSicuro('<html><head><title>t</title></head><body>x</body></html>', 'https://a.test')
    expect(conHead.indexOf('Content-Security-Policy')).toBeLessThan(conHead.indexOf('<title>'))
    expect(documentoSicuro('<p>x</p>', 'https://a.test')).toMatch(/^<!doctype html><html lang="it"><head>/)
  })

  it('un’origine che non si legge non apre le immagini a nessuno', () => {
    expect(documentoSicuro(html, 'non un url')).toContain('img-src data:;')
  })
})

describe('il backup in app', () => {
  it('niente allegato e niente conteggi: dice che è partito per email e dove scaricarlo', () => {
    const n = notificaBackup({ giorno: '19/10/2026', inviata: true })
    expect(n.titolo).toBe('Backup settimanale Alpha Management · 19/10/2026')
    expect(n.link).toBe('/settings/export')
    expect(n.html).toContain('per email')
    expect(n.html).toContain('Esporta')
    expect(n.html).not.toMatch(/Clienti:|Vendite:|allegato in|\.json/)
    expect(notificaBackup({ giorno: '19/10/2026', inviata: false }).titolo).toContain('non inviato')
  })
})

describe('chi manda l’email salva anche la notifica', () => {
  const ambiente = { ...process.env }
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_MITTENTE
    vi.mocked(creaBackup).mockClear()
  })
  afterEach(() => {
    process.env = { ...ambiente }
  })
  const configura = () => {
    process.env.RESEND_API_KEY = 're_finta'
    process.env.EMAIL_MITTENTE = 'Percorso Alpha <join@percorsoalpha.com>'
  }
  const admin = [
    { id: ADMIN_A, email: 'a@alpha.test' },
    { id: ADMIN_B, email: 'b@alpha.test' },
  ]
  const riepilogo = {
    da: '2026-10-10',
    a: '2026-10-16',
    cash: 3200,
    cash_per_parte: { nuovi_clienti: 3200, rate_precedenti: 0, rinnovo: 0, upsell: 0 },
    incassi: [],
    vendite: [],
    vendite_per_tipo: { nuovo: 2, rinnovo: 0, upsell: 0 },
    in_ritardo: { numero: 0, totale: 0 },
    clienti_in_ritardo: [],
    clienti_in_ritardo_totale: 0,
    in_scadenza_7_giorni: { numero: 0, totale: 0 },
    dm_totali: 0,
    conversazioni: 0,
    call_prenotate: 0,
    call_svolte: 0,
    no_show: 0,
    chiuse: 0,
  }

  it('riepilogo senza email: salvato per i due admin, “non inviato”, e un secondo giro non lo raddoppia', async () => {
    const { db, righe } = dbFinto({ riepilogo })
    const invia = vi.fn()
    const argomenti = { db, settimana: { da: '2026-10-10', a: '2026-10-16' }, admin, urlApp: 'https://d.test', invia }
    expect(await inviaRiepilogoSettimana(argomenti)).toBe('non inviato')
    expect(await inviaRiepilogoSettimana(argomenti)).toBe('non inviato')
    expect(invia).not.toHaveBeenCalled()
    expect(righe.size).toBe(2)
    const riga = [...righe.values()][0]
    expect(riga).toMatchObject({ tipo: 'riepilogo_settimana', email_inviata: false, chiave: 'riepilogo-settimana/2026-10-10/2026-10-16' })
  })

  it('riepilogo con email: salvato con “inviata”; la chiave è quella di Resend', async () => {
    configura()
    const { db, righe } = dbFinto({ riepilogo })
    const invia = vi.fn(async () => ({ inviata: true as const }))
    expect(await inviaRiepilogoSettimana({ db, settimana: { da: '2026-10-10', a: '2026-10-16' }, admin, urlApp: 'https://d.test', invia })).toBe('inviato')
    expect(invia).toHaveBeenCalledWith(expect.objectContaining({ idempotenza: 'riepilogo-settimana/2026-10-10/2026-10-16', a: ['a@alpha.test', 'b@alpha.test'] }))
    expect([...righe.values()].every((r) => r.email_inviata)).toBe(true)
  })

  it('riepilogo: se Resend rifiuta la notifica c’è lo stesso, con “non inviata”', async () => {
    configura()
    const { db, righe } = dbFinto({ riepilogo })
    const invia = vi.fn(async () => ({ inviata: false as const, motivo: 'errore' as const }))
    expect(await inviaRiepilogoSettimana({ db, settimana: { da: '2026-10-10', a: '2026-10-16' }, admin, urlApp: 'https://d.test', invia })).toBe('non inviato')
    expect([...righe.values()].map((r) => r.email_inviata)).toEqual([false, false])
  })

  it('riepilogo: se non registrare fallisce, l’invio non ne risente', async () => {
    configura()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      rpc: vi.fn(async (nome: string) =>
        nome === 'riepilogo_settimana' ? { data: riepilogo, error: null } : { data: null, error: { code: 'XX000', message: 'giù' } },
      ),
    } as never
    const invia = vi.fn(async () => ({ inviata: true as const }))
    expect(await inviaRiepilogoSettimana({ db, settimana: { da: '2026-10-10', a: '2026-10-16' }, admin, urlApp: 'https://d.test', invia })).toBe('inviato')
  })

  it('backup senza email: non lo costruisce, salva la notifica una volta sola per giorno', async () => {
    const { db, righe } = dbFinto()
    const a = await inviaBackup(db, admin, '2026-10-19')
    const b = await inviaBackup(db, admin, '2026-10-19')
    expect(a).toEqual({ inviata: false, file: null, byte: 0 })
    expect(b.inviata).toBe(false)
    expect(creaBackup).not.toHaveBeenCalled()
    expect(righe.size).toBe(2)
    expect([...righe.values()][0]).toMatchObject({ tipo: 'backup', chiave: 'backup/2026-10-19', email_inviata: false, link: '/settings/export' })
  })

  it('backup con email: la notifica dice partito e non porta il file', async () => {
    configura()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const { db, righe } = dbFinto()
    const esito = await inviaBackup(db, admin, '2026-10-19')
    vi.unstubAllGlobals()
    expect(esito.inviata).toBe(true)
    expect([...righe.values()].every((r) => r.email_inviata && r.titolo.startsWith('Backup settimanale Alpha'))).toBe(true)
  })

  it('promemoria senza email: i dovuti sono salvati (non quelli “salta”), nessuna prenotazione, chiave senza il giorno', async () => {
    const { db, righe, chiamate } = dbFinto({
      promemoria: [promemoria(), promemoria({ client_id: 'c2', tipo: 'feedback_3_mesi' }), promemoria({ client_id: 'c3', azione: 'salta' })],
    })
    const argomenti = { db, oggi: '2026-10-19', indirizzi: ['a@alpha.test'], destinatari: [ADMIN_A], urlApp: 'https://d.test' }
    const uno = await inviaPromemoriaPercorso(argomenti)
    const due = await inviaPromemoriaPercorso({ ...argomenti, oggi: '2026-10-20' })
    expect(uno).toEqual({ configurata: false, notificate: 2 })
    expect(due).toEqual({ configurata: false, notificate: 2 })
    expect(chiamate.filter((c) => c === 'promemoria_percorso_prenota')).toEqual([])
    expect(righe.size).toBe(2)
    expect([...righe.values()].map((r) => r.tipo).sort()).toEqual(['promemoria_feedback', 'promemoria_rinnovo'])
    expect([...righe.values()].every((r) => !r.email_inviata && r.link?.startsWith('/clients/'))).toBe(true)
    expect(chiaveNotifica(promemoria())).toBe('promemoria-percorso/c1/rinnovo_1_mese/2026-11-18')
  })

  it('promemoria senza email e senza destinatari: niente, come prima', async () => {
    const { db, chiamate } = dbFinto({ promemoria: [promemoria()] })
    expect(await inviaPromemoriaPercorso({ db, oggi: '2026-10-19', indirizzi: [], urlApp: 'https://d.test' })).toEqual({ configurata: false })
    expect(chiamate).toEqual([])
  })

  it('promemoria con email: salvato con la sua esito; rifiutato oggi e partito domani, la riga è una sola e diventa “inviata”', async () => {
    configura()
    const { db, righe } = dbFinto({ promemoria: [promemoria()] })
    const rifiuta = vi.fn(async () => ({ inviata: false as const, motivo: 'errore' as const }))
    const accetta = vi.fn(async () => ({ inviata: true as const }))
    const base2 = { db, indirizzi: ['a@alpha.test'], destinatari: [ADMIN_A], urlApp: 'https://d.test', pausaMs: 0 }
    await inviaPromemoriaPercorso({ ...base2, oggi: '2026-10-19', invia: rifiuta })
    expect([...righe.values()].map((r) => r.email_inviata)).toEqual([false])
    await inviaPromemoriaPercorso({ ...base2, oggi: '2026-10-20', invia: accetta })
    expect(righe.size).toBe(1)
    expect([...righe.values()][0].email_inviata).toBe(true)
  })

  it('promemoria: uno già prenotato da un altro giro non lo salva questo giro', async () => {
    configura()
    const { db, righe } = dbFinto({ promemoria: [promemoria()] })
    // the other run booked it between the list and the booking
    const originale = (db as { rpc: (...a: unknown[]) => Promise<unknown> }).rpc
    ;(db as { rpc: unknown }).rpc = vi.fn(async (nome: string, a: unknown) =>
      nome === 'promemoria_percorso_prenota' ? { data: null, error: null } : originale(nome, a),
    )
    const invia = vi.fn(async () => ({ inviata: true as const }))
    const esito = await inviaPromemoriaPercorso({ db, oggi: '2026-10-19', indirizzi: ['a@alpha.test'], destinatari: [ADMIN_A], urlApp: 'https://d.test', invia, pausaMs: 0 })
    expect(invia).not.toHaveBeenCalled()
    expect(righe.size).toBe(0)
    expect(esito).toMatchObject({ configurata: true, gia_presi: 1 })
  })
})
