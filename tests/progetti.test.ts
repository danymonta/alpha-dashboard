import { describe, expect, it } from 'vitest'

import { riassuntoScrittura } from '@/lib/alfire/riassunto'
import { differenze } from '@/lib/audit'
import {
  alberoTask,
  compitiDiRuoloInParole,
  corrisponde,
  elencoNomi,
  filtroAttivo,
  formatStima,
  iniziali,
  isUuid,
  nomiAssegnatari,
  parseFiltroStatoProgetto,
  parseFiltroStatoTask,
  parseStima,
  puoCreareProgetti,
  spostaInOrdine,
  type TaskMinimo,
} from '@/lib/progetti'
import {
  listaSchema,
  modificaProgettoSchema,
  modificaTaskSchema,
  nuovoProgettoSchema,
  nuovoTaskSchema,
  modelloSchema,
  voceModelloSchema,
} from '@/lib/validation/progetti'
import { cambioLivelloPmSchema } from '@/lib/validation/team'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('stima dei task', () => {
  it('legge minuti, ore e ore con minuti', () => {
    expect(parseStima('45')).toBe(45)
    expect(parseStima('45 min')).toBe(45)
    expect(parseStima('45m')).toBe(45)
    expect(parseStima('2h')).toBe(120)
    expect(parseStima('2 ore')).toBe(120)
    expect(parseStima('1h 30m')).toBe(90)
    expect(parseStima('1 h 30 min')).toBe(90)
    expect(parseStima('1:30')).toBe(90)
    expect(parseStima('1,5 h')).toBe(90)
    expect(parseStima(90)).toBe(90)
  })

  it('un campo vuoto è nessuna stima, un testo illeggibile è un errore', () => {
    expect(parseStima('')).toBeNull()
    expect(parseStima('   ')).toBeNull()
    expect(parseStima(null)).toBeNull()
    expect(parseStima(undefined)).toBeNull()
    expect(parseStima('tanto')).toBeUndefined()
    expect(parseStima('1,5')).toBeUndefined()
    expect(parseStima('0')).toBeUndefined()
    expect(parseStima(-5)).toBeUndefined()
    expect(parseStima(1.5)).toBeUndefined()
  })

  it('si scrive come si legge, e si rilegge uguale', () => {
    expect(formatStima(45)).toBe('45 min')
    expect(formatStima(120)).toBe('2 h')
    expect(formatStima(90)).toBe('1 h 30 min')
    expect(formatStima(null)).toBe('')
    for (const minuti of [5, 45, 60, 90, 125, 480]) expect(parseStima(formatStima(minuti))).toBe(minuti)
  })
})

describe('etichette e permessi', () => {
  it('iniziali dei membri', () => {
    expect(iniziali('Marco Coach')).toBe('MC')
    expect(iniziali('Sara')).toBe('S')
    expect(iniziali('  anna maria rossi ')).toBe('AM')
    expect(iniziali(null)).toBe('')
  })

  it('i progetti li apre un admin o un manager', () => {
    expect(puoCreareProgetti('admin')).toBe(true)
    expect(puoCreareProgetti('manager')).toBe(true)
    expect(puoCreareProgetti('employee')).toBe(false)
  })

  it('solo un uuid arriva a una query', () => {
    expect(isUuid(ID(1))).toBe(true)
    expect(isUuid('nuovo')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('i filtri sconosciuti tornano al valore predefinito', () => {
    expect(parseFiltroStatoProgetto(undefined)).toBe('attivi')
    expect(parseFiltroStatoProgetto('completati')).toBe('completati')
    expect(parseFiltroStatoProgetto('toString')).toBe('attivi')
    expect(parseFiltroStatoTask('in_ritardo')).toBe('in_ritardo')
    expect(parseFiltroStatoTask('boh')).toBe('tutti')
  })
})

describe('albero dei task', () => {
  const io = ID(99)
  const task = (n: number, campi: Partial<TaskMinimo> = {}): TaskMinimo => ({
    id: ID(n),
    parent_id: null,
    tasklist_id: 'L1',
    stato: 'da_fare',
    assegnatari: [],
    in_ritardo: false,
    ...campi,
  })
  const tasks = [
    task(1, { assegnatari: [io] }),
    task(2, { stato: 'completato' }),
    // shared with someone else: still mine
    task(3, { parent_id: ID(2), assegnatari: [ID(50), io], in_ritardo: true }),
    task(4, { parent_id: ID(2), stato: 'completato' }),
    task(5, { tasklist_id: null }),
  ]

  it('senza filtri: task per lista, sotto-task sotto il loro principale, nell’ordine ricevuto', () => {
    const albero = alberoTask(tasks, { stato: 'tutti', soloMiei: false, io })
    expect(albero.get('L1')?.map((n) => [n.task.id, n.figli.map((f) => f.id)])).toEqual([
      [ID(1), []],
      [ID(2), [ID(3), ID(4)]],
    ])
    expect(albero.get('')?.map((n) => n.task.id)).toEqual([ID(5)])
  })

  it('con un filtro il principale resta se corrisponde un suo sotto-task', () => {
    const albero = alberoTask(tasks, { stato: 'tutti', soloMiei: true, io })
    expect(albero.get('L1')?.map((n) => [n.task.id, n.figli.map((f) => f.id)])).toEqual([
      [ID(1), []],
      [ID(2), [ID(3)]],
    ])
    expect(albero.has('')).toBe(false)
  })

  it('filtra per stato, aperti e in ritardo', () => {
    expect(corrisponde(task(1), { stato: 'aperti', soloMiei: false, io })).toBe(true)
    expect(corrisponde(task(2, { stato: 'completato' }), { stato: 'aperti', soloMiei: false, io })).toBe(false)
    expect(corrisponde(task(3, { in_ritardo: true }), { stato: 'in_ritardo', soloMiei: false, io })).toBe(true)
    expect(corrisponde(task(1, { stato: 'in_corso' }), { stato: 'in_corso', soloMiei: false, io })).toBe(true)
    expect(filtroAttivo({ stato: 'tutti', soloMiei: false })).toBe(false)
    expect(filtroAttivo({ stato: 'tutti', soloMiei: true })).toBe(true)
  })

  it('"I miei task": basta essere una delle persone assegnate', () => {
    const mieiSoltanto = { stato: 'tutti', soloMiei: true, io } as const
    expect(corrisponde(task(1, { assegnatari: [ID(50), io] }), mieiSoltanto)).toBe(true)
    expect(corrisponde(task(1, { assegnatari: [ID(50), ID(51)] }), mieiSoltanto)).toBe(false)
    expect(corrisponde(task(1), mieiSoltanto)).toBe(false)
  })

  it('un sotto-task con il principale fuori dai dati resta visibile come principale', () => {
    const albero = alberoTask([task(7, { parent_id: ID(70) })], { stato: 'tutti', soloMiei: false, io })
    expect(albero.get('L1')?.map((n) => n.task.id)).toEqual([ID(7)])
  })
})

describe('persone assegnate', () => {
  const nomi = new Map([
    [ID(1), 'Marco Coach'],
    [ID(2), 'Sara Editor'],
    [ID(3), 'Dany'],
  ])

  it('i nomi seguono l’ordine della view, chi non è nell’elenco resta fuori', () => {
    expect(nomiAssegnatari([ID(2), ID(1)], nomi)).toEqual(['Sara Editor', 'Marco Coach'])
    expect(nomiAssegnatari([ID(9), ID(3)], nomi)).toEqual(['Dany'])
    expect(nomiAssegnatari(null, nomi)).toEqual([])
  })

  it('in una frase: virgole e "e" prima dell’ultimo', () => {
    expect(elencoNomi(['Marco'])).toBe('Marco')
    expect(elencoNomi(['Marco', 'Sara'])).toBe('Marco e Sara')
    expect(elencoNomi(['Marco', 'Sara', 'Dany'])).toBe('Marco, Sara e Dany')
    expect(elencoNomi([])).toBe('')
  })

  it('Alfire dice a chi assegna il nuovo task prima di farlo', () => {
    expect(
      riassuntoScrittura('task', { azione: 'aggiungi', titolo: 'Copertina', progetto: 'Reel', assegnatari: ['io', 'Sara Editor'] })
        .dettagli,
    ).toEqual(['Progetto: Reel', 'Assegnato a: te e Sara Editor'])
    expect(riassuntoScrittura('task', { azione: 'aggiungi', titolo: 'Copertina', progetto: 'Reel' }).dettagli).toEqual([
      'Progetto: Reel',
      'Senza assegnatario',
    ])
  })
})

describe('riordino', () => {
  it('sposta su e giù, e non esce dai bordi', () => {
    expect(spostaInOrdine(['a', 'b', 'c'], 'b', 'su')).toEqual(['b', 'a', 'c'])
    expect(spostaInOrdine(['a', 'b', 'c'], 'b', 'giu')).toEqual(['a', 'c', 'b'])
    expect(spostaInOrdine(['a', 'b', 'c'], 'a', 'su')).toBeNull()
    expect(spostaInOrdine(['a', 'b', 'c'], 'c', 'giu')).toBeNull()
    expect(spostaInOrdine(['a'], 'x', 'su')).toBeNull()
  })
})

/** Client and server parse the same values: the output must read back unchanged. */
function rilettura<T>(schema: { parse: (v: unknown) => T }, input: unknown): T {
  const una = schema.parse(input)
  expect(schema.parse(una)).toEqual(una)
  return una
}

describe('schemi dei progetti', () => {
  it('nuovo progetto: campi vuoti a null, un solo membro scelto diventa un elenco', () => {
    const v = rilettura(nuovoProgettoSchema, {
      reparto_id: ID(1),
      nome: '  Percorso Tiziano Mele ',
      descrizione: '',
      modello_id: ID(2),
      client_id: '',
      data_inizio: '2026-10-01',
      data_fine: '',
      membri: ID(3),
    })
    expect(v).toEqual({
      reparto_id: ID(1),
      nome: 'Percorso Tiziano Mele',
      descrizione: null,
      modello_id: ID(2),
      client_id: null,
      data_inizio: '2026-10-01',
      data_fine: null,
      membri: [ID(3)],
    })
    expect(rilettura(nuovoProgettoSchema, { reparto_id: ID(1), nome: 'Ok', membri: false }).membri).toEqual([])
  })

  it('nuovo progetto: nome, reparto e date in ordine', () => {
    const errori = nuovoProgettoSchema.safeParse({
      reparto_id: '',
      nome: 'x',
      data_inizio: '2026-10-10',
      data_fine: '2026-10-01',
    })
    expect(errori.success).toBe(false)
    const messaggi = errori.error!.issues.map((i) => i.message)
    expect(messaggi).toContain('Scegli il reparto')
    expect(messaggi).toContain('Scrivi il nome del progetto')
  })

  it('le date al contrario si fermano sulla fine', () => {
    const r = nuovoProgettoSchema.safeParse({ reparto_id: ID(1), nome: 'Ok', data_inizio: '2026-10-10', data_fine: '2026-10-01' })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0]).toMatchObject({ path: ['data_fine'], message: 'La fine viene dopo l’inizio' })
  })

  it('modifica progetto: senza il campo cliente non tocca il collegamento', () => {
    const base = { id: ID(1), nome: 'Reel del mese', reparto_id: ID(7), stato: 'attivo', responsabile_id: '' }
    expect(rilettura(modificaProgettoSchema, base).client_id).toBeUndefined()
    // the department is editable and required
    expect(modificaProgettoSchema.safeParse({ ...base, reparto_id: '' }).success).toBe(false)
    expect(rilettura(modificaProgettoSchema, { ...base, client_id: '' }).client_id).toBeNull()
    expect(rilettura(modificaProgettoSchema, { ...base, client_id: ID(5) }).client_id).toBe(ID(5))
    expect(modificaProgettoSchema.safeParse({ ...base, stato: 'chiuso' }).success).toBe(false)
  })

  it('task: stima leggibile in minuti, sotto-task non di sé stesso, scadenza dopo l’inizio', () => {
    const base = {
      id: ID(1),
      titolo: ' Call di check ',
      descrizione: '',
      stato: 'in_corso',
      priorita: 'alta',
      assegnatari: [ID(3), ID(4)],
      data_inizio: '2026-10-01',
      scadenza: '2026-10-03',
      stima_minuti: '1 h 30 min',
      tasklist_id: ID(2),
      parent_id: '',
    }
    const v = rilettura(modificaTaskSchema, base)
    expect(v).toMatchObject({ titolo: 'Call di check', stima_minuti: 90, assegnatari: [ID(3), ID(4)], parent_id: null })
    expect(rilettura(modificaTaskSchema, { ...base, assegnatari: false }).assegnatari).toEqual([])

    const stima = modificaTaskSchema.safeParse({ ...base, stima_minuti: 'molto' })
    expect(stima.error?.issues[0].message).toBe('Scrivi la stima come 45 min, 2 h o 1 h 30 min')
    const padre = modificaTaskSchema.safeParse({ ...base, parent_id: ID(1) })
    expect(padre.error?.issues[0].message).toBe('Un task non è sotto-task di sé stesso')
    const date = modificaTaskSchema.safeParse({ ...base, scadenza: '2026-09-30' })
    expect(date.error?.issues[0]).toMatchObject({ path: ['scadenza'], message: 'La scadenza viene dopo l’inizio' })
  })

  it('aggiunta rapida: basta il titolo', () => {
    expect(rilettura(nuovoTaskSchema, { progetto_id: ID(1), tasklist_id: null, parent_id: null, titolo: ' Montaggio ' })).toEqual({
      progetto_id: ID(1),
      tasklist_id: null,
      parent_id: null,
      titolo: 'Montaggio',
      assegnatari: [],
    })
    // one or more people; a single checkbox gives a string, none gives false
    expect(rilettura(nuovoTaskSchema, { progetto_id: ID(1), titolo: 'Reel', assegnatari: [ID(2), ID(3)] }).assegnatari).toEqual([
      ID(2),
      ID(3),
    ])
    expect(rilettura(nuovoTaskSchema, { progetto_id: ID(1), titolo: 'Reel', assegnatari: ID(2) }).assegnatari).toEqual([ID(2)])
    expect(rilettura(nuovoTaskSchema, { progetto_id: ID(1), titolo: 'Reel', assegnatari: false }).assegnatari).toEqual([])
    expect(nuovoTaskSchema.safeParse({ progetto_id: ID(1), titolo: 'Reel', assegnatari: ['Sara'] }).success).toBe(false)
    expect(nuovoTaskSchema.safeParse({ progetto_id: ID(1), titolo: '   ' }).error?.issues[0].message).toBe(
      'Scrivi il titolo del task',
    )
  })

  it('lista: nuova senza id, date facoltative', () => {
    expect(rilettura(listaSchema, { progetto_id: ID(1), nome: 'Onboarding', data_inizio: '', data_fine: '' })).toMatchObject({
      id: null,
      nome: 'Onboarding',
      data_inizio: null,
      data_fine: null,
    })
  })

  it('voce di modello: giorni interi, durata di almeno un giorno', () => {
    const v = rilettura(voceModelloSchema, {
      modello_id: ID(1),
      tasklist: 'Percorso',
      titolo: 'Call di check',
      ordine: '12',
      inizio_giorni: '14',
      durata_giorni: '7',
    })
    expect(v).toMatchObject({ ordine: 12, inizio_giorni: 14, durata_giorni: 7, id: null, descrizione: null })
    const zero = voceModelloSchema.safeParse({ ...v, durata_giorni: '0' })
    expect(zero.error?.issues[0].message).toBe('Almeno un giorno')
  })

  it('voce di modello senza lista e senza date: un task aperto per tutto il percorso (02/10/2026)', () => {
    const v = rilettura(voceModelloSchema, {
      modello_id: ID(1),
      tasklist: '  ',
      titolo: 'Programmazione alimentare (creazione e aggiornamenti)',
      ordine: '4',
      inizio_giorni: '',
      durata_giorni: '',
      per_ruolo: 'nutrizione',
    })
    expect(v).toMatchObject({ tasklist: null, inizio_giorni: null, durata_giorni: null, per_ruolo: 'nutrizione' })
    expect(rilettura(voceModelloSchema, { ...v, per_ruolo: '' }).per_ruolo).toBeNull()
    // the start without the length, or the other way round, is half a date
    const meta = voceModelloSchema.safeParse({ ...v, inizio_giorni: '3' })
    expect(meta.error?.issues[0]).toMatchObject({
      path: ['durata_giorni'],
      message: 'Scrivi sia da che giorno sia quanti giorni, o togli le date',
    })
    expect(voceModelloSchema.safeParse({ ...v, per_ruolo: 'capo' }).success).toBe(false)
  })

  it('modello: «per i nuovi clienti» è spento finché non lo si sceglie', () => {
    expect(rilettura(modelloSchema, { nome: 'Percorso cliente', reparto_id: ID(1) }).per_nuovi_clienti).toBe(false)
    expect(rilettura(modelloSchema, { nome: 'Percorso cliente', reparto_id: ID(1), per_nuovi_clienti: true })).toMatchObject({
      reparto_id: ID(1),
      per_nuovi_clienti: true,
    })
  })

  it('livello progetti: solo admin, manager, employee', () => {
    expect(cambioLivelloPmSchema.safeParse({ profile_id: ID(1), livello_pm: 'manager' }).success).toBe(true)
    expect(cambioLivelloPmSchema.safeParse({ profile_id: ID(1), livello_pm: 'capo' }).success).toBe(false)
  })
})

describe('registro modifiche', () => {
  it('il livello progetti ha un nome leggibile', () => {
    expect(differenze({ livello_pm: 'employee' }, { livello_pm: 'manager' })).toEqual([
      { campo: 'livello progetti', prima: 'Employee', dopo: 'Manager' },
    ])
  })
})

describe('«Scegli il coach»: dove vanno i task di un ruolo, in parole (pagina e Alfire)', () => {
  const attivi = [
    { id: 'n2', nome: 'Zoe Nutri', ruolo: 'nutrizione' as const },
    { id: 'n1', nome: 'Anna Nutri', ruolo: 'nutrizione' as const },
    { id: 'c1', nome: 'Marco Coach', ruolo: 'coach' as const },
  ]
  const piano = { titolo: 'Programmazione alimentare', per_ruolo: 'nutrizione' as const, assegnatari: [] as string[] }

  it('a chi ha il ruolo, prima chi è già nel progetto, poi per nome; altrimenti al coach', () => {
    expect(compitiDiRuoloInParole([piano], attivi, new Set(), null)).toEqual(['«Programmazione alimentare» va a Anna Nutri (Nutrizione).'])
    expect(compitiDiRuoloInParole([piano], attivi, new Set(['n2']), null)).toEqual(['«Programmazione alimentare» va a Zoe Nutri (Nutrizione).'])
    expect(compitiDiRuoloInParole([piano], attivi.slice(2), new Set(), null)).toEqual([
      '«Programmazione alimentare» va al coach: nel team nessuno ha il ruolo Nutrizione.',
    ])
  })

  it('un task già di qualcuno che non è il coach resta suo: nessuna riga', () => {
    expect(compitiDiRuoloInParole([{ ...piano, assegnatari: ['n1'] }], attivi, new Set(), 'c1')).toEqual([])
    expect(compitiDiRuoloInParole([{ ...piano, assegnatari: ['c1'] }], attivi, new Set(), 'c1')).toHaveLength(1)
  })
})
