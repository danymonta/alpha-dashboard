import { describe, expect, it } from 'vitest'

import {
  chiusoPerche,
  compitiDaTesto,
  leggiCampoBase,
  leggiCampoBaseTeam,
  nodiDaPassi,
  percentualeModulo,
  prossimaLezione,
  resocontoIniziale,
  schedaDa,
  testoTelegram,
} from '@/lib/percorso/campo-base'
import { checkupSchema } from '@/lib/validation/checkup'
import { lezioneSchema, moduloSchema } from '@/lib/validation/aula'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('tabs of the home base', () => {
  it('lands on the path before the launch and on Home after', () => {
    expect(schedaDa(null, false)).toBe('percorso')
    expect(schedaDa(null, true)).toBe('home')
    expect(schedaDa('aula', false)).toBe('aula')
    expect(schedaDa('nessuna', true)).toBe('home')
  })
})

describe('Aula', () => {
  it('says the progress and why a module is closed', () => {
    expect(percentualeModulo({ totali: 0, completate: 0 })).toBe(0)
    expect(percentualeModulo({ totali: 3, completate: 1 })).toBe(33)
    expect(percentualeModulo({ totali: 2, completate: 5 })).toBe(100)
    expect(chiusoPerche({ stato: 'pubblicato', aperto: true })).toBeNull()
    expect(chiusoPerche({ stato: 'pubblicato', aperto: false })).toBe('dopo_lancio')
    expect(chiusoPerche({ stato: 'prossimamente', aperto: true })).toBe('prossimamente')
    expect(chiusoPerche({ stato: 'bloccato', aperto: false })).toBe('bloccato')
  })

  it('picks the first lesson to do', () => {
    const lezione = (id: number, fatta: boolean) => ({
      id: ID(id),
      titolo: `L${id}`,
      tipo: 'testo' as const,
      obbligatoria: false,
      completataIl: fatta ? '2026-11-10T10:00:00Z' : null,
      percentuale: 0,
      corpo: null,
      youtubeId: null,
      url: null,
    })
    expect(prossimaLezione({ lezioni: [lezione(1, true), lezione(2, false)] })?.titolo).toBe('L2')
    expect(prossimaLezione({ lezioni: [lezione(1, true)] })?.titolo).toBe('L1')
    expect(prossimaLezione({ lezioni: [] })).toBeNull()
  })
})

describe('check-ups', () => {
  it('starts the recap like Dany’s model and builds the Telegram text', () => {
    expect(resocontoIniziale('Mario Rossi')).toBe('Mario, grazie della call, oggi abbiamo parlato di questo topic principale: ')
    expect(testoTelegram({ resoconto: 'Mario, grazie della call.', compiti: ['Uno', 'Due'] })).toBe(
      'Mario, grazie della call.\n\nI tuoi compiti entro la nostra prossima call:\n\n- Uno\n- Due',
    )
    expect(testoTelegram({ resoconto: null, compiti: [] })).toBe('')
  })

  it('reads the tasks one per line, at most 20 of 300 characters', () => {
    expect(compitiDaTesto('- uno\n\n2. due\n• tre\n   ')).toEqual(['uno', 'due', 'tre'])
    expect(compitiDaTesto(Array.from({ length: 30 }, (_, i) => `c${i}`).join('\n'))).toHaveLength(20)
    expect(compitiDaTesto('x'.repeat(400))[0]).toHaveLength(300)
  })

  it('the client document never carries the notes', () => {
    const doc = {
      nome: 'Mario',
      lanciato: true,
      checkup: [
        { id: ID(1), giorno: '2026-11-10', argomento: 'a', resoconto: 'r', compiti: ['c'], fathom_url: 'https://fathom.video/share/x' },
      ],
    }
    const campo = leggiCampoBase(doc)!
    expect(campo.checkup[0]).not.toHaveProperty('appunti')
    expect(campo.checkup[0]!.fathomUrl).toBe('https://fathom.video/share/x')
  })

  it('the team document has the notes, and a client in pause is only his name', () => {
    const team = leggiCampoBaseTeam({
      nome: 'Mario',
      cognome: 'Rossi',
      registrato: true,
      checkup: [{ id: ID(1), giorno: '2026-11-10', compiti: [], appunti: 'solo del team' }],
    })!
    expect(team.nomeCliente).toBe('Mario Rossi')
    expect(team.checkup[0]!.appunti).toBe('solo del team')
    const pausa = leggiCampoBaseTeam({ nome: 'Mario', cognome: 'Rossi', in_pausa: true, checkup: [{ id: ID(1) }] })!
    expect(pausa.inPausa).toBe(true)
    expect(pausa.checkup).toEqual([])
  })
})

describe('stages from the steps', () => {
  it('follows the rule of percorso_cliente()', () => {
    const nodi = nodiDaPassi([
      { nodo: 'benvenuto', stato: 'fatto', completato_il: '2026-11-01T10:00:00Z' },
      { nodo: 'preparazione', stato: 'fatto', completato_il: null },
      { nodo: 'preparazione', stato: 'disponibile', completato_il: null },
      { nodo: 'lancio', stato: 'bloccato', completato_il: null },
    ])
    expect(nodi.map((n) => [n.chiave, n.stato])).toEqual([
      ['benvenuto', 'completato'],
      ['preparazione', 'attuale'],
      ['lancio', 'futuro'],
    ])
  })
})

describe('schemas', () => {
  const base = {
    client_id: ID(1),
    id: null,
    giorno: '2026-11-10',
    fathom_url: '',
    argomento: '',
    resoconto: '',
    appunti: '',
    compiti: [],
    call_id: null,
  }

  it('a check-up wants a Fathom link or nothing, and the limits of the table', () => {
    expect(checkupSchema.safeParse(base).success).toBe(true)
    expect(checkupSchema.safeParse({ ...base, fathom_url: 'https://fathom.video/share/x' }).success).toBe(true)
    expect(checkupSchema.safeParse({ ...base, fathom_url: 'https://example.com/x' }).success).toBe(false)
    expect(checkupSchema.safeParse({ ...base, argomento: 'a'.repeat(201) }).success).toBe(false)
    expect(checkupSchema.safeParse({ ...base, compiti: Array(21).fill('c') }).success).toBe(false)
  })

  it('a video lesson wants a YouTube id, a link lesson an https address', () => {
    const lezione = { modulo_id: ID(2), titolo: 'L', ordine: 1 }
    expect(lezioneSchema.safeParse({ ...lezione, tipo: 'video', youtube: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(true)
    expect(lezioneSchema.safeParse({ ...lezione, tipo: 'video', youtube: '' }).success).toBe(false)
    expect(lezioneSchema.safeParse({ ...lezione, tipo: 'link', url: 'http://x.it' }).success).toBe(false)
    expect(lezioneSchema.safeParse({ ...lezione, tipo: 'testo', corpo: 'ciao' }).success).toBe(true)
    expect(moduloSchema.safeParse({ titolo: 'M', icona: 'libro', ordine: 1, stato: 'pubblicato' }).success).toBe(true)
  })
})
