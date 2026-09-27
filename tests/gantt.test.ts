import { describe, expect, it } from 'vitest'

import {
  PX_GIORNO,
  formaDi,
  geometria,
  giorniTra,
  intervalloGantt,
  larghezzaAsse,
  organizzaGantt,
  tacche,
  xOggi,
  type ListaGantt,
  type TaskGantt,
} from '@/lib/gantt'

function lista(id: string, ordine: number, data_inizio: string | null = null, data_fine: string | null = null): ListaGantt {
  return { id, nome: id, ordine, data_inizio, data_fine }
}

function task(
  id: string,
  { lista: tasklist_id = null, parent = null, ordine = 0, inizio = null, scadenza = null }: {
    lista?: string | null
    parent?: string | null
    ordine?: number
    inizio?: string | null
    scadenza?: string | null
  } = {},
): TaskGantt {
  return { id, titolo: id, tasklist_id, parent_id: parent, ordine, data_inizio: inizio, scadenza }
}

describe('forma di un elemento', () => {
  it('inizio e fine: barra; solo scadenza: rombo; nulla: nessuna', () => {
    expect(formaDi({ inizio: '2026-09-01', fine: '2026-09-05' })).toEqual({ forma: 'barra', inizio: '2026-09-01', fine: '2026-09-05' })
    expect(formaDi({ inizio: null, fine: '2026-09-05' })).toEqual({ forma: 'rombo', data: '2026-09-05', quale: 'scadenza' })
    expect(formaDi({ inizio: '2026-09-01', fine: null })).toEqual({ forma: 'rombo', data: '2026-09-01', quale: 'inizio' })
    expect(formaDi({ inizio: null, fine: null })).toEqual({ forma: 'nessuna' })
  })
})

describe('asse del tempo', () => {
  it('conta i giorni attraverso il cambio dell’ora legale', () => {
    expect(giorniTra('2026-10-24', '2026-10-26')).toBe(2)
    expect(giorniTra('2026-03-28', '2026-03-30')).toBe(2)
    expect(giorniTra('2026-09-05', '2026-09-01')).toBe(-4)
  })

  it('in settimane parte e finisce su settimane intere, con una settimana d’aria', () => {
    const forme = [formaDi({ inizio: '2026-09-02', fine: '2026-09-10' })]
    const i = intervalloGantt(forme, '2026-09-03', 'settimane')
    expect(i.da).toBe('2026-08-24') // lunedì prima della settimana del 02/09
    expect(new Date(`${i.a}T12:00:00Z`).getUTCDay()).toBe(0) // domenica
    expect(giorniTra(i.da, i.a) + 1).toBeGreaterThanOrEqual(42)
    expect((giorniTra(i.da, i.a) + 1) % 7).toBe(0)
  })

  it('oggi è sempre dentro, anche se il progetto è lontano', () => {
    const forme = [formaDi({ inizio: '2027-03-01', fine: '2027-03-10' })]
    const i = intervalloGantt(forme, '2026-09-28', 'mesi')
    expect(i.da).toBe('2026-09-01')
    expect(i.a).toBe('2027-03-31')
  })

  it('in mesi mostra almeno un trimestre, da un primo del mese a una fine mese', () => {
    const i = intervalloGantt([], '2026-12-15', 'mesi')
    expect(i).toEqual({ da: '2026-12-01', a: '2027-02-28' })
  })

  it('una barra copre i suoi giorni da un capo all’altro, il rombo sta a metà giornata', () => {
    const i = { da: '2026-09-01', a: '2026-09-30' }
    expect(geometria(formaDi({ inizio: '2026-09-02', fine: '2026-09-05' }), i, 'settimane')).toEqual({
      forma: 'barra',
      x: PX_GIORNO.settimane,
      larghezza: 4 * PX_GIORNO.settimane,
    })
    expect(geometria(formaDi({ inizio: null, fine: '2026-09-01' }), i, 'mesi')).toEqual({ forma: 'rombo', x: PX_GIORNO.mesi / 2 })
    expect(larghezzaAsse(i, 'mesi')).toBe(30 * PX_GIORNO.mesi)
    expect(xOggi('2026-09-03', i, 'settimane')).toBe(2.5 * PX_GIORNO.settimane)
  })

  it('tacche: ogni lunedì in settimane, ogni primo del mese in mesi', () => {
    const settimane = tacche({ da: '2026-09-21', a: '2026-10-11' }, 'settimane')
    expect(settimane.map((t) => [t.data, t.etichetta])).toEqual([
      ['2026-09-21', '21 set'],
      ['2026-09-28', '28 set'],
      ['2026-10-05', '5 ott'],
    ])
    expect(settimane[1].x).toBe(7 * PX_GIORNO.settimane)

    const mesi = tacche({ da: '2026-11-15', a: '2027-02-10' }, 'mesi')
    expect(mesi.map((t) => t.etichetta)).toEqual(['dic', 'gen 27', 'feb'])
  })
})

describe('righe del grafico', () => {
  it('ogni lista seguita dai suoi task in ordine, i sotto-task rientrati, poi i task senza lista', () => {
    const { righe, senzaDate } = organizzaGantt(
      [lista('Percorso', 2, '2026-09-10', '2026-10-10'), lista('Onboarding', 1, '2026-09-01', '2026-09-05')],
      [
        task('Call', { lista: 'Onboarding', ordine: 2, inizio: '2026-09-02', scadenza: '2026-09-03' }),
        task('Questionario', { lista: 'Onboarding', ordine: 1, scadenza: '2026-09-01' }),
        task('Check', { lista: 'Percorso', inizio: '2026-09-15', scadenza: '2026-09-20' }),
        task('Video check', { lista: 'Percorso', parent: 'Check', scadenza: '2026-09-18' }),
        task('Feedback', { lista: 'Percorso', ordine: 9 }),
        task('Fattura', { scadenza: '2026-09-30' }),
      ],
    )

    expect(
      righe.map((r) => (r.tipo === 'lista' ? `L:${r.lista.id}` : r.tipo === 'gruppo' ? `G:${r.nome}` : `${'-'.repeat(r.livello)}${r.task.id}`)),
    ).toEqual(['L:Onboarding', 'Questionario', 'Call', 'L:Percorso', 'Check', '-Video check', 'G:Senza lista', 'Fattura'])
    expect(senzaDate.map((t) => t.id)).toEqual(['Feedback'])
  })

  it('una lista senza date si estende sui suoi task; senza nulla da disegnare esce dal grafico', () => {
    const { righe, senzaDate } = organizzaGantt(
      [lista('Da ricavare', 1), lista('Vuota', 2)],
      [
        task('A', { lista: 'Da ricavare', inizio: '2026-09-04', scadenza: '2026-09-06' }),
        task('B', { lista: 'Da ricavare', scadenza: '2026-09-12' }),
        task('C', { lista: 'Vuota' }),
      ],
    )
    const prima = righe[0]
    expect(prima).toMatchObject({ tipo: 'lista', derivata: true, forma: { forma: 'barra', inizio: '2026-09-04', fine: '2026-09-12' } })
    expect(righe.some((r) => r.tipo === 'lista' && r.lista.id === 'Vuota')).toBe(false)
    expect(senzaDate.map((t) => t.id)).toEqual(['C'])
  })

  it('un sotto-task datato di un task senza date prende il suo posto', () => {
    const { righe, senzaDate } = organizzaGantt(
      [],
      [task('Padre'), task('Figlio', { parent: 'Padre', scadenza: '2026-09-10' })],
    )
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ tipo: 'task', livello: 0, task: { id: 'Figlio' } })
    expect(senzaDate.map((t) => t.id)).toEqual(['Padre'])
  })

  it('senza liste non c’è l’intestazione "Senza lista"', () => {
    const { righe } = organizzaGantt([], [task('Solo', { scadenza: '2026-09-10' })])
    expect(righe.map((r) => r.tipo)).toEqual(['task'])
  })
})
