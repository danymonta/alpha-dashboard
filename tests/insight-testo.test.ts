import { describe, expect, it } from 'vitest'

import type { ConversazioneGraph, MessaggioGraph } from '@/lib/instagram/graph'
import {
  descriviMessaggio,
  ETICHETTE,
  GIORNI_MESSAGGI,
  istanteISO,
  linkInstagram,
  pulisciTesto,
  scrittoDa,
  senzaVecchi,
  TESTO_MAX,
  usernameDelLead,
  versoChatTesto,
} from '@/lib/instagram/testo'

// From Meta's messages to what the Insight stores (lib/instagram/testo.ts).
// Every account, chat, text and shortcode is invented.

const ACCOUNT = { username: 'alpha_prova', id: '17841400000000001' }
const LEAD = { username: 'lead.prova', id: '17841499000000077' }
const t = (utc: string) => `${utc}:00+0000`

let n = 0
function nostro(utc: string, extra: Partial<MessaggioGraph> = {}): MessaggioGraph {
  return { id: `m${++n}`, created_time: t(utc), from: { ...ACCOUNT }, to: { data: [{ ...LEAD }] }, ...extra }
}
function delLead(utc: string, extra: Partial<MessaggioGraph> = {}): MessaggioGraph {
  return { id: `m${++n}`, created_time: t(utc), from: { ...LEAD }, to: { data: [{ ...ACCOUNT }] }, ...extra }
}

const QUANDO = t('2026-10-07T18:00')

describe('descriviMessaggio: le etichette del DM Reader', () => {
  it('il testo scritto, chi lo ha scritto e quando in ISO UTC', () => {
    expect(descriviMessaggio({ created_time: QUANDO, message: 'Ciao, come funziona?' }, false)).toEqual({
      da: 'lead',
      il: '2026-10-07T18:00:00.000Z',
      testo: 'Ciao, come funziona?',
      codici: [],
      storia: false,
    })
    expect(descriviMessaggio({ created_time: QUANDO, message: 'Eccomi' }, true)?.da).toBe('alpha')
  })

  it('ogni allegato con la sua etichetta, dal tipo o dal mime', () => {
    const allegato = (a: object) => descriviMessaggio({ created_time: QUANDO, attachments: { data: [a] } }, false)?.testo
    expect(allegato({ audio_data: { url: 'https://cdn.invalid/a.mp4' } })).toBe(ETICHETTE.vocale)
    expect(allegato({ mime_type: 'audio/mpeg' })).toBe('[messaggio vocale]')
    expect(allegato({ video_data: {} })).toBe('[video]')
    expect(allegato({ mime_type: 'video/mp4' })).toBe('[video]')
    expect(allegato({ image_data: {} })).toBe('[immagine]')
    expect(allegato({ mime_type: 'image/jpeg' })).toBe('[immagine]')
    expect(allegato({ generic_template: {} })).toBe('[template]')
    expect(allegato({ file_url: 'https://cdn.invalid/doc.pdf' })).toBe('[file]')
    expect(allegato({})).toBe('[allegato]')
    // the attachment's URL is never written
    expect(allegato({ file_url: 'https://cdn.invalid/doc.pdf' })).not.toContain('cdn.invalid')
  })

  it('sticker, contenuto non supportato, non leggibile, niente del tutto', () => {
    const testo = (m: object) => descriviMessaggio({ created_time: QUANDO, ...m }, false)?.testo
    expect(testo({ sticker: { id: 1 } })).toBe('[sticker]')
    expect(testo({ is_unsupported: true })).toBe("[contenuto non supportato dall'API]")
    expect(testo({ non_leggibile: true })).toBe('[non leggibile]')
    expect(testo({})).toBe('[contenuto non disponibile]')
    expect(testo({ message: '   ' })).toBe('[contenuto non disponibile]')
  })

  it("le parti nell'ordine del DM Reader: testo, allegati, storia, condivisi, sticker, non supportato", () => {
    const m = descriviMessaggio(
      {
        created_time: QUANDO,
        message: 'Guarda qui',
        attachments: { data: [{ image_data: {} }, null, { audio_data: {} }] },
        story: { mention: { link: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1' } },
        shares: { data: [{ link: 'https://www.instagram.com/p/PostCondiviso1/' }] },
        sticker: {},
        is_unsupported: true,
      },
      false,
    )
    expect(m?.testo).toBe(
      "Guarda qui [immagine] [messaggio vocale] [menzione in una storia] [contenuto condiviso: https://www.instagram.com/p/PostCondiviso1/] [sticker] [contenuto non supportato dall'API]",
    )
    expect(m?.storia).toBe(true)
  })

  it('una risposta a una storia: mai il link della storia, il suo shortcode solo quando è un post', () => {
    const cdn = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=17900000000000001&signature=finta'
    const daCdn = descriviMessaggio({ created_time: QUANDO, message: 'Che bella!', story: { reply_to: { link: cdn, id: '17900000000000001' } } }, false)
    expect(daCdn).toMatchObject({ testo: 'Che bella! [risposta a una storia]', codici: [], storia: true })
    expect(JSON.stringify(daCdn)).not.toContain('lookaside')
    expect(JSON.stringify(daCdn)).not.toContain('17900000000000001')

    const daPost = descriviMessaggio({ created_time: QUANDO, story: { reply_to: { link: 'https://www.instagram.com/reel/StoriaReel01/' } } }, false)
    expect(daPost).toMatchObject({ testo: '[risposta a una storia]', codici: ['StoriaReel01'], storia: true })
    expect(daPost?.testo).not.toContain('instagram.com')

    const menzione = descriviMessaggio({ created_time: QUANDO, story: { mention: { link: 'https://www.instagram.com/p/Menzione01/' } } }, false)
    expect(menzione).toMatchObject({ testo: '[menzione in una storia]', codici: ['Menzione01'], storia: true })
  })

  it('un link condiviso si scrive solo se è di instagram.com, senza la query', () => {
    const condiviso = (link: string) => descriviMessaggio({ created_time: QUANDO, shares: { data: [{ link }] } }, false)
    const ig = condiviso('https://www.instagram.com/reel/ReelCond01/?igsh=chilhacondiviso')
    expect(ig).toMatchObject({ testo: '[contenuto condiviso: https://www.instagram.com/reel/ReelCond01/]', codici: ['ReelCond01'], storia: false })
    expect(JSON.stringify(ig)).not.toContain('igsh')

    for (const altro of ['https://www.youtube.com/watch?v=abcdef', 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2', 'https://example.com/instagram.com/p/Finto01/']) {
      expect(condiviso(altro)).toMatchObject({ testo: '[contenuto condiviso]', codici: [] })
    }
    // a share without a link
    expect(descriviMessaggio({ created_time: QUANDO, shares: { data: [{}] } }, false)?.testo).toBe('[contenuto condiviso]')
  })

  it('gli shortcode solo da shortcodeInstagram: /share/ e /reels/audio/ no, /<utente>/reel/ e instagr.am sì', () => {
    const codici = (link: string) => descriviMessaggio({ created_time: QUANDO, shares: { data: [{ link }] } }, false)?.codici
    expect(codici('https://www.instagram.com/share/reel/BAbcdef123/')).toEqual([])
    expect(codici('https://www.instagram.com/reels/audio/1234567890123/')).toEqual([])
    expect(codici('https://www.instagram.com/alpha_prova/reel/DiUtente01/')).toEqual(['DiUtente01'])
    expect(codici('https://instagr.am/p/Corto0001/')).toEqual(['Corto0001'])
    expect(codici('https://m.instagram.com/tv/Tv0000001/')).toEqual(['Tv0000001'])
    expect(codici('https://www.instagram.com/alpha_prova/')).toEqual([])
    // the /share/ link is still an instagram.com one: written, without a code
    expect(descriviMessaggio({ created_time: QUANDO, shares: { data: [{ link: 'https://www.instagram.com/share/reel/BAbcdef123/' }] } }, false)?.testo).toBe(
      '[contenuto condiviso: https://www.instagram.com/share/reel/BAbcdef123/]',
    )
  })

  it('i link scritti nel testo danno il loro shortcode, una volta sola', () => {
    const m = descriviMessaggio(
      {
        created_time: QUANDO,
        message: 'Questo https://www.instagram.com/reel/NelTesto01/?igsh=x e questo https://www.instagram.com/reel/NelTesto01/ e https://example.com',
        shares: { data: [{ link: 'https://www.instagram.com/reel/NelTesto01/' }, { link: 'https://www.instagram.com/p/Altro00001/' }] },
      },
      false,
    )
    expect(m?.codici).toEqual(['NelTesto01', 'Altro00001'])
    // the text the person wrote stays as written
    expect(m?.testo.startsWith('Questo https://www.instagram.com/reel/NelTesto01/?igsh=x e questo')).toBe(true)
  })

  it('senza un orario valido il messaggio non si mette nella chat', () => {
    expect(descriviMessaggio({ message: 'senza orario' }, false)).toBeNull()
    expect(descriviMessaggio({ created_time: 'ieri', message: 'x' }, false)).toBeNull()
    expect(istanteISO('2026-10-07T20:00:00+0000')).toBe('2026-10-07T20:00:00.000Z')
    expect(istanteISO('')).toBeNull()
    expect(istanteISO(42)).toBeNull()
  })
})

describe('pulizia del testo', () => {
  it('a capo, caratteri di controllo e di direzione, spazi ai bordi', () => {
    expect(pulisciTesto('  Ciao\r\nCome stai?\rBene\u0000\u0007 ‮girato‬⁦x⁩  ')).toBe('Ciao\nCome stai?\nBene giratox')
    expect(pulisciTesto('riga\ttab')).toBe('riga\ttab')
    expect(pulisciTesto('Forza 💪🏻 👨‍👩‍👧')).toBe('Forza 💪🏻 👨‍👩‍👧')
    expect(pulisciTesto('\u0085\u009f')).toBeNull()
    expect(pulisciTesto(undefined)).toBeNull()
    expect(pulisciTesto(12)).toBeNull()
  })

  it('al massimo 2000 caratteri, contati come caratteri e non come unità UTF-16', () => {
    const lungo = pulisciTesto('a'.repeat(TESTO_MAX + 50))
    expect([...(lungo ?? '')]).toHaveLength(TESTO_MAX)
    expect(lungo?.endsWith('…')).toBe(true)
    const emoji = '💪'.repeat(TESTO_MAX)
    // 4000 UTF-16 units, 2000 characters: whole
    expect(pulisciTesto(emoji)).toBe(emoji)
    expect(pulisciTesto('b'.repeat(TESTO_MAX))).toBe('b'.repeat(TESTO_MAX))
  })

  it('linkInstagram: solo http(s) su instagram.com, senza query né frammento', () => {
    expect(linkInstagram('https://WWW.Instagram.com/reel/AbCdE12345/?igsh=1#x')).toBe('https://www.instagram.com/reel/AbCdE12345/')
    expect(linkInstagram('http://instagram.com/p/AbCdE12345')).toBe('https://instagram.com/p/AbCdE12345')
    expect(linkInstagram('javascript:alert(1)')).toBeNull()
    expect(linkInstagram('https://instagram.com.finto.invalid/p/AbCdE12345/')).toBeNull()
    expect(linkInstagram('non un link')).toBeNull()
    expect(linkInstagram(null)).toBeNull()
  })
})

describe('versoChatTesto', () => {
  const conversazione = (extra: Partial<ConversazioneGraph> = {}): ConversazioneGraph => ({
    id: 'c_prova',
    updated_time: t('2026-10-07T19:00'),
    participants: { data: [{ ...ACCOUNT }, { ...LEAD }] },
    ...extra,
  })

  it('dal messaggio più vecchio, completa sotto i 20, ultimo messaggio, link della call e shortcode condivisi', () => {
    const cronologici = [
      delLead('2026-10-07T08:00', { shares: { data: [{ link: 'https://www.instagram.com/reel/Arrivo0001/' }] } }),
      delLead('2026-10-07T08:00', { message: 'Ciao! Ho visto questo reel' }),
      nostro('2026-10-07T09:00', { message: 'Ciao! Che obiettivo hai?' }),
      delLead('2026-10-07T10:00', { message: 'Il tuo link https://calendly.com/danielemontagnolo/coaching-call?' }),
      nostro('2026-10-07T11:00', { message: 'Eccolo: https://calendly.com/danielemontagnolo/coaching-call' }),
      nostro('2026-10-07T12:00', { shares: { data: [{ link: 'https://calendly.com/danielemontagnolo/coaching-call' }] } }),
      delLead('2026-10-07T13:00', { message: 'Prenotato! https://www.instagram.com/p/Secondo001/' }),
    ]
    const chat = versoChatTesto(conversazione(), { messaggi: [...cronologici].reverse(), letti: cronologici.length }, ACCOUNT)
    expect(chat.messaggi.map((m) => m.testo)).toEqual([
      '[contenuto condiviso: https://www.instagram.com/reel/Arrivo0001/]',
      'Ciao! Ho visto questo reel',
      'Ciao! Che obiettivo hai?',
      'Il tuo link https://calendly.com/danielemontagnolo/coaching-call?',
      'Eccolo: https://calendly.com/danielemontagnolo/coaching-call',
      '[contenuto condiviso]',
      'Prenotato! https://www.instagram.com/p/Secondo001/',
    ])
    expect(chat.messaggi.map((m) => m.da)).toEqual(['lead', 'lead', 'alpha', 'lead', 'alpha', 'alpha', 'lead'])
    expect(chat).toMatchObject({
      conversazione_id: 'c_prova',
      username: 'lead.prova',
      utente_id: LEAD.id,
      nome: null,
      aggiornata_il: '2026-10-07T19:00:00.000Z',
      messaggi_letti: 7,
      completa: true,
      ultimo_da: 'lead',
      ultimo_il: '2026-10-07T13:00:00.000Z',
      // our last message with the link (the shared one); the lead's never counts
      calendly_inviato_il: '2026-10-07T12:00:00.000Z',
      codici_condivisi: ['Arrivo0001', 'Secondo001'],
    })
    // the account is never the lead
    expect(JSON.stringify(chat)).not.toContain(ACCOUNT.username)
  })

  it('20 messaggi letti: non completa (il suo inizio non si vede)', () => {
    const venti = Array.from({ length: 20 }, (_, i) => nostro(`2026-10-07T${String(i + 1).padStart(2, '0')}:00`)).reverse()
    const chat = versoChatTesto(conversazione(), { messaggi: venti, letti: 20 }, ACCOUNT)
    expect(chat.completa).toBe(false)
    expect(chat.messaggi_letti).toBe(20)
    // a deleted message still counts among the read ones
    expect(versoChatTesto(conversazione(), { messaggi: venti.slice(1), letti: 20 }, ACCOUNT).completa).toBe(false)
    expect(versoChatTesto(conversazione(), { messaggi: venti.slice(1), letti: 19 }, ACCOUNT).completa).toBe(true)
  })

  it("l'ultimo messaggio è di un autore noto: un non leggibile senza mittente non decide chi aspetta", () => {
    const cronologici: MessaggioGraph[] = [
      delLead('2026-10-07T08:00', { message: 'Ciao' }),
      nostro('2026-10-07T09:00', { message: 'Ciao! Dimmi' }),
      { id: 'mx', created_time: t('2026-10-07T10:00'), non_leggibile: true },
    ]
    const chat = versoChatTesto(conversazione(), { messaggi: [...cronologici].reverse(), letti: 3 }, ACCOUNT)
    expect(chat.messaggi.at(-1)?.testo).toBe('[non leggibile]')
    expect(chat.ultimo_da).toBe('alpha')
    expect(chat.ultimo_il).toBe('2026-10-07T09:00:00.000Z')
  })

  it("stesso istante: resta l'ordine di Meta; senza orario: fuori", () => {
    const a = delLead('2026-10-07T08:00', { message: 'primo' })
    const b = delLead('2026-10-07T08:00', { message: 'secondo' })
    const senza = { ...delLead('2026-10-07T08:30', { message: 'perso' }), created_time: undefined }
    // Meta: most recent first, so for equal instants the later one comes first
    const chat = versoChatTesto(conversazione(), { messaggi: [senza, b, a], letti: 3 }, ACCOUNT)
    expect(chat.messaggi.map((m) => m.testo)).toEqual(['primo', 'secondo'])
    expect(chat.messaggi_letti).toBe(3)
  })

  it('senza participants il lead si legge dai messaggi; senza messaggi del lead dal destinatario dei nostri', () => {
    const solo = versoChatTesto(conversazione({ participants: undefined }), { messaggi: [delLead('2026-10-07T08:00', { message: 'x' })], letti: 1 }, ACCOUNT)
    expect(solo).toMatchObject({ username: 'lead.prova', utente_id: LEAD.id })
    const nostri = versoChatTesto(conversazione({ participants: undefined }), { messaggi: [nostro('2026-10-07T08:00', { message: 'Ciao!' })], letti: 1 }, ACCOUNT)
    expect(nostri).toMatchObject({ username: 'lead.prova', utente_id: LEAD.id, ultimo_da: 'alpha' })
    const vuota = versoChatTesto(conversazione({ participants: undefined, updated_time: undefined }), { messaggi: [], letti: 0 }, ACCOUNT)
    expect(vuota).toMatchObject({ username: null, utente_id: null, aggiornata_il: null, messaggi: [], completa: true, ultimo_da: null, ultimo_il: null, calendly_inviato_il: null, codici_condivisi: [] })
  })
})

describe('i 30 giorni', () => {
  it('senzaVecchi tiene solo i messaggi degli ultimi 30 giorni', () => {
    const adesso = new Date('2026-10-14T18:00:00.000Z')
    const limite = adesso.getTime() - GIORNI_MESSAGGI * 86_400_000
    const m = (ms: number | string) => ({ il: typeof ms === 'string' ? ms : new Date(ms).toISOString(), testo: 'x' })
    const tenuti = senzaVecchi([m(limite - 1), m(limite), m(limite + 60_000), m(adesso.getTime()), m('non una data')], adesso)
    expect(tenuti.map((x) => x.il)).toEqual([new Date(limite).toISOString(), new Date(limite + 60_000).toISOString(), adesso.toISOString()])
    expect(GIORNI_MESSAGGI).toBe(30)
  })
})

describe('scrittoDa e usernameDelLead, spostati da report.ts', () => {
  it("scrittoDa: per username, per id solo quando Meta non dà lo username", () => {
    const nostroDi = scrittoDa({ username: 'alpha_prova', id: '17841400000000001' })
    expect(nostroDi({ from: { username: 'Alpha_Prova' } })).toBe(true)
    expect(nostroDi({ from: { username: 'altro', id: '17841400000000001' } })).toBe(false)
    expect(nostroDi({ from: { id: '17841400000000001' } })).toBe(true)
    expect(nostroDi({ from: { id: '999' } })).toBe(false)
    expect(nostroDi({})).toBe(false)
    expect(scrittoDa({ username: 'alpha_prova', id: null })({ from: { id: '17841400000000001' } })).toBe(false)
  })

  it('usernameDelLead: dai partecipanti, poi dai messaggi del lead, poi dai destinatari dei nostri; mai l’account', () => {
    const nostroDi = scrittoDa(ACCOUNT)
    const conv = (data?: { username?: string; id?: string }[]): ConversazioneGraph => ({ id: 'c', ...(data ? { participants: { data } } : {}) })
    expect(usernameDelLead(conv([{ username: 'alpha_prova' }, { username: '@Lead.Uno ' }]), [], 'alpha_prova', nostroDi)).toBe('lead.uno')
    expect(usernameDelLead(conv(), [delLead('2026-10-07T08:00')], 'alpha_prova', nostroDi)).toBe('lead.prova')
    expect(usernameDelLead(conv(), [nostro('2026-10-07T08:00')], 'alpha_prova', nostroDi)).toBe('lead.prova')
    expect(usernameDelLead(conv([{ username: 'alpha_prova' }]), [], 'alpha_prova', nostroDi)).toBeNull()
    expect(usernameDelLead(conv([{ username: 'non valido!' }]), [], 'alpha_prova', nostroDi)).toBeNull()
  })
})
