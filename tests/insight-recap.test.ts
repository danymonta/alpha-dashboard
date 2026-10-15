import { describe, expect, it } from 'vitest'

import {
  LINK_INBOX_MESSENGER,
  linkChatInstagram,
  linkContenutoCalendario,
  linkPost,
  linkProfiloInstagram,
  urlSicuro,
  usernameValido,
} from '@/lib/insight/link'
import {
  arrivaDa,
  etichettaGiornoRecap,
  fasePasso,
  metaAggiornato,
  metaAutomazione,
  nomePostOrigine,
  periodoContent,
  rigaEscluseImpostazioni,
  rigaFallita,
  rigaInCorso,
  rigaPianificatore,
  titoloNessunRecap,
  viaOrigine,
} from '@/lib/insight/parole'
import { leggiRecap } from '@/lib/insight/recap'

// What the page reads from a recap: the tolerant schema (the recap is written
// by code from what a model read in untrusted DMs), the links it builds from it
// and its words. Every chat is invented.

describe('leggiRecap, as the page renders it', () => {
  it('a recap with missing lists, nulls and an unknown priority still renders', () => {
    const r = leggiRecap({
      date: '2026-10-14',
      headline: null,
      summary: null,
      leads: [
        { username: 'marco.esempio', conversation_id: 'c1', priority: 'urgentissima', messages: null, topics: 'tutto' },
        null,
        { conversation_id: 'c2', priority: 'Media', last_message_at: 12 },
      ],
      reactivate: 'nessuno',
      content: { themes: [{ theme: 'Poco tempo', count: '6' }], posts: null, ideas: [{ hook: 'Un tavolo e due zaini' }] },
      non_leads: [{ username: 'amico.inventato' }],
      escluse: '2',
      stato: 'a metà',
    })
    expect(r).not.toBeNull()
    expect(r!.headline).toBe('')
    expect(r!.leads.map((l) => [l.conversation_id, l.priority, l.messages.length, l.topics.length])).toEqual([
      ['c1', 'bassa', 0, 0],
      ['c2', 'media', 0, 0],
    ])
    expect(r!.leads[1].last_message_at).toBe('')
    expect(r!.reactivate).toEqual([])
    expect(r!.content.themes[0]).toMatchObject({ theme: 'Poco tempo', count: 0 })
    expect(r!.content.posts).toEqual([])
    expect(r!.content.ideas[0]).toEqual({ hook: 'Un tavolo e due zaini', format: '', why: '' })
    expect(r!.non_leads[0]).toMatchObject({ username: 'amico.inventato', reason: '' })
    expect(r!.escluse).toBe(0)
    expect(r!.stato).toBe('completo')
  })
})

describe('links: only from a valid username, only to their own host', () => {
  it('usernameValido: the check of insight_chat and instagram_esclusi', () => {
    expect(usernameValido('Marco.Esempio')).toBe('marco.esempio')
    expect(usernameValido('@luca_prova')).toBe('luca_prova')
    expect(usernameValido('marco esempio')).toBeNull()
    expect(usernameValido('javascript:alert(1)')).toBeNull()
    expect(usernameValido('a'.repeat(31))).toBeNull()
    expect(usernameValido('')).toBeNull()
    expect(usernameValido(undefined)).toBeNull()
  })

  it('the profile and the chat (ig.me/m) of a valid username, nothing otherwise', () => {
    expect(linkProfiloInstagram('marco.esempio')).toBe('https://www.instagram.com/marco.esempio/')
    expect(linkChatInstagram('marco.esempio')).toBe('https://ig.me/m/marco.esempio')
    expect(linkChatInstagram('../../evil')).toBeNull()
    expect(linkProfiloInstagram(null)).toBeNull()
    expect(LINK_INBOX_MESSENGER).toBe('https://business.facebook.com/latest/inbox/messenger')
  })

  it('urlSicuro: https on its own host, without credentials or ports', () => {
    expect(urlSicuro('https://www.instagram.com/reel/SeedDemo01/', 'instagram')).toBe('https://www.instagram.com/reel/SeedDemo01/')
    expect(urlSicuro(' https://instagram.com/p/SeedPost02/ ', 'instagram')).toBe('https://instagram.com/p/SeedPost02/')
    expect(urlSicuro('http://www.instagram.com/reel/SeedDemo01/', 'instagram')).toBeNull()
    expect(urlSicuro('https://www.instagram.com.evil.example/reel/x/', 'instagram')).toBeNull()
    expect(urlSicuro('https://user:pass@www.instagram.com/', 'instagram')).toBeNull()
    expect(urlSicuro('https://www.instagram.com:8443/', 'instagram')).toBeNull()
    expect(urlSicuro('javascript:alert(1)', 'instagram')).toBeNull()
    expect(urlSicuro('https://meet.google.com/abc-defg-hij', 'meet')).toBe('https://meet.google.com/abc-defg-hij')
    expect(urlSicuro('https://www.instagram.com/', 'meet')).toBeNull()
    expect(urlSicuro('', 'meet')).toBeNull()
  })

  it('linkPost: the permalink, else the shortcode, else nothing', () => {
    expect(linkPost('https://www.instagram.com/reel/SeedDemo01/', 'SeedDemo01')).toBe('https://www.instagram.com/reel/SeedDemo01/')
    expect(linkPost('https://evil.example/reel/x', 'SeedPost02')).toBe('https://www.instagram.com/p/SeedPost02/')
    expect(linkPost(undefined, 'no/slash')).toBeNull()
    expect(linkPost(undefined, undefined)).toBeNull()
  })

  it('the calendar content in its panel', () => {
    expect(linkContenutoCalendario('ccccccc1-0000-4000-8000-000000000001')).toBe(
      '/marketing/contenuti?contenuto=ccccccc1-0000-4000-8000-000000000001',
    )
  })
})

describe('the page’s words', () => {
  it('the meta line and the day select', () => {
    expect(metaAggiornato('2026-10-08T20:55:00Z')).toBe('Aggiornato 08/10, 22:55 · ultime 24 ore')
    expect(metaAggiornato('')).toBe('ultime 24 ore')
    expect(metaAutomazione(true, '19:05')).toBe('recap automatico alle 19:05')
    expect(metaAutomazione(false, '19:00')).toBe('recap automatico spento')
    expect(etichettaGiornoRecap('2026-10-08')).toBe('giovedì 8 ottobre')
    expect(etichettaGiornoRecap('boh')).toBe('boh')
  })

  it('the run’s lines', () => {
    expect(fasePasso('lettura', null, null)).toBe('leggo Instagram e Messenger')
    expect(fasePasso('analisi', 4, 12)).toBe('Claude analizza le chat (4/12)')
    expect(fasePasso('analisi', null, null)).toBe('Claude analizza le chat')
    expect(fasePasso('unione', 12, 12)).toBe('preparo il recap')
    expect(rigaInCorso(0, 'preparo il recap')).toBe(
      'Aggiornamento avviato 1 min fa: preparo il recap. Il recap arriva da solo, puoi chiudere la pagina.',
    )
    expect(rigaFallita('Claude non ha risposto.')).toBe('L’aggiornamento non è riuscito: Claude non ha risposto.')
    expect(rigaFallita(null)).toBe('L’aggiornamento non è riuscito: riprova con Aggiorna dati.')
    expect(rigaPianificatore('18:40')).toBe(
      'Il pianificatore non risponde dalle 18:40: il recap automatico è fermo. Usa Aggiorna dati e avvisa chi gestisce l’app.',
    )
  })

  it('«Arriva da» (D26)', () => {
    expect(arrivaDa({ tipo_post: 'reel', data: '03/10', hook: 'Ho solo un tavolo' })).toBe('Arriva da: reel del 03/10 «Ho solo un tavolo»')
    expect(arrivaDa({})).toBe('Arriva da: post')
    expect(nomePostOrigine({ tipo_post: 'carosello' })).toBe('carosello')
    expect(viaOrigine({ tipo: 'condivisione' })).toBe('condiviso in DM')
    expect(viaOrigine({ tipo: 'parola_chiave', parola: 'ALPHA' })).toBe('parola chiave «ALPHA»')
    expect(viaOrigine({ tipo: 'parola_chiave' })).toBe('parola chiave della didascalia')
    expect(viaOrigine({ tipo: 'storia' })).toBe('risposta a una storia')
    expect(viaOrigine({ tipo: 'testo' })).toBe('dal testo della chat')
  })

  it('content, excluded chats and empty states', () => {
    expect(periodoContent('', 0)).toBe('Analisi delle ultime 24 ore')
    expect(periodoContent('ultimi 14 giorni', 23)).toBe('ultimi 14 giorni · 23 chat analizzate')
    expect(rigaEscluseImpostazioni(1)).toBe('1 chat esclusa dalle impostazioni non è stata analizzata.')
    expect(rigaEscluseImpostazioni(2)).toBe('2 chat escluse dalle impostazioni non sono state analizzate.')
    expect(titoloNessunRecap('instagram')).toBe('Nessun recap Instagram ancora')
    expect(titoloNessunRecap('messenger')).toBe('Nessun recap Messenger ancora')
    expect(titoloNessunRecap('agenda')).toBe('Nessun recap con agenda ancora')
  })
})
