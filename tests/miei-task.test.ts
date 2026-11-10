import { describe, expect, it } from 'vitest'

import {
  COMPLETATI_RECENTI,
  colonneBacheca,
  completatiDaMostrare,
  confrontaBacheca,
  cookieVistaTask,
  scadenzaDellaColonna,
  vistaTaskIniziale,
  etichettaCompletato,
  gruppoDi,
  mostraTuttiICompletati,
  raggruppa,
  righeAperte,
  scordaRiaperti,
  titoloGruppo,
  type MioTask,
  type MioTaskCompletato,
  type Tocco,
} from '@/lib/miei-task'

const OGGI = '2026-10-05'
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function task(n: number, campi: Partial<MioTask> = {}): MioTask {
  return {
    id: ID(n),
    titolo: `Task ${n}`,
    stato: 'da_fare',
    priorita: 'media',
    scadenza: null,
    in_ritardo: false,
    progetto_id: ID(900),
    progetto: 'Reel di ottobre',
    con: [],
    creato_il: `2026-09-${String(10 + n).padStart(2, '0')}T08:00:00+00:00`,
    ...campi,
  }
}

function completato(n: number, campi: Partial<MioTaskCompletato> = {}): MioTaskCompletato {
  return {
    id: ID(n),
    titolo: `Task ${n}`,
    scadenza: null,
    progetto_id: ID(900),
    progetto: 'Reel di ottobre',
    completato_il: '2026-10-05T10:00:00+00:00',
    ...campi,
  }
}

const tocchi = (...voci: Tocco[]) => new Map(voci.map((v) => [v.task.id, v]))

describe('"I miei task": i gruppi per scadenza', () => {
  it('in ritardo, oggi, i prossimi 7 giorni, più avanti, senza scadenza', () => {
    expect(gruppoDi('2026-10-04', OGGI)).toBe('ritardo')
    expect(gruppoDi(OGGI, OGGI)).toBe('oggi')
    expect(gruppoDi('2026-10-06', OGGI)).toBe('settimana')
    expect(gruppoDi('2026-10-12', OGGI)).toBe('settimana')
    expect(gruppoDi('2026-10-13', OGGI)).toBe('dopo')
    expect(gruppoDi(null, OGGI)).toBe('senza')
    expect(titoloGruppo('settimana')).toBe('Prossimi 7 giorni')
  })

  it('solo i gruppi con qualcosa, nell’ordine della pagina; il conteggio è di quelli da fare', () => {
    const righe = righeAperte(
      [task(1, { scadenza: OGGI }), task(2, { scadenza: '2026-10-01' }), task(3, { scadenza: OGGI })],
      tocchi({ task: task(3, { scadenza: OGGI }), stato: 'completato' }),
    )
    const gruppi = raggruppa(righe, OGGI)
    expect(gruppi.map((g) => [g.chiave, g.righe.map((r) => r.task.id), g.daFare])).toEqual([
      ['ritardo', [ID(2)], 1],
      ['oggi', [ID(1), ID(3)], 1],
    ])
  })
})

describe('"I miei task": il task spuntato resta al suo posto', () => {
  const aperti = [task(1, { scadenza: OGGI }), task(2, { scadenza: OGGI }), task(3)]

  it('spuntato ma il server non ha ancora risposto: resta lì, spuntato', () => {
    const righe = righeAperte(aperti, tocchi({ task: aperti[1], stato: 'completato' }))
    expect(righe.map((r) => [r.task.id, r.completatoAdesso])).toEqual([
      [ID(1), false],
      [ID(2), true],
      [ID(3), false],
    ])
  })

  it('il server l’ha già tolto dagli aperti: torna al suo posto, spuntato', () => {
    const righe = righeAperte([aperti[0], aperti[2]], tocchi({ task: aperti[1], stato: 'completato' }))
    expect(righe.map((r) => [r.task.id, r.completatoAdesso])).toEqual([
      [ID(1), false],
      [ID(2), true],
      [ID(3), false],
    ])
  })

  it('al suo posto anche con la stessa scadenza e lo stesso istante di creazione (poi conta l’id)', () => {
    const stesso = '2026-09-20T08:00:00.123456+00:00'
    const a = task(5, { scadenza: OGGI, creato_il: stesso })
    const b = task(6, { scadenza: OGGI, creato_il: stesso })
    const c = task(7, { scadenza: OGGI, creato_il: stesso })
    const righe = righeAperte([a, c], tocchi({ task: b, stato: 'completato' }))
    expect(righe.map((r) => r.task.id)).toEqual([ID(5), ID(6), ID(7)])
  })

  it('Annulla: mentre riapre resta lì, non spuntato; riaperto, vale la riga del server', () => {
    const inRiapertura = righeAperte([aperti[0], aperti[2]], tocchi({ task: aperti[1], stato: 'riapertura' }))
    expect(inRiapertura.map((r) => [r.task.id, r.completatoAdesso])).toEqual([
      [ID(1), false],
      [ID(2), false],
      [ID(3), false],
    ])
    const dalServer = task(2, { scadenza: OGGI, stato: 'da_fare', titolo: 'Titolo nuovo' })
    const riaperto = righeAperte([aperti[0], dalServer, aperti[2]], tocchi({ task: aperti[1], stato: 'riaperto' }))
    expect(riaperto[1]).toEqual({ task: dalServer, completatoAdesso: false })
  })

  it('in Completati non compare due volte: quello toccato sulla pagina resta sopra', () => {
    const chiusi = [completato(2), completato(8)]
    const sopra = righeAperte([aperti[0], aperti[2]], tocchi({ task: aperti[1], stato: 'completato' }))
    expect(completatiDaMostrare(chiusi, sopra).map((t) => t.id)).toEqual([ID(8)])
    expect(completatiDaMostrare(chiusi, righeAperte([aperti[0], aperti[2]], new Map())).map((t) => t.id)).toEqual([
      ID(2),
      ID(8),
    ])
  })

  it('riaperto e poi chiuso altrove: la lista nuova del server chiude il ponte, va in Completati', () => {
    const riaperto = tocchi({ task: aperti[1], stato: 'riaperto' })
    // before the server's list has it, the reopened task stays in its place
    expect(righeAperte([aperti[0], aperti[2]], riaperto).map((r) => r.task.id)).toEqual([ID(1), ID(2), ID(3)])
    // the next list from the server ends it: closed again elsewhere, it is not kept open
    const dopo = scordaRiaperti(riaperto)
    expect(dopo.size).toBe(0)
    const sopra = righeAperte([aperti[0], aperti[2]], dopo)
    expect(sopra.map((r) => r.task.id)).toEqual([ID(1), ID(3)])
    expect(completatiDaMostrare([completato(2)], sopra).map((t) => t.id)).toEqual([ID(2)])
  })

  it('la lista nuova tiene gli spuntati e quelli che stanno riaprendo; senza riaperti, la stessa mappa', () => {
    const misti = tocchi(
      { task: aperti[0], stato: 'completato' },
      { task: aperti[1], stato: 'riapertura' },
      { task: aperti[2], stato: 'riaperto' },
    )
    expect([...scordaRiaperti(misti).keys()]).toEqual([ID(1), ID(2)])
    const senza = tocchi({ task: aperti[0], stato: 'completato' })
    expect(scordaRiaperti(senza)).toBe(senza)
  })
})

describe('"I miei task": quando l’ho chiuso', () => {
  it('oggi e ieri con l’ora, prima con la data; il giorno è quello di Roma', () => {
    expect(etichettaCompletato('2026-10-05T16:42:00+00:00', OGGI)).toBe('Completato oggi alle 18:42')
    // 23:30 UTC of the 4th is already the 5th in Rome
    expect(etichettaCompletato('2026-10-04T23:30:00+00:00', OGGI)).toBe('Completato oggi alle 01:30')
    expect(etichettaCompletato('2026-10-04T07:05:00+00:00', OGGI)).toBe('Completato ieri alle 09:05')
    expect(etichettaCompletato('2026-09-28T10:00:00+00:00', OGGI)).toBe('Completato il 28/09/2026')
    expect(etichettaCompletato(null, OGGI)).toBe('Completato')
    expect(etichettaCompletato('non è una data', OGGI)).toBe('Completato')
  })

  it('i 30 più recenti, tutti solo con ?completati=tutti', () => {
    expect(COMPLETATI_RECENTI).toBe(30)
    expect(mostraTuttiICompletati('tutti')).toBe(true)
    expect(mostraTuttiICompletati(undefined)).toBe(false)
    expect(mostraTuttiICompletati(['tutti'])).toBe(false)
  })
})

describe('la bacheca dei miei task (1.75.0)', () => {
  it('ha sempre le cinque colonne, anche vuote, nell’ordine della pagina', () => {
    const colonne = colonneBacheca([{ task: task(1, { scadenza: OGGI }), completatoAdesso: false }], OGGI)
    expect(colonne.map((c) => c.chiave)).toEqual(['ritardo', 'oggi', 'settimana', 'dopo', 'senza'])
    expect(colonne.find((c) => c.chiave === 'oggi')!.righe).toHaveLength(1)
    expect(colonne.find((c) => c.chiave === 'senza')!.righe).toHaveLength(0)
  })

  it('in ogni colonna mette prima l’alta priorità, poi la scadenza più vicina', () => {
    const righe = [
      task(1, { scadenza: '2026-10-07', priorita: 'bassa' }),
      task(2, { scadenza: '2026-10-09', priorita: 'alta' }),
      task(3, { scadenza: '2026-10-06', priorita: 'media' }),
      task(4, { scadenza: '2026-10-08', priorita: 'alta' }),
    ].map((t) => ({ task: t, completatoAdesso: false }))
    const settimana = colonneBacheca(righe, OGGI).find((c) => c.chiave === 'settimana')!
    expect(settimana.righe.map((r) => r.task.id)).toEqual([ID(4), ID(2), ID(3), ID(1)])
    expect(confrontaBacheca(task(1, { priorita: 'alta' }), task(2, { priorita: 'bassa' }))).toBeLessThan(0)
  })

  it('non conta tra i da fare quelli spuntati adesso', () => {
    const colonne = colonneBacheca(
      [
        { task: task(1), completatoAdesso: true },
        { task: task(2), completatoAdesso: false },
      ],
      OGGI,
    )
    expect(colonne.find((c) => c.chiave === 'senza')!.daFare).toBe(1)
  })

  it('dà a ogni colonna la sua scadenza, e nessuna data passata', () => {
    expect(scadenzaDellaColonna('oggi', OGGI)).toBe(OGGI)
    expect(scadenzaDellaColonna('settimana', OGGI)).toBe('2026-10-06')
    expect(scadenzaDellaColonna('dopo', OGGI)).toBe('2026-10-19')
    expect(scadenzaDellaColonna('senza', OGGI)).toBeNull()
    expect(scadenzaDellaColonna('ritardo', OGGI)).toBeUndefined()
    // a card dropped on a column lands in that column
    expect(gruppoDi(scadenzaDellaColonna('settimana', OGGI)!, OGGI)).toBe('settimana')
    expect(gruppoDi(scadenzaDellaColonna('dopo', OGGI)!, OGGI)).toBe('dopo')
  })

  it('apre la bacheca, salvo l’indirizzo o la scelta ricordata', () => {
    expect(vistaTaskIniziale(undefined, undefined)).toBe('bacheca')
    expect(vistaTaskIniziale(undefined, 'elenco')).toBe('elenco')
    expect(vistaTaskIniziale('bacheca', 'elenco')).toBe('bacheca')
    expect(vistaTaskIniziale('altro', 'nulla')).toBe('bacheca')
    expect(cookieVistaTask('elenco', true)).toBe('alpha_vista_task=elenco; Path=/task; Max-Age=31536000; SameSite=Lax; Secure')
  })
})
