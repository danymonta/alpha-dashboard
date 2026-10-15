import { describe, expect, it } from 'vitest'

import {
  etichettaTarget,
  tendenza,
  tonoAgenda,
  tonoEsito,
  tonoPriorita,
  tonoStato,
  tonoTarget,
  tonoVerdetto,
} from '@/lib/insight/toni'

// The artifact's pill classes (hot, warm, ok, plain) on the app's tones.

describe('priority and target', () => {
  it('alta critical, media attention, bassa neutral', () => {
    expect([tonoPriorita('alta'), tonoPriorita('media'), tonoPriorita('bassa')]).toEqual(['critico', 'attenzione', 'neutro'])
  })

  it('sì ok, no neutral, to check attention, with the artifact’s words', () => {
    expect([tonoTarget('si'), tonoTarget('no'), tonoTarget('da verificare')]).toEqual(['ok', 'neutro', 'attenzione'])
    expect([etichettaTarget('si'), etichettaTarget('no'), etichettaTarget('da verificare')]).toEqual([
      'in target',
      'fuori target',
      'target da verificare',
    ])
  })
})

describe('tonoStato (D8)', () => {
  it('critical only when it says «attende» and the lead is the one waiting', () => {
    expect(tonoStato('Attende risposta da ieri', true)).toBe('critico')
    expect(tonoStato('messaggio inviato, attende risposta', false)).toBe('neutro')
    expect(tonoStato('in qualificazione', true)).toBe('neutro')
  })
})

describe('tonoAgenda', () => {
  it.each([
    ['promemoria da inviare', 'critico'],
    ['non confermata', 'critico'],
    ['a rischio', 'critico'],
    ['Confermata', 'ok'],
    ['promemoria inviato', 'ok'],
    ['', 'neutro'],
    ['spostata', 'neutro'],
  ])('%s: %s', (status, tono) => {
    expect(tonoAgenda(status)).toBe(tono)
  })
})

describe('tonoEsito', () => {
  it.each([
    ['no-show', 'critico'],
    ['no show', 'critico'],
    ['noshow', 'critico'],
    ['assente', 'critico'],
    ['presentato', 'ok'],
    ['call fatta', 'ok'],
    ['da verificare', 'attenzione'],
    ['', 'attenzione'],
  ])('%s: %s', (esito, tono) => {
    expect(tonoEsito(esito)).toBe(tono)
  })
})

describe('tonoVerdetto', () => {
  it.each([
    ['spingere', 'ok'],
    ['Potenziare', 'ok'],
    ['cambiare', 'critico'],
    ['stop', 'critico'],
    ['fermare', 'critico'],
    ['mantenere', 'attenzione'],
    [null, 'attenzione'],
  ])('%s: %s', (verdetto, tono) => {
    expect(tonoVerdetto(verdetto)).toBe(tono)
  })
})

describe('tendenza', () => {
  it.each([
    ['in crescita', 'su'],
    ['sale', 'su'],
    ['+3', 'su'],
    ['in calo', 'giu'],
    ['scende', 'giu'],
    ['-2', 'giu'],
    ['stabile', 'stabile'],
    ['', 'stabile'],
  ])('%s: %s', (trend, attesa) => {
    expect(tendenza(trend)).toBe(attesa)
  })
})
