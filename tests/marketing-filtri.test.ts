import { describe, expect, it } from 'vitest'

import {
  RICERCA_MAX,
  filtriDaParametri,
  filtriDelGruppo,
  haFiltri,
  parametriDaFiltri,
  patternRicerca,
  statiFiltrati,
} from '@/lib/marketing/filtri'

describe('i filtri dei contenuti, nell’indirizzo', () => {
  it('legge i valori validi e lascia cadere gli altri', () => {
    expect(
      filtriDaParametri({
        gruppo: 'in_progress',
        stato: 'to_be_edited',
        reel_type: 'radio',
        formato: 'b_roll',
        tipo: 'carousel',
        q: '  trazioni ',
      }),
    ).toEqual({
      gruppo: 'in_progress',
      stato: 'to_be_edited',
      reel_type: 'radio',
      formato: 'b_roll',
      tipo: 'carousel',
      q: 'trazioni',
    })
    expect(
      filtriDaParametri({ gruppo: 'fatto', stato: 'Posted', reel_type: 'RADIO', formato: '', tipo: 'video', q: '   ' }),
    ).toEqual({})
  })

  it('di un parametro ripetuto vale il primo; la ricerca al massimo 100 caratteri', () => {
    expect(filtriDaParametri({ stato: ['posted', 'canceled'] })).toEqual({ stato: 'posted' })
    expect(filtriDaParametri({ q: 'a'.repeat(150) }).q).toHaveLength(RICERCA_MAX)
  })

  it('andata e ritorno: i parametri ridanno gli stessi filtri', () => {
    const filtri = { gruppo: 'complete', formato: 'split', q: 'casa' } as const
    const parametri = parametriDaFiltri(filtri)
    expect(parametri).toEqual({
      gruppo: 'complete',
      stato: undefined,
      reel_type: undefined,
      formato: 'split',
      tipo: undefined,
      q: 'casa',
    })
    expect(filtriDaParametri(parametri)).toEqual(filtri)
  })

  it('haFiltri: nessun filtro di base, come in Notion', () => {
    expect(haFiltri({})).toBe(false)
    expect(haFiltri({ q: '' })).toBe(false)
    expect(haFiltri({ tipo: 'reel' })).toBe(true)
    expect(haFiltri({ q: 'x' })).toBe(true)
  })
})

describe('statiFiltrati', () => {
  it('il gruppo, lo Status, o tutti e due insieme', () => {
    expect(statiFiltrati({})).toBeNull()
    expect(statiFiltrati({ gruppo: 'to_do' })).toEqual(['canceled', 'not_started'])
    expect(statiFiltrati({ stato: 'posted' })).toEqual(['posted'])
    expect(statiFiltrati({ gruppo: 'complete', stato: 'posted' })).toEqual(['posted'])
    // a Status outside the group chosen: nothing
    expect(statiFiltrati({ gruppo: 'complete', stato: 'canceled' })).toEqual([])
  })
})

describe('filtriDelGruppo: il numero del chip è quello che apre', () => {
  it('uno Status di un altro gruppo cade, quello del gruppo resta; «Tutti» lo tiene', () => {
    const filtri = { stato: 'posted', reel_type: 'education', q: 'casa' } as const
    expect(filtriDelGruppo(filtri, 'in_progress')).toEqual({ gruppo: 'in_progress', reel_type: 'education', q: 'casa' })
    expect(filtriDelGruppo(filtri, 'complete')).toEqual({ ...filtri, gruppo: 'complete' })
    expect(filtriDelGruppo({ ...filtri, gruppo: 'complete' }, null)).toEqual(filtri)
  })

  it('con lo Status di un altro gruppo il chip conta i contenuti del suo gruppo, mai 0 per costruzione', () => {
    // ?stato=posted: "In progress" counts and opens the In progress contents, not an empty list
    expect(statiFiltrati(filtriDelGruppo({ stato: 'posted' }, 'in_progress'))).toEqual([
      'to_be_posted',
      'to_be_edited',
      'to_be_recorded',
    ])
    expect(statiFiltrati(filtriDelGruppo({ stato: 'posted' }, 'complete'))).toEqual(['posted'])
    expect(statiFiltrati(filtriDelGruppo({ stato: 'posted' }, null))).toEqual(['posted'])
  })
})

describe('patternRicerca', () => {
  it('ogni carattere si cerca com’è: niente jolly, nemmeno l’asterisco che PostgREST leggerebbe come %', () => {
    expect(patternRicerca('casa')).toBe('***=casa')
    for (const q of ['*', 'a*b', '100%', 'b_roll', 'a\\b', '(bozza)', 'v1.2', '[x]', 'a|b', '^$']) {
      expect(patternRicerca(q)).toBe(`***=${q}`)
    }
  })
})
