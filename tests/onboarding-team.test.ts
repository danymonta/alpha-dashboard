import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { problemiApertura } from '@/lib/onboarding/area'
import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { istanteRoma } from '@/lib/date'
import { emailToccaATe, fraseToccaATe, messaggioToccaATe } from '@/lib/email/cliente'
import { LINGUE } from '@/lib/i18n/lingua'
import { ONBOARDING_TEAM, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { vociNav } from '@/lib/nav'
import {
  CODE,
  codeDellaRiga,
  codeDelleRighe,
  incarichiDi,
  perGruppoIncaricati,
  permessiTeam,
  type RigaIncaricato,
} from '@/lib/onboarding/code'
import { eventoInParole } from '@/lib/onboarding/stati'
import { TESTI_TOCCA_A_TE } from '@/lib/percorso/testi'
import {
  ERRORI_ONBOARDING_TEAM,
  confermaCallSchema,
  consegnaSchema,
  esitoCallSchema,
  riavviaSchema,
  sbloccaPassoSchema,
} from '@/lib/validation/onboarding-team'
import { impostazioniOnboardingSchema } from '@/lib/validation/onboarding'

/*
 * The team's side of release B2 (1.80.0): the list of the people in charge (groups and
 * queues), the item of the menu for whoever has an incarico, the email «Tocca a te», the
 * schemas of the actions and the database's words in English.
 */

const CLIENTE = '0b0b0000-0000-4000-8000-000000000003'

function riga(parziale: Partial<RigaIncaricato>): RigaIncaricato {
  return {
    client_id: CLIENTE,
    nome: 'Giorgio',
    cognome: 'Neri',
    incarico: 'coach',
    incarichi: ['coach'],
    gruppo: 'tocca_al_cliente',
    passo: 'prenotazione',
    passo_titolo: 'Prenota la call',
    ...Object.fromEntries(CODE.map((c) => [c, false])),
    ...parziale,
  } as RigaIncaricato
}

describe('la lista degli incaricati', () => {
  it('i quattro gruppi, nell’ordine del contratto; un gruppo sconosciuto aspetta il cliente', () => {
    const righe = [
      riga({ client_id: 'a', gruppo: 'tocca_a_te', call_da_confermare: true }),
      riga({ client_id: 'b', gruppo: 'in_pausa' }),
      riga({ client_id: 'c', gruppo: 'completati' }),
      riga({ client_id: 'd', gruppo: 'tocca_al_cliente' }),
      riga({ client_id: 'e', gruppo: 'un_gruppo_nuovo' }),
    ]
    const g = perGruppoIncaricati(righe)
    expect(Object.keys(g)).toEqual(['tocca_a_te', 'tocca_al_cliente', 'in_pausa', 'completati'])
    expect(g.tocca_a_te.map((r) => r.client_id)).toEqual(['a'])
    expect(g.tocca_al_cliente.map((r) => r.client_id)).toEqual(['d', 'e'])
    expect(g.in_pausa.map((r) => r.client_id)).toEqual(['b'])
    expect(g.completati.map((r) => r.client_id)).toEqual(['c'])
  })

  it('le code di una riga, nell’ordine del lavoro; nessuna per un cliente in pausa o completato', () => {
    const r = riga({ gruppo: 'tocca_a_te', programma_da_consegnare: true, call_da_confermare: true, preparazione_incompleta: true })
    expect(codeDellaRiga(r)).toEqual(['call_da_confermare', 'preparazione_incompleta', 'programma_da_consegnare'])
    expect(codeDellaRiga({ ...r, gruppo: 'in_pausa' })).toEqual([])
    expect(codeDellaRiga({ ...r, gruppo: 'completati' })).toEqual([])
  })

  it('le code in cima: solo quelle con qualcuno, ognuna con i suoi clienti', () => {
    const code = codeDelleRighe([
      riga({ client_id: 'a', gruppo: 'tocca_a_te', call_da_confermare: true }),
      riga({ client_id: 'b', gruppo: 'tocca_a_te', call_da_confermare: true, richiesta_community: true }),
      riga({ client_id: 'c', gruppo: 'in_pausa', test_da_confermare: true }),
    ])
    expect(code.map((c) => c.coda)).toEqual(['call_da_confermare', 'richiesta_community'])
    expect(code[0].righe.map((r) => r.client_id)).toEqual(['a', 'b'])
    expect(codeDelleRighe([riga({})])).toEqual([])
  })

  it('le sette code del contratto ci sono tutte, con «Test da rivedere» del revisore', () => {
    for (const coda of [
      'call_da_confermare',
      'call_da_segnare',
      'richiesta_community',
      'presentazione_da_controllare',
      'test_da_confermare',
      'test_da_rivedere',
      'programma_da_consegnare',
      'preparazione_incompleta',
    ]) {
      expect(CODE).toContain(coda)
    }
    const t = ONBOARDING_TEAM.it.code.voci
    expect(t.call_da_confermare).toBe('Call da confermare')
    expect(t.call_da_segnare).toBe('Call da segnare')
    expect(t.richiesta_community).toBe('Richieste di accesso alla community')
    expect(t.presentazione_da_controllare).toBe('Presentazioni da controllare')
    expect(t.test_da_confermare).toBe('Test da confermare')
    expect(t.test_da_rivedere).toBe('Test da rivedere')
    expect(t.programma_da_consegnare).toBe('Programma da consegnare')
    expect(t.preparazione_incompleta).toBe('Preparazione incompleta')
    expect(ONBOARDING_TEAM.it.scheda.preparazioneIncompleta).toBe('Preparazione incompleta: manca la community.')
    for (const lingua of LINGUE) for (const coda of CODE) expect(ONBOARDING_TEAM[lingua].code.voci[coda]).toBeTruthy()
  })

  it('i nomi dei gruppi del contratto', () => {
    expect(ONBOARDING_TEAM.it.lista.gruppi).toEqual({
      tocca_a_te: 'Tocca a te',
      tocca_al_cliente: 'Tocca al cliente',
      in_pausa: 'In pausa',
      completati: 'Completati',
    })
  })

  it('gli incarichi in un ordine fisso, solo quelli noti', () => {
    expect(incarichiDi({ incarichi: ['revisore', 'coach', 'altro'] })).toEqual(['coach', 'revisore'])
    expect(incarichiDi({ incarichi: null })).toEqual([])
  })

  it('chi fa cosa: il coach tutto, il responsabile solo la community, il revisore niente', () => {
    expect(permessiTeam(['coach'], false)).toEqual({ coach: true, community: true, questionario: true })
    expect(permessiTeam(['responsabile'], false)).toEqual({ coach: false, community: true, questionario: false })
    expect(permessiTeam(['revisore'], false)).toEqual({ coach: false, community: false, questionario: false })
    expect(permessiTeam([], true)).toEqual({ coach: true, community: true, questionario: true })
  })
})

describe('la voce «Onboarding» per chi ha un incarico', () => {
  const ha = (ruolo: (typeof TUTTI_I_RUOLI)[number], onboarding: boolean) =>
    vociNav(ruolo, { onboarding }).gruppi.flatMap((g) => g.voci).filter((v) => v.href === '/onboarding').length

  it('senza incarico nessuno tranne l’admin; con un incarico ogni ruolo del team, una volta sola', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      if (ruolo === 'business_coach') continue
      expect(ha(ruolo, false), ruolo).toBe(ruolo === 'admin' ? 1 : 0)
      expect(ha(ruolo, true), ruolo).toBe(1)
    }
    expect(ha('business_coach', true)).toBe(0)
  })

  it('mai nella barra in basso; nel foglio «Altro», nel gruppo Progetti', () => {
    for (const ruolo of ['coach', 'setter', 'closer', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      const nav = vociNav(ruolo, { onboarding: true })
      expect(nav.principali.map((v) => v.href), ruolo).not.toContain('/onboarding')
      expect(nav.principali).toEqual(vociNav(ruolo).principali)
      expect(nav.altre.map((v) => v.href), ruolo).toContain('/onboarding')
      const progetti = nav.gruppi.find((g) => g.titolo === 'Progetti')
      expect(progetti?.voci.map((v) => v.href), ruolo).toContain('/onboarding')
    }
  })

  it('il menu senza incarico resta quello di sempre', () => {
    expect(vociNav('coach', { onboarding: false })).toBe(vociNav('coach'))
    expect(vociNav('admin', { onboarding: true })).toBe(vociNav('admin'))
  })
})

describe('«Tocca a te»', () => {
  const url = 'https://dashboard.example.test/percorso'

  it('una frase per ogni avviso delle funzioni del team', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261110090100_percorso_team.sql'), 'utf8')
    const motivi = new Set(
      [...sql.matchAll(/onboarding_avviso_cliente\('([a-z_]+)'\)/g), ...sql.matchAll(/v_avviso := '([a-z_]+)'/g)].map((m) => m[1]),
    )
    for (const m of [...sql.matchAll(/then 'call_spostata' else '([a-z_]+)'/g)]) motivi.add(m[1])
    expect(motivi.size).toBeGreaterThanOrEqual(6)
    for (const motivo of motivi) {
      expect(Object.keys(TESTI_TOCCA_A_TE.motivi), motivo).toContain(motivo)
    }
    expect(fraseToccaATe('un_avviso_nuovo')).toBe(TESTI_TOCCA_A_TE.generico)
  })

  it('l’email: il nome, la frase, il link all’area, mai un codice o un importo', () => {
    const e = emailToccaATe({ nome: 'Giorgio', motivo: 'call_confermata', urlPercorso: url, urlLogo: 'https://x.it/l.png' })
    expect(e.oggetto).toBe('Tocca a te: il prossimo passo del tuo percorso')
    expect(e.testo).toContain('Ciao Giorgio,')
    expect(e.testo).toContain('la tua call di onboarding è confermata')
    expect(e.testo).toContain(url)
    expect(e.html).toContain(`href="${url}"`)
    expect(e.oggetto + e.testo + e.html).not.toMatch(/€|\d{6,}|[–—]/)
    expect(e.oggetto + e.testo).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('senza nome saluta lo stesso, e il nome si scrive com’è nell’HTML senza diventare markup', () => {
    expect(emailToccaATe({ nome: '', motivo: 'x', urlPercorso: url, urlLogo: 'https://x.it/l.png' }).testo).toMatch(/^Ciao,/)
    const html = emailToccaATe({ nome: '<b>Mario</b>', motivo: 'x', urlPercorso: url, urlLogo: 'https://x.it/l.png' }).html
    expect(html).toContain('&lt;b&gt;Mario&lt;/b&gt;')
    expect(html).not.toContain('<b>Mario</b>')
  })

  it('il messaggio per Telegram: le stesse parole, il link, nessuna email', () => {
    const m = messaggioToccaATe({ nome: 'Giorgio', motivo: 'programma_consegnato', urlPercorso: url })
    expect(m).toBe(`Ciao Giorgio, il tuo programma è pronto: guarda i video nella tua area e il tuo percorso parte.\n${url}`)
    expect(m).not.toMatch(/@/)
  })
})

describe('gli schemi delle azioni del team', () => {
  it('conferma della call: giorno, ora e un link di Meet (anche senza https)', () => {
    const ok = confermaCallSchema.parse({ client_id: CLIENTE, giorno: '2026-11-20', ora: '18:00', meet_url: 'meet.google.com/abc-defg-hij' })
    expect(ok.meet_url).toBe('https://meet.google.com/abc-defg-hij')
    const ko = confermaCallSchema.safeParse({ client_id: CLIENTE, giorno: '2026-11-20', ora: '18:00', meet_url: 'https://zoom.us/j/1' })
    expect(ko.success).toBe(false)
    if (!ko.success) expect(ko.error.issues[0].message).toBe(ERRORI_ONBOARDING_TEAM.meet)
    expect(confermaCallSchema.safeParse({ client_id: CLIENTE, giorno: '2026-02-30', ora: '18:00', meet_url: 'https://meet.google.com/a' }).success).toBe(false)
  })

  it('esito: «svolta» senza giorno, le altre col nuovo giorno e la nuova ora', () => {
    const call = '0b0b0000-0000-4000-8000-0000000000aa'
    expect(esitoCallSchema.safeParse({ call_id: call, esito: 'svolta' }).success).toBe(true)
    expect(esitoCallSchema.safeParse({ call_id: call, esito: 'spostata' }).success).toBe(false)
    expect(esitoCallSchema.safeParse({ call_id: call, esito: 'non_presentato', giorno: '2026-11-21', ora: '09:30' }).success).toBe(true)
    expect(esitoCallSchema.safeParse({ call_id: call, esito: 'persa' }).success).toBe(false)
  })

  it('consegne: un video di YouTube (link o id), un PDF o un link https; obbligatoria solo per un video', () => {
    const video = consegnaSchema.parse({ client_id: CLIENTE, tipo: 'video', titolo: ' Scheda A ', url: 'youtu.be/abcdefghijk', obbligatoria: true })
    expect(video).toMatchObject({ titolo: 'Scheda A', url: 'https://youtu.be/abcdefghijk', obbligatoria: true })
    expect(consegnaSchema.parse({ client_id: CLIENTE, tipo: 'video', titolo: 'A', url: 'abcdefghijk' }).url).toBe('abcdefghijk')
    expect(consegnaSchema.safeParse({ client_id: CLIENTE, tipo: 'video', titolo: 'A', url: 'https://vimeo.com/1' }).success).toBe(false)
    const pdf = consegnaSchema.parse({ client_id: CLIENTE, tipo: 'pdf', titolo: 'Piano', url: 'drive.google.com/x', obbligatoria: true })
    expect(pdf).toMatchObject({ url: 'https://drive.google.com/x', obbligatoria: false })
    expect(consegnaSchema.safeParse({ client_id: CLIENTE, tipo: 'link', titolo: '', url: 'https://x.it' }).success).toBe(false)
  })

  it('sblocca e riavvia vogliono il motivo, al massimo 300 caratteri', () => {
    expect(sbloccaPassoSchema.safeParse({ client_id: CLIENTE, passo: 'benvenuto', motivo: ' ' }).success).toBe(false)
    expect(sbloccaPassoSchema.safeParse({ client_id: CLIENTE, passo: 'inesistente', motivo: 'Video rotto' }).success).toBe(false)
    expect(sbloccaPassoSchema.safeParse({ client_id: CLIENTE, passo: 'benvenuto', motivo: 'Video rotto' }).success).toBe(true)
    expect(riavviaSchema.safeParse({ client_id: CLIENTE, motivo: 'x'.repeat(301) }).success).toBe(false)
  })

  it('la pagina di prenotazione delle impostazioni: solo Google Calendar, vuota è nessuna', () => {
    const base = { coach_predefinito_id: '', revisore_predefinito_id: '', responsabile_predefinito_id: '', link_community: '', giorni_validita_link: 14 }
    expect(impostazioniOnboardingSchema.parse({ ...base, link_prenotazione: 'calendar.app.google/abc' }).link_prenotazione).toBe(
      'https://calendar.app.google/abc',
    )
    expect(impostazioniOnboardingSchema.parse({ ...base, link_prenotazione: '' }).link_prenotazione).toBeNull()
    expect(impostazioniOnboardingSchema.safeParse({ ...base, link_prenotazione: 'https://calendly.com/x' }).success).toBe(false)
    expect(impostazioniOnboardingSchema.parse({ ...base, avvisa_cliente_email: false }).avvisa_cliente_email).toBe(false)
  })
})

describe('giorno e ora di Roma', () => {
  it('l’istante in UTC, con l’ora legale e quella solare', () => {
    expect(istanteRoma('2026-11-20', '18:00')).toBe('2026-11-20T17:00:00.000Z')
    expect(istanteRoma('2026-07-20', '18:00')).toBe('2026-07-20T16:00:00.000Z')
    expect(istanteRoma('2026-10-25', '12:00')).toBe('2026-10-25T11:00:00.000Z')
  })
})

describe('le parole del database in inglese', () => {
  /** Every message a function raises with one of our codes, as Postgres says it (''' -> '). */
  function messaggi(nome: string): string[] {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', nome), 'utf8')
    const trovati = [...sql.matchAll(/raise exception '((?:[^']|'')+)'\s+using errcode = '(22023|42501)'/g)]
    return [...new Set(trovati.map((m) => m[1].replace(/''/g, "'")))]
  }

  // the team's functions (section 9 of the migration): the cards show their words
  const DEL_TEAM = [
    "Non c'è una call da confermare.",
    'Il link di Meet comincia con https://meet.google.com/.',
    'Questa call non è da segnare.',
    "La call non c'è ancora stata: segnala svolta dopo averla fatta.",
    'Il cliente non ha ancora finito la settimana test.',
    'Il programma si consegna dopo aver confermato i test.',
    'Aggiungi almeno una consegna prima.',
    'Il cliente non si è ancora presentato.',
    'Questo step non è bloccato.',
    "L'onboarding di questo cliente è in pausa.",
    "L'area clienti la apre l'admin",
  ]

  it('ogni frase del team che la migration solleva ha la sua traduzione', () => {
    const sollevati = messaggi('20261110090100_percorso_team.sql')
    for (const m of DEL_TEAM) {
      expect(sollevati, m).toContain(m)
      expect(traduciErroreOnboarding(m, 'en'), m).not.toBe(m)
    }
    expect(traduciErroreOnboarding("Questa azione è del coach del cliente e dell'admin.", 'en')).toBe(
      'This action belongs to the client’s coach and the admin.',
    )
  })

  it('ogni messaggio degli schemi del team ha la sua traduzione', () => {
    for (const [chiave, messaggio] of Object.entries(ERRORI_ONBOARDING_TEAM)) {
      expect(traduciErroreOnboarding(messaggio, 'en'), chiave).not.toBe(messaggio)
    }
  })

  it('quello che manca prima di aprire l’area, una riga per problema nelle due lingue', () => {
    const m =
      "Prima di aprire l'area clienti: 2 contenuti hanno ancora «[Da scrivere», 1 video ha ancora l'id segnaposto, manca il link della community, manca l'indirizzo della pagina di prenotazione."
    expect(problemiApertura(m, 'it')).toEqual([
      '2 contenuti hanno ancora «[Da scrivere»',
      "1 video ha ancora l'id segnaposto",
      'manca il link della community',
      "manca l'indirizzo della pagina di prenotazione",
    ])
    expect(problemiApertura(m, 'en')).toEqual([
      '2 contents still have «[Da scrivere»',
      '1 video still has the placeholder id',
      'the community link is missing',
      'the booking page address is missing',
    ])
    expect(problemiApertura('Altro errore', 'it')).toBeNull()
  })
})

describe('il registro del lavoro del team', () => {
  it('le righe nuove in parole, il motivo di «Sblocca» con lui', () => {
    expect(eventoInParole({ tipo: 'call_confermata', dettagli: { call_id: 'x' } })).toBe('Call di onboarding confermata')
    expect(eventoInParole({ tipo: 'call_svolta', dettagli: { tipo: 'checkpoint' } })).toBe('Checkpoint svolto')
    expect(eventoInParole({ tipo: 'passo_sbloccato', dettagli: { passo: 'benvenuto', motivo: 'Video rotto' } })).toBe(
      'Step sbloccato: «Benvenuto»: Video rotto',
    )
    expect(eventoInParole({ tipo: 'community_approvata', dettagli: {} }, 'en')).toBe('Community access approved')
  })
})
