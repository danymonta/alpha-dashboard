import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { avvisaRateInRitardo, registraAvviso, valoriAvviso, type AvvisoDaRegistrare } from '@/lib/notifiche/avvisi'
import { avvisaCollegamenti, avvisiCollegamenti, creaAvvisiDellaSera } from '@/lib/notifiche/collegamenti'
import { ETICHETTA_TIPO, LIMITI_NOTIFICA, TIPI_AVVISO, TIPI_EMAIL, TIPI_NOTIFICA, etichettaLink, linkInterno } from '@/lib/notifiche/tipi'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { AVVISI_INSIGHT } from '@/lib/insight/frasi'

const ADMIN_A = '11111111-1111-4111-8111-111111111111'
const ADMIN_B = '11111111-1111-4111-8111-222222222222'
// 19/10/2026 20:30 in Rome (18:30 UTC)
const ADESSO = new Date('2026-10-19T18:30:00Z')

const base: AvvisoDaRegistrare = {
  tipo: 'spesa_claude',
  titolo: 'La spesa di Claude è all’80% del limite',
  anteprima: '20,10 $ su 25,00 $ questo mese.',
  dettagli: ['Puoi alzare il limite nelle impostazioni.'],
  link: '/settings/instagram#analisi-reel',
  chiave: 'spesa/reel/2026-10/80',
}

describe('i tipi di notifica', () => {
  it('le email e gli avvisi sono due insiemi senza doppioni, e ognuno ha le sue parole', () => {
    expect(new Set(TIPI_NOTIFICA).size).toBe(TIPI_NOTIFICA.length)
    expect([...TIPI_EMAIL, ...TIPI_AVVISO]).toEqual([...TIPI_NOTIFICA])
    for (const t of TIPI_NOTIFICA) expect(ETICHETTA_TIPO[t].length).toBeGreaterThan(2)
  })

  it('sono gli stessi che accetta la tabella (l\'ultima migration che ne scrive il vincolo)', () => {
    const cartella = join(process.cwd(), 'supabase/migrations')
    const ultima = readdirSync(cartella)
      .filter((f) => f.endsWith('.sql') && readFileSync(join(cartella, f), 'utf8').includes('notifiche_tipo_check check'))
      .sort()
      .at(-1)
    const sql = readFileSync(join(cartella, ultima!), 'utf8')
    const dalSql = [...sql.slice(sql.lastIndexOf('notifiche_tipo_check check')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    for (const t of TIPI_NOTIFICA) expect(dalSql).toContain(t)
  })

  it('ogni link degli avvisi apre una pagina con le sue parole', () => {
    expect(etichettaLink('/payments?vista=ritardo')).toBe('Apri Incassi')
    expect(etichettaLink('/settings/chiavi')).toBe('Apri Chiavi e collegamenti')
    expect(etichettaLink('/setting#da-approvare')).toBe('Apri il tracciamento da approvare')
    expect(etichettaLink('/settings/instagram#analisi-reel')).toBe('Apri le impostazioni delle analisi')
    expect(etichettaLink('/settings/fathom')).toBe('Apri le impostazioni di Fathom')
    // a settings page is not the setter page
    expect(etichettaLink('/settings/team')).toBe('Apri')
    // the payment of a new client confirmed (1.77.0): the card of his onboarding
    expect(etichettaLink('/onboarding/0b0a0000-0000-4000-8000-000000000001')).toBe('Apri l’onboarding')
    expect(etichettaLink('/onboarding/0b0a0000-0000-4000-8000-000000000001', 'en')).toBe('Open the onboarding')
    expect(etichettaLink('/onboarding')).toBe('Apri l’onboarding')
    expect(etichettaLink('/onboardingx')).toBe('Apri')
  })

  it('«onboarding_pagamento» è un avviso solo nell’app, con le sue parole (1.77.0)', () => {
    expect(TIPI_AVVISO).toContain('onboarding_pagamento')
    expect(TIPI_EMAIL as readonly string[]).not.toContain('onboarding_pagamento')
    expect(ETICHETTA_TIPO.onboarding_pagamento).toBe('Onboarding')
    expect(linkInterno('/onboarding/0b0a0000-0000-4000-8000-000000000001')).toBe(
      '/onboarding/0b0a0000-0000-4000-8000-000000000001',
    )
  })

  it('i link che usano sono percorsi interni validi', () => {
    for (const l of ['/payments?vista=ritardo', '/settings/chiavi', '/setting#da-approvare', '/settings/instagram#analisi-reel', '/settings/fathom']) {
      expect(linkInterno(l)).toBe(l)
    }
  })
})

describe('i valori di un avviso restano nei limiti della tabella', () => {
  it('taglia titolo, riga e righe di dettaglio, toglie le vuote, al massimo 31', () => {
    const v = valoriAvviso({
      ...base,
      titolo: 'T'.repeat(500),
      anteprima: 'A'.repeat(500),
      dettagli: ['x'.repeat(400), '   ', ...Array.from({ length: 40 }, (_, i) => `riga ${i}`)],
      chiave: 'k'.repeat(300),
    })
    expect(v.titolo).toHaveLength(LIMITI_NOTIFICA.titolo)
    expect(v.anteprima).toHaveLength(LIMITI_NOTIFICA.anteprima)
    expect(v.dettagli).toHaveLength(LIMITI_NOTIFICA.dettagli)
    expect(v.dettagli?.[0]).toHaveLength(LIMITI_NOTIFICA.riga)
    expect(v.dettagli).not.toContain('')
    expect(v.chiave).toHaveLength(LIMITI_NOTIFICA.chiave)
  })

  it('senza righe i dettagli sono null; un link esterno è scartato', () => {
    expect(valoriAvviso({ ...base, dettagli: [] }).dettagli).toBeNull()
    expect(valoriAvviso({ ...base, dettagli: undefined }).dettagli).toBeNull()
    expect(valoriAvviso({ ...base, link: 'https://evil.example/x' }).link).toBeNull()
  })
})

describe('registraAvviso', () => {
  afterEach(() => vi.restoreAllMocks())

  it('chiama la funzione degli avvisi con i valori e restituisce quante righe ha scritto', async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }))
    expect(await registraAvviso({ db: { rpc } as never, destinatari: [ADMIN_A, ADMIN_B], avviso: base })).toBe(2)
    expect(rpc).toHaveBeenCalledWith('notifiche_avviso', {
      p_destinatari: [ADMIN_A, ADMIN_B],
      p_tipo: 'spesa_claude',
      p_titolo: base.titolo,
      p_anteprima: base.anteprima,
      p_dettagli: base.dettagli,
      p_link: base.link,
      p_chiave: base.chiave,
    })
  })

  it('senza destinatari non chiama il database', async () => {
    const rpc = vi.fn()
    expect(await registraAvviso({ db: { rpc } as never, destinatari: [], avviso: base })).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('non lancia mai: un errore del database o un’eccezione sono una riga di log col solo codice', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const conErrore = { rpc: vi.fn(async () => ({ data: null, error: { code: '23514', message: 'titolo segreto' } })) }
    expect(await registraAvviso({ db: conErrore as never, destinatari: [ADMIN_A], avviso: base })).toBeNull()
    const rotto = { rpc: vi.fn(async () => { throw new Error('rete') }) }
    expect(await registraAvviso({ db: rotto as never, destinatari: [ADMIN_A], avviso: base })).toBeNull()
    expect(log).toHaveBeenCalledTimes(2)
    const scritto = JSON.stringify(log.mock.calls)
    expect(scritto).toContain('23514')
    expect(scritto).not.toContain('segreto')
    expect(scritto).not.toContain(base.titolo)
  })
})

describe('le rate in ritardo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('chiede al database il digest del giorno e restituisce quante ne ha annunciate', async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }))
    expect(await avvisaRateInRitardo({ rpc } as never, '2026-10-19')).toBe(3)
    expect(rpc).toHaveBeenCalledWith('notifiche_rate_in_ritardo', { p_giorno: '2026-10-19' })
  })

  it('un errore non lancia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await avvisaRateInRitardo({ rpc: vi.fn(async () => ({ data: null, error: { code: 'XX000' } })) } as never, '2026-10-19')).toBeNull()
    expect(await avvisaRateInRitardo({ rpc: vi.fn(async () => { throw new Error('x') }) } as never, '2026-10-19')).toBeNull()
  })
})

describe('gli avvisi dei collegamenti', () => {
  const oraFa = (ore: number) => new Date(ADESSO.getTime() - ore * 3_600_000).toISOString()
  const traGiorni = (g: number) => new Date(ADESSO.getTime() + g * 86_400_000).toISOString()
  const nullo = { presente: true, errore: null, errore_il: null }

  it('niente di niente quando va tutto bene (token con più di 7 giorni davanti)', () => {
    expect(
      avvisiCollegamenti({ instagram: { presente: true, scade_il: traGiorni(30), errore: null, errore_il: null }, messenger: nullo, fathom: nullo }, ADESSO),
    ).toEqual([])
  })

  it('il token di Instagram che scade entro 7 giorni: una chiave per la data della fine', () => {
    const fine = traGiorni(5)
    const [a, ...resto] = avvisiCollegamenti({ instagram: { presente: true, scade_il: fine, errore: null, errore_il: null } }, ADESSO)
    expect(resto).toEqual([])
    expect(a.tipo).toBe('chiave_in_scadenza')
    expect(a.chiave).toBe('instagram-token-scade/2026-10-24')
    expect(a.titolo).toBe('Il token di Instagram scade il 24/10/2026: rigeneralo in Impostazioni › Chiavi e collegamenti')
    expect(a.link).toBe('/settings/chiavi')
    // the next evening the key is the same: emitted once
    const [b] = avvisiCollegamenti({ instagram: { presente: true, scade_il: fine, errore: null, errore_il: null } }, new Date(ADESSO.getTime() + 86_400_000))
    expect(b.chiave).toBe(a.chiave)
  })

  it('senza il token (tolto) non dice niente, nemmeno con una data vecchia', () => {
    expect(avvisiCollegamenti({ instagram: { presente: false, scade_il: traGiorni(2), errore: null, errore_il: null } }, ADESSO)).toEqual([])
  })

  it('il token scaduto per data: un avviso solo, con la data della fine', () => {
    const [a, ...resto] = avvisiCollegamenti({ instagram: { presente: true, scade_il: traGiorni(-2), errore: null, errore_il: null } }, ADESSO)
    expect(resto).toEqual([])
    expect(a.tipo).toBe('chiave_rifiutata')
    expect(a.chiave).toBe('instagram-token-scaduto/2026-10-17')
  })

  it('il token rifiutato da Meta (190): una chiave per il giorno dell’errore, e solo se è di ieri notte', () => {
    const stato = (ore: number) => ({
      instagram: { presente: true, scade_il: traGiorni(40), errore: FRASI_ERRORE.token, errore_il: oraFa(ore) },
    })
    const [a] = avvisiCollegamenti(stato(19), ADESSO)
    expect(a.tipo).toBe('chiave_rifiutata')
    expect(a.chiave).toBe('instagram-token-rifiutato/2026-10-19')
    // an old refusal that nobody rewrote is not news
    expect(avvisiCollegamenti(stato(60), ADESSO)).toEqual([])
    // another error (the network) is not a refused token
    expect(
      avvisiCollegamenti({ instagram: { presente: true, scade_il: traGiorni(40), errore: 'Instagram non ha risposto', errore_il: oraFa(3) } }, ADESSO),
    ).toEqual([])
  })

  it('un rifiuto che la notte riscrive ogni giorno si annuncia una volta per token; un token nuovo rifiutato è un avviso nuovo', () => {
    const salvato = '2026-10-10T08:00:00.000Z'
    const stato = (versione: string) => ({
      instagram: { presente: true, scade_il: traGiorni(40), versione, errore: FRASI_ERRORE.token, errore_il: oraFa(2) },
      messenger: { presente: true, versione, errore: AVVISI_INSIGHT.messenger_token, errore_il: oraFa(2) },
      fathom: { presente: true, versione, errore: FRASI_FATHOM.chiave, errore_il: oraFa(2) },
    })
    const oggi = avvisiCollegamenti(stato(salvato), ADESSO).map((a) => a.chiave)
    const domani = avvisiCollegamenti(stato(salvato), new Date(ADESSO.getTime() + 86_400_000)).map((a) => a.chiave)
    expect(oggi).toHaveLength(3)
    expect(domani).toEqual(oggi)
    expect(oggi.every((k) => k.endsWith(`/v${Date.parse(salvato)}`))).toBe(true)
    const nuovo = avvisiCollegamenti(stato('2026-10-18T09:00:00.000Z'), ADESSO).map((a) => a.chiave)
    expect(nuovo.some((k) => oggi.includes(k))).toBe(false)
  })

  it('Messenger e Fathom rifiutati: una chiave per giorno', () => {
    const lista = avvisiCollegamenti(
      {
        messenger: { presente: true, errore: AVVISI_INSIGHT.messenger_token, errore_il: oraFa(2) },
        fathom: { presente: true, errore: FRASI_FATHOM.chiave, errore_il: oraFa(5) },
      },
      ADESSO,
    )
    expect(lista.map((a) => a.chiave)).toEqual(['messenger-token-rifiutato/2026-10-19', 'fathom-chiave-rifiutata/2026-10-19'])
    expect(lista.every((a) => a.tipo === 'chiave_rifiutata' && a.link === '/settings/chiavi')).toBe(true)
    expect(lista[0].titolo).toContain('Pagina di Messenger')
    expect(lista[1].titolo).toContain('Fathom')
  })

  it('mai un token o una chiave nel testo', () => {
    const lista = avvisiCollegamenti(
      {
        instagram: { presente: true, scade_il: traGiorni(1), errore: null, errore_il: null },
        messenger: { presente: true, errore: AVVISI_INSIGHT.messenger_token, errore_il: oraFa(2) },
      },
      ADESSO,
    )
    for (const a of lista) expect(JSON.stringify(a)).not.toMatch(/IG[A-Za-z0-9]{20,}|access_token/)
  })

  it('la scansione legge lo stato in SQL, scrive ogni avviso una volta, e non lancia mai', async () => {
    const stato = {
      instagram: { presente: true, scade_il: traGiorni(3), errore: null, errore_il: null },
      messenger: nullo,
      fathom: nullo,
    }
    const emesse = new Set<string>()
    const rpc = vi.fn(async (nome: string, a: Record<string, unknown>) => {
      if (nome === 'notifiche_collegamenti_stato') return { data: stato, error: null }
      if (nome === 'notifiche_avviso') {
        if (emesse.has(a.p_chiave as string)) return { data: 0, error: null }
        emesse.add(a.p_chiave as string)
        return { data: (a.p_destinatari as string[]).length, error: null }
      }
      return { data: null, error: { code: 'XX' } }
    })
    expect(await avvisaCollegamenti({ db: { rpc } as never, destinatari: [ADMIN_A, ADMIN_B], adesso: ADESSO })).toBe(2)
    expect(await avvisaCollegamenti({ db: { rpc } as never, destinatari: [ADMIN_A, ADMIN_B], adesso: ADESSO })).toBe(0)

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const guasto = { rpc: vi.fn(async () => ({ data: null, error: { code: '42501' } })) }
    expect(await avvisaCollegamenti({ db: guasto as never, destinatari: [ADMIN_A] })).toBeNull()
    const forma = { rpc: vi.fn(async () => ({ data: { instagram: 'boh' }, error: null })) }
    expect(await avvisaCollegamenti({ db: forma as never, destinatari: [ADMIN_A] })).toBeNull()
  })

  it('il giro della sera fa le due parti, e una che fallisce non ferma l’altra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rpc = vi.fn(async (nome: string) => {
      if (nome === 'notifiche_rate_in_ritardo') return { data: null, error: { code: 'XX000' } }
      if (nome === 'notifiche_collegamenti_stato') return { data: { instagram: { presente: true, scade_il: traGiorni(2), errore: null, errore_il: null } }, error: null }
      return { data: 1, error: null }
    })
    const esito = await creaAvvisiDellaSera({ db: { rpc } as never, oggi: '2026-10-19', destinatari: [ADMIN_A], adesso: ADESSO })
    expect(esito).toEqual({ rate: 'non riuscito', collegamenti: 1 })
  })
})
