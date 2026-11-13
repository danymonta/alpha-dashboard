import { describe, expect, it } from 'vitest'

import {
  ORIGINE_YOUTUBE,
  campiona,
  indirizzoIframe,
  leggiMessaggioPlayer,
  percentualeVista,
  secondiVisti,
  unisciIntervalli,
} from '@/lib/percorso/video'
import { progressoVideoSchema } from '@/lib/validation/percorso'

/* The seconds of a video seen (release B1a, «Player»): no script of YouTube, our postMessage. */

describe('gli intervalli', () => {
  it('si uniscono, ordinati, senza vuoti', () => {
    expect(unisciIntervalli([[10, 20], [0, 5], [5, 8], [18, 25], [30, 30]])).toEqual([[0, 8], [10, 25]])
    expect(secondiVisti([[0, 10], [5, 15]], 100)).toBe(15)
    expect(secondiVisti([[90, 120]], 100)).toBe(10)
  })

  it('la percentuale come il database, con due decimali', () => {
    expect(percentualeVista([[0, 90]], 100)).toBe(90)
    expect(percentualeVista([[0, 1]], 3)).toBe(33.33)
    expect(percentualeVista([[0, 10]], 0)).toBe(0)
  })
})

describe('il campionamento: un salto in avanti non conta', () => {
  it('conta solo un avanzamento fino a 2 secondi', () => {
    expect(campiona(null, 5)).toBeNull()
    expect(campiona(10, 11)).toEqual([10, 11])
    expect(campiona(10.4, 12.3)).toEqual([10, 12])
    expect(campiona(10, 13)).toBeNull()
    expect(campiona(10, 9)).toBeNull()
    expect(campiona(10, 10)).toBeNull()
  })
})

describe('i messaggi del player', () => {
  const finestra = {}
  const ok = (data: unknown) => ({ origin: ORIGINE_YOUTUBE, source: finestra, data })

  it('infoDelivery con tempo, durata e stato', () => {
    expect(
      leggiMessaggioPlayer(ok(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 12.5, duration: 300, playerState: 1 } })), finestra),
    ).toEqual({ tempo: 12.5, durata: 300, stato: 1 })
    expect(leggiMessaggioPlayer(ok({ event: 'onStateChange', info: 2 }), finestra)).toEqual({ stato: 2 })
  })

  it('un’origine o una finestra sbagliate si ignorano', () => {
    const data = JSON.stringify({ event: 'infoDelivery', info: { currentTime: 1 } })
    expect(leggiMessaggioPlayer({ origin: 'https://www.youtube.com', source: finestra, data }, finestra)).toBeNull()
    expect(leggiMessaggioPlayer({ origin: 'https://cattivo.example', source: finestra, data }, finestra)).toBeNull()
    expect(leggiMessaggioPlayer({ origin: ORIGINE_YOUTUBE, source: {}, data }, finestra)).toBeNull()
    expect(leggiMessaggioPlayer({ origin: ORIGINE_YOUTUBE, source: finestra, data }, null)).toBeNull()
  })

  it('un messaggio che non si legge si ignora', () => {
    expect(leggiMessaggioPlayer(ok('non json'), finestra)).toBeNull()
    expect(leggiMessaggioPlayer(ok({ event: 'altro' }), finestra)).toBeNull()
    expect(leggiMessaggioPlayer(ok({ event: 'infoDelivery', info: { currentTime: -1, duration: 'x' } }), finestra)).toBeNull()
  })
})

describe('l’iframe e la route', () => {
  it('solo youtube-nocookie, con la JS API e senza video correlati', () => {
    expect(indirizzoIframe('dQw4w9WgXcQ', 'https://dashboard.percorsoalpha.com')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&playsinline=1&origin=https%3A%2F%2Fdashboard.percorsoalpha.com',
    )
    expect(indirizzoIframe('corto', 'x')).toBeNull()
  })

  it('il corpo della route: un blocco o una consegna, la durata, al massimo 50 intervalli', () => {
    const blocco = '0b0b0000-0000-4000-8000-000000000001'
    expect(progressoVideoSchema.safeParse({ blocco, durata: 120, intervalli: [[0, 10]] }).success).toBe(true)
    expect(progressoVideoSchema.safeParse({ blocco, consegna: blocco, durata: 120, intervalli: [[0, 10]] }).success).toBe(false)
    expect(progressoVideoSchema.safeParse({ durata: 120, intervalli: [[0, 10]] }).success).toBe(false)
    expect(progressoVideoSchema.safeParse({ blocco, durata: 120, intervalli: [[10, 5]] }).success).toBe(false)
    expect(
      progressoVideoSchema.safeParse({ blocco, durata: 120, intervalli: Array.from({ length: 51 }, (_, i) => [i, i + 1]) }).success,
    ).toBe(false)
  })
})
