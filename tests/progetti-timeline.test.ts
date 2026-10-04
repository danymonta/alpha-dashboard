import { describe, expect, it } from 'vitest'

import { oggiRoma } from '@/lib/date'
import {
  GIORNI_IN_SCADENZA,
  PX_GIORNO_MINIMO,
  aggiungiMesi,
  dividiPerFine,
  fineProgetto,
  formaProgetto,
  geometriaTimeline,
  giornoCss,
  inizioVista,
  intervalloTimeline,
  larghezzaTimeline,
  parseVistaProgetti,
  senzaCoachDaSegnalare,
  taccheTimeline,
  testoFine,
  xData,
  xOggiTimeline,
} from '@/lib/progetti-timeline'

function progetto(nome: string, data_inizio: string | null, data_fine: string | null) {
  return { nome, data_inizio, data_fine }
}

describe('vista di /progetti', () => {
  it('?vista=timeline apre la timeline, tutto il resto l’elenco', () => {
    expect(parseVistaProgetti('timeline')).toBe('timeline')
    expect(parseVistaProgetti('elenco')).toBe('elenco')
    expect(parseVistaProgetti(undefined)).toBe('elenco')
    expect(parseVistaProgetti('Timeline')).toBe('elenco')
    expect(parseVistaProgetti(['timeline'])).toBe('elenco')
  })
})

describe('fine di un progetto', () => {
  const oggi = '2026-10-05'
  /** scaduto as v_pm_progetti says it: active or paused, end before today. */
  function fine(stato: 'attivo' | 'in_pausa' | 'completato' | 'archiviato', data_fine: string | null, scaduto = false) {
    return fineProgetto({ stato, data_fine, scaduto }, oggi)
  }

  it('conta i giorni di calendario da oggi alla fine', () => {
    expect(fine('attivo', '2026-10-22')).toEqual({ tipo: 'in_scadenza', data: '2026-10-22', giorni: 17 })
    expect(fine('attivo', '2027-03-20')).toEqual({ tipo: 'futura', data: '2027-03-20', giorni: 166 })
    expect(fine('attivo', '2026-10-04', true)).toEqual({ tipo: 'finito', data: '2026-10-04', giorni: -1 })
  })

  it('finito lo dice il database (scaduto), mai ricalcolato: a cavallo della mezzanotte resta "finisce oggi"', () => {
    expect(fine('attivo', '2026-10-04', false)).toEqual({ tipo: 'in_scadenza', data: '2026-10-04', giorni: 0 })
    expect(fine('in_pausa', '2026-09-01', true).tipo).toBe('finito')
  })

  it('il cambio dell’ora (25/10/2026) non sposta il conteggio', () => {
    expect(fineProgetto({ stato: 'attivo', data_fine: '2026-10-30', scaduto: false }, '2026-10-20')).toMatchObject({ giorni: 10 })
    expect(fineProgetto({ stato: 'attivo', data_fine: '2027-04-01', scaduto: false }, '2027-03-25')).toMatchObject({ giorni: 7 })
  })

  it(`in scadenza da oggi a ${GIORNI_IN_SCADENZA} giorni compresi`, () => {
    expect(fine('attivo', oggi).tipo).toBe('in_scadenza')
    expect(fine('attivo', '2026-11-04')).toMatchObject({ tipo: 'in_scadenza', giorni: 30 })
    expect(fine('attivo', '2026-11-05')).toMatchObject({ tipo: 'futura', giorni: 31 })
    // a paused project still ends: it is counted the same way
    expect(fine('in_pausa', '2026-10-10').tipo).toBe('in_scadenza')
  })

  it('completato o archiviato: la fine non conta più; senza fine: lo dice', () => {
    expect(fine('completato', '2026-10-10')).toEqual({ tipo: 'chiuso' })
    expect(fine('archiviato', null)).toEqual({ tipo: 'chiuso' })
    expect(fine('attivo', null)).toEqual({ tipo: 'senza_fine' })
  })

  it('in parole: oggi, domani, tra N giorni; finito il percorso del cliente, gli altri dovevano finire', () => {
    expect(testoFine({ tipo: 'in_scadenza', data: oggi, giorni: 0 }, false)).toBe('finisce oggi')
    expect(testoFine({ tipo: 'in_scadenza', data: '2026-10-06', giorni: 1 }, false)).toBe('finisce domani')
    expect(testoFine({ tipo: 'in_scadenza', data: '2026-10-22', giorni: 17 }, true)).toBe('tra 17 giorni')
    expect(testoFine({ tipo: 'futura', data: '2027-03-20', giorni: 166 }, true)).toBe('tra 166 giorni')
    expect(testoFine({ tipo: 'finito', data: '2026-10-04', giorni: -1 }, true)).toBe('finito il 04/10/2026')
    expect(testoFine({ tipo: 'finito', data: '2026-10-04', giorni: -1 }, false)).toBe('doveva finire il 04/10/2026')
    expect(testoFine({ tipo: 'chiuso' }, false)).toBe('')
  })

  it('"oggi" è quello di Roma: a mezzanotte e mezza italiana è già il giorno dopo', () => {
    // 22:30 UTC on 4 October = 00:30 on 5 October in Rome (summer time)
    const oggiItalia = oggiRoma(new Date('2026-10-04T22:30:00Z'))
    expect(oggiItalia).toBe('2026-10-05')
    expect(fineProgetto({ stato: 'attivo', data_fine: '2026-10-05', scaduto: false }, oggiItalia)).toMatchObject({
      tipo: 'in_scadenza',
      giorni: 0,
    })
  })

  it('senza coach: solo il percorso di un cliente ancora in corso', () => {
    const inCorso = fine('attivo', '2026-12-01')
    expect(senzaCoachDaSegnalare({ per_cliente: true, coach: null }, inCorso)).toBe(true)
    expect(senzaCoachDaSegnalare({ per_cliente: true, coach: null }, fine('attivo', '2026-10-20'))).toBe(true)
    expect(senzaCoachDaSegnalare({ per_cliente: true, coach: 'Lorenzo' }, inCorso)).toBe(false)
    // not a client's project: no coach to choose
    expect(senzaCoachDaSegnalare({ per_cliente: false, coach: null }, inCorso)).toBe(false)
    // over, completed or archived: nothing to do
    expect(senzaCoachDaSegnalare({ per_cliente: true, coach: null }, fine('attivo', '2026-10-01', true))).toBe(false)
    expect(senzaCoachDaSegnalare({ per_cliente: true, coach: null }, fine('completato', '2026-12-01'))).toBe(false)
  })
})

describe('progetti sul grafico', () => {
  it('con la fine: barra, o rombo se manca l’inizio; senza fine: fuori dal grafico', () => {
    expect(formaProgetto(progetto('a', '2026-09-01', '2026-12-01'))).toEqual({ forma: 'barra', inizio: '2026-09-01', fine: '2026-12-01' })
    expect(formaProgetto(progetto('b', null, '2026-12-01'))).toEqual({ forma: 'rombo', data: '2026-12-01', quale: 'scadenza' })
    expect(formaProgetto(progetto('c', '2026-09-01', null))).toEqual({ forma: 'nessuna' })
    expect(formaProgetto(progetto('d', null, null))).toEqual({ forma: 'nessuna' })
  })

  it('per fine, la più vicina prima; a pari fine l’inizio più vecchio, poi il nome', () => {
    const { sulGrafico, senzaFine } = dividiPerFine([
      progetto('Zeta', '2026-06-01', '2027-03-01'),
      progetto('Libreria', '2026-08-05', null),
      progetto('Beta', '2026-09-01', '2026-11-01'),
      progetto('Alfa', '2026-09-01', '2026-11-01'),
      progetto('Prima', '2026-05-01', '2026-11-01'),
      progetto('Finito ieri', '2026-07-05', '2026-10-04'),
      progetto('Archivio', null, null),
    ])
    expect(sulGrafico.map((p) => p.nome)).toEqual(['Finito ieri', 'Prima', 'Alfa', 'Beta', 'Zeta'])
    expect(senzaFine.map((p) => p.nome)).toEqual(['Archivio', 'Libreria'])
  })
})

describe('asse del tempo', () => {
  const oggi = '2026-10-05'

  it('si apre un mese prima di oggi', () => {
    expect(inizioVista(oggi)).toBe('2026-09-01')
    expect(inizioVista('2027-01-15')).toBe('2026-12-01')
  })

  it('mesi: dall’inizio più vecchio alla fine più lontana, a mesi interi', () => {
    const forme = [
      formaProgetto(progetto('a', '2026-05-02', '2026-11-01')),
      formaProgetto(progetto('b', '2026-08-08', '2027-08-07')),
    ]
    expect(intervalloTimeline(forme, oggi, 'mesi')).toEqual({ da: '2026-05-01', a: '2027-08-31' })
  })

  it('trimestri: a trimestri interi', () => {
    const forme = [formaProgetto(progetto('a', '2026-05-02', '2027-08-07'))]
    expect(intervalloTimeline(forme, oggi, 'trimestri')).toEqual({ da: '2026-04-01', a: '2027-09-30' })
  })

  it('pochi progetti brevi: almeno 6 mesi, o 4 trimestri', () => {
    const forme = [formaProgetto(progetto('a', '2026-10-01', '2026-10-20'))]
    expect(intervalloTimeline(forme, oggi, 'mesi')).toEqual({ da: '2026-09-01', a: '2027-02-28' })
    expect(intervalloTimeline(forme, oggi, 'trimestri')).toEqual({ da: '2026-07-01', a: '2027-06-30' })
    expect(intervalloTimeline([], oggi, 'mesi')).toEqual({ da: '2026-09-01', a: '2027-02-28' })
  })

  it('un anno sbagliato non allunga l’asse: al massimo 24 mesi indietro e 36 avanti', () => {
    const forme = [formaProgetto(progetto('refuso', '2016-10-01', '2099-10-01'))]
    expect(intervalloTimeline(forme, oggi, 'mesi')).toEqual({ da: '2024-10-01', a: '2029-10-31' })
  })

  it('geometria: una barra copre i suoi giorni; tagliata ai bordi della finestra', () => {
    const intervallo = { da: '2026-09-01', a: '2027-02-28' }
    const px = PX_GIORNO_MINIMO.mesi
    expect(geometriaTimeline({ forma: 'barra', inizio: '2026-09-01', fine: '2026-09-30' }, intervallo, px)).toEqual({
      forma: 'barra',
      x: 0,
      larghezza: 150,
      tagliataPrima: false,
      tagliataDopo: false,
    })
    expect(geometriaTimeline({ forma: 'barra', inizio: '2026-08-01', fine: '2026-09-10' }, intervallo, px)).toEqual({
      forma: 'barra',
      x: 0,
      larghezza: 50,
      tagliataPrima: true,
      tagliataDopo: false,
    })
    expect(geometriaTimeline({ forma: 'barra', inizio: '2027-02-20', fine: '2027-06-01' }, intervallo, px)).toMatchObject({
      forma: 'barra',
      tagliataDopo: true,
      larghezza: 45,
    })
    expect(geometriaTimeline({ forma: 'barra', inizio: '2026-01-01', fine: '2026-02-01' }, intervallo, px)).toEqual({ forma: 'nessuna' })
    expect(geometriaTimeline({ forma: 'rombo', data: '2026-09-02', quale: 'scadenza' }, intervallo, px)).toEqual({ forma: 'rombo', x: 7.5 })
    expect(geometriaTimeline({ forma: 'nessuna' }, intervallo, px)).toEqual({ forma: 'nessuna' })
    // in days (px = 1): what the chart draws with the axis' day width
    expect(geometriaTimeline({ forma: 'barra', inizio: '2026-09-11', fine: '2026-09-20' }, intervallo, 1)).toMatchObject({ x: 10, larghezza: 10 })
  })

  it('oggi a metà del suo giorno; larghezza dell’asse', () => {
    const intervallo = { da: '2026-09-01', a: '2027-02-28' }
    expect(xData('2026-10-05', intervallo.da, 5)).toBe(170)
    expect(xOggiTimeline('2026-10-05', intervallo, 5)).toBe(172.5)
    expect(xOggiTimeline('2026-10-05', intervallo, 1)).toBe(34.5)
    expect(larghezzaTimeline(intervallo, 5)).toBe(181 * 5)
    expect(larghezzaTimeline(intervallo, 1)).toBe(181)
  })

  it('larghezza di un giorno: tutta la finestra nella larghezza visibile, mai sotto il minimo della scala', () => {
    // the room after the furthest end, plus one pixel: never a scroll bar for a rounding
    expect(giornoCss('trimestri', 618, 128)).toBe('max(1px, (100cqw - 129px) / 618)')
    expect(giornoCss('mesi', 181, 128)).toBe('max(5px, (100cqw - 129px) / 181)')
    expect(giornoCss('mesi', 0, 128)).toBe('max(5px, (100cqw - 129px) / 1)')
    // a quarter is room enough for its name ("ott–dic 26"), a month for "gen 27"
    expect(90 * PX_GIORNO_MINIMO.trimestri).toBeGreaterThanOrEqual(90)
    expect(28 * PX_GIORNO_MINIMO.mesi).toBeGreaterThanOrEqual(140)
  })

  it('tacche: ogni mese ("gen 27" con l’anno) o ogni trimestre ("ott–dic 26"), in giorni con la durata del periodo', () => {
    const mesi = taccheTimeline({ da: '2026-11-01', a: '2027-02-28' }, 'mesi')
    expect(mesi.map((t) => t.etichetta)).toEqual(['nov', 'dic', 'gen 27', 'feb'])
    expect(mesi.map((t) => t.giorno)).toEqual([0, 30, 61, 92])
    expect(mesi.map((t) => t.durata)).toEqual([30, 31, 31, 28])

    const trimestri = taccheTimeline({ da: '2026-07-01', a: '2027-06-30' }, 'trimestri')
    expect(trimestri.map((t) => t.etichetta)).toEqual(['lug–set 26', 'ott–dic 26', 'gen–mar 27', 'apr–giu 27'])
    expect(trimestri.map((t) => t.giorno)).toEqual([0, 92, 184, 274])
    expect(trimestri.map((t) => t.durata)).toEqual([92, 92, 90, 91])
    // the periods cover the window end to end
    const ultima = trimestri.at(-1)!
    expect(ultima.giorno + ultima.durata).toBe(larghezzaTimeline({ da: '2026-07-01', a: '2027-06-30' }, 1))
  })

  it('mesi aggiunti e tolti, anche a cavallo dell’anno', () => {
    expect(aggiungiMesi('2026-11-01', 3)).toBe('2027-02-01')
    expect(aggiungiMesi('2026-01-01', -1)).toBe('2025-12-01')
    expect(aggiungiMesi('2026-10-01', -24)).toBe('2024-10-01')
  })
})
